// Vídeos publicados no Reddit (r/soccer, r/Evangelista_TV…). Todos os subreddits são lidos num só pedido
// (/r/a+b/new), o que poupa o limite de pedidos do Reddit.
// Três maneiras de ler, pela ordem em que são tentadas:
//  1. API oficial com uma app gratuita do Reddit (REDDIT_CLIENT_ID e REDDIT_CLIENT_SECRET): 100 pedidos por
//     minuto e não é bloqueada nos servidores de alojamento; permite ler a cada 3 segundos.
//  2. JSON público (reddit.com/…/new.json): sem conta, cerca de 10 pedidos por minuto; de 8 em 8 segundos.
//  3. RSS público (reddit.com/…/new/.rss), quando o JSON é recusado.
import Parser from "rss-parser";
import { sleep } from "../util.js";

const UA = process.env.REDDIT_USER_AGENT || "web:var-feed:1.0 (agregador de videos de futebol)";
const VIDEO_HOSTS = /(^|\.)(v\.redd\.it|streamable\.com|streamin\.(one|me|link|fun)|streamja\.com|streamff\.(com|co|link)|streamgg\.com|dubz\.(co|link|live)|streamvi\.com|clippituser\.tv|mixture\.gg|juststream\.live|streambug\.io|youtube\.com|youtu\.be|x\.com|twitter\.com|imgur\.com|gfycat\.com|redgifs\.com|dailymotion\.com|dai\.ly|vimeo\.com|streamain\.com|caulse\.com|footy\.media|goalclip\.net)$/i;
const IMAGEM = /\.(jpe?g|png|webp)(\?|$)/i;
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const hostDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// uma publicação do JSON do Reddit → publicação em bruto para o feed de vídeos (ou null se não tiver vídeo)
export function deJson(d, subs) {
  if (!d || d.over_18 || d.removed_by_category || d.is_self) return null;
  const origem = d.crosspost_parent_list?.[0];
  const media = d.secure_media || d.media || origem?.secure_media || origem?.media;
  const rv = media?.reddit_video;
  const url = decode(d.url_overridden_by_dest || d.url || "");
  const host = hostDe(url);
  const isVideo = d.is_video || !!rv || (VIDEO_HOSTS.test(host) && !IMAGEM.test(url) && !/i\.imgur\.com\/\w+\.(jpe?g|png)/.test(url))
    || d.post_hint === "rich:video" || d.post_hint === "hosted:video" || media?.type === "youtube.com" || media?.oembed?.type === "video";
  if (!isVideo) return null;
  if (/(^|\.)imgur\.com$/.test(host) && !/\.(gifv|mp4)$/i.test(url)) return null; // imagens do imgur
  const sub = subs.find((s) => s.sub.toLowerCase() === String(d.subreddit).toLowerCase()) || {};
  const flair = d.link_flair_text || "";
  if (sub.soMedia && !(rv || VIDEO_HOSTS.test(host))) return null;
  const img = d.preview?.images?.[0] || origem?.preview?.images?.[0];
  const res = (img?.resolutions || []).filter((r) => r.width >= 320);
  const thumbnail = decode(res[0]?.url || img?.source?.url || (/^https?:/.test(d.thumbnail || "") ? d.thumbnail : "")) || null;
  const videoUrl = rv ? `https://v.redd.it/${(url.match(/v\.redd\.it\/(\w+)/) || [])[1] || (rv.fallback_url || "").split("/")[3] || d.id}` : url;
  return {
    fonte: "reddit",
    post_id: `reddit:${d.id}`,
    crosspost_of: d.crosspost_parent ? `reddit:${String(d.crosspost_parent).replace(/^t3_/, "")}` : null,
    subreddit: d.subreddit,
    regiao: sub.regiao || "mundo",
    title: decode(d.title),
    reddit_url: `https://www.reddit.com${d.permalink}`,
    video_url: videoUrl,
    hls: rv?.hls_url ? decode(rv.hls_url) : null,
    mp4: rv?.fallback_url ? decode(rv.fallback_url) : null,
    height: rv?.height || img?.source?.height || null,
    thumbnail,
    author: d.author,
    flair,
    created_time: Math.round((d.created_utc || Date.now() / 1000) * 1000),
  };
}

