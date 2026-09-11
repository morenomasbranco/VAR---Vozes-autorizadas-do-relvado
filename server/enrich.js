// Classificação, resumo e tradução com o Gemini (plano gratuito da Google).
// Os posts que chegam quase ao mesmo tempo seguem num só pedido, para caber nos limites gratuitos.
// Se o limite se esgotar, a notícia é publicada na mesma, classificada por palavras-chave e sem tradução.
import { sleep } from "./util.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MIN_GAP = Number(process.env.GEMINI_INTERVALO_MS) || 6000; // ~10 pedidos por minuto
const BATCH_WAIT = 800;
const BATCH_MAX = 8;

const SECCOES = ["porto", "sporting", "benfica", "mercado", "big5", "perifericos", "modalidades", "estatisticas", "premios", "portugueses"];
const IDIOMAS = ["pt", "en", "es", "it", "fr", "tr", "outro"];

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      i: { type: "INTEGER" },
      relevante: { type: "BOOLEAN" },
      igual_a: { type: "STRING", nullable: true },
      idioma: { type: "STRING", enum: IDIOMAS },
      seccoes: { type: "ARRAY", items: { type: "STRING", enum: SECCOES } },
      titulo_pt: { type: "STRING" },
      titulo_en: { type: "STRING" },
      pontos_pt: { type: "ARRAY", items: { type: "STRING" } },
      pontos_en: { type: "ARRAY", items: { type: "STRING" } },
      importancia: { type: "INTEGER" },
    },
    required: ["i", "relevante", "idioma", "seccoes", "titulo_pt", "titulo_en", "pontos_pt", "pontos_en", "importancia"],
  },
};

const SYSTEM = `És o editor do VAR, um feed de notícias de desporto em tempo real para leitores portugueses. Recebes um ou mais posts publicados por fontes (jornais, jornalistas, canais) e transformas cada um numa notícia curta, em português e em inglês. Devolves um objeto por post, com o mesmo número i.

Conteúdo
- Usa apenas a informação do post. Não acrescentes factos, números, nomes nem contexto que lá não estejam.
- Se o post for um rumor ou uma informação por confirmar, mantém esse tom («em negociações», «perto de», «segundo…»).
- Português de Portugal (golo, equipa, guarda-redes, treinador, plantel, contratação), nunca do Brasil. Inglês britânico.
- Ignora assinaturas, datas e links no fim do texto (por exemplo «— Fabrizio Romano (@FabrizioRomano) Sep 3, 2026»).

Título
- Frase declarativa com maiúscula só no início e nos nomes próprios, até 110 caracteres, sem emojis nem hashtags.
- Envolve em ==…== o nome principal (jogador, treinador ou clube), no máximo dois por título.
- Se a fonte for Fabrizio Romano e o post disser «Here we go», o título começa por «Here we go!» nas duas línguas.

Pontos
- Zero a três frases curtas com os dados concretos do post (valores, duração do contrato, datas, marcador, resultado). Não repitas o título.

Secções (pode haver várias)
- porto, sporting, benfica: quando o clube é assunto, incluindo as modalidades.
- mercado: transferências, renovações, empréstimos, rescisões, saídas e entradas de treinadores.
- big5: Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 e os seus clubes.
- perifericos: outros campeonatos estrangeiros (Turquia, Países Baixos, Arábia Saudita, MLS, Brasil, etc.).
- modalidades: tudo o que não seja futebol de onze (futsal, andebol, hóquei em patins, basquetebol, voleibol…).
- estatisticas: posts centrados em números, rankings, xG ou notas.
- premios: distinções, jogador do mês, Bola de Ouro, equipas do ano.
- portugueses: jogadores ou treinadores portugueses em clubes estrangeiros.

Importância, do ponto de vista de um adepto português
- 5: última hora de grande impacto (lesão grave de uma figura, contratação ou saída de peso em Porto, Sporting ou Benfica, despedimento de treinador de um grande).
- 4: notícia forte («Here we go» com portugueses ou com os grandes, renovações importantes, convocatória da seleção A).
- 3: interesse geral (portugueses no estrangeiro em destaque, grandes jogos europeus, prémios).
- 2: rotina (antevisões, rumores fracos, estatísticas).
- 1: marginal.

Repetidos (igual_a)
- Se o post relata o mesmo facto de uma notícia da lista recente (a mesma transferência, a mesma lesão), devolve o id dessa notícia.
- Se relata o mesmo facto de um post anterior do mesmo lote, devolve "#" seguido do número desse post (por exemplo "#0").
- Caso contrário, null.

Não é notícia (relevante = false)
- Publicidade, apostas, passatempos, pedidos para seguir ou ver um canal, grelha de programação sem notícia, posts só com link ou emojis e tudo o que não seja desporto.`;

