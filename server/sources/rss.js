// Sites com feed RSS/Atom: verificação a cada 15 s, com pedidos condicionais (ETag) para não sobrecarregar os sites.
import Parser from "rss-parser";
import { sleep, hash, BACKFILL_MS } from "../util.js";

const parser = new Parser({ timeout: 10000 });
const UA = "Mozilla/5.0 (compatible; VAR-feed/1.0; agregador de notícias de desporto)";
// mínimo de 5 s: mais depressa do que isso os sites começam a bloquear o servidor, e o feed raramente muda tão rápido
const INTERVAL = Math.max(5, Number(process.env.RSS_SEGUNDOS) || 15) * 1000;
const clean = (html = "") => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// procura o feed na página do site (<link rel="alternate" type="application/rss+xml">)
export async function discover(site) {
  const res = await fetch(site, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
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
  if (!res.ok) throw new Error(`o feed respondeu ${res.status}`);
  cache.etag = res.headers.get("etag");
  cache.lastModified = res.headers.get("last-modified");
  return parser.parseString(await res.text());
}

export function startRss(sources, onPost, log) {
  for (const s of sources) run(s);

  async function run(s) {
    let feed = s.feed || null;
    let seen = new Set();
    let wait = INTERVAL;
    const cache = {};
    for (;;) {
      try {
        if (!feed) {
          feed = await discover(s.site);
          if (!feed) throw new Error(`não encontrei o feed em ${s.site}; indica-o no campo "feed" do fontes.json`);
          log(`[RSS] ${s.nome}: feed ${feed}`);
        }
        const parsed = await readFeed(feed, cache);
        if (parsed) {
          const items = (parsed.items || []).slice(0, 40);
          for (const it of [...items].reverse()) {
            const key = it.guid || it.link || it.title;
            if (!key || seen.has(key)) continue;
            const ts = Date.parse(it.isoDate || it.pubDate) || Date.now();
            if (Date.now() - ts > BACKFILL_MS) continue;
            const body = clean(it.contentSnippet || it.content || it.summary || "");
            onPost({
              postId: `${s.id}:${hash(key)}`,
              src: s.id,
              name: s.nome,
              via: "RSS",
              url: it.link || s.site,
              text: `${clean(it.title)}\n${body}`.slice(0, 1500),
              lang: s.lang,
              ts,
            });
          }
          seen = new Set(items.map((it) => it.guid || it.link || it.title));
        }
        wait = INTERVAL;
      } catch (e) {
        log(`[RSS] ${s.nome}: ${e.message}`);
        wait = Math.min(Math.max(wait * 2, 30000), 300000);
      }
      await sleep(wait);
    }
  }
}
