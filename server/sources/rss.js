// Sites com feed RSS/Atom: verificação a cada 15 s, com pedidos condicionais (ETag) para não sobrecarregar os sites.
// Se o site bloquear o servidor, não indicar o feed ou tiver um feed parado, a fonte passa a ser lida pelo
// feed público do Google News para esse site (atraso de alguns minutos, mas funciona a partir de qualquer servidor).
import Parser from "rss-parser";
import { sleep, hash, BACKFILL_MS } from "../util.js";

const parser = new Parser({ timeout: 10000 });
const UA = "Mozilla/5.0 (compatible; VAR-feed/1.0; agregador de notícias de desporto)";
// mínimo de 5 s: mais depressa do que isso os sites começam a bloquear o servidor, e o feed raramente muda tão rápido
const INTERVAL = Math.max(5, Number(process.env.RSS_SEGUNDOS) || 15) * 1000;
const GOOGLE_INTERVAL = 60000; // o Google News só muda de minuto a minuto; mais do que isto seria desperdício
const GOOGLE_BASE = process.env.GOOGLE_NEWS_BASE || "https://news.google.com/rss/search";
const LOCALES = { pt: "hl=pt-PT&gl=PT&ceid=PT:pt-150", en: "hl=en-GB&gl=GB&ceid=GB:en", fr: "hl=fr&gl=FR&ceid=FR:fr", es: "hl=es&gl=ES&ceid=ES:es", it: "hl=it&gl=IT&ceid=IT:it", de: "hl=de&gl=DE&ceid=DE:de" };
const STALE_MS = 7 * 86400e3;
const clean = (html = "") => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const fail = (message, extra) => Object.assign(new Error(message), extra);

// feed do Google News com as notícias do último dia de um site (ou de uma pesquisa indicada em "google")
export function googleNewsFeed(s) {
  const q = s.google || `site:${new URL(s.site).hostname.replace(/^www\./, "")}`;
  return `${GOOGLE_BASE}?q=${encodeURIComponent(`${q} when:1d`)}&${LOCALES[s.lang] || LOCALES.pt}`;
}

// procura o feed na página do site (<link rel="alternate" type="application/rss+xml">)
export async function discover(site) {
  const res = await fetch(site, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw fail(`o site respondeu ${res.status}`, { status: res.status });
  const html = await res.text();
  const tags = (html.match(/<link\b[^>]*>/gi) || []).filter((t) => /alternate/i.test(t) && /(rss|atom)\+xml/i.test(t));
  const href = tags.map((t) => t.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]).find(Boolean);
  return href ? new URL(href.replace(/&amp;/g, "&"), res.url).href : null;
}

export async function readFeed(url, cache = {}) {
  const headers = { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8" };
  if (cache.etag) headers["If-None-Match"] = cache.etag;
  if (cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (res.status === 304) return null;
  if (!res.ok) throw fail(`o feed respondeu ${res.status}`, { status: res.status });
  cache.etag = res.headers.get("etag");
  cache.lastModified = res.headers.get("last-modified");
  try {
    return await parser.parseString(await res.text());
  } catch {
    throw fail("o endereço não é um feed RSS válido", { parse: true });
  }
}

export function startRss(sources, onPost, log) {
  for (const s of sources) run(s);

  async function run(s) {
    let feed = s.feed || null;
    let google = false;
    let seen = new Set();
    let fails = 0;
    let wait = INTERVAL;
    let cache = {};
    const every = () => (google ? GOOGLE_INTERVAL : s.intervalo ? Math.max(5, s.intervalo) * 1000 : INTERVAL);
    const useGoogle = (why) => {
      feed = googleNewsFeed(s);
      google = true;
      cache = {};
      log(`[RSS] ${s.nome}: ${why}; passo a usar o Google News`);
    };

    for (;;) {
      try {
        if (!feed) {
          feed = await discover(s.site);
          if (!feed) throw fail(`não encontrei o feed em ${s.site}`, { notFound: true });
          log(`[RSS] ${s.nome}: feed ${feed}`);
        }
        const parsed = await readFeed(feed, cache);
        if (parsed) {
          const items = (parsed.items || []).slice(0, 40);
          const dated = items.map((it) => Date.parse(it.isoDate || it.pubDate)).filter(Boolean);
          if (!google && dated.length && Date.now() - Math.max(...dated) > STALE_MS) throw fail("o feed não é atualizado há mais de uma semana", { stale: true });
          for (const it of [...items].reverse()) {
            const key = it.guid || it.link || it.title;
            if (!key || seen.has(key)) continue;
            const ts = Date.parse(it.isoDate || it.pubDate) || Date.now();
            if (Date.now() - ts > BACKFILL_MS) continue;
            // no Google News o título vem com « - Nome do jornal» no fim e a descrição repete o título
            const title = google ? clean(it.title).replace(/\s+-\s+[^-]+$/, "") : clean(it.title);
            const body = google ? "" : clean(it.contentSnippet || it.content || it.summary || "").replace(/\s*submitted by\s+\/u\/\S+[\s\S]*$/i, "");
            onPost({
              postId: `${s.id}:${hash(key)}`,
              src: s.id,
              name: s.nome,
              via: google ? "Google News" : "RSS",
              url: it.link || s.site,
              text: `${title}\n${body}`.trim().slice(0, 1500),
              lang: s.lang,
              ts,
            });
          }
          seen = new Set(items.map((it) => it.guid || it.link || it.title));
        }
        fails = 0;
        wait = every();
      } catch (e) {
        const blocked = [401, 403, 404, 410, 451].includes(e.status) || e.notFound || e.parse || e.stale;
        if (s.semGoogle && (blocked || ++fails >= 3)) {
          // fontes que o Google News não cobre (Reddit): se recusarem, tenta de novo daqui a 15 minutos
          log(`[RSS] ${s.nome}: ${e.message}; nova tentativa daqui a 15 min`);
          fails = 0;
          wait = 15 * 60e3;
        } else if (!google && (blocked || ++fails >= 3)) {
          useGoogle(e.message);
          wait = 1000;
        } else {
          log(`[RSS] ${s.nome}: ${e.message}`);
          wait = Math.min(Math.max(wait * 2, 30000), 300000);
        }
      }
      await sleep(wait);
    }
  }
}