// uma entrada do RSS (Atom) do Reddit: o endereço do vídeo vem no link «[link]» do conteúdo
const rssParser = new Parser({ timeout: 10000, customFields: { item: [["media:thumbnail", "thumb", { keepArray: false }], ["category", "cat", { keepArray: false }]] } });
export function deRss(it, subs) {
  const html = it.content || "";
  const link = decode(html.match(/<a href="([^"]+)">\[link\]<\/a>/)?.[1] || "");
  const host = hostDe(link);
  if (!link || !VIDEO_HOSTS.test(host) || IMAGEM.test(link)) return null;
  const id = String(it.id || it.guid || "").replace(/^t3_/, "") || (it.link || "").match(/comments\/(\w+)/)?.[1];
  if (!id) return null;
  const subNome = it.cat?.$?.term || it.link?.match(/\/r\/([^/]+)/)?.[1] || "";
  const sub = subs.find((s) => s.sub.toLowerCase() === subNome.toLowerCase()) || {};
  const thumb = it.thumb?.$?.url || decode(html.match(/<img src="([^"]+)"/)?.[1] || "") || null;
  return {
    fonte: "reddit",
    post_id: `reddit:${id}`,
    crosspost_of: null,
    subreddit: subNome,
    regiao: sub.regiao || "mundo",
    title: decode(it.title),
    reddit_url: it.link,
    video_url: link,
    hls: /v\.redd\.it/.test(host) ? `${link.replace(/\/$/, "")}/HLSPlaylist.m3u8` : null,
    mp4: null,
    height: null,
    thumbnail: thumb,
    author: String(it.author || "").replace(/^\/u\//, ""),
    flair: "",
    created_time: Date.parse(it.isoDate || it.pubDate || "") || Date.now(),
  };
}

// o Reddit bloqueia servidores de alojamento com respostas 200 que não são o feed (página de login ou
// «blocked by network security»); isto trata-as como recusas em vez de feeds vazios
export const bloqueado = (res, corpo) => res.status === 200 && /<html|blocked by network security|prove your humanity|whoa there/i.test(String(corpo).slice(0, 2000)) && !/<feed|"kind":\s*"Listing"/.test(String(corpo).slice(0, 2000));

export function startReddit(subs, add, log, estado = {}, { relayAtivo = () => false } = {}) {
  if (!subs.length) return;
  if (process.env.REDDIT_SERVIDOR === "0") { log("[Reddit] leitura no servidor desligada (REDDIT_SERVIDOR=0); os vídeos do Reddit chegam pelo retransmissor"); return; }
  const caminho = `/r/${subs.map((s) => s.sub).join("+")}/new`;
  const { REDDIT_CLIENT_ID: ID, REDDIT_CLIENT_SECRET: SEGREDO } = process.env;
  const oauth = !!(ID && SEGREDO);
  const ritmo = Math.max(2, Number(process.env.REDDIT_SEGUNDOS) || (oauth ? 3 : 8)) * 1000;
  // o RSS público só aceita cerca de um pedido por minuto por endereço; mais do que isso dá 429
  const ritmoRss = Math.max(30, Number(process.env.REDDIT_RSS_SEGUNDOS) || 60) * 1000;
  let token = null;
  let tokenAte = 0;
  let modo = oauth ? "oauth" : "json";
  let falhasJson = 0;
  Object.assign(estado, { modo, ritmo: ritmo / 1000, ok: null, erro: null, ultimo: null });

  async function obterToken() {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${ID}:${SEGREDO}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: "grant_type=client_credentials",
    });
    if (!r.ok) throw new Error(`token do Reddit recusado (${r.status})`);
    const j = await r.json();
    token = j.access_token;
    tokenAte = Date.now() + (j.expires_in || 3600) * 1000 - 60e3;
  }

  // devolve quanto tempo esperar a mais, segundo os cabeçalhos de limite do Reddit
  const pausaDoLimite = (res) => {
    const resta = Number(res.headers.get("x-ratelimit-remaining"));
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    return Number.isFinite(resta) && resta < 2 && Number.isFinite(reset) ? reset * 1000 : 0;
  };

  async function lerJson() {
    const base = modo === "oauth" ? "https://oauth.reddit.com" : "https://www.reddit.com";
    if (modo === "oauth" && (!token || Date.now() > tokenAte)) await obterToken();
    const res = await fetch(`${base}${caminho}${modo === "oauth" ? "" : ".json"}?limit=100&raw_json=1`, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(modo === "oauth" ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (res.status === 401 && modo === "oauth") { token = null; throw Object.assign(new Error("token expirado"), { status: 401 }); }
    if (!res.ok) throw Object.assign(new Error(`o Reddit respondeu ${res.status}`), { status: res.status, pausa: pausaDoLimite(res) });
    const corpo = await res.text();
    if (bloqueado(res, corpo)) throw Object.assign(new Error("o Reddit devolveu uma página de bloqueio em vez dos dados"), { status: 403 });
    const j = JSON.parse(corpo);
    const posts = (j?.data?.children || []).map((c) => c.data);
    return { posts: posts.map((d) => deJson(d, subs)), pausa: pausaDoLimite(res) };
  }

  async function lerRss() {
    const res = await fetch(`https://www.reddit.com${caminho}/.rss?limit=100`, { headers: { "User-Agent": UA, Accept: "application/atom+xml, application/xml" } });
    if (!res.ok) throw Object.assign(new Error(`o RSS do Reddit respondeu ${res.status}`), { status: res.status });
    const corpo = await res.text();
    if (bloqueado(res, corpo)) throw Object.assign(new Error("o RSS do Reddit devolveu uma página de bloqueio"), { status: 403 });
    const feed = await rssParser.parseString(corpo);
    return { posts: (feed.items || []).map((it) => deRss(it, subs)), pausa: 0 };
  }

  (async () => {
    log(`[Reddit] vídeos de ${subs.map((s) => `r/${s.sub}`).join(", ")} (${oauth ? "API oficial" : "JSON público"}, a cada ${ritmo / 1000} s)`);
    let espera = ritmo;
    for (;;) {
      // com o retransmissor de casa a funcionar, o servidor não gasta pedidos (nem se arrisca a ser bloqueado)
      if (relayAtivo()) { estado.modo = "retransmissor"; await sleep(30000); continue; }
      try {
        const { posts, pausa } = modo === "rss" ? await lerRss() : await lerJson();
        const validos = posts.filter(Boolean).sort((a, b) => a.created_time - b.created_time);
        for (const p of validos) add(p);
        Object.assign(estado, { modo, ok: true, erro: null, ultimo: Date.now(), lidos: posts.length, comVideo: validos.length });
        falhasJson = 0;
        espera = Math.max(modo === "rss" ? ritmoRss : ritmo, pausa);
      } catch (e) {
        Object.assign(estado, { modo, ok: false, erro: e.message });
        if (modo === "json" && [403, 429].includes(e.status) && ++falhasJson >= 2) {
          // o JSON público é muitas vezes recusado a servidores de alojamento: passa para o RSS
          modo = "rss";
          log("[Reddit] o JSON público foi recusado a este servidor; passo a ler o RSS, um pedido por minuto. Para tempo real, usa o retransmissor (npm run reddit-relay) num computador de casa");
          espera = 2000;
        } else {
          espera = Math.min(5 * 60e3, Math.max(e.pausa || 0, espera * 2, 15000));
          log(`[Reddit] ${e.message}; nova tentativa daqui a ${Math.round(espera / 1000)} s`);
        }
      }
      // de vez em quando volta a experimentar o JSON, que traz a qualidade do vídeo e as partilhas
      if (modo === "rss" && !oauth && Math.random() < 0.02) { modo = "json"; falhasJson = 0; }
      await sleep(espera);
    }
  })();
}
