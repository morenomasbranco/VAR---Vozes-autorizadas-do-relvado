// Tradução automática das notícias para as línguas que não vêm do enriquecimento (fr, de, it, es), e para
// português e inglês nas notícias que o Gemini não chegou a tratar (limite gratuito esgotado).
// Para português: primeiro um modelo de linguagem do Groq (server/ia.js), que percebe a linguagem dos títulos de
// futebol — o Google Tradutor traduzia «Real Madrid make move for Mac Allister» como «Mac Allister mexe-se para sair
// do Real Madrid». Sem ele (sem chave ou sem quota), e nas outras línguas, o Google Tradutor público (gratuito, sem
// chave, sem quota); se falhar, o Gemini. O resultado fica guardado na própria notícia: cada título é traduzido uma
// vez, sirva para um leitor ou para mil.
import { sleep } from "./util.js";
import { traduzirGoogle, estadoGoogle } from "./gtradutor.js";
import { pedirIA, motoresIA } from "./ia.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TRADUTOR_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MIN_GAP = Number(process.env.TRADUTOR_INTERVALO_MS) || 4000; // espaço entre pedidos ao Gemini
const LOTE = Number(process.env.TRADUTOR_LOTE) || 10; // notícias por pedido

export const LINGUAS = { fr: "francês", de: "alemão", it: "italiano", es: "espanhol", pt: "português de Portugal", en: "inglês britânico" };
export const ativo = true; // o Google Tradutor não precisa de chave

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

// os modelos do Groq para as traduções: só o qwen. A quota do Groq é por modelo e por dia, e os gpt-oss ficam para o
// que precisa de pesquisa na web (o 120b para o «Neste dia», o 20b para as curiosidades dos jogos) — a tradução
// chegou a gastar a quota toda do gpt-oss-20b e as curiosidades deixaram de funcionar. Além disso, a tradução tem um
// orçamento de tokens por dia (TRADUTOR_IA_TOKENS_DIA), para sobrar quota do qwen para as Declarações e o Prosebot;
// passado o orçamento, segue o Google Tradutor até ao dia seguinte
const MODELOS_TRADUCAO = () => [process.env.TRADUTOR_GROQ_MODEL || "qwen/qwen3.8-27b"];
const ORCAMENTO_DIA = () => Number(process.env.TRADUTOR_IA_TOKENS_DIA) || 250000;
const diaDeLisboa = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(t));
const SISTEMA_IA = `Traduzes títulos e pontos de notícias de futebol (e de outros desportos) para português de Portugal, como os escreveria um jornalista do zerozero ou do Record.
Regras:
- Percebe o sentido no mundo do futebol antes de traduzir. Mercado: «X make move for Y» / «X move for Y» = «X avança por Y» ou «X quer contratar Y» (Y é o jogador; X é o clube interessado, nunca o contrário); «Y move to X» / «Y joins X» = «Y muda-se para X» / «Y reforça o X»; «linked with» = «associado a»; «in talks» = «em negociações»; «agreement in principle» = «acordo de princípio»; «Here we go» fica «Here we go!»; «loan» = «empréstimo»; «release clause» = «cláusula de rescisão»; «sacked» = «despedido».
- Vocabulário de Portugal: equipa, golo, guarda-redes, treinador, plantel, relvado, adeptos, avançado, médio, defesa-central. Nunca do Brasil.
- Mantém os nomes de pessoas, clubes, competições e canais; o que vier entre == == fica exatamente igual, com os sinais.
- Não acrescentes nem retires informação; tom de título de jornal, curto e direto; maiúscula só no início e nos nomes próprios.
- Se o texto já estiver em português de Portugal, devolve-o igual.
Respondes APENAS com JSON: {"traducoes": [{"i": 0, "titulo": "…", "pontos": ["…"]}]} — um objeto por item, com o mesmo i e só os campos que o item trouxe.`;

