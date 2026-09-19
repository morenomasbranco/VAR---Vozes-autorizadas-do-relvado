// Classificação, resumo e tradução com o Gemini (plano gratuito da Google).
// Os posts que chegam quase ao mesmo tempo seguem num só pedido, para caber nos limites gratuitos.
// Se o limite se esgotar, a notícia é publicada na mesma, classificada por palavras-chave e sem tradução.
import { sleep } from "./util.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MIN_GAP = Number(process.env.GEMINI_INTERVALO_MS) || 6000; // ~10 pedidos por minuto
const BATCH_WAIT = Number(process.env.GEMINI_ESPERA_MS) || 4000;
const BATCH_MAX = 12;

const SECCOES = ["porto", "sporting", "benfica", "mercado", "modalidades", "estatisticas", "premios", "portugueses"];
const IDIOMAS = ["pt", "en", "es", "it", "fr", "de", "tr", "nl", "pl", "outro"];

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
      pais_tema: { type: "STRING", nullable: true },
      modalidade: { type: "STRING", nullable: true },
      equipas: {
        type: "ARRAY",
        items: { type: "OBJECT", properties: { nome: { type: "STRING" }, papel: { type: "STRING", enum: ["origem", "destino", "envolvido"] } }, required: ["nome", "papel"] },
      },
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
- modalidades: tudo o que não seja futebol de onze (futsal, andebol, hóquei em patins, basquetebol, voleibol…).
- estatisticas: posts centrados em números, rankings, xG ou notas.
- premios: distinções, jogador do mês, Bola de Ouro, equipas do ano.
- portugueses: SÓ quando a notícia trata de um jogador, treinador, árbitro ou equipa portuguesa fora de Portugal. Não marques por o texto vir de um site português.
- Uma notícia que não seja de futebol de onze leva sempre "modalidades", mesmo que fale de uma liga ou de um clube conhecido (ténis, golfe, críquete, corridas de cavalos, futebol americano, basquetebol, Fórmula 1, ciclismo, râguebi…).

Importância, do ponto de vista de um adepto português
- 5: última hora de grande impacto (lesão grave de uma figura, contratação ou saída de peso em Porto, Sporting ou Benfica, despedimento de treinador de um grande).
- 4: notícia forte («Here we go» com portugueses ou com os grandes, renovações importantes, convocatória da seleção A).
- 3: interesse geral (portugueses no estrangeiro em destaque, grandes jogos europeus, prémios).
- 2: rotina (antevisões, rumores fracos, estatísticas).
- 1: marginal.

País a que a notícia se refere (pais_tema)
- Código do país do clube, da competição ou da seleção de que a notícia trata, em minúsculas: pt, es, fr, it, de, nl, br, us, sa, tr…
- Inglaterra gb-eng, Escócia gb-sct, País de Gales gb-wls.
- Numa competição internacional (Liga dos Campeões, Liga Europa, Mundial de Clubes, Libertadores…), o país é o do clube de que a notícia trata: um jogo do Arsenal na Liga dos Campeões é gb-eng, uma notícia do Benfica na Liga Europa é pt. Numa seleção, o país da seleção.
- eu só quando a notícia é sobre a competição europeia em geral (sorteio, regulamento, UEFA) sem um clube em destaque; un só para competições mundiais ou notícias sobre vários países ao mesmo tempo.
- Um português num clube estrangeiro conta como o país desse clube. Um jogo entre seleções conta como a seleção de que a notícia trata.
- Este campo decide a coluna em que a notícia aparece na página inicial (Portugal, Inglaterra, Espanha, Itália, Alemanha, França, Resto do Mundo), por isso preenche-o sempre que for possível.
- Se não for possível saber, null.

Modalidade (modalidade)
- Se a notícia não for de futebol de onze, indica a modalidade, exatamente um destes valores: futsal, praia, andebol, basquetebol, voleibol, hoquei_patins, hoquei_gelo, futebol_americano, tenis, padel, ciclismo, atletismo, natacao, automobilismo, golfe, ragby, criquete, beisebol, combate, equestre, outra.
- Se for futebol de onze, null.

