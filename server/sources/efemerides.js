// «Neste dia»: o que aconteceu no desporto no dia de hoje, há 1, 2, 3, 4, 5, 10, 15… 100 anos.
// Três fontes gratuitas, sem chave:
// - Wikipédia «Neste dia» (pt, en, es, fr, it, de): acontecimentos, nascimentos e mortes, filtrados pelo desporto.
//   Cada língua do site mostra o que a Wikipédia dessa língua regista, com o texto da própria Wikipédia.
// - Wikidata: desportistas nascidos e mortos neste dia (futebolistas, treinadores, tenistas, pilotos…), com os
//   portugueses sempre incluídos e os estrangeiros só quando são conhecidos (páginas em várias Wikipédias).
// - ESPN: os jogos disputados neste dia, nas ligas do ligas.json e nas grandes competições de seleções.
// A lista é refeita à meia-noite de Lisboa (muda o dia) e revista de meia em meia hora. Cada fonte é publicada
// assim que chega, e o site recebe o aviso na hora, sem esperar pelas outras.
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
// competições de seleções e taças que não estão no ligas.json mas contam para a história
const ESPN_EXTRA = [
  { nome: "Campeonato do Mundo", nome_en: "World Cup", espn: "soccer/fifa.world", bandeira: "un" },
  { nome: "Campeonato da Europa", nome_en: "European Championship", espn: "soccer/uefa.euro", bandeira: "eu" },
  { nome: "Supertaça Europeia", nome_en: "UEFA Super Cup", espn: "soccer/uefa.super_cup", bandeira: "eu" },
  { nome: "Mundial de Clubes", nome_en: "Club World Cup", espn: "soccer/fifa.cwc", bandeira: "un" },
  { nome: "Copa América", nome_en: "Copa América", espn: "soccer/conmebol.america", bandeira: "un" },
];

// dia de Lisboa: { ano, mes, dia, iso }
export function hojeLisboa(ts = Date.now()) {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ts));
  const [ano, mes, dia] = iso.split("-").map(Number);
  return { ano, mes, dia, iso };
}
const dd = (n) => String(n).padStart(2, "0");
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
    } catch (e) { erro = e; await sleep(1500 * (i + 1)); }
  }
  throw erro;
}

