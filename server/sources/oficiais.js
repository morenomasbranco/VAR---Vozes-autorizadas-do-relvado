// Notícias e comunicados oficiais das ligas e federações (Big 5, Brasil, Portugal com todas as associações
// distritais, FIFA, UEFA e CONMEBOL). A lista de fontes está no oficiais.json; cada fonte é lida à sua maneira:
//  - rss: o feed do próprio site (Bundesliga, CONMEBOL, AF Algarve, AF Lisboa);
//  - sitemap: o sitemap de notícias que os sites dão ao Google (Ligue 1, DFB, UEFA), com título e data;
//  - premierleague e fifa: a API pública que as próprias páginas usam;
//  - html: a página da lista, de onde se tiram as ligações que batem certo com o padrão «link» da fonte;
//  - sequencial: as notícias numeradas (FPF), em que se vai experimentando o número seguinte.
// Se uma fonte deixar de responder, passa a ser lida pelo Google News (campo «google»), e volta a tentar o
// site de meia em meia hora. Os títulos que não estão em português são traduzidos pelo Google Tradutor.
// Tudo fica gravado em data/oficiais.json; o site recebe cada entrada nova no mesmo segundo (evento «oficial»).
// As notícias e os comunicados das associações de futebol (grupo «af», e as que a FPF publica sobre uma associação)
// não entram na secção «Ligas e Federações»: vão para a coluna da associação na secção «Distritais», com as notícias
// da imprensa sobre cada associação (pesquisa do Google News, uma por associação).
import fs from "node:fs";
import { sleep, hash, norm, lerTexto, entidades, conserta } from "../util.js";
import { readFeed } from "./rss.js";
import { traduzirGoogle } from "../gtradutor.js";
import { ASSOCIACOES, orgPorNome, associacaoDoTexto } from "../pt/catalogo.js";

