// Sites com feed RSS/Atom: verificação a cada 15 s, com pedidos condicionais (ETag) para não sobrecarregar os sites.
// Se o site bloquear o servidor, não indicar o feed ou tiver um feed parado, a fonte passa a ser lida pelo
// feed público do Google News para esse site (atraso de alguns minutos, mas funciona a partir de qualquer servidor).
import Parser from "rss-parser";
import { sleep, hash, BACKFILL_MS } from "../util.js";

const parser = new Parser({ timeout: 10000 });
const UA = "Mozilla/5.0 (compatible; VAR-feed/1.0; agregador de notícias de desporto)";
const INTERVAL = Math.max(1, Number(process.env.RSS_SEGUNDOS) || 15) * 1000;
// fontes marcadas como "rapido": leitura ao segundo enquanto o feed dá sinal de vida, abrandando quando
// fica parado. Os pedidos são condicionais (ETag), por isso um feed sem novidades responde só "304".
const FAST = Math.max(1, Number(process.env.RSS_RAPIDO_SEGUNDOS) || 1) * 1000;
const FAST_STEPS = [[10 * 60e3, FAST], [60 * 60e3, 5000], [Infinity, 15000]]; // parado há X → ler a cada Y
const GOOGLE_INTERVAL = 60000; // o Google News só muda de minuto a minuto; mais do que isto seria desperdício
const GOOGLE_BASE = process.env.GOOGLE_NEWS_BASE || "https://news.google.com/rss/search";
const LOCALES = { pt: "hl=pt-PT&gl=PT&ceid=PT:pt-150", en: "hl=en-GB&gl=GB&ceid=GB:en", fr: "hl=fr&gl=FR&ceid=FR:fr", es: "hl=es&gl=ES&ceid=ES:es", it: "hl=it&gl=IT&ceid=IT:it", de: "hl=de&gl=DE&ceid=DE:de" };
const STALE_MS = 7 * 86400e3;
const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»", eacute: "é", egrave: "è", ecirc: "ê", aacute: "á", agrave: "à", acirc: "â", atilde: "ã", iacute: "í", icirc: "î", oacute: "ó", ocirc: "ô", otilde: "õ", uacute: "ú", ccedil: "ç", ntilde: "ñ", uuml: "ü", Eacute: "É", Aacute: "Á", Atilde: "Ã", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ccedil: "Ç", Eacute2: "É" };
const decode = (t) => t
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([A-Za-z]+);/g, (m, n) => ENTITIES[n] ?? m);
// o zerozero põe marcas internas no texto: {TEAM_LINK|9|FC Porto} fica só «FC Porto»
const unmark = (t) => t.replace(/\{[A-Z_]+\|\d+\|([^}]*)\}/g, "$1").replace(/\{[A-Z_]+\|([^}|]*)\}/g, "$1");
const clean = (html = "") => unmark(decode(String(html).replace(/<[^>]+>/g, " "))).replace(/\s+/g, " ").trim();
// feeds gerais (ex. destaques do SAPO): só entram as notícias de desporto
const DESPORTO = /(despo?rt|futebol|f[uú]tsal|andebol|basquete|v[oó]lei|h[oó]quei|at[ée]t?ismo|atletismo|ciclismo|t[ée]nis|nata[cç][aã]o|r[aá]guebi|rugby|automobilismo|f[oó]rmula ?1|motogp|golfe|benfica|sporting|fc porto|braga|vit[oó]ria|liga|sele[cç][aã]o|sele[cç][aã]o|mundial|campeonato|jogador|treinador|clube|est[aá]dio|golo|golos|transfer[eê]ncia)/i;
const fail = (message, extra) => Object.assign(new Error(message), extra);

// feed do Google News com as notícias do último dia de um site (ou de uma pesquisa indicada em "google")
export function googleNewsFeed(s) {
  const q = s.google || `site:${new URL(s.site).hostname.replace(/^www\./, "")}`;
  return `${GOOGLE_BASE}?q=${encodeURIComponent(`${q} when:1d`)}&${LOCALES[s.lang] || LOCALES.pt}`;
}

