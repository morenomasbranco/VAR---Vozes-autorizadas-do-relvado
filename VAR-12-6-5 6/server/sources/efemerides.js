// «Nesta semana»: o que aconteceu no desporto nos sete dias da semana atual (de segunda a domingo),
// há 1, 2, 3, 4, 5, 10, 15… 100 anos. Três fontes gratuitas, sem chave:
// - Wikipédia «Neste dia» (pt, en, es, fr, it, de), para cada dia da semana: acontecimentos, nascimentos e mortes,
//   filtrados pelo desporto. Se a API da Wikipédia não responder, lê-se a própria página do dia
//   («19 de setembro», «September 19») e tiram-se de lá as linhas de desporto.
// - Wikidata: desportistas nascidos e mortos nesses dias (futebolistas, treinadores, tenistas, pilotos…), com os
//   portugueses sempre incluídos e os estrangeiros só quando são conhecidos (páginas em várias Wikipédias).
// - ESPN: os jogos disputados nesses dias, nas ligas do ligas.json (futebol e basquetebol) e nas grandes
//   competições de clubes e de seleções (um pedido por liga e por ano, com a semana inteira).
// - Wikidata: acontecimentos de futebol, futsal, basquetebol e hóquei em patins com data exata nesses dias
//   (finais, jogos marcantes, início e fim de competições), portugueses e internacionais.
// A lista é refeita quando a semana muda (segunda-feira, meia-noite de Lisboa) e revista de meia em meia hora.
// Cada fonte é publicada assim que chega, e o site recebe o aviso na hora, sem esperar pelas outras.
import fs from "node:fs";
import { sleep, norm } from "../util.js";

export const ANOS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
export const LINGUAS = ["pt", "en", "es", "fr", "it", "de"];
const FICHEIRO = new URL("../../data/efemerides.json", import.meta.url);
const UA = process.env.EFEMERIDES_UA || "VAR-feed/1.0 (https://github.com/morenomasbranco/VAR---Vozes-autorizadas-do-relvado; agregador de notícias de desporto)";
const ESPN = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_DESDE = Number(process.env.EFEMERIDES_ESPN_DESDE) || 1994;
const REVER_MS = (Number(process.env.EFEMERIDES_HORAS) || 0.5) * 3600e3;
const ESPN_PARALELO = Math.max(1, Number(process.env.EFEMERIDES_ESPN_PARALELO) || 6); // pedidos à ESPN ao mesmo tempo
// sobe quando as fontes mudam: a lista gravada da semana é refeita em vez de ficar a de antes
const VERSAO = 2;
// competições de seleções e taças que não estão no ligas.json mas contam para a história
const ESPN_EXTRA = [
  { nome: "Campeonato do Mundo", nome_en: "World Cup", espn: "soccer/fifa.world", bandeira: "un" },
  { nome: "Campeonato da Europa", nome_en: "European Championship", espn: "soccer/uefa.euro", bandeira: "eu" },
  { nome: "Supertaça Europeia", nome_en: "UEFA Super Cup", espn: "soccer/uefa.super_cup", bandeira: "eu" },
  { nome: "Mundial de Clubes", nome_en: "Club World Cup", espn: "soccer/fifa.cwc", bandeira: "un" },
  { nome: "Copa América", nome_en: "Copa América", espn: "soccer/conmebol.america", bandeira: "un" },
  { nome: "Qualificação para o Europeu", nome_en: "Euro qualifying", espn: "soccer/uefa.euroq", bandeira: "eu" },
  { nome: "Mundial feminino", nome_en: "Women's World Cup", espn: "soccer/fifa.wwc", bandeira: "un" },
  { nome: "Europeu feminino", nome_en: "Women's Euro", espn: "soccer/uefa.weuro", bandeira: "eu" },
  { nome: "Jogos Olímpicos (futebol)", nome_en: "Olympic football", espn: "soccer/fifa.olympics", bandeira: "un" },
  { nome: "Libertadores", nome_en: "Copa Libertadores", espn: "soccer/conmebol.libertadores", bandeira: "un" },
  { nome: "Sul-Americana", nome_en: "Copa Sudamericana", espn: "soccer/conmebol.sudamericana", bandeira: "un" },
  { nome: "Taça de Inglaterra", nome_en: "FA Cup", espn: "soccer/eng.fa", bandeira: "gb-eng" },
  { nome: "Taça da Liga inglesa", nome_en: "EFL Cup", espn: "soccer/eng.league_cup", bandeira: "gb-eng" },
  { nome: "Taça do Rei", nome_en: "Copa del Rey", espn: "soccer/esp.copa_del_rey", bandeira: "es" },
  { nome: "Taça de Itália", nome_en: "Coppa Italia", espn: "soccer/ita.coppa_italia", bandeira: "it" },
  { nome: "Taça da Alemanha", nome_en: "DFB-Pokal", espn: "soccer/ger.dfb_pokal", bandeira: "de" },
  { nome: "Taça de França", nome_en: "Coupe de France", espn: "soccer/fra.coupe_de_france", bandeira: "fr" },
  { nome: "Liga escocesa", nome_en: "Scottish Premiership", espn: "soccer/sco.1", bandeira: "gb-sct" },
  { nome: "Liga argentina", nome_en: "Argentine league", espn: "soccer/arg.1", bandeira: "ar" },
  { nome: "Liga mexicana", nome_en: "Liga MX", espn: "soccer/mex.1", bandeira: "mx" },
  { nome: "Liga belga", nome_en: "Belgian Pro League", espn: "soccer/bel.1", bandeira: "be" },
];
// NBA e WNBA têm jogos todos os dias: só entram os do playoff (as finais incluídas)
const SO_PLAYOFF = /^basketball\/(nba|wnba)$/;

