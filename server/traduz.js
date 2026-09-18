// Tradução automática das notícias para as línguas que não vêm do enriquecimento (fr, de, it, es).
// O Gemini traduz em lote os títulos que os leitores estão a ver nessa língua, e o resultado fica
// guardado na própria notícia: cada título é traduzido uma vez, sirva para um leitor ou para mil.
// Sem chave, ou com o limite gratuito esgotado, a notícia fica na língua em que já está.
import { sleep } from "./util.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TRADUTOR_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MIN_GAP = Number(process.env.TRADUTOR_INTERVALO_MS) || 4000; // espaço entre pedidos ao Gemini
const LOTE = Number(process.env.TRADUTOR_LOTE) || 10; // notícias por pedido

export const LINGUAS = { fr: "francês", de: "alemão", it: "italiano", es: "espanhol" };
export const ativo = !!KEY;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      i: { type: "INTEGER" },
      titulo: { type: "STRING" },
      pontos: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["i"],
  },
};

const SYSTEM = (lingua) => `Traduzes notícias de desporto para ${lingua}. Recebes uma lista numerada e devolves a tradução de cada item, com o mesmo número i.
Cada item pode trazer título, pontos, ou só um dos dois: devolve exatamente os campos que recebeste, sem inventar os outros.
Regras: mantém o sentido exato, sem acrescentar nem retirar informação; mantém o tom de título de jornal, curto e direto; nomes de pessoas, clubes, competições e canais ficam como estão; o que vier entre == == fica exatamente igual, incluindo os sinais; devolve tantos pontos quantos receberes, na mesma ordem.`;

async function callGemini(lingua, itens) {
  const lista = itens.map((it, i) => [
    `[${i}]`,
    it.titulo ? `título: ${it.titulo}` : null,
    it.pontos?.length ? `pontos:\n${it.pontos.map((p) => `- ${p}`).join("\n")}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");
  const res = await fetch(`${API}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM(lingua) }] },
      contents: [{ role: "user", parts: [{ text: `Notícias a traduzir (${itens.length}):\n\n${lista}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.1 },
    }),
  });
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "[]";
  const out = JSON.parse(text);
  return Array.isArray(out) ? out : [];
}

export function createTradutor({ log }) {
  const fila = []; // { lang, item, resolve }
  const aCaminho = new Set(); // `${lang}:${id}` já na fila, para o mesmo título não seguir duas vezes
  let running = false;
  let lastCall = 0; // travão de ritmo: o plano gratuito limita pedidos por minuto
  let pausaGemini = 0;
  let recent429 = [];
  const contas = { pedidas: 0, feitas: 0, semQuota: 0 };
  if (!KEY) log("[Tradutor] sem GEMINI_API_KEY; as notícias ficam na língua de origem nas línguas extra");

  // traduz um lote; devolve null quando não há chave ou o limite gratuito está esgotado
  async function traduzir(lang, itens) {
    if (!KEY || Date.now() < pausaGemini) return null;
    const espera = lastCall + MIN_GAP - Date.now();
    if (espera > 0) await sleep(espera);
    lastCall = Date.now();
    try {
      return await callGemini(LINGUAS[lang], itens);
    } catch (e) {
      if (e.status === 429) {
        recent429 = [...recent429.filter((t) => Date.now() - t < 600000), Date.now()];
        const tempo = recent429.length >= 3 ? 15 * 60000 : 60000;
        pausaGemini = Date.now() + tempo;
        log(`[Tradutor] limite gratuito atingido; volto a tentar dentro de ${Math.round(tempo / 60000)} min`);
      } else log(`[Tradutor] ${e.message}`);
      return null;
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (fila.length) {
        // um pedido trata só de uma língua; leva a da primeira notícia à espera
        const lang = fila[0].lang;
        const batch = [];
        for (let i = 0; i < fila.length && batch.length < LOTE; i++) {
          if (fila[i].lang === lang) batch.push(...fila.splice(i--, 1));
        }
        const fim = (res) => batch.forEach((b, i) => {
          aCaminho.delete(b.chave);
          b.resolve(res ? res[i] : null);
        });
        const out = await traduzir(lang, batch.map((b) => b.item));
        if (!out) { contas.semQuota += batch.length; fim(null); continue; }
        contas.feitas += out.length;
        fim(batch.map((b, i) => {
          const r = out.find((o) => o.i === i);
          if (!r || (!r.titulo && !r.pontos?.length)) return null;
          return { id: b.item.id, t: r.titulo || null, b: Array.isArray(r.pontos) ? r.pontos : [] };
        }));
      }
    } finally {
      running = false;
    }
  }

  return {
    estado: () => ({
      ...contas,
      fila: fila.length,
      pausadoAte: pausaGemini > Date.now() ? pausaGemini : null,
      ativo: !!KEY,
    }),
    // Cada item é { id, titulo?, pontos? }: pede-se só o que falta. O site pede primeiro os títulos
    // de tudo o que mostra e só depois os pontos das notícias da secção que está aberta, o que reduz
    // quase a metade o texto enviado ao Gemini.
    // Devolve uma lista do mesmo tamanho: { id, t, b } para as que traduziu, null para as outras
    pedir(lang, itens) {
      if (!LINGUAS[lang]) return Promise.resolve(itens.map(() => null));
      contas.pedidas += itens.length;
      const out = itens.map((item) => {
        const chave = `${lang}:${item.id}:${item.titulo ? "t" : ""}${item.pontos?.length ? "b" : ""}`;
        if (aCaminho.has(chave)) return Promise.resolve(null); // já vai noutro pedido; entra no próximo pedido do leitor
        aCaminho.add(chave);
        return new Promise((resolve) => { fila.push({ lang, item, chave, resolve }); });
      });
      pump();
      return Promise.all(out);
    },
  };
}