Clubes e seleções (equipas)
- Os clubes ou seleções de que a notícia trata, no máximo três, pelo nome internacional em inglês: Manchester United, Bayern Munich, Sporting CP, FC Porto, Benfica, Paris Saint-Germain, Portugal.
- Numa transferência ou empréstimo, o clube de onde o jogador sai tem papel «origem» e o clube para onde vai tem papel «destino». Nos restantes casos, papel «envolvido».
- Não incluas clubes mencionados só de passagem. Se a notícia não tratar de nenhum, lista vazia.

Repetidos (igual_a)
- Se o post relata o mesmo facto de uma notícia da lista recente (a mesma transferência, a mesma lesão), devolve o id dessa notícia.
- Se relata o mesmo facto de um post anterior do mesmo lote, devolve "#" seguido do número desse post (por exemplo "#0").
- Caso contrário, null.

Não é notícia (relevante = false)
- Publicidade, apostas, passatempos, pedidos para seguir ou ver um canal, grelha de programação sem notícia, posts só com link ou emojis e tudo o que não seja desporto.
- Jornais generalistas (Observador, Público, JN, DN, SIC, CNN Portugal, TSF, Renascença, SAPO, Notícias ao Minuto, RTP) também publicam política, economia, sociedade, justiça, cultura, saúde, meteorologia e crime. Tudo isso é relevante = false, mesmo que fale de uma figura ligada ao desporto, de dinheiro público para estádios ou de um clube em contexto que não é desportivo. Só é relevante quando o assunto principal é desporto: competições, atletas, treinadores, clubes enquanto equipas, transferências, arbitragem.`;

// classificação de recurso, sem modelo
// modalidade concreta de cada notícia que não é futebol de onze
export const MODALIDADES = {
  futsal: { pt: "Futsal", en: "Futsal", re: /futsal|liga placard|taça de portugal de futsal|uefa futsal/i },
  praia: { pt: "Futebol de praia", en: "Beach soccer", re: /futebol de praia|beach soccer/i },
  andebol: { pt: "Andebol", en: "Handball", re: /andebol|handball|\behf\b|campeonato de andebol|liga de andebol/i },
  basquetebol: { pt: "Basquetebol", en: "Basketball", re: /basquete|basketball|\bnba\b|\bwnba\b|euroleague|liga betclic|final four|\bacb\b|\bfiba\b|\beurobasket\b|proliga de basquete/i },
  voleibol: { pt: "Voleibol", en: "Volleyball", re: /voleibol|volleyball|v[oó]lei\b|\bcev\b|liga de voleibol/i },
  hoquei_patins: { pt: "Hóquei em patins", en: "Roller hockey", re: /h[oó]quei em patins|roller hockey|rink hockey|\bcerh\b|world skate|liga de h[oó]quei/i },
  hoquei_gelo: { pt: "Hóquei no gelo", en: "Ice hockey", re: /h[oó]quei no gelo|ice hockey|\bnhl\b/i },
  futebol_americano: { pt: "Futebol americano", en: "American football", re: /futebol americano|american football|\bnfl\b|quarterback|touchdown|college football|super bowl/i },
  tenis: { pt: "Ténis", en: "Tennis", re: /\bt[eé]nis\b|\btennis\b|\bus open\b|wimbledon|roland garros|\batp\b|\bwta\b/i },
  padel: { pt: "Padel", en: "Padel", re: /p[aá]del|padel/i },
  ciclismo: { pt: "Ciclismo", en: "Cycling", re: /\bciclismo\b|\bcycling\b|volta a portugal|volta a espanha|tour de france|giro d'?italia|\bla vuelta\b|pelot[aã]o|\bciclista\b|\bUCI\b/i },
  atletismo: { pt: "Atletismo", en: "Athletics", re: /\batletismo\b|\bathletics\b|maratona|marathon|salto com vara|pole vault|\b(100|200|400|800|1500|5000|10000) ?m(etros)?\b/i },
  natacao: { pt: "Natação", en: "Swimming", re: /nata[cç][aã]o|swimming/i },
  automobilismo: { pt: "Automobilismo", en: "Motorsport", re: /f[oó]rmula ?1|formula ?1|\bf1\b|grande pr[eé]mio|grand prix|motogp|nascar|rali|rally/i },
  golfe: { pt: "Golfe", en: "Golf", re: /\bgolfe\b|\bgolf\b|ryder cup|solheim|irish open|\bbirdie\b|\bfourballs?\b/i },
  ragby: { pt: "Râguebi", en: "Rugby", re: /r[aá]guebi|rugby/i },
  criquete: { pt: "Críquete", en: "Cricket", re: /cr[ií]quete|cricket|\btest match\b/i },
  beisebol: { pt: "Beisebol", en: "Baseball", re: /beisebol|baseball|\bmlb\b/i },
  combate: { pt: "Desportos de combate", en: "Combat sports", re: /\bboxe\b|\bboxing\b|\bufc\b|\bmma\b|\bjudo\b|karate/i },
  equestre: { pt: "Equestre", en: "Equestrian", re: /hip[ií]smo|horse racing|corrida de cavalos|doncaster cup|st leger|equestre|\bjóquei\b|\bjockey\b/i },
  outra: { pt: "Outra modalidade", en: "Other sport", re: /dardos|darts|snooker|xadrez|chess|esports|surf/i },
};
export const modalidadeDe = (texto) => Object.entries(MODALIDADES).find(([, m]) => m.re.test(texto))?.[0] || null;

export const RULES = [
  ["porto", /\b(fc )?porto\b|drag[aã]o|drag[oõ]es|azuis e brancos/i],
  ["sporting", /\bsporting\b(?! (de |clube de )?braga)|le[oõ]es|alvalade|sporting cp/i],
  ["benfica", /\bbenfica\b|[aá]guias|encarnados|luz\b/i],
  ["mercado", /here we go|transfer|contrat|renov|empr[eé]stimo|cl[aá]usula|assina|rescis|mercado|signs?\b|loan\b|fichaje/i],
  ["modalidades", /futsal|andebol|h[oó]quei|basquet|voleibol|handball|volleyball|basketball|nba\b|t[eé]nis|tennis|golfe|golf\b|ciclismo|cycling|atletismo|athletics|nata[cç][aã]o|r[aá]guebi|rugby|cricket|f[oó]rmula ?1|formula ?1|\bf1\b|motogp|nfl\b|padel|p[aá]del|corrida de cavalos|horse racing|us open|solheim|ryder cup|ehf|euroleague|liga betclic de basquetebol|final four|superta[cç]a de andebol/i],
  ["premios", /pr[eé]mio|bola de ouro|ballon d'or|jogador do m[eê]s|player of the month|melhor jogador|troféu|hall of fame/i],
  ["estatisticas", /estat[ií]stica|statistics|ranking|xg\b|m[eé]dia de idades|n[uú]meros e curiosidades/i],
];
// palavras que marcam uma notícia como sendo de outra modalidade, e não de futebol de onze
export const NAO_FUTEBOL = /\bcricket\b|horse racing|corrida de cavalos|doncaster cup|st leger|\bnfl\b|quarterback|touchdown|college football|super league|\brugby\b|\br[aá]guebi\b|\bnba\b|\bwnba\b|\bgolfe?\b|\bpadel\b|p[aá]del|\bt[eé]nis\b|\btennis\b|\bus open\b|f[oó]rmula ?1|formula ?1|\bf1\b|grand prix|grande pr[eé]mio|motogp|\bciclismo\b|\bciclista|\bcycling\b|volta a portugal|volta a espanha|\batletismo\b|nata[cç][aã]o|voleibol|volleyball|andebol|handball|futsal|h[oó]quei|\behf\b|euroleague|final four|\bnhl\b|\bmlb\b/i;
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