// dia de Lisboa: { ano, mes, dia, iso }
export function hojeLisboa(ts = Date.now()) {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ts));
  const [ano, mes, dia] = iso.split("-").map(Number);
  return { ano, mes, dia, iso };
}
const dd = (n) => String(n).padStart(2, "0");
// semana de Lisboa que contém o instante: de segunda a domingo, cada dia com { ano, mes, dia, iso }
export function semanaLisboa(ts = Date.now()) {
  const h = hojeLisboa(ts);
  const base = new Date(Date.UTC(h.ano, h.mes - 1, h.dia, 12));
  const recuo = (base.getUTCDay() + 6) % 7; // 0 = segunda
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + (i - recuo) * 86400e3);
    return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(), iso: d.toISOString().slice(0, 10) };
  });
  return { id: dias[0].iso, dias, hoje: h.iso };
}
// 29 de fevereiro só existe nos anos bissextos
const existe = (ano, mes, dia) => { const d = new Date(Date.UTC(ano, mes - 1, dia)); return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia; };

/* ───────── Desporto ou não ───────── */
// palavras que dizem que é desporto, nas seis línguas; aplicadas ao texto e à descrição das páginas ligadas
const DESPORTO = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[
  // futebol
  "futebol\\w*", "futebolista", "football\\w*", "soccer", "fútbol\\w*", "futbol\\w*", "calcio\\b", "calciator\\w*", "fu(ß|ss)ball\\w*", "footballeur", "footballeuse",
  "treinador de futebol", "entrenador de fútbol", "allenatore di calcio", "entraîneur de football", "fu(ß|ss)balltrainer", "football manager",
  "árbitro de futebol", "football referee", "arbitro di calcio", "schiedsrichter",
  "futsal", "futebol de praia", "beach soccer",
  // competições e clubes
  "taça dos campeões", "liga dos campeões", "champions league", "coupe d'europe", "coppa dei campioni", "europapokal", "copa de europa",
  "campeonato do mundo de futebol", "copa do mundo fifa", "fifa world cup", "coupe du monde de football", "coppa del mondo fifa", "fu(ß|ss)ball-weltmeisterschaft", "copa mundial",
  "uefa", "fifa", "euro \\d{4}", "eurocopa", "bola de ouro", "ballon d'or", "pallone d'oro", "balón de oro",
  "european cup", "cup winners' cup", "uefa cup", "fa cup", "copa del rey", "coppa italia", "dfb-pokal", "coupe de france", "ta[cç]a de portugal", "ta[cç]a da liga",
  "premier league", "primeira liga", "la liga", "serie a", "bundesliga", "ligue 1", "copa libertadores", "copa am[eé]rica",
  "real madrid", "fc barcelona", "manchester united", "manchester city", "liverpool f\\.?c", "juventus", "ac milan", "inter(nazionale)? mil", "bayern", "ajax\\b", "boca juniors", "river plate",
  "benfica", "sporting clube", "sporting cp", "fc porto", "futebol clube do porto", "seleção portuguesa de futebol",
  // outras modalidades
  "t[eé]nis\\b", "tenista", "tennis\\w*", "wimbledon", "roland[- ]garros", "us open", "australian open", "grand slam",
  "basquet\\w*", "basket\\w*", "baloncest\\w*", "pallacanestr\\w*", "nba\\b",
  "andebol", "handball\\w*", "balonmano", "pallamano", "v[oó]lei\\w*", "volley\\w*", "voleibol", "pallavolo",
  "h[oó]quei", "hockey", "rugby", "r[aá]guebi", "golfe?\\b", "golfista", "golfer", "golfeur", "golfspieler",
  "ciclis\\w*", "cycliste", "radrennfahrer", "radsport", "tour de france", "volta a portugal", "giro d'italia", "vuelta a españa",
  "atletismo", "athletics", "athlétisme", "atletica leggera", "leichtathlet\\w*", "maratona", "marathon", "maratón",
  "nata[cç][aã]o", "nadador\\w*", "swimmer", "nageur", "nageuse", "nuotator\\w*", "schwimmer\\w*",
  "f[oó]rmula ?1", "formula one", "formule 1", "formel 1", "motogp", "rali\\b", "rallye", "rally (de|of|dakar|driver|championship)", "le mans", "indianapolis 500", "indy 500",
  "piloto de (automobilismo|f[oó]rmula|corridas|motociclismo|rali|carros)", "racing driver", "pilote automobile", "pilota automobilistic\\w*", "rennfahrer", "automobilis\\w*", "motocicli\\w*",
  "boxe\\b", "boxer", "boxeur", "pugil\\w*", "boxeador", "judo\\w*", "jud[oó]ca", "karat\\w*", "taekwondo", "esgrim\\w*", "fencer", "escrime",
  "ginást\\w*", "gymnast\\w*", "gimnast\\w*", "ginnast\\w*", "remo\\b", "rower", "canoag\\w*", "canoe\\w*", "surf\\b", "surfista", "surfer",
  "ski\\b", "skier\\w*", "esquiador\\w*", "esqui\\b", "sciator\\w*", "skifahrer\\w*", "patinag\\w*", "skater", "patinador\\w*", "wrestl\\w*", "lutador", "ufc", "mma\\b",
  "beisebol", "baseball", "béisbol", "cr[ií]quete", "cricket\\w*", "futebol americano", "american football", "nfl\\b", "quarterback", "super bowl",
  "xadrez", "chess", "échecs", "ajedrez", "scacch\\w*", "schach\\w*",
  // desporto em geral
  "desport\\w*", "deport(e|es|ivo|iva|ivos|ivas|ista|istas)\\b", "sport\\w*", "atleta", "athlete", "athlète", "ol[ií]mpic\\w*", "olympic\\w*", "olympique\\w*", "olympisch\\w*", "olimpic\\w*", "jogos ol[ií]mpicos", "paral[ií]mpic\\w*", "paralympi\\w*",
  "medalha de ouro", "gold medal", "médaille d'or", "medalla de oro", "medaglia d'oro", "goldmedaille",
  "campeão (mundial|europeu|olímpico|nacional)", "world champion", "champion du monde", "campe[oó]n (del mundo|mundial)", "campione del mondo", "weltmeister\\w*",
  "recorde mundial", "world record", "record du monde", "récord mundial", "record mondiale", "weltrekord",
].join("|")})`, "iu");
// o que parece desporto mas não é (política com «desportivo», doenças com «atleta»…)
const NAO = /pé de atleta|athlete's foot|ministério do desporto e|reforma desportiva do governo/i;
export const eDesporto = (texto) => DESPORTO.test(texto) && !NAO.test(texto);

/* ───────── Pedidos ───────── */
async function json(url, { tentativas = 2, timeout = 20000, headers = {} } = {}) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 404) return null;
      if (!r.ok) throw Object.assign(new Error(`${new URL(url).hostname} respondeu ${r.status}`), { status: r.status });
      return await r.json();
    } catch (e) { erro = e; if (i < tentativas - 1) await sleep(1500 * (i + 1)); }
  }
  throw erro;
}

/* ───────── Wikipédia «Neste dia» ───────── */
const TIPOS_WIKI = { selected: "acontecimento", events: "acontecimento", births: "nascimento", deaths: "morte" };
async function wikipedia(lang, mes, dia) {
  const caminho = `feed/onthisday/all/${dd(mes)}/${dd(dia)}`;
  // a REST de cada Wikipédia; se falhar, o agregador da Wikimedia
  let d = null;
  try { d = await json(`https://${lang}.wikipedia.org/api/rest_v1/${caminho}`, { tentativas: 1 }); }
  catch { d = await json(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/all/${dd(mes)}/${dd(dia)}`, { tentativas: 1 }); }
  if (!d) return [];
  const out = [];
  for (const [campo, tipo] of Object.entries(TIPOS_WIKI)) {
    for (const ev of d[campo] || []) {
      const ano = Number(ev.year);
      if (!Number.isFinite(ano) || !ev.text) continue;
      const pages = ev.pages || [];
      // o desporto tem de estar no texto ou na descrição das páginas ligadas (não no resumo, que fala de tudo)
      const alvo = `${ev.text} ${pages.map((p) => p.description || "").join(" ")}`;
      if (!eDesporto(alvo)) continue;
      const principal = pages.find((p) => p.thumbnail?.source) || pages[0];
      out.push({
        tipo, ano, lang,
        texto: String(ev.text).trim(),
        qids: pages.map((p) => p.wikibase_item).filter(Boolean),
        link: principal?.content_urls?.desktop?.page || null,
        img: principal?.thumbnail?.source || null,
        titulo: principal?.titles?.normalized || principal?.title || null,
      });
    }
  }
  return out;
}

/* ───────── Wikipédia: página do dia (recurso quando a API «Neste dia» falha) ───────── */
const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAGINA_DIA = { pt: (m, d) => `${d} de ${MESES_PT[m - 1]}`, en: (m, d) => `${MESES_EN[m - 1]} ${d}` };
const SECCAO_DIA = [
  [/^(eventos|acontecimentos|events)\b/i, "acontecimento"],
  [/^(nascimentos|births)\b/i, "nascimento"],
  [/^(falecimentos|mortes|[oó]bitos|deaths)\b/i, "morte"],
];
// wikitexto → texto simples
function limparWiki(t) {
  let s = String(t || "").replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(s); i++) {
    s = s.replace(/\{\{(?:flagicon|bandeira|band|flag)[^{}]*\}\}/gi, "").replace(/\{\{[^{}|]*\|([^{}|]*)\}\}/g, "$1").replace(/\{\{[^{}]*\}\}/g, "");
  }
  return s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, "$1").replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
async function wikipediaPagina(lang, mes, dia) {
  const titulo = PAGINA_DIA[lang]?.(mes, dia);
  if (!titulo) return [];
  const d = await json(`https://${lang}.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&redirects=1&prop=wikitext&page=${encodeURIComponent(titulo)}`);
  const texto = d?.parse?.wikitext;
  if (!texto) return [];
  const out = [];
  let tipo = null;
  let anoPai = null; // «* [[1990]]» sozinho: as linhas «**» seguintes são desse ano
  for (const linha of texto.split("\n")) {
    const h = linha.match(/^==+\s*(.+?)\s*==+\s*$/);
    if (h) {
      const nome = limparWiki(h[1]);
      const sec = SECCAO_DIA.find(([re]) => re.test(nome));
      if (/^==[^=]/.test(linha)) tipo = sec ? sec[1] : null;
      else if (sec) tipo = sec[1];
      anoPai = null;
      continue;
    }
    if (!tipo || !/^\*/.test(linha)) continue;
    const nivel = linha.match(/^\*+/)[0].length;
    const limpa = limparWiki(linha.replace(/^\*+\s*/, ""));
    const m = limpa.match(/^(\d{3,4})(?:\s*(?:[—–-]|:)\s*(.*))?$/);
    if (m && !m[2]) { anoPai = Number(m[1]); continue; }
    let ano = m ? Number(m[1]) : null;
    let resto = m ? m[2] : limpa;
    if (!ano && nivel > 1 && anoPai) ano = anoPai;
    if (!ano || !resto || !eDesporto(resto)) continue;
    const link = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, "_"))}`;
    out.push({ tipo, ano, lang, texto: resto, qids: [], link, img: null, titulo: null });
  }
  return out;
}

/* ───────── Wikidata: desportistas nascidos e mortos neste dia ───────── */
// profissões: futebolista, treinador, árbitro, tenista, basquetebolista, piloto (e de F1), ciclista, atleta de atletismo,
// nadador, andebolista, voleibolista, futsalista, pugilista, golfista, motociclista, judoca, râguebi, futebol americano,
// hóquei no gelo, basebol, críquete, ginasta, esgrimista, desportista em geral
const PROFISSOES = ["Q937857", "Q628099", "Q10833314", "Q3665646", "Q378622", "Q10841764", "Q2309784", "Q11513337", "Q10843402",
  "Q13365117", "Q15117302", "Q11338576", "Q13156709", "Q3014296", "Q6665249", "Q14089670", "Q19204627", "Q11774891",
  "Q10871364", "Q12299841", "Q2066131"];
const MIN_LIGACOES = Number(process.env.EFEMERIDES_MIN_WIKIS) || 15; // estrangeiros: só os que têm páginas em muitas Wikipédias
async function wikidata(propriedade, datas) {
  if (!datas.length) return [];
  const valores = datas.map((d) => `"${d}T00:00:00Z"^^xsd:dateTime`).join(" ");
  const etiquetas = LINGUAS.map((l) => `OPTIONAL { ?p rdfs:label ?l_${l} FILTER(LANG(?l_${l}) = "${l}") } OPTIONAL { ?p schema:description ?d_${l} FILTER(LANG(?d_${l}) = "${l}") }`).join("\n  ");
  // a ordem dos padrões é a de execução (optimizador desligado): primeiro as pessoas com esta data, que
  // são poucas centenas por dia, e só depois a profissão; ao contrário, o Wikidata percorria todos os futebolistas
  const q = `SELECT DISTINCT ?p ?data ?links ?pt ?img ${LINGUAS.map((l) => `?l_${l} ?d_${l}`).join(" ")} ?wpt ?wen WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?data { ${valores} }
  ?p wdt:${propriedade} ?data .
  ?p wdt:P106 ?occ .
  VALUES ?occ { ${PROFISSOES.map((x) => `wd:${x}`).join(" ")} }
  ?p wikibase:sitelinks ?links .
  ?p p:${propriedade}/psv:${propriedade} [ wikibase:timeValue ?data ; wikibase:timePrecision 11 ] .
  OPTIONAL { ?p wdt:P27 wd:Q45 . BIND(true AS ?pt) }
  FILTER(?links >= ${MIN_LIGACOES} || BOUND(?pt) && ?links >= 4)
  OPTIONAL { ?p wdt:P18 ?img }
  OPTIONAL { ?wpt schema:about ?p ; schema:isPartOf <https://pt.wikipedia.org/> }
  OPTIONAL { ?wen schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
  ${etiquetas}
} LIMIT 400`;
  const d = await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { timeout: 55000, headers: { Accept: "application/sparql-results+json" } });
  const vistos = new Map();
  for (const b of d?.results?.bindings || []) {
    const qid = b.p.value.split("/").pop();
    if (vistos.has(qid)) continue;
    const ano = Number(b.data.value.slice(0, 4));
    const nome = Object.fromEntries(LINGUAS.map((l) => [l, b[`l_${l}`]?.value]).filter(([, v]) => v));
    const desc = Object.fromEntries(LINGUAS.map((l) => [l, b[`d_${l}`]?.value]).filter(([, v]) => v));
    if (!nome.pt && !nome.en) continue;
    vistos.set(qid, {
      tipo: propriedade === "P569" ? "nascimento" : "morte",
      ano, qid, nome, desc,
      portugues: !!b.pt,
      ligacoes: Number(b.links.value) || 0,
      img: b.img ? `${b.img.value.replace(/^http:/, "https:")}?width=160` : null,
      link: { pt: b.wpt?.value || null, en: b.wen?.value || null },
    });
  }
  return [...vistos.values()];
}

/* ───────── Wikidata: acontecimentos de futebol, futsal, basquetebol e hóquei em patins ───────── */
// Tudo o que no Wikidata tem data exata num destes dias e é de uma das quatro modalidades: finais, jogos
// marcantes, e o início ou o fim de campeonatos, taças e torneios (portugueses e internacionais).
const MODALIDADES_EV = /football|soccer|futsal|basketball|roller hockey|rink hockey|quad hockey/i;
const NAO_MODALIDADES = /american|australian|gaelic|canadian|arena|rugby|wheelchair|3x3|table football|fantasy/i;
const MOD_EV = (l) => (/futsal/i.test(l) ? "futsal" : /basketball/i.test(l) ? "basquetebol" : /hockey/i.test(l) ? "hoquei_patins" : "futebol");
const MIN_LIGACOES_EV = Number(process.env.EFEMERIDES_MIN_WIKIS_EV) || 2; // estrangeiros: páginas em pelo menos duas Wikipédias
async function acontecimentos(datas) {
  if (!datas.length) return [];
  const valores = datas.map((d) => `"${d}T00:00:00Z"^^xsd:dateTime`).join(" ");
  const etiquetas = LINGUAS.map((l) => `OPTIONAL { ?e rdfs:label ?l_${l} FILTER(LANG(?l_${l}) = "${l}") } OPTIONAL { ?e schema:description ?d_${l} FILTER(LANG(?d_${l}) = "${l}") }`).join("\n  ");
  const vencedor = LINGUAS.map((l) => `OPTIONAL { ?w rdfs:label ?w_${l} FILTER(LANG(?w_${l}) = "${l}") }`).join(" ");
  // mesma ideia da consulta das pessoas: primeiro as datas, depois a modalidade
  const ramo = (prop, k) => `{ ?e wdt:${prop} ?data . ?e p:${prop}/psv:${prop} [ wikibase:timeValue ?data ; wikibase:timePrecision 11 ] . BIND("${k}" AS ?k) }`;
  const q = `SELECT DISTINCT ?e ?data ?k ?links ?pt ?img ?spl ?wpt ?wen ${LINGUAS.map((l) => `?l_${l} ?d_${l} ?w_${l}`).join(" ")} WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?data { ${valores} }
  { ${ramo("P585", "dia")} UNION ${ramo("P580", "inicio")} UNION ${ramo("P582", "fim")} }
  ?e wdt:P641 ?sport .
  ?sport rdfs:label ?spl . FILTER(LANG(?spl) = "en")
  ?e wikibase:sitelinks ?links .
  OPTIONAL { ?e wdt:P17 wd:Q45 . BIND(true AS ?pt) }
  FILTER(?links >= ${MIN_LIGACOES_EV} || BOUND(?pt))
  OPTIONAL { ?e wdt:P18 ?img }
  OPTIONAL { ?e wdt:P1346 ?w . ${vencedor} }
  OPTIONAL { ?wpt schema:about ?e ; schema:isPartOf <https://pt.wikipedia.org/> }
  OPTIONAL { ?wen schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
  ${etiquetas}
} LIMIT 800`;
  const d = await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { timeout: 55000, headers: { Accept: "application/sparql-results+json" } });
  const vistos = new Map();
  for (const b of d?.results?.bindings || []) {
    const spl = b.spl?.value || "";
    if (!MODALIDADES_EV.test(spl) || NAO_MODALIDADES.test(spl)) continue;
    const qid = b.e.value.split("/").pop();
    const chave = `${qid}:${b.k.value}`;
    if (vistos.has(chave)) continue;
    const nome = Object.fromEntries(LINGUAS.map((l) => [l, b[`l_${l}`]?.value]).filter(([, v]) => v));
    if (!nome.pt && !nome.en) continue;
    vistos.set(chave, {
      tipo: "acontecimento", fonte: "wikidata", k: b.k.value,
      ano: Number(b.data.value.slice(0, 4)), qid, nome,
      desc: Object.fromEntries(LINGUAS.map((l) => [l, b[`d_${l}`]?.value]).filter(([, v]) => v)),
      vencedor: Object.fromEntries(LINGUAS.map((l) => [l, b[`w_${l}`]?.value]).filter(([, v]) => v)),
      mod: MOD_EV(spl),
      portugues: !!b.pt,
      ligacoes: Number(b.links.value) || 0,
      img: b.img ? `${b.img.value.replace(/^http:/, "https:")}?width=160` : null,
      link: { pt: b.wpt?.value || null, en: b.wen?.value || null },
    });
  }
  return [...vistos.values()];
}
// o texto de cada acontecimento na língua escolhida
const EV_TXT = {
  pt: { inicio: "Começou", fim: "Terminou", venceu: "vencedor" }, en: { inicio: "Started", fim: "Ended", venceu: "winner" },
  es: { inicio: "Comenzó", fim: "Terminó", venceu: "ganador" }, fr: { inicio: "Début", fim: "Fin", venceu: "vainqueur" },
  it: { inicio: "Inizio", fim: "Fine", venceu: "vincitore" }, de: { inicio: "Beginn", fim: "Ende", venceu: "Sieger" },
};
function textoEvento(e, L) {
  const tx = EV_TXT[L] || EV_TXT.pt;
  const nome = e.nome[L] || e.nome.en || e.nome.pt;
  const desc = e.desc?.[L] || e.desc?.en || "";
  const venc = e.vencedor?.[L] || e.vencedor?.en || e.vencedor?.pt;
  const base = e.k === "inicio" ? `${tx.inicio}: ${nome}` : e.k === "fim" ? `${tx.fim}: ${nome}` : nome;
  return `${base}${desc ? ` (${desc})` : ""}${venc ? ` — ${tx.venceu}: ${venc}` : ""}`;
}

/* ───────── ESPN: jogos disputados neste dia ───────── */
async function jogosEspn(ligas, semana, log, aoChegar = () => {}) {
  const out = [];
  const fut = ligas.filter((l) => l.espn && (l.espn.startsWith("soccer/") || l.espn.startsWith("basketball/")));
  // para cada aniversário (há n anos), os dias da semana nesse ano: «MM-DD» → ano esperado
  const periodos = ANOS.map((n) => {
    const dias = semana.dias.filter((d) => existe(d.ano - n, d.mes, d.dia)).map((d) => ({ ...d, alvo: d.ano - n }));
    if (!dias.length) return null;
    const ymd = (d) => `${d.alvo}${dd(d.mes)}${dd(d.dia)}`;
    return { n, dias, intervalo: `${ymd(dias[0])}-${ymd(dias[dias.length - 1])}` };
  }).filter((p) => p && p.dias[0].alvo >= ESPN_DESDE);
  // a ESPN não tem resultados de futebol anteriores a meados dos anos 90: não vale a pena pedir
  const pedidos = [];
  for (const lg of [...fut, ...ESPN_EXTRA]) for (const per of periodos) pedidos.push([lg, per]);
  let parar = false;
  const trabalhador = async () => {
    while (pedidos.length && !parar) {
      const [lg, per] = pedidos.shift();
      let d = null;
      try { d = await json(`${ESPN}/${lg.espn}/scoreboard?dates=${per.intervalo}&limit=400`, { tentativas: 1, timeout: 15000 }); }
      catch (e) { if (e.status === 403 || e.status === 429) { log(`[Neste dia] ESPN: ${e.message}`); parar = true; return; } }
      const evs = (d?.events || []).filter((ev) => (ev.status?.type?.completed || ev.status?.type?.state === "post")
        && (!SO_PLAYOFF.test(lg.espn) || ev.season?.type === 3));
      if (!evs.length) continue;
      const antes = out.length;
      for (const ev of evs) {
        const comp = ev.competitions?.[0] || {};
        const lado = (h) => comp.competitors?.find((c) => c.homeAway === h) || {};
        const casa = lado("home"), fora = lado("away");
        const nome = (c) => c.team?.displayName || c.team?.shortDisplayName || c.team?.name || "";
        // o dia do jogo em Lisboa tem de ser um dos dias da semana, no ano certo (a ESPN agrupa pela data americana)
        const quando = Date.parse(ev.date);
        if (!quando) continue;
        const h = hojeLisboa(quando);
        const dSem = per.dias.find((x) => x.mes === h.mes && x.dia === h.dia && x.alvo === h.ano);
        if (!dSem) continue;
        const ano = h.ano;
        const golos = (comp.details || []).filter((x) => x.scoringPlay).map((x) => ({
          min: x.clock?.displayValue || "", quem: x.athletesInvolved?.[0]?.displayName || "", casa: String(x.team?.id) === String(casa.team?.id),
        }));
        out.push({
          tipo: "jogo",
          ano,
          dia: dSem.iso, // o dia desta semana em que o jogo faz anos
          id: `espn:${ev.id}`,
          liga: lg.nome, liga_en: lg.nome_en || lg.nome, bandeira: lg.bandeira || null,
          casa: nome(casa), fora: nome(fora),
          hs: Number(casa.score ?? 0), as: Number(fora.score ?? 0),
          logoCasa: casa.team?.logo || casa.team?.logos?.[0]?.href || null,
          logoFora: fora.team?.logo || fora.team?.logos?.[0]?.href || null,
          penaltis: casa.shootoutScore != null ? `${casa.shootoutScore}-${fora.shootoutScore}` : null,
          golos: golos.slice(0, 12),
          fase: comp.notes?.[0]?.headline || ev.season?.slug || null,
          mod: lg.espn.startsWith("basketball/") ? "basquetebol" : null,
          link: ev.links?.find((x) => x.href)?.href
            || (lg.espn.startsWith("soccer/") ? `https://www.espn.com/soccer/match/_/gameId/${ev.id}` : `https://www.espn.com/${lg.espn.split("/")[1]}/game/_/gameId/${ev.id}`),
        });
      }
      if (out.length > antes) aoChegar(out);
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: ESPN_PARALELO }, trabalhador));
  return out;
}