export function createTradutor({ log }) {
  const fila = []; // { lang, item, resolve }
  const aCaminho = new Set(); // `${lang}:${id}` já na fila, para o mesmo título não seguir duas vezes
  let running = false;
  let lastCall = 0; // travão de ritmo: o plano gratuito limita pedidos por minuto
  let pausaGemini = 0;
  let recent429 = [];
  const contas = { pedidas: 0, feitas: 0, semQuota: 0, viaIA: 0, viaGoogle: 0, viaGemini: 0 };

  // pelo Google Tradutor: títulos e pontos numa só lista de linhas, desfeita no fim
  async function porGoogle(lang, itens) {
    const linhas = [];
    const mapa = itens.map((it) => {
      const t = it.titulo ? linhas.push(it.titulo) - 1 : -1;
      const p = (it.pontos || []).map((x) => linhas.push(x) - 1);
      return { t, p };
    });
    if (!linhas.length) return [];
    const r = await traduzirGoogle(linhas, lang);
    if (!r) return null;
    return mapa.map((m, i) => ({
      i,
      titulo: m.t >= 0 ? r.textos[m.t] : undefined,
      pontos: m.p.length ? m.p.map((k) => r.textos[k]).filter(Boolean) : undefined,
    }));
  }

  // pelo modelo de linguagem (só para português): devolve null se não houver motor, se o orçamento do dia acabou ou se
  // não responder
  const gasto = { dia: diaDeLisboa(), tokens: 0 };
  async function porIA(lang, itens) {
    if (lang !== "pt" || !motoresIA().includes("groq") || process.env.TRADUTOR_IA === "0") return null;
    if (gasto.dia !== diaDeLisboa()) Object.assign(gasto, { dia: diaDeLisboa(), tokens: 0 });
    if (gasto.tokens >= ORCAMENTO_DIA()) return null;
    const lista = itens.map((it, i) => [
      `[${i}]`,
      it.titulo ? `título: ${it.titulo}` : null,
      it.pontos?.length ? `pontos:\n${it.pontos.map((p) => `- ${p}`).join("\n")}` : null,
    ].filter(Boolean).join("\n")).join("\n\n");
    try {
      const r = await pedirIA({ sistema: SISTEMA_IA, pedido: `Itens a traduzir (${itens.length}):\n\n${lista}`, temperatura: 0.1, uso: "tradução das notícias", motores: ["groq"], modelosGroq: MODELOS_TRADUCAO(), esforco: "low" });
      // sem a contagem do Groq, uma estimativa (cerca de três caracteres por token, pedido e resposta)
      gasto.tokens += r.tokens ?? Math.round((SISTEMA_IA.length + lista.length * 2) / 3);
      const out = (Array.isArray(r.json?.traducoes) ? r.json.traducoes : [])
        .filter((o) => Number.isInteger(o?.i) && o.i >= 0 && o.i < itens.length)
        .map((o) => ({ i: o.i, titulo: typeof o.titulo === "string" && itens[o.i].titulo ? o.titulo.trim() : undefined, pontos: Array.isArray(o.pontos) && itens[o.i].pontos?.length ? o.pontos.map(String) : undefined }));
      // um título sem os nomes marcados com ==…== perdeu-os na tradução: fica para o Google
      const ok = out.filter((o) => !o.titulo || (itens[o.i].titulo.match(/==/g) || []).length === (o.titulo.match(/==/g) || []).length);
      if (!ok.length) return null;
      return ok;
    } catch (e) {
      if (Date.now() - avisoIA > 600000) { avisoIA = Date.now(); log(`[Tradutor] IA: ${String(e.detalhe || e.message).slice(0, 200)}`); }
      return null;
    }
  }
  let avisoIA = 0;

  // traduz um lote; devolve null quando nem a IA, nem o Google, nem o Gemini responderam
  async function traduzir(lang, itens) {
    const ia = await porIA(lang, itens);
    if (ia) {
      contas.viaIA += ia.length;
      // os que a IA não devolveu seguem para o Google
      const faltam = itens.map((it, i) => i).filter((i) => !ia.some((o) => o.i === i));
      if (!faltam.length) return ia;
      const g = await porGoogle(lang, faltam.map((i) => itens[i]));
      return [...ia, ...(g || []).map((o) => ({ ...o, i: faltam[o.i] }))];
    }
    const g = await porGoogle(lang, itens);
    if (g) { contas.viaGoogle += itens.length; return g; }
    if (!KEY || Date.now() < pausaGemini) return null;
    const espera = lastCall + MIN_GAP - Date.now();
    if (espera > 0) await sleep(espera);
    lastCall = Date.now();
    try {
      const out = await callGemini(LINGUAS[lang], itens);
      contas.viaGemini += itens.length;
      return out;
    } catch (e) {
      if (e.status === 429) {
        recent429 = [...recent429.filter((t) => Date.now() - t < 600000), Date.now()];
        const tempo = recent429.length >= 3 ? 15 * 60000 : 60000;
        pausaGemini = Date.now() + tempo;
        log(`[Tradutor] limite gratuito atingido; volto a tentar dentro de ${Math.round(tempo / 60000)} min`);
      } else {
        pausaGemini = Date.now() + 10 * 60000; // modelo errado ou chave inválida: não insiste durante 10 min
        log(`[Tradutor] ${e.message}`);
      }
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
      ia: { dia: gasto.dia, tokens: gasto.tokens, orcamento: ORCAMENTO_DIA(), modelos: MODELOS_TRADUCAO() },
      chaveGemini: !!KEY,
      googleTradutor: estadoGoogle(),
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
