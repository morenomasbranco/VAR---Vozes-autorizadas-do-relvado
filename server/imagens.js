// A imagem de uma notícia, para o «Hoje no VAR» do Feed (a imagem grande da manchete escolhida). As notícias chegam
// sem imagem (RSS, X, Telegram, Bluesky), por isso o servidor vai buscá-la quando o site a pede:
// - posts do X: a fotografia (ou a imagem do vídeo) pela API pública do FxTwitter;
// - posts do Telegram: a fotografia da página pública do post;
// - notícias dos sites: a imagem que a página indica para as partilhas (og:image, twitter:image);
// e, se a fonte principal não tiver imagem, a de uma das fontes que confirmaram a notícia. A imagem descarregada fica
// em memória (até IMAGENS_MB) e uma notícia sem imagem não volta a ser procurada durante meia hora.
import { interno } from "./declaracoes.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_IMG = 5 * 1024 * 1024;
const MAX_CACHE = (Number(process.env.IMAGENS_MB) || 48) * 1024 * 1024;
const SEM_IMAGEM_MS = 30 * 60e3;
// páginas cuja imagem de partilha nunca é a da notícia
const SEM_PAGINA = /(^|\.)(news\.google\.com|google\.com|reddit\.com|youtube\.com|youtu\.be)$/i;

const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const absoluto = (u, base) => { try { return new URL(String(u).replace(/&amp;/g, "&").replace(/\\\//g, "/"), base).href; } catch { return null; } };
const seguro = (u) => !!u && /^https?:\/\//i.test(u) && !interno(host(u));

// a imagem indicada pelo HTML de uma página (og:image, twitter:image, image_src)
export function imagemDaPagina(html, base) {
  const meta = (prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1];
  const c = meta("og:image:secure_url") || meta("og:image") || meta("og:image:url") || meta("twitter:image") || meta("twitter:image:src")
    || html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1];
  return c ? absoluto(c, base) : null;
}

// a fotografia de um post público do Telegram (a página de incorporação do post)
export function imagemDoTelegram(html) {
  const m = html.match(/tgme_widget_message_(?:photo_wrap|video_thumb)[^>]+background-image:\s*url\(['"]?([^'")]+)['"]?\)/i);
  return m ? m[1] : null;
}

// a imagem de um post do X, pela resposta da API do FxTwitter
export function imagemDoFx(j) {
  const t = j?.tweet || {};
  const m = t.media || t.quote?.media || {};
  return m.photos?.[0]?.url || m.videos?.[0]?.thumbnail_url || m.mosaic?.formats?.jpeg || m.all?.[0]?.thumbnail_url || m.all?.[0]?.url || null;
}

async function texto(url, ms = 8000) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json,*/*" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  if (!r.ok || !seguro(r.url)) return null;
  return { corpo: (await r.text()).slice(0, 1.5e6), url: r.url };
}

// o endereço da imagem de uma ligação (post do X, do Telegram ou página de uma notícia)
async function enderecoDe(url) {
  if (!seguro(url) || SEM_PAGINA.test(host(url))) return null;
  const x = url.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
  if (x) {
    const r = await texto(`https://api.fxtwitter.com/${x[1]}/status/${x[2]}`).catch(() => null);
    if (!r) return null;
    try { return imagemDoFx(JSON.parse(r.corpo)); } catch { return null; }
  }
  const tg = url.match(/^https?:\/\/(?:www\.)?t\.me\/(?:s\/)?([\w]{4,64})\/(\d+)/i);
  if (tg) {
    const r = await texto(`https://t.me/${tg[1]}/${tg[2]}?embed=1&mode=tme`).catch(() => null);
    return r ? imagemDoTelegram(r.corpo) : null;
  }
  const r = await texto(url).catch(() => null);
  return r ? imagemDaPagina(r.corpo, r.url) : null;
}

async function descarregar(u) {
  if (!seguro(u)) return null;
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(10000), redirect: "follow" }).catch(() => null);
  if (!r?.ok || !seguro(r.url)) return null;
  const tipo = (r.headers.get("content-type") || "").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(tipo)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 2000 && buf.length <= MAX_IMG ? { buf, tipo } : null;
}

export function createImagens({ log = () => {} } = {}) {
  const cache = new Map(); // id → { ts, buf, tipo } ou { ts, sem: true }
  const aCaminho = new Map(); // id → promessa
  let bytes = 0;
  const estado = { pedidos: 0, encontradas: 0, sem: 0 };

  const guardar = (id, v) => {
    const ant = cache.get(id);
    if (ant?.buf) bytes -= ant.buf.length;
    cache.delete(id);
    cache.set(id, v);
    if (v.buf) bytes += v.buf.length;
    while (bytes > MAX_CACHE && cache.size) {
      const [k, x] = cache.entries().next().value;
      cache.delete(k);
      if (x.buf) bytes -= x.buf.length;
    }
  };

  // «it»: a notícia (do store), com o endereço dela e as fontes que a confirmaram
  async function imagem(it) {
    if (!it?.id) return null;
    const c = cache.get(it.id);
    if (c?.buf) { cache.delete(it.id); cache.set(it.id, c); return c; }
    if (c?.sem && Date.now() - c.ts < SEM_IMAGEM_MS) return null;
    if (aCaminho.has(it.id)) return aCaminho.get(it.id);
    const p = (async () => {
      estado.pedidos++;
      const ligacoes = [...new Set([it.url, ...(it.also || []).map((a) => a.url)].filter(Boolean))].slice(0, 5);
      for (const l of ligacoes) {
        try {
          const u = await enderecoDe(l);
          const img = u ? await descarregar(u) : null;
          if (img) { estado.encontradas++; const v = { ts: Date.now(), ...img }; guardar(it.id, v); return v; }
        } catch (e) { log(`[Imagens] ${l}: ${e.message}`); }
      }
      estado.sem++;
      guardar(it.id, { ts: Date.now(), sem: true });
      return null;
    })().finally(() => aCaminho.delete(it.id));
    aCaminho.set(it.id, p);
    return p;
  }

  return { imagem, estado: () => ({ ...estado, emCache: cache.size, mb: Math.round(bytes / 1048576) }) };
}