// jogos dos grandes portugueses, da seleção e das finais primeiro
const PT = /benfica|sporting|porto|braga|vit[oó]ria|portugal/i;
const pesoJogo = (j) => (PT.test(`${j.casa} ${j.fora}`) ? 3 : 0) + (/final/i.test(j.fase || "") ? 2 : 0) + (j.bandeira === "pt" ? 1 : 0) + (j.bandeira === "eu" || j.bandeira === "un" ? 1 : 0);

/* ───────── Montagem ───────── */
export function createEfemerides({ log = () => {}, broadcast = () => {}, ligas = [] } = {}) {
  let dados = null;
  try { dados = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { dados = null; }
  if (dados && !dados.semana) dados = null; // ficheiro antigo, do «Neste dia»
  if (dados && dados.versao !== VERSAO) dados = { ...dados, completo: false, jogos: [], semana: `${dados.semana}:v${dados.versao || 1}` }; // fontes novas: refaz-se tudo
  const estado = { at: null, semana: dados?.semana || null, erros: {}, contagem: {} };
  const cacheJogos = { semana: dados?.semana || null, lista: dados?.jogos || [] };
  let aCorrer = false;

  const gravar = () => { try { fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(dados)); } catch { /* só em memória */ } };

  async function montar() {
    if (aCorrer) return;
    aCorrer = true;
    const sem = semanaLisboa();
    // para cada dia da semana, os anos que fazem aniversário redondo (há 1, 2… 100 anos)
    const alvoDia = new Map(sem.dias.map((d) => [d.iso, ANOS.map((n) => d.ano - n).filter((a) => existe(a, d.mes, d.dia))]));
    const erros = {};
    // numa revisão da mesma semana, a lista anterior fica visível enquanto a nova se compõe
    const mesma = dados?.semana === sem.id;
    const novo = {
      semana: sem.id, versao: VERSAO, dias: sem.dias.map((d) => d.iso), at: Date.now(), anos: ANOS, completo: mesma && !!dados.completo,
      wiki: mesma ? { ...(dados.wiki || {}) } : {},
      pessoas: mesma ? dados.pessoas || [] : [],
      eventos: mesma ? dados.eventos || [] : [],
      jogos: cacheJogos.semana === sem.id ? cacheJogos.lista : [],
    };
    // publica o que já há e avisa o site (os avisos seguidos juntam-se num só)
    let aviso = null;
    const publicar = () => {
      if (semanaLisboa().id !== sem.id) return;
      novo.at = Date.now();
      dados = novo;
      if (!aviso) aviso = setTimeout(() => { aviso = null; broadcast("efemerides", { semana: sem.id, at: novo.at }); }, 1200);
    };
    if (!mesma) publicar(); // o site passa logo para a semana nova, a mostrar «a preparar»
    try {
      await Promise.all([
        // 1) Wikipédia, nas seis línguas (a portuguesa primeiro), para cada dia da semana
        (async () => {
          for (const l of LINGUAS) {
            const lista = [];
            let falhou = 0;
            for (const d of sem.dias) {
              const anos = new Set(alvoDia.get(d.iso));
              let doDia = [];
              try { doDia = await wikipedia(l, d.mes, d.dia); } catch (e) { erros[`wikipedia-${l}`] = e.message; falhou++; }
              // a API não deu nada de desporto (ou falhou): a página do dia, em português e inglês
              if (!doDia.length && PAGINA_DIA[l]) {
                try { doDia = await wikipediaPagina(l, d.mes, d.dia); } catch (e) { erros[`wikipedia-pagina-${l}`] = e.message; }
              }
              lista.push(...doDia.filter((x) => anos.has(x.ano)).map((x) => ({ ...x, dia: d.iso })));
              await sleep(250);
            }
            if (lista.length || falhou < sem.dias.length || !novo.wiki[l]) novo.wiki[l] = lista;
            publicar();
          }
        })(),
        // 2) Wikidata: nascimentos e mortes, dia a dia (as datas guardadas como dia exato)
        (async () => {
          const pessoas = [];
          let falhas = 0;
          for (const d of sem.dias) {
            const datas = alvoDia.get(d.iso).map((a) => `${a}-${dd(d.mes)}-${dd(d.dia)}`);
            const [n, m] = await Promise.allSettled([wikidata("P569", datas), wikidata("P570", datas)]);
            if (n.status === "rejected") { erros.wikidata = n.reason?.message; falhas++; }
            if (m.status === "rejected") { erros.wikidata = m.reason?.message; falhas++; }
            pessoas.push(...[...(n.value || []), ...(m.value || [])].map((p) => ({ ...p, dia: d.iso })));
            if (pessoas.length > novo.pessoas.length || !mesma) { novo.pessoas = [...pessoas]; publicar(); }
            await sleep(500);
          }
          if (pessoas.length || falhas < sem.dias.length * 2) novo.pessoas = pessoas;
          publicar();
        })(),
        // 3) Wikidata: acontecimentos de futebol, futsal, basquetebol e hóquei em patins, dia a dia
        (async () => {
          const eventos = [];
          let falhas = 0;
          for (const d of sem.dias) {
            const datas = alvoDia.get(d.iso).map((a) => `${a}-${dd(d.mes)}-${dd(d.dia)}`);
            try { eventos.push(...(await acontecimentos(datas)).map((e) => ({ ...e, dia: d.iso }))); }
            catch (e) { erros["wikidata-acontecimentos"] = e.message; falhas++; }
            if (eventos.length > novo.eventos.length || !mesma) { novo.eventos = [...eventos]; publicar(); }
            await sleep(500);
          }
          if (eventos.length || falhas < sem.dias.length) novo.eventos = eventos;
          publicar();
        })(),
        // 4) jogos da ESPN: uma vez por semana (o passado não muda)
        (async () => {
          if (cacheJogos.semana === sem.id && cacheJogos.lista.length) return;
          try {
            const lista = await jogosEspn(ligas, sem, log, (parcial) => { novo.jogos = [...parcial]; publicar(); });
            cacheJogos.lista = lista; cacheJogos.semana = sem.id;
            novo.jogos = lista;
          } catch (e) { erros.espn = e.message; }
          publicar();
        })(),
      ]);
      novo.completo = true;
      publicar();
      Object.assign(estado, {
        at: Date.now(), semana: sem.id, erros,
        contagem: { ...Object.fromEntries(LINGUAS.map((l) => [`wikipedia-${l}`, (novo.wiki[l] || []).length])), pessoas: novo.pessoas.length, acontecimentos: novo.eventos.length, jogos: novo.jogos.length },
      });
      gravar();
      log(`[Nesta semana] ${sem.id}: ${novo.pessoas.length} desportistas, ${novo.eventos.length} acontecimentos, ${novo.jogos.length} jogos, ${LINGUAS.map((l) => `${l} ${(novo.wiki[l] || []).length}`).join(" · ")}`);
    } finally { aCorrer = false; }
  }

  // o que o site mostra numa língua: acontecimentos da Wikipédia dessa língua (ou, se ela não tiver
  // nada de desporto, da inglesa, e depois da portuguesa), desportistas do Wikidata e jogos da ESPN, sem repetidos
  function para(lang) {
    const L = LINGUAS.includes(lang) ? lang : "pt";
    const sem = semanaLisboa();
    const anoDe = new Map(sem.dias.map((d) => [d.iso, d.ano]));
    if (!dados || dados.semana !== sem.id) return { semana: sem.id, dias: sem.dias.map((d) => d.iso), hoje: sem.hoje, anos: ANOS, pronto: false, itens: [] };
    const itens = [];
    const langWiki = [L, "en", "pt", ...LINGUAS].find((l) => dados.wiki?.[l]?.length) || L;
    const wiki = dados.wiki?.[langWiki] || [];
    const anosDe = (x) => (anoDe.get(x.dia) || sem.dias[0].ano) - x.ano;
    const qidsPessoas = new Set();
    // desportistas do Wikidata, com o nome e a descrição na língua escolhida
    for (const p of dados.pessoas || []) {
      qidsPessoas.add(p.qid);
      const nome = p.nome[L] || p.nome.en || p.nome.pt;
      const desc = p.desc[L] || p.desc.en || p.desc.pt || "";
      itens.push({
        id: `wd:${p.tipo}:${p.qid}`, tipo: p.tipo, ano: p.ano, dia: p.dia, anos: anosDe(p), nome, desc,
        portugues: p.portugues, peso: (p.portugues ? 100 : 0) + p.ligacoes, img: p.img,
        link: (L === "pt" ? p.link.pt : null) || p.link.en || p.link.pt || `https://www.wikidata.org/wiki/${p.qid}`,
      });
    }
    const vistos = new Set();
    for (const w of wiki) {
      // nascimentos e mortes que o Wikidata já trouxe não se repetem
      if ((w.tipo === "nascimento" || w.tipo === "morte") && w.qids.some((q) => qidsPessoas.has(q))) continue;
      const id = `wp:${w.tipo}:${w.dia}:${w.ano}:${norm(w.texto).slice(0, 60)}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      itens.push({
        id, tipo: w.tipo, ano: w.ano, dia: w.dia, anos: anosDe(w),
        texto: w.texto, img: w.img, link: w.link, lang: langWiki, peso: 60 + (PT.test(w.texto) ? 40 : 0),
      });
    }
    // acontecimentos do Wikidata que a Wikipédia «Neste dia» ainda não trouxe
    const qidsWiki = new Set(wiki.flatMap((w) => w.qids || []));
    for (const e of dados.eventos || []) {
      if (qidsWiki.has(e.qid)) continue;
      const id = `wde:${e.k}:${e.qid}:${e.dia}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      itens.push({
        id, tipo: "acontecimento", ano: e.ano, dia: e.dia, anos: anosDe(e), texto: textoEvento(e, L), mod: e.mod,
        portugues: e.portugues, img: e.img, peso: 50 + (e.portugues || PT.test(textoEvento(e, "pt")) ? 40 : 0) + Math.min(e.ligacoes, 40),
        link: (L === "pt" ? e.link.pt : null) || e.link.en || e.link.pt || `https://www.wikidata.org/wiki/${e.qid}`,
      });
    }
    for (const j of dados.jogos || []) itens.push({ ...j, anos: anosDe(j), peso: pesoJogo(j) });
    // por aniversário (há 1 ano, há 2…), depois pelo dia da semana, depois pelo peso
    itens.sort((a, b) => a.anos - b.anos || String(a.dia).localeCompare(String(b.dia)) || (b.peso || 0) - (a.peso || 0));
    return {
      semana: sem.id, dias: dados.dias || sem.dias.map((d) => d.iso), hoje: sem.hoje, anos: dados.anos,
      pronto: dados.completo !== false || itens.length > 0, completo: dados.completo !== false, at: dados.at, itens,
    };
  }

  async function start() {
    for (;;) {
      try { await montar(); } catch (e) { log(`[Nesta semana] ${e.message}`); }
      // espera até à próxima revisão ou até a semana mudar (segunda-feira à meia-noite de Lisboa), o que vier primeiro
      const semana = semanaLisboa().id;
      const ate = Date.now() + REVER_MS;
      while (Date.now() < ate && semanaLisboa().id === semana) await sleep(30000);
    }
  }

  return { start, para, estado: () => estado };
}