/* ───────── Wikipédia «Neste dia» ───────── */
const TIPOS_WIKI = { selected: "acontecimento", events: "acontecimento", births: "nascimento", deaths: "morte" };
async function wikipedia(lang, mes, dia) {
  const caminho = `feed/onthisday/all/${dd(mes)}/${dd(dia)}`;
  // a REST de cada Wikipédia; se falhar, o agregador da Wikimedia
  let d = null;
  try { d = await json(`https://${lang}.wikipedia.org/api/rest_v1/${caminho}`); }
  catch { d = await json(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/onthisday/all/${dd(mes)}/${dd(dia)}`); }
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

/* ───────── Wikidata: desportistas nascidos e mortos neste dia ───────── */
// profissões: futebolista, treinador, árbitro, tenista, basquetebolista, piloto (e de F1), ciclista, atleta de atletismo,
// nadador, andebolista, voleibolista, futsalista, pugilista, golfista, motociclista, judoca, râguebi, futebol americano,
// hóquei no gelo, basebol, críquete, ginasta, esgrimista, desportista em geral
const PROFISSOES = ["Q937857", "Q628099", "Q10833314", "Q3665646", "Q378622", "Q10841764", "Q2309784", "Q11513337", "Q10843402",
  "Q13365117", "Q15117302", "Q11338576", "Q13156709", "Q3014296", "Q6665249", "Q14089670", "Q19204627", "Q11774891",
  "Q10871364", "Q12299841", "Q2066131"];
const MIN_LIGACOES = Number(process.env.EFEMERIDES_MIN_WIKIS) || 25; // estrangeiros: só os que têm páginas em muitas Wikipédias
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

/* ───────── ESPN: jogos disputados neste dia ───────── */
async function jogosEspn(ligas, anosAlvo, mes, dia, log, aoChegar = () => {}) {
  const out = [];
  const fut = ligas.filter((l) => l.espn && l.espn.startsWith("soccer/"));
  // a ESPN não tem resultados de futebol anteriores a meados dos anos 90: não vale a pena pedir
  const pedidos = [];
  for (const lg of [...fut, ...ESPN_EXTRA]) for (const ano of anosAlvo.filter((a) => a >= ESPN_DESDE)) pedidos.push([lg, ano]);
  let parar = false;
  const trabalhador = async () => {
    while (pedidos.length && !parar) {
      const [lg, ano] = pedidos.shift();
      let d = null;
      try { d = await json(`${ESPN}/${lg.espn}/scoreboard?dates=${ano}${dd(mes)}${dd(dia)}`, { tentativas: 1, timeout: 12000 }); }
      catch (e) { if (e.status === 403 || e.status === 429) { log(`[Neste dia] ESPN: ${e.message}`); parar = true; return; } }
      const evs = (d?.events || []).filter((ev) => ev.status?.type?.completed || ev.status?.type?.state === "post");
      if (!evs.length) continue;
      const antes = out.length;
      for (const ev of evs) {
        const comp = ev.competitions?.[0] || {};
        const lado = (h) => comp.competitors?.find((c) => c.homeAway === h) || {};
        const casa = lado("home"), fora = lado("away");
        const nome = (c) => c.team?.displayName || c.team?.shortDisplayName || c.team?.name || "";
        // o dia do jogo em Lisboa tem de ser mesmo este (a ESPN agrupa pela data americana)
        const quando = Date.parse(ev.date);
        if (quando) { const h = hojeLisboa(quando); if (h.mes !== mes || h.dia !== dia) continue; }
        const golos = (comp.details || []).filter((x) => x.scoringPlay).map((x) => ({
          min: x.clock?.displayValue || "", quem: x.athletesInvolved?.[0]?.displayName || "", casa: String(x.team?.id) === String(casa.team?.id),
        }));
        out.push({
          tipo: "jogo",
          ano,
          id: `espn:${ev.id}`,
          liga: lg.nome, liga_en: lg.nome_en || lg.nome, bandeira: lg.bandeira || null,
          casa: nome(casa), fora: nome(fora),
          hs: Number(casa.score ?? 0), as: Number(fora.score ?? 0),
          logoCasa: casa.team?.logo || casa.team?.logos?.[0]?.href || null,
          logoFora: fora.team?.logo || fora.team?.logos?.[0]?.href || null,
          penaltis: casa.shootoutScore != null ? `${casa.shootoutScore}-${fora.shootoutScore}` : null,
          golos: golos.slice(0, 12),
          fase: comp.notes?.[0]?.headline || ev.season?.slug || null,
          link: `https://www.espn.com/soccer/match/_/gameId/${ev.id}`,
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
  const estado = { at: null, dia: dados?.dia || null, erros: {}, contagem: {} };
  const cacheJogos = { dia: dados?.dia || null, lista: dados?.jogos || [] };
  let aCorrer = false;

  const gravar = () => { try { fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(dados)); } catch { /* só em memória */ } };

  async function montar() {
    if (aCorrer) return;
    aCorrer = true;
    const h = hojeLisboa();
    const alvo = ANOS.map((n) => h.ano - n).filter((a) => existe(a, h.mes, h.dia));
    const anosSet = new Set(alvo);
    const erros = {};
    // numa revisão do mesmo dia, a lista anterior fica visível enquanto a nova se compõe
    const mesmoDia = dados?.dia === h.iso;
    const novo = {
      dia: h.iso, at: Date.now(), anos: alvo, completo: mesmoDia && !!dados.completo,
      wiki: mesmoDia ? { ...(dados.wiki || {}) } : {},
      pessoas: mesmoDia ? dados.pessoas || [] : [],
      jogos: cacheJogos.dia === h.iso ? cacheJogos.lista : [],
    };
    // publica o que já há e avisa o site (os avisos seguidos juntam-se num só)
    let aviso = null;
    const publicar = () => {
      if (hojeLisboa().iso !== h.iso) return;
      novo.at = Date.now();
      dados = novo;
      if (!aviso) aviso = setTimeout(() => { aviso = null; broadcast("efemerides", { dia: h.iso, at: novo.at }); }, 1200);
    };
    if (!mesmoDia) publicar(); // o site passa logo para o dia novo, a mostrar «a preparar»
    try {
      await Promise.all([
        // 1) Wikipédia, nas seis línguas (a portuguesa primeiro)
        (async () => {
          for (const l of LINGUAS) {
            try { novo.wiki[l] = (await wikipedia(l, h.mes, h.dia)).filter((x) => anosSet.has(x.ano)); }
            catch (e) { erros[`wikipedia-${l}`] = e.message; novo.wiki[l] = novo.wiki[l] || []; }
            publicar();
            await sleep(300);
          }
        })(),
        // 2) Wikidata: nascimentos e mortes (as datas guardadas como dia exato)
        (async () => {
          const datas = alvo.map((a) => `${a}-${dd(h.mes)}-${dd(h.dia)}`);
          const [n, m] = await Promise.allSettled([wikidata("P569", datas), wikidata("P570", datas)]);
          if (n.status === "rejected") erros.wikidata = n.reason?.message;
          if (m.status === "rejected") erros.wikidata = m.reason?.message;
          const pessoas = [...(n.value || []), ...(m.value || [])];
          if (pessoas.length || !novo.pessoas.length) novo.pessoas = pessoas;
          publicar();
        })(),
        // 3) jogos da ESPN: só uma vez por dia (o passado não muda)
        (async () => {
          if (cacheJogos.dia === h.iso && cacheJogos.lista.length) return;
          try {
            const lista = await jogosEspn(ligas, alvo, h.mes, h.dia, log, (parcial) => { novo.jogos = [...parcial]; publicar(); });
            cacheJogos.lista = lista; cacheJogos.dia = h.iso;
            novo.jogos = lista;
          } catch (e) { erros.espn = e.message; }
          publicar();
        })(),
      ]);
      novo.completo = true;
      publicar();
      Object.assign(estado, {
        at: Date.now(), dia: h.iso, erros,
        contagem: { ...Object.fromEntries(LINGUAS.map((l) => [`wikipedia-${l}`, (novo.wiki[l] || []).length])), pessoas: novo.pessoas.length, jogos: novo.jogos.length },
      });
      gravar();
      log(`[Neste dia] ${h.iso}: ${novo.pessoas.length} desportistas, ${novo.jogos.length} jogos, ${LINGUAS.map((l) => `${l} ${(novo.wiki[l] || []).length}`).join(" · ")}`);
    } finally { aCorrer = false; }
  }

  // o que o site mostra numa língua: acontecimentos da Wikipédia dessa língua (ou, se ela não tiver
  // nada de desporto, da inglesa), desportistas do Wikidata e jogos da ESPN, sem repetidos
  function para(lang) {
    const L = LINGUAS.includes(lang) ? lang : "pt";
    const h = hojeLisboa();
    if (!dados || dados.dia !== h.iso) return { dia: h.iso, anos: ANOS, pronto: false, itens: [] };
    const itens = [];
    const wiki = dados.wiki?.[L]?.length ? dados.wiki[L] : dados.wiki?.en || [];
    const langWiki = dados.wiki?.[L]?.length ? L : "en";
    const qidsPessoas = new Set();
    // desportistas do Wikidata, com o nome e a descrição na língua escolhida
    for (const p of dados.pessoas || []) {
      qidsPessoas.add(p.qid);
      const nome = p.nome[L] || p.nome.en || p.nome.pt;
      const desc = p.desc[L] || p.desc.en || p.desc.pt || "";
      itens.push({
        id: `wd:${p.tipo}:${p.qid}`, tipo: p.tipo, ano: p.ano, anos: h.ano - p.ano, nome, desc,
        portugues: p.portugues, peso: (p.portugues ? 100 : 0) + p.ligacoes, img: p.img,
        link: (L === "pt" ? p.link.pt : null) || p.link.en || p.link.pt || `https://www.wikidata.org/wiki/${p.qid}`,
      });
    }
    for (const w of wiki) {
      // nascimentos e mortes que o Wikidata já trouxe não se repetem
      if ((w.tipo === "nascimento" || w.tipo === "morte") && w.qids.some((q) => qidsPessoas.has(q))) continue;
      itens.push({
        id: `wp:${w.tipo}:${w.ano}:${norm(w.texto).slice(0, 60)}`, tipo: w.tipo, ano: w.ano, anos: h.ano - w.ano,
        texto: w.texto, img: w.img, link: w.link, lang: langWiki, peso: 60 + (PT.test(w.texto) ? 40 : 0),
      });
    }
    for (const j of dados.jogos || []) itens.push({ ...j, anos: h.ano - j.ano, peso: pesoJogo(j) });
    itens.sort((a, b) => a.anos - b.anos || (b.peso || 0) - (a.peso || 0));
    return { dia: h.iso, anos: dados.anos, pronto: dados.completo !== false || itens.length > 0, completo: dados.completo !== false, at: dados.at, itens };
  }

  async function start() {
    for (;;) {
      try { await montar(); } catch (e) { log(`[Neste dia] ${e.message}`); }
      // espera até à próxima revisão ou até à meia-noite de Lisboa, o que vier primeiro
      const dia = hojeLisboa().iso;
      const ate = Date.now() + REVER_MS;
      while (Date.now() < ate && hojeLisboa().iso === dia) await sleep(30000);
    }
  }

  return { start, para, estado: () => estado };
}