const FILE = new URL("../../data/oficiais.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const RITMO = Math.max(20, Number(process.env.OFICIAIS_SEGUNDOS) || 60) * 1000;
const MAX = Number(process.env.OFICIAIS_MAX) || 5000; // as associações e a imprensa de cada uma também contam
const IDADE_MAX = (Number(process.env.OFICIAIS_DIAS) || 30) * 86400e3;
const PRIMEIRA_DIAS = 21; // na primeira leitura de uma fonte entram as entradas das últimas três semanas
const NOVA_DIAS = 7; // depois disso, uma entrada «nova» com mais de uma semana é uma antiga que voltou à lista
const GOOGLE_BASE = process.env.GOOGLE_NEWS_BASE || "https://news.google.com/rss/search";
const LOCALES = { pt: "hl=pt-PT&gl=PT&ceid=PT:pt-150", br: "hl=pt-BR&gl=BR&ceid=BR:pt-419", en: "hl=en-GB&gl=GB&ceid=GB:en", es: "hl=es&gl=ES&ceid=ES:es", fr: "hl=fr&gl=FR&ceid=FR:fr", it: "hl=it&gl=IT&ceid=IT:it", de: "hl=de&gl=DE&ceid=DE:de" };

const limpa = (h) => conserta(entidades(String(h || "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))).replace(/\s+/g, " ").trim();
const abs = (h, base) => { try { return new URL(entidades(h).replace(/\\\//g, "/"), base).href; } catch { return null; } };
const ePdf = (u) => /\.pdf(\?|#|$)|DownloadFiles\.ashx|DownloadDocument\.ashx|LinkClick\.aspx|fl_attachment/i.test(u || "");

/* ───────── Datas ───────── */
const MESES = {
  jan: 1, janeiro: 1, january: 1, enero: 1, gennaio: 1, janvier: 1, januar: 1, ene: 1, gen: 1, janv: 1,
  fev: 2, fevereiro: 2, feb: 2, february: 2, febrero: 2, febbraio: 2, "février": 2, fevrier: 2, februar: 2, "févr": 2,
  mar: 3, "março": 3, marco: 3, march: 3, marzo: 3, mars: 3, "märz": 3, marz: 3, "mär": 3,
  abr: 4, abril: 4, apr: 4, april: 4, aprile: 4, avril: 4, avr: 4,
  mai: 5, maio: 5, may: 5, mayo: 5, maggio: 5, mag: 5,
  jun: 6, junho: 6, june: 6, junio: 6, giugno: 6, juin: 6, juni: 6, giu: 6,
  jul: 7, julho: 7, july: 7, julio: 7, luglio: 7, juillet: 7, juli: 7, lug: 7, juil: 7,
  ago: 8, agosto: 8, aug: 8, august: 8, "août": 8, aout: 8,
  set: 9, setembro: 9, sep: 9, sept: 9, september: 9, septiembre: 9, settembre: 9, septembre: 9,
  out: 10, outubro: 10, oct: 10, october: 10, octubre: 10, ottobre: 10, octobre: 10, okt: 10, oktober: 10, ott: 10,
  nov: 11, novembro: 11, november: 11, noviembre: 11, novembre: 11,
  dez: 12, dezembro: 12, dec: 12, december: 12, diciembre: 12, dicembre: 12, "décembre": 12, decembre: 12, dezember: 12, dic: 12, "déc": 12,
};
const NOMES_MES = Object.keys(MESES).sort((a, b) => b.length - a.length).join("|");
// instante de um dia e hora no fuso da fonte: as horas sem fuso que um site italiano escreve são horas de Roma,
// não de Lisboa (era isto que punha as notícias de Itália, Espanha, França e Alemanha uma hora ao lado)
const LISBOA = "Europe/Lisbon";
function local(y, m, d, h = 12, mi = 0, tz = LISBOA) {
  const palpite = Date.UTC(y, m - 1, d, h, mi);
  const desvio = (t) => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "longOffset" }).format(new Date(t));
    const o = f.match(/GMT([+-])(\d{2}):(\d{2})/);
    return o ? (o[1] === "-" ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000 : 0;
  };
  const t = palpite - desvio(palpite);
  return palpite - desvio(t); // segunda volta: acerta nas horas perto da mudança da hora
}
// fuso de cada grupo de fontes (o campo «tz» de uma fonte sobrepõe-se)
const FUSOS = { pt: LISBOA, af: LISBOA, en: "Europe/London", es: "Europe/Madrid", fr: "Europe/Paris", de: "Europe/Berlin", it: "Europe/Rome", br: "America/Sao_Paulo", int: "Europe/Zurich" };
export const fusoDe = (s) => s?.tz || FUSOS[s?.grupo] || LISBOA;
// um valor de data vindo de JSON ou XML: número (segundos ou milissegundos), texto ISO com fuso, ou texto sem fuso
export function instante(v, tz = LISBOA) {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d{10,13}$/.test(String(v))) { const n = +v; return n < 1e12 ? n * 1000 : n; }
  const t = String(v).trim();
  const so = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (so) return local(+so[1], +so[2], +so[3], 12, 0, tz);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(t) || /\b(GMT|UTC|[+-]\d{4})\b/.test(t)) return Date.parse(t.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) || null;
  return dataDe(t, tz)?.ts || Date.parse(t) || null;
}
const diaDe = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
const plausivel = (y, m, d) => y >= 2000 && y <= new Date().getFullYear() + 1 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
// devolve { ts, dia (true se só se sabe o dia), txt (o pedaço do texto que era a data) } ou null
export function dataDe(texto, tz = LISBOA) {
  const t = String(texto || "");
  const lisboa = (y, m, d, h, mi) => local(y, m, d, h, mi, tz);
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${m[6] ? (m[6] === "Z" ? "Z" : m[6].replace(/(\d{2})(\d{2})$/, "$1:$2")) : ""}`;
    const ts = m[6] ? Date.parse(iso) : lisboa(+m[1], +m[2], +m[3], +m[4], +m[5]);
    if (ts) return { ts, dia: false, txt: m[0] };
  }
  const RE = [
    // 07/10/2026 15:30, 07.10.2026, 07-10-2026
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s*(?:às|at|-|,)?\s*(\d{1,2})[:h](\d{2}))?/, (x) => [+x[3], +x[2], +x[1], x[4], x[5]]],
    // 05.10.26, 07/10/26
    [/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2})\b(?![/.]\d)/, (x) => [2000 + +x[3], +x[2], +x[1]]],
    // 07 outubro 2026, 6 de Outubro, 2026, 7 de outubro de 2026, 22 Sept 2026, 1er octobre 2026
    [new RegExp(`\\b(\\d{1,2})(?:º|er|\\.)?\\s+(?:de\\s+)?(${NOMES_MES})\\.?,?\\s+(?:de\\s+)?(\\d{4})`, "i"), (x) => [+x[3], MESES[x[2].toLowerCase()], +x[1]]],
    // Outubro 7, 2026; Oct 07, 2026 11:41 AM
    [new RegExp(`\\b(${NOMES_MES})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})\\s*([AP]M))?`, "i"), (x) => [+x[3], MESES[x[1].toLowerCase()], +x[2], x[4] ? (+x[4] % 12) + (/p/i.test(x[6]) ? 12 : 0) : undefined, x[5]]],
  ];
  for (const [re, f] of RE) {
    m = t.match(re);
    if (!m) continue;
    const [y, mo, d, h, mi] = f(m);
    if (!plausivel(y, mo, d)) continue;
    const comHora = h != null && mi != null;
    return { ts: lisboa(y, mo, d, comHora ? +h : 12, comHora ? +mi : 0), dia: !comHora, txt: m[0] };
  }
  // «há 3 horas», «3 hours ago», «5 minutes ago», «hace 2 horas», «3 ore fa», «vor 2 Stunden»
  m = t.match(/(?:^|[^\p{L}])(?:h[aá]|hace|il y a|vor)\s+(\d+|um|uma|una?|un|einer?)\s+(min|hora|hour|heure|stunde|dia|día|day|jour|tag)/iu)
    || t.match(/\b(\d+|an?|one)\s+(min(?:ute)?|hour|day)s?\s+ago\b/i)
    || t.match(/\b(\d+|un|una)\s+(minut|or[ae]|giorn)[a-z]*\s+fa\b/i);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : 1;
    const un = /^min/i.test(m[2]) ? 60e3 : /^(hora|hour|heure|stunde|or[ae])/i.test(m[2]) ? 3600e3 : 86400e3;
    return { ts: Date.now() - n * un, dia: un === 86400e3, txt: m[0] };
  }
  // «ontem», «yesterday», «ieri», «ayer», «hier», «gestern» (com hora, se a houver)
  m = t.match(/(?:^|[^\p{L}])(ontem|yesterday|ieri|ayer|hier|gestern|hoje|today|oggi|hoy|aujourd'hui|heute)(?:,?\s*(?:às|at|alle|a las|à|um)?\s*(\d{1,2})[:h](\d{2}))?/iu);
  // (sem hora, só conta num texto curto, como a etiqueta de um cartão: num título, «hoje» não é uma data)
  if (m && (m[2] != null || t.trim().length <= 30)) {
    const ontem = /^(ontem|yesterday|ieri|ayer|hier|gestern)$/i.test(m[1]);
    const [y, mo, d] = new Date(Date.now() - (ontem ? 86400e3 : 0)).toLocaleDateString("en-CA", { timeZone: tz }).split("-").map(Number);
    const comHora = m[2] != null;
    return { ts: lisboa(y, mo, d, comHora ? +m[2] : 12, comHora ? +m[3] : 0), dia: !comHora, txt: m[0].trim() };
  }
  return null;
}
// a data que o próprio endereço traz: /2026/10/07/, /2026/oct/05/, -07102026, /uploads/2026/10/
export function dataDoUrl(u, tz = LISBOA) {
  let s = String(u || "");
  try { s = decodeURIComponent(s); } catch { /* endereço com % solto */ }
  const lisboa = (y, m, d) => local(y, m, d, 12, 0, tz);
  let m = s.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  if (m && plausivel(+m[1], +m[2], +m[3])) return { ts: lisboa(+m[1], +m[2], +m[3]), dia: true };
  m = s.match(new RegExp(`/(20\\d{2})/(${NOMES_MES})/(\\d{2})/`, "i"));
  if (m && MESES[m[2].toLowerCase()]) return { ts: lisboa(+m[1], MESES[m[2].toLowerCase()], +m[3]), dia: true };
  m = s.match(/-(\d{2})(\d{2})(20\d{2})\/?$/);
  if (m && plausivel(+m[3], +m[2], +m[1])) return { ts: lisboa(+m[3], +m[2], +m[1]), dia: true };
  m = s.match(/\/uploads\/(20\d{2})\/(\d{2})\//);
  if (m && plausivel(+m[1], +m[2], 1)) return { ts: lisboa(+m[1], +m[2], 1), dia: true, mes: true };
  return null;
}

/* ───────── Pedidos ───────── */
async function pedir(url, { lang = "pt", accept = "text/html,application/xhtml+xml,*/*;q=0.8", json = false } = {}) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: json ? "application/json,*/*;q=0.5" : accept, "Accept-Language": `${lang === "pt-br" ? "pt-BR" : lang},pt;q=0.8,en;q=0.7` },
    redirect: "follow", signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Object.assign(new Error(`respondeu ${r.status}`), { status: r.status });
  return { r: { url: r.url || url, headers: r.headers }, texto: json ? null : await lerTexto(r), json: json ? await r.json() : null };
}

/* ───────── Páginas HTML ───────── */
const GENERICO = /^(ver( mais| documento| not[ií]cia)?|ler( mais)?|saiba mais|read more|more|mais|download|descarregar|abrir|pdf|documento|clique aqui|leia mais|see more|en savoir plus|leggi( di pi[uù])?|weiterlesen|\d+(\.\d+)?\s*[km]b)$/i;
const limpaTitulo = (t) => String(t || "")
  .replace(/\b(ver documento|download|descarregar|abrir documento|ler mais|read more|leia mais)\b/gi, " ")
  .replace(/\b\d+([.,]\d+)?\s*(kb|mb)\b/gi, " ")
  .replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim();

// Ligações de uma página que batem certo com o padrão: cada endereço aparece uma vez, com o melhor título
// (o texto mais longo das ligações para lá, ou o cabeçalho do cartão) e a data mais próxima no cartão.
export function lerLista(html, base, link, tz = LISBOA) {
  const src = String(html || "");
  const re = new RegExp(link, "i");
  const achados = [];
  const A = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = A.exec(src))) {
    const href = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || /^(#|javascript:|mailto:)/i.test(href)) continue;
    const url = abs(href, base);
    if (!url || !(re.test(entidades(href)) || re.test(url) || re.test(decodeURI(url)))) continue;
    if (url.replace(/[#?].*$/, "").replace(/\/$/, "") === String(base).replace(/[#?].*$/, "").replace(/\/$/, "")) continue;
    if (/\/page\/\d+\/?$|[?&](page|e-page-[a-z0-9]+)=\d+/i.test(url)) continue; // paginação
    const attrTitulo = entidades(m[1].match(/\b(?:title|aria-label)\s*=\s*["']([^"']+)["']/i)?.[1] || m[2].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1] || "");
    achados.push({ url, ini: m.index, fim: m.index + m[0].length, texto: limpa(m[2]), attrTitulo, dentro: m[2] });
  }
  // agrupar por endereço (sem a âncora)
  const grupos = new Map();
  for (const a of achados) {
    const k = a.url.replace(/#.*$/, "");
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(a);
  }
  const ordem = [...grupos.entries()].sort((a, b) => a[1][0].ini - b[1][0].ini);
  const out = [];
  ordem.forEach(([url, gs], i) => {
    const ini = gs[0].ini;
    const fim = gs[gs.length - 1].fim;
    const prox = ordem[i + 1]?.[1][0].ini ?? src.length;
    const ant = i ? ordem[i - 1][1].at(-1).fim : 0;
    const cartao = src.slice(ini, Math.min(prox, fim + 900));
    const antes = src.slice(Math.max(ant, ini - 500), ini);
    // título: o texto da ligação, ou o título/alt, ou um cabeçalho no cartão, ou o texto que vem antes (tabelas de documentos)
    let titulo = gs.map((g) => limpaTitulo(g.texto)).filter((t) => t.length >= 6 && !GENERICO.test(t)).sort((a, b) => b.length - a.length)[0]
      || gs.map((g) => limpaTitulo(g.attrTitulo)).find((t) => t.length >= 6 && !GENERICO.test(t))
      || limpaTitulo(limpa(cartao.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1] || ""));
    if (!titulo || titulo.length < 6) {
      const tr = limpa(antes.split(/<\/?(?:tr|li|article)\b[^>]*>/i).pop() || "");
      const linhas = tr.split(/\s{2,}|\s\|\s/).map(limpaTitulo).filter((t) => t.length >= 6 && !GENERICO.test(t));
      titulo = linhas.pop() || "";
    }
    if (!titulo || titulo.length < 6) return;
    // data: no próprio título (documentos da FPF: «CO_105 07 outubro 2026 Calendário…»), no cartão, antes dele ou no endereço
    let data = dataDe(titulo, tz);
    if (data && titulo.replace(data.txt, " ").replace(/\s+/g, " ").trim().length >= 6) titulo = titulo.replace(data.txt, " ").replace(/\s+/g, " ").trim();
    const daTag = cartao.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
    data = data || (daTag && dataDe(daTag, tz)) || dataDe(limpa(cartao), tz) || dataDe(limpa(antes).slice(-200), tz) || dataDoUrl(url, tz);
    out.push({ titulo: titulo.slice(0, 300), url, ts: data?.ts || null, dia: !!data?.dia });
  });
  return out.slice(0, 40);
}

// Páginas feitas no browser (Next.js, Nuxt…): a lista de notícias vem num JSON dentro da própria página
// (__NEXT_DATA__, __NUXT_DATA__, JSON-LD). Procura objetos com título, endereço (ou «slug») e data.
const CAMPO_TITULO = ["title", "headline", "name", "titolo", "titulo"];
const CAMPO_URL = ["url", "link", "href", "permalink", "path", "canonicalUrl", "slug"];
const CAMPO_DATA = ["datePublished", "publishedAt", "published_at", "publishDate", "publish_date", "publicationDate", "publishedDate", "firstPublished", "date", "createdAt", "created_at", "data"];
export function lerEmbutido(html, base, link, tz = LISBOA) {
  const src = String(html || "");
  const re = link ? new RegExp(link, "i") : null;
  const blocos = [...src.matchAll(/<script\b[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/(?:ld\+)?json["'])[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const out = new Map();
  const pasta = String(base).replace(/[#?].*$/, "").replace(/\/$/, "");
  const anda = (o, prof = 0) => {
    if (!o || typeof o !== "object" || prof > 40) return;
    if (Array.isArray(o)) { for (const x of o) anda(x, prof + 1); return; }
    const titulo = CAMPO_TITULO.map((k) => o[k]).find((v) => typeof v === "string" && v.trim().length >= 12);
    let href = CAMPO_URL.map((k) => (typeof o[k] === "string" ? o[k] : o[k]?.current || o[k]?.url)).find((v) => typeof v === "string" && v.length > 2);
    if (titulo && href) {
      if (!/^(https?:)?\/\//.test(href) && !href.startsWith("/")) href = `${pasta}/${href}`; // só o «slug»
      const url = abs(href, base);
      const data = CAMPO_DATA.map((k) => o[k]).find((v) => v != null && v !== "");
      if (url && url.replace(/\/$/, "") !== pasta && (!re || re.test(url) || re.test(decodeURI(url))) && !out.has(url)) {
        const ts = instante(typeof data === "object" ? data?.value || data?.date : data, tz);
        out.set(url, { titulo: limpaTitulo(limpa(titulo)).slice(0, 300), url, ts: ts || null, dia: !!ts && typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) });
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") anda(v, prof + 1);
  };
  for (const b of blocos) { try { anda(JSON.parse(b.trim())); } catch { /* bloco que não é JSON */ } }
  return [...out.values()].filter((x) => x.titulo.length >= 6).slice(0, 40);
}

// a data de uma notícia aberta: meta article:published_time, JSON-LD datePublished, <time>, ou a data depois do título
const datadas = new Map();
export async function datarArtigo(url, lang, tz = LISBOA) {
  if (datadas.has(url)) return datadas.get(url);
  datadas.set(url, null);
  if (datadas.size > 5000) datadas.delete(datadas.keys().next().value);
  try {
    const { texto } = await pedir(url, { lang });
    const meta = texto.match(/<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:article:published_time|datePublished|date|pubdate|publish-date|dc\.date)["'][^>]+content=["']([^"']+)["']/i)?.[1]
      || texto.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:article:published_time|datePublished)["']/i)?.[1]
      || texto.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
      || texto.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
    let d = meta ? dataDe(meta, tz) : null;
    if (!d) {
      const i = texto.search(/<h1\b/i);
      if (i >= 0) d = dataDe(limpa(texto.slice(i, i + 6000)).slice(0, 1500), tz);
    }
    datadas.set(url, d);
    return d;
  } catch { return null; }
}

/* ───────── Leitores ───────── */
const LEITORES = {
  async rss(s) {
    const feed = await readFeed(s.url, s._cache || (s._cache = {}));
    if (!feed) return null; // 304: nada de novo
    return (feed.items || []).slice(0, 40).map((it) => {
      const ts = Date.parse(it.isoDate || it.pubDate || "") || null;
      return { titulo: limpa(it.title), url: it.link, ts, dia: false };
    });
  },
  async sitemap(s) {
    const { texto } = await pedir(s.url, { lang: s.lang, accept: "application/xml,text/xml,application/json,*/*" });
    const out = [];
    const t = texto.trim();
    if (/^[[{]/.test(t)) {
      // sitemap servido em JSON: procura objetos com endereço, título e data
      const anda = (o) => {
        if (Array.isArray(o)) return o.forEach(anda);
        if (!o || typeof o !== "object") return;
        const url = o.loc || o.url || o.link;
        const titulo = o.title || o["news:title"] || o.news?.title;
        const data = o.publication_date || o["news:publication_date"] || o.news?.publication_date || o.lastmod || o.date;
        if (typeof url === "string" && titulo) out.push({ titulo: limpa(titulo), url, ts: instante(data, fusoDe(s)), dia: false });
        Object.values(o).forEach(anda);
      };
      anda(JSON.parse(t));
    } else {
      for (const b of t.split(/<url>/i).slice(1)) {
        const tag = (n) => entidades(b.match(new RegExp(`<${n}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${n}>`, "i"))?.[1] || "").trim();
        const url = tag("loc");
        const titulo = tag("news:title") || tag("video:title") || tag("image:title");
        const data = tag("news:publication_date") || tag("video:publication_date") || tag("lastmod");
        if (!url || !titulo) continue;
        const soDia = /^\d{4}-\d{2}-\d{2}$/.test(data);
        out.push({ titulo: limpa(titulo), url, ts: soDia ? dataDe(data.split("-").reverse().join("/"), fusoDe(s))?.ts || null : instante(data, fusoDe(s)), dia: soDia });
      }
    }
    const vistos = new Set();
    return out.filter((x) => !vistos.has(x.url) && vistos.add(x.url)).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 40);
  },
  async premierleague(s) {
    const urls = ["https://api.premierleague.com/content/premierleague/en?contentTypes=TEXT&pageSize=60&sort=date",
      "https://footballapi.pulselive.com/content/PremierLeague/text/EN/?pageSize=60&page=0&sort=date"];
    let j = null;
    for (const u of urls) { try { j = (await pedir(u, { json: true, lang: "en" })).json; break; } catch (e) { if (u === urls.at(-1)) throw e; } }
    const lista = j?.content || [];
    return lista
      .filter((c) => !c.hotlinkUrl && !(c.tags || []).some((t) => /external/i.test(t.label || "")))
      .filter((c) => {
        const alvo = `${c.title} ${(c.tags || []).map((t) => t.label).join(" ")}`;
        return (!s.filtro || new RegExp(s.filtro, "i").test(alvo)) && (!s.exclui || !new RegExp(s.exclui, "i").test(alvo));
      })
      .map((c) => ({
        titulo: limpa(c.title),
        url: `https://www.premierleague.com/en/news/${c.id}${c.titleUrlSegment ? `/${c.titleUrlSegment}` : ""}`,
        ts: Number(c.publishFrom) || Date.parse(String(c.date || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) || null, dia: false,
      }));
  },
  async fifa(s) {
    const loc = s.locale_api || "en";
    const secoes = s.secoes || ["2lsGSGYOtykcJRJQu7bdDg", "1fn42J5E6XlvTbtAjMTKwn"];
    const out = [];
    let erro = null;
    for (const id of secoes) {
      try {
        const { json } = await pedir(`https://cxm-api.fifa.com/fifaplusweb/api/sections/news/${id}?locale=${loc}&limit=25`, { json: true, lang: loc });
        for (const it of json?.items || []) {
          const rel = it.articlePageUrl || (it.slug ? `/${loc}/articles/${it.slug}` : null);
          if (!it.title || !rel) continue;
          out.push({ titulo: limpa(it.title), url: abs(rel, "https://www.fifa.com/"), ts: Date.parse(it.publishedDate || "") || null, dia: false });
        }
      } catch (e) { erro = e; }
    }
    if (!out.length && erro) throw erro;
    return out;
  },
  async html(s, est) {
    const tz = fusoDe(s);
    // as ligações da página e, se não houver, a lista que vem no JSON embutido (páginas feitas no browser)
    const ler = (texto, url) => { const l = lerLista(texto, url, s.link, tz); return l.length ? l : lerEmbutido(texto, url, s.link, tz); };
    // a página que funcionou da última vez, a da fonte e as alternativas (outra língua, outro endereço da mesma lista)
    const paginas = [...new Set([est.pagina, s.url, ...(s.alternativas || [])].filter(Boolean))];
    let erro = null;
    for (const pagina of paginas) {
      try {
        let { r, texto } = await pedir(pagina, { lang: s.lang });
        let lista = ler(texto, r.url);
        // a página dada só tem uma ligação para a verdadeira lista (comunicados das associações): segue-a uma vez
        if (!lista.length && s.segue && pagina === s.url) {
          const destino = [...texto.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((x) => x[1]).find((h) => new RegExp(s.segue, "i").test(entidades(h)) || new RegExp(s.segue, "i").test(decodeURI(abs(h, r.url) || "")));
          if (destino) {
            ({ r, texto } = await pedir(abs(destino, r.url), { lang: s.lang }));
            lista = ler(texto, r.url);
            if (lista.length) { est.pagina = r.url; return lista; }
          }
        }
        if (lista.length) { est.pagina = pagina === s.url ? undefined : pagina; return lista; }
      } catch (e) { erro = e; }
    }
    if (erro && paginas.length === 1) throw erro;
    throw Object.assign(new Error(`${paginas.length > 1 ? `nenhuma das ${paginas.length} páginas` : "a página"} trouxe entradas (pode ser feita no browser, com JavaScript)${erro ? `; ${erro.message}` : ""}`), { vazio: true, status: erro?.status });
  },
  // notícias numeradas (FPF): parte do número mais alto que a página mostra e experimenta os seguintes
  async sequencial(s, est) {
    const re = new RegExp(s.link, "i");
    if (!est.ultimoId) {
      const { texto } = await pedir(s.url, { lang: s.lang });
      const ids = [...texto.matchAll(new RegExp(s.link, "gi"))].map((x) => +x[1]).filter(Boolean);
      const guardado = est.idGuardado || 0;
      est.ultimoId = Math.max(guardado, ...ids, 0);
      if (!est.ultimoId) throw Object.assign(new Error("não encontrei o número das notícias na página"), { vazio: true });
      est.inicio = guardado ? est.ultimoId + 1 : est.ultimoId - 7; // primeira vez: as últimas oito, para a coluna não começar vazia
    }
    const out = [];
    const de = est.inicio ?? est.ultimoId + 1;
    // de dez em dez minutos, procura mais longe (há números que não são notícias e ficam por saltar)
    const alcance = Date.now() - (est.longe || 0) > 10 * 60e3 ? 25 : 6;
    if (alcance === 25) est.longe = Date.now();
    let falhas = 0;
    for (let id = de, n = 0; id <= est.ultimoId + alcance && falhas < alcance && n < 40; id++, n++) {
      const url = s.artigo.replace("{id}", id);
      try {
        const { r, texto } = await pedir(url, { lang: s.lang });
        if (!re.test(decodeURI(r.url))) { falhas++; continue; }
        const titulo = limpa(texto.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || texto.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
        const i = texto.search(/<h1\b/i);
        const data = dataDe(limpa(texto.slice(Math.max(0, i), Math.max(0, i) + 6000)).slice(0, 1500), fusoDe(s));
        if (!titulo || titulo.length < 6 || !data) { falhas++; continue; }
        out.push({ titulo: titulo.replace(/\s*[|–-]\s*(FPF|Federação Portuguesa de Futebol)\s*$/i, ""), url, ts: data.ts, dia: data.dia });
        est.ultimoId = Math.max(est.ultimoId, id);
        falhas = 0;
      } catch { falhas++; }
    }
    est.inicio = null;
    return out;
  },
  // Google News: uma pesquisa ou várias (lista), experimentadas por ordem até uma trazer resultados
  async google(s) {
    const loc = LOCALES[s.locale] || LOCALES[s.lang === "pt-br" ? "br" : s.lang] || LOCALES.pt;
    let erro = null;
    for (const q of [].concat(s.google || [])) {
      try {
        const feed = await readFeed(`${GOOGLE_BASE}?q=${encodeURIComponent(`${q} when:7d`)}&${loc}`, {});
        const lista = (feed?.items || []).slice(0, 30).map((it) => {
          const t = limpa(it.title);
          const meio = t.match(/\s+-\s+([^-]+)$/)?.[1]?.trim() || undefined;
          return { titulo: t.replace(/\s+-\s+[^-]+$/, ""), url: it.link, ts: Date.parse(it.isoDate || it.pubDate || "") || null, dia: false, meio };
        });
        if (lista.length) return lista;
      } catch (e) { erro = e; }
    }
    if (erro) throw erro;
    return [];
  },
};

/* ───────── Arquivo e ciclo de leitura ───────── */
const canon = (u) => {
  try {
    const x = new URL(u);
    const id = x.searchParams.get("IdDoc");
    return `${x.hostname.replace(/^www\./, "")}${decodeURI(x.pathname).replace(/\/+$/, "").toLowerCase()}${id ? `?IdDoc=${id}` : ""}`;
  } catch { return String(u || ""); }
};

// a associação de uma fonte do grupo «af» (pelo nome da organização: «AF Viana do Castelo» → af-viana)
const assocDe = (s) => s.assoc || (s.grupo === "af" ? orgPorNome(s.org)?.key || associacaoDoTexto(s.org) : null);
// imprensa sobre cada associação: uma pesquisa do Google News por associação, de 20 em 20 minutos
export function fontesImprensa() {
  return ASSOCIACOES.map((a) => {
    const lugar = a.nome.replace(/^AF /, "");
    return {
      id: `imprensa-${a.key}`, org: a.nome, assoc: a.key, grupo: "af", tipo: "imprensa", lang: "pt", leitor: "google", url: "https://news.google.com/", minutos: 20,
      google: [`"${a.nome}" OR "${a.longo}" OR "distrital de ${lugar}" futebol`, `"${a.nome}" futebol`],
    };
  });
}
// o grupo e a associação de uma entrada: uma notícia da FPF ou da Liga que fala de uma associação vai para a
// coluna dessa associação, nas Distritais, e deixa a coluna «Portugal» só com o futebol nacional
export function arrumar(x, s = null) {
  const daFonte = s ? assocDe(s) : null;
  if (x.grupo === "af") { x.assoc ||= daFonte || associacaoDoTexto(`${x.org} ${x.titulo}`) || undefined; return x; }
  if (x.grupo === "pt") {
    const a = associacaoDoTexto(x.titulo);
    if (a) { x.grupo = "af"; x.assoc = a; }
  }
  return x;
}

export function createOficiais({ broadcast = () => {}, log = () => {}, config = {} } = {}) {
  const FONTES = [...(config.fontes || []), ...(process.env.OFICIAIS_IMPRENSA === "0" ? [] : fontesImprensa())]
    .filter((s) => s.id && s.url && LEITORES[s.leitor])
    // as páginas das associações, se deixarem de responder, passam a ser lidas pelo Google News (site:)
    .map((s) => {
      if (s.grupo !== "af" || s.google || s.leitor === "google") return s;
      try { return { ...s, google: `site:${new URL(s.url).hostname.replace(/^www\./, "")}` }; } catch { return s; }
    });
  const GRUPOS = config.grupos || [];
  let itens = [];
  let vistos = {}; // fonte → endereços já vistos (também os que ficaram de fora, para não voltarem como novos)
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    itens = (d.itens || []).filter((x) => Date.now() - x.ts < IDADE_MAX);
    vistos = d.vistos || {};
    // as entradas gravadas antes de as associações irem para as Distritais: grupo e associação revistos
    const porId = new Map((config.fontes || []).map((s) => [s.id, s]));
    for (const x of itens) arrumar(x, porId.get(x.fonte));
  } catch { /* primeira vez */ }
  const estado = Object.fromEntries(FONTES.map((s) => [s.id, { modo: "site", ok: null, erro: null, ultimo: null, lidos: null, novos: 0 }]));
  let sujo = false;
  setInterval(() => {
    if (!sujo) return;
    try {
      fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ itens, vistos }));
      sujo = false;
    } catch (e) { log(`[Oficiais] não consegui gravar: ${e.message}`); }
  }, 30000).unref();

  const porUrl = new Set(itens.map((x) => canon(x.url)));

  // As entradas gravadas antes da correção das horas (sem «v: 2») voltam a ser datadas pela própria notícia,
  // devagar (uma a cada poucos segundos), e o site recebe a hora corrigida.
  const fonteDe = new Map((config.fontes || []).map((s) => [s.id, s]));
  async function redatar() {
    const fila = itens.filter((x) => x.v !== 2);
    for (const x of fila) {
      x.v = 2;
      sujo = true;
      if (x.pdf || x.via || !x.url) continue;
      const s = fonteDe.get(x.fonte);
      const d = await datarArtigo(x.url, s?.lang || x.lang, fusoDe(s || { grupo: x.grupo }));
      if (d && !d.dia && Math.abs(d.ts - x.ts) > 5 * 60e3 && Math.abs(d.ts - x.ts) < 3 * 86400e3 && d.ts <= Date.now() + 2 * 60e3) {
        x.ts = Math.min(d.ts, Date.now());
        delete x.soDia;
        broadcast("oficial", { ...x, corrigido: true });
      }
      await sleep(3000);
    }
    if (fila.length) itens.sort((a, b) => b.ts - a.ts);
  }
  const mesmoTitulo = (org, titulo, ts) => itens.some((x) => x.org === org && Math.abs(x.ts - ts) < 3 * 86400e3 && norm(x.titulo) === norm(titulo));

  async function traduzir(novos) {
    const fora = novos.filter((x) => !/^pt/.test(x.lang || "pt"));
    if (!fora.length) return;
    try {
      const r = await traduzirGoogle(fora.map((x) => x.titulo), "pt");
      if (!r) return;
      fora.forEach((x, i) => { if (r.textos[i] && norm(r.textos[i]) !== norm(x.titulo)) { x.titulo_pt = r.textos[i]; broadcast("oficial", x); } });
      sujo = true;
    } catch { /* fica o título original */ }
  }

  async function processa(s, lista, est, via) {
    const tz = fusoDe(s);
    // o que se viu pelo site e pelo Google News fica em separado: cada um tem a sua primeira leitura
    const chave = via === "google" ? `${s.id}#google` : s.id;
    const v = new Set(vistos[chave] || []);
    // uma lista que de repente traz muitas entradas sem data (a página mudou) conta como primeira leitura
    const semDataNovas = lista.filter((x) => x.url && !x.ts && !v.has(canon(x.url))).length;
    const primeira = !v.size || semDataNovas > 15;
    const hoje = diaDe(Date.now());
    const novos = [];
    let datadasAgora = 0;
    // do mais antigo para o mais recente, para chegarem ao site pela ordem certa
    const ordenada = [...lista].filter((x) => x.url && x.titulo).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    for (const x of ordenada) {
      const k = canon(x.url);
      if (v.has(k)) continue;
      let { ts, dia } = x;
      // sem data, ou só com o dia: abre-se a notícia para ler a hora exata em que foi publicada
      // (antes, uma entrada sem data ficava com a hora a que apareceu na lista, e as datadas só pelo dia com o meio-dia)
      if ((!ts || dia) && via !== "google" && !ePdf(x.url) && datadasAgora < (primeira ? 12 : 8)) {
        datadasAgora++;
        const d = await datarArtigo(x.url, s.lang, tz);
        if (d && (!ts || !d.dia) && (!ts || diaDe(d.ts) === diaDe(ts))) ({ ts, dia } = d);
      }
      v.add(k);
      if (!ts) {
        if (primeira) continue; // sem data na primeira leitura: não se sabe se é de hoje ou do mês passado
        ts = Date.now(); dia = false; // apareceu agora na lista
      }
      if (ts - Date.now() > 2 * 60e3) { if (dia && diaDe(ts) !== hoje) continue; ts = Date.now(); } // datada no futuro
      if (dia) {
        if (!primeira && diaDe(ts) === hoje) { ts = Date.now(); dia = false; } // entrou hoje, neste minuto
        else ts = Math.min(ts, Date.now());
      }
      if (Date.now() - ts > (primeira ? PRIMEIRA_DIAS : NOVA_DIAS) * 86400e3) continue;
      if (porUrl.has(k) || mesmoTitulo(s.org, x.titulo, ts)) continue;
      const item = arrumar({
        id: `${s.id}:${hash(k)}`, fonte: s.id, org: s.org, grupo: s.grupo, tipo: s.tipo, lang: s.lang,
        titulo: x.titulo, url: x.url, ts, soDia: dia || undefined, pdf: ePdf(x.url) || undefined, via: via === "google" ? "Google News" : undefined, meio: x.meio, v: 2,
      }, s);
      porUrl.add(k);
      itens.push(item);
      novos.push(item);
    }
    vistos[chave] = [...v].slice(-400);
    if (novos.length) {
      itens.sort((a, b) => b.ts - a.ts);
      if (itens.length > MAX) itens.length = MAX;
      sujo = true;
      for (const n of novos) broadcast("oficial", n);
      est.novos += novos.length;
      traduzir(novos);
    } else if (primeira) sujo = true;
  }

  async function ciclo(s) {
    const est = estado[s.id];
    est._s = s;
    const guardados = itens.filter((x) => x.fonte === s.id);
    if (s.leitor === "sequencial") est.idGuardado = Math.max(0, ...guardados.map((x) => +String(x.url).match(/(\d+)\/?$/)?.[1] || 0));
    await sleep(Math.random() * 30000); // não arrancam todas no mesmo segundo
    let falhas = 0;
    let google = false;
    let voltaAoSite = 0;
    for (;;) {
      let espera = s.minutos ? s.minutos * 60e3 : RITMO;
      try {
        if (google && Date.now() > voltaAoSite) { google = false; est.modo = "site"; } // de meia em meia hora, volta a tentar o site
        const via = google ? "google" : s.leitor;
        const lista = await LEITORES[via](s, est);
        if (lista) await processa(s, lista, est, via);
        Object.assign(est, { ok: true, erro: null, ultimo: Date.now(), lidos: lista ? lista.length : est.lidos, modo: google ? "Google News" : "site" });
        falhas = 0;
      } catch (e) {
        falhas++;
        Object.assign(est, { ok: false, erro: e.message, ultimo: Date.now() });
        if (!google && s.google && (falhas >= 2 || e.vazio || [401, 403, 404, 410].includes(e.status))) {
          google = true;
          voltaAoSite = Date.now() + 30 * 60e3;
          est.modo = "Google News";
          log(`[Oficiais] ${s.org} (${s.id}): ${e.message}; passo a usar o Google News`);
          espera = 1000;
        } else {
          if (falhas === 1 || falhas % 10 === 0) log(`[Oficiais] ${s.org} (${s.id}): ${e.message}`);
          espera = Math.min(15 * 60e3, (s.minutos ? s.minutos * 60e3 : RITMO) * 2 ** Math.min(4, falhas));
        }
      }
      await sleep(espera);
    }
  }

  return {
    start() {
      if (process.env.OFICIAIS === "0") return;
      log(`[Oficiais] ${FONTES.length} fontes de ligas e federações, a cada ${RITMO / 1000} s`);
      for (const s of FONTES) ciclo(s);
      setTimeout(() => redatar().catch((e) => log(`[Oficiais] correção das horas: ${e.message}`)), 60e3).unref();
      setInterval(() => { const n = itens.length; itens = itens.filter((x) => Date.now() - x.ts < IDADE_MAX); if (itens.length !== n) sujo = true; }, 3600e3).unref();
    },
    // «Ligas e Federações»: tudo menos as associações (que estão nas Distritais)
    lista: (limit = 1500) => itens.filter((x) => x.grupo !== "af").slice(0, limit),
    grupos: () => GRUPOS.filter((g) => g.id !== "af"),
    // «Distritais»: notícias, comunicados e imprensa de cada associação (associação → entradas, da mais recente)
    daAssociacao: (assoc = null, limite = 60) => {
      const out = {};
      for (const x of itens) {
        if (x.grupo !== "af" || !x.assoc || (assoc && x.assoc !== assoc)) continue;
        const l = (out[x.assoc] ||= []);
        if (l.length < limite) l.push(x);
      }
      return out;
    },
    estado: () => FONTES.map((s) => {
      const { _s, idGuardado, inicio, longe, pagina, ...e } = estado[s.id] || {};
      return { id: s.id, org: s.org, tipo: s.tipo, grupo: s.grupo, leitor: s.leitor, url: s.url, ...e, pagina: pagina || undefined };
    }),
  };
}