// procura o feed na página indicada: primeiro nas marcas <link rel="alternate">,
// depois nas ligações da própria página (páginas de RSS como a do zerozero listam-nas assim)
export async function discover(site) {
  const res = await fetch(site, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw fail(`o site respondeu ${res.status}`, { status: res.status });
  const html = await res.text();
  const abs = (h) => new URL(h.replace(/&amp;/g, "&"), res.url).href;
  const tags = (html.match(/<link\b[^>]*>/gi) || []).filter((t) => /alternate/i.test(t) && /(rss|atom)\+xml/i.test(t));
  const link = tags.map((t) => t.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]).find(Boolean);
  if (link) return abs(link);
  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const feedish = hrefs
    .filter((h) => /(rss|feed|atom|xml)/i.test(h) && !/^(mailto|javascript|#)/i.test(h))
    .filter((h) => { try { return abs(h) !== res.url; } catch { return false; } }); // ignorar a ligação para a própria página
  // preferir as ligações com «news» ou «noticias», que são o feed de notícias
  const best = feedish.find((h) => /(news|not[ií]cias)/i.test(h)) || feedish[0];
  return best ? abs(best) : null;
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
    const alts = [s.feed, ...(s.feeds || [])].flat().filter(Boolean); // vários endereços possíveis
    let alt = 0;
    let feed = alts[0] || null;
    let google = false;
    let seen = new Set();
    let fails = 0;
    let wait = INTERVAL;
    let cache = {};
    let lastNew = Date.now(); // última vez que o feed trouxe algo
    let slow = 0; // travão temporário quando o site pede calma (429) ou falha
    const every = () => {
      if (google) return GOOGLE_INTERVAL;
      const base = s.intervalo ? Math.max(1, s.intervalo) * 1000
        : s.rapido ? FAST_STEPS.find(([idle]) => Date.now() - lastNew < idle)[1]
          : INTERVAL;
      return Math.max(base, slow);
    };
    const useGoogle = (why) => {
      feed = googleNewsFeed(s);
      google = true;
      cache = {};
      log(`[RSS] ${s.nome}: ${why}; passo a usar o Google News`);
    };

    for (;;) {
      try {
        if (!feed) {
          feed = alts[++alt] || await discover(s.site);
          if (alts[alt]) log(`[RSS] ${s.nome}: a experimentar ${feed}`);
          if (!feed) throw fail(`não encontrei o feed em ${s.site}`, { notFound: true });
          log(`[RSS] ${s.nome}: feed ${feed}`);
        }
        const parsed = await readFeed(feed, cache);
        if (parsed) {
          const items = (parsed.items || []).slice(0, 40);
          const dated = items.map((it) => Date.parse(it.isoDate || it.pubDate)).filter(Boolean);
          if (!google && dated.length && Date.now() - Math.max(...dated) > STALE_MS) throw fail("o feed não é atualizado há mais de uma semana", { stale: true });
          for (const it of [...items].reverse()) {
            const uniq = items.filter((x) => (x.guid || x.link) === (it.guid || it.link)).length === 1;
            const key = (uniq && (it.guid || it.link)) || `${it.title}|${it.isoDate || it.pubDate || ""}`;
            if (!key || seen.has(key)) continue;
            lastNew = Date.now();
            const ts = Date.parse(it.isoDate || it.pubDate) || Date.now();
            if (Date.now() - ts > BACKFILL_MS) continue;
            // no Google News o título vem com « - Nome do jornal» no fim e a descrição repete o título
            const title = google ? clean(it.title).replace(/\s+-\s+[^-]+$/, "") : clean(it.title);
            // num feed geral, deixar passar só o que é desporto (categoria, endereço ou texto)
            if (s.soDesporto) {
              const alvo = `${(it.categories || []).join(" ")} ${it.link || ""} ${title} ${it.contentSnippet || ""}`;
              if (!DESPORTO.test(alvo)) continue;
            }
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
          seen = new Set(items.map((it) => {
            const uniq = items.filter((x) => (x.guid || x.link) === (it.guid || it.link)).length === 1;
            return (uniq && (it.guid || it.link)) || `${it.title}|${it.isoDate || it.pubDate || ""}`;
          }));
        }
        fails = 0;
        slow = Math.max(0, slow / 2 - 500); // correu bem: levantar o travão aos poucos
        wait = every();
      } catch (e) {
        if (e.status === 429 || e.status === 503) {
          // o site pede calma: abrandar até 60 s em vez de desistir do feed
          slow = Math.min(60000, Math.max(5000, slow * 2));
          log(`[RSS] ${s.nome}: ${e.message}; abrando para ${Math.round(slow / 1000)} s`);
          await sleep(slow);
          continue;
        }
        const blocked = [401, 403, 404, 410, 451].includes(e.status) || e.notFound || e.parse || e.stale;
        if (!google && blocked && alt < alts.length - 1) {
          // ainda há outro endereço de feed para experimentar antes de passar ao Google News
          log(`[RSS] ${s.nome}: ${e.message}`);
          feed = null;
          wait = 1000;
        } else if (s.semGoogle && (blocked || ++fails >= 3)) {
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