// classificação de recurso, sem modelo
const RULES = [
  ["porto", /\b(fc )?porto\b|drag[aã]o|drag[oõ]es|azuis e brancos/i],
  ["sporting", /\bsporting\b(?! (de )?braga)|le[oõ]es|alvalade/i],
  ["benfica", /\bbenfica\b|[aá]guias|encarnados/i],
  ["mercado", /here we go|transfer|contrat|renov|empr[eé]stimo|cl[aá]usula|assina|rescis|mercado|signs?\b|loan/i],
  ["modalidades", /futsal|andebol|h[oó]quei|basquet|voleibol|handball|volleyball/i],
  ["premios", /pr[eé]mio|bola de ouro|ballon d'or|jogador do m[eê]s|player of the month/i],
  ["big5", /premier league|laliga|la liga|serie a|bundesliga|ligue 1/i],
];
export function fallback(post) {
  const lines = post.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || post.text).replace(/\s+/g, " ").slice(0, 140);
  return {
    relevante: true,
    idioma: post.lang || "outro",
    seccoes: RULES.filter(([, re]) => re.test(post.text)).map(([c]) => c),
    titulo_pt: title,
    titulo_en: title,
    pontos_pt: [],
    pontos_en: [],
    importancia: 2,
    bruto: true,
  };
}

async function callGemini(posts, recent) {
  const lista = recent.length ? recent.map((r) => `${r.id} | ${r.name || r.src} | ${r.t.pt}`).join("\n") : "(nenhuma)";
  const novos = posts.map((p, i) => `[${i}] fonte: ${p.name} (${p.via})\n"""\n${p.text}\n"""`).join("\n\n");
  const res = await fetch(`${API}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Notícias publicadas nas últimas horas:\n${lista}\n\nNovos posts (${posts.length}):\n\n${novos}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
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

export function createEnricher({ recent, log }) {
  const queue = [];
  let running = false;
  let lastCall = 0;
  let pausedUntil = 0;
  let recent429 = [];
  if (!KEY) log("[Gemini] sem GEMINI_API_KEY no .env; as notícias saem sem tradução nem resumo");

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        await sleep(BATCH_WAIT);
        const batch = queue.splice(0, BATCH_MAX);
        if (!KEY || Date.now() < pausedUntil) { batch.forEach((b) => b.resolve(fallback(b.post))); continue; }
        const wait = lastCall + MIN_GAP - Date.now();
        if (wait > 0) await sleep(wait);
        lastCall = Date.now();
        try {
          const out = await callGemini(batch.map((b) => b.post), recent());
          batch.forEach((b, i) => {
            const r = out.find((o) => o.i === i);
            if (!r) return b.resolve(fallback(b.post));
            if (typeof r.igual_a === "string" && r.igual_a.startsWith("#")) r.igual_a = batch[Number(r.igual_a.slice(1))]?.post.postId || null;
            b.resolve(r);
          });
        } catch (e) {
          if (e.status === 429) {
            recent429 = [...recent429.filter((t) => Date.now() - t < 600000), Date.now()];
            pausedUntil = Date.now() + (recent429.length >= 3 ? 30 * 60000 : 60000);
            log(`[Gemini] limite gratuito atingido; notícias sem tradução durante ${recent429.length >= 3 ? "30 min" : "1 min"}`);
          } else log(`[Gemini] ${e.message}`);
          batch.forEach((b) => b.resolve(fallback(b.post)));
        }
      }
    } finally {
      running = false;
    }
  }

  return (post) => new Promise((resolve) => { queue.push({ post, resolve }); pump(); });
}
