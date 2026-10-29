// A imagem de uma notícia, para o «Hoje no VAR» do Feed (a imagem grande da manchete escolhida). Procura-se por esta
// ordem:
// - a que chegou com a notícia ou com uma das confirmações (campo «img»): a imagem do feed RSS (media:content,
//   enclosure…) ou a do post do Bluesky; ou a fotografia da mensagem do Telegram («tg:canal/id»), descarregada pela
//   conta do Telegram, que não depende de o servidor chegar aos sites;
// - a das páginas: posts do X (API pública do FxTwitter), posts do Telegram (página pública) e notícias dos sites
//   (a imagem de partilha, og:image); as ligações do Google News levam primeiro à notícia no jornal.
// Uma imagem com endereço abre-a o próprio browser (302, sem «Referer»): é mais rápido e poupa o servidor, que nem
// sempre chega aos sites a tempo. Se não abrir, o site pede-a outra vez com ?servidor=1 e aí é o servidor que a
// descarrega e a serve. As imagens descarregadas ficam em memória (até IMAGENS_MB). Uma notícia sem imagem não volta a
// ser procurada durante meia hora, a não ser que entretanto chegue uma fonte com imagem. As últimas procuras ficam no
// estado, com o que falhou em cada passo, para a sonda.
import { interno } from "./declaracoes.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_IMG = 5 * 1024 * 1024;
const MAX_CACHE = (Number(process.env.IMAGENS_MB) || 48) * 1024 * 1024;
const SEM_IMAGEM_MS = 30 * 60e3;
const PRAZO_ENDERECO = 6 * 3600e3; // o endereço da imagem de uma notícia não muda
const PRAZO_TOTAL = 20e3; // passado este tempo não se abrem mais páginas
// páginas cuja imagem de partilha nunca é a da notícia
const SEM_PAGINA = /(^|\.)(news\.google\.com|google\.com|reddit\.com|youtube\.com|youtu\.be)$/i;

const host = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const absoluto = (u, base) => { try { return new URL(String(u).replace(/&amp;/g, "&").replace(/\\\//g, "/"), base).href; } catch { return null; } };
const seguro = (u) => !!u && /^https?:\/\//i.test(u) && !interno(host(u));
// o motivo de uma falha de rede, em poucas palavras
const motivo = (e) => (e?.name === "TimeoutError" || e?.name === "AbortError" ? "sem resposta" : e?.cause?.code || e?.code || String(e?.message || e).slice(0, 80));
const comPrazo = (p, ms) => {
  let t;
  return Promise.race([p, new Promise((_, nao) => { t = setTimeout(() => nao(Object.assign(new Error("sem resposta"), { name: "TimeoutError" })), ms); })])
    .finally(() => clearTimeout(t));
};
// o tipo de imagem pelos primeiros bytes (o Telegram não diz o tipo)
export function tipoDe(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (b.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  return null;
}

// a mensagem do Telegram tem fotografia: a do próprio post, ou a da pré-visualização da ligação partilhada (que o
// Telegram já foi buscar ao site)
export const temFoto = (m) => m?.media?.className === "MessageMediaPhoto" || (m?.media?.className === "MessageMediaWebPage" && !!m.media.webpage?.photo);

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

// uma página (ou um JSON): { corpo, url } ou { falha, rede }
async function texto(url, ms = 8000, cabecalhos = {}) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json,*/*", ...cabecalhos }, signal: AbortSignal.timeout(ms), redirect: "follow" });
    if (!r.ok) return { falha: `respondeu ${r.status}` };
    if (!seguro(r.url)) return { falha: "endereço interno" };
    return { corpo: (await r.text()).slice(0, 1.5e6), url: r.url };
  } catch (e) { return { falha: motivo(e), rede: true }; }
}

// As ligações do Google News (news.google.com/rss/articles/…) não dizem de que jornal é a notícia: o Google dá o
// endereço a quem lho pedir com a assinatura e a hora que vêm na página da ligação (pedido «garturlreq»). O cookie
// diz que a escolha dos cookies já foi feita, para a página não ser a do consentimento (servidores na Europa).
const COOKIE_GOOGLE = { Cookie: "CONSENT=YES+; SOCS=CAI" };
export const idGoogleNews = (url) => String(url).match(/^https?:\/\/news\.google\.com\/(?:rss\/)?articles\/([\w-]+)/i)?.[1] || null;
export function assinaturaGoogleNews(html) {
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  return sg && ts ? { sg, ts } : null;
}
export function pedidoGoogleNews(id, { sg, ts }) {
  const pedido = [["Fbv4je", `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${Number(ts)},"${sg}"]`]];
  return `f.req=${encodeURIComponent(JSON.stringify([pedido]))}`;
}
// a resposta: «)]}'», uma linha em branco e [["wrb.fr","Fbv4je","[\"garturlres\",\"https://…\",1]",…],…]
export function lerRespostaGoogleNews(txt) {
  try {
    const linha = JSON.parse(String(txt).split("\n\n")[1]).find((x) => x[0] === "wrb.fr" && x[1] === "Fbv4je");
    const u = JSON.parse(linha[2])[1];
    return /^https?:\/\//i.test(u) && !/(^|\.)google\.com$/i.test(host(u)) ? u : null;
  } catch { return null; }
}
async function destinoGoogleNews(id) {
  let a = null;
  for (const u of [`https://news.google.com/rss/articles/${id}`, `https://news.google.com/articles/${id}`]) {
    const r = await texto(u, 8000, COOKIE_GOOGLE);
    if (r.corpo && (a = assinaturaGoogleNews(r.corpo))) break;
    if (r.rede) return { ...r, falha: `Google News ${r.falha}` };
  }
  if (!a) return { falha: "Google News sem assinatura na página da ligação" };
  try {
    const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST", body: pedidoGoogleNews(id, a), signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Referer: "https://news.google.com/", ...COOKIE_GOOGLE },
    });
    if (!r.ok) return { falha: `Google News respondeu ${r.status}` };
    const u = lerRespostaGoogleNews(await r.text());
    return u ? { url: u } : { falha: "o Google News não deu o endereço da notícia" };
  } catch (e) { return { falha: `Google News ${motivo(e)}`, rede: true }; }
}

// o endereço da imagem de uma ligação (post do X, do Telegram, ligação do Google News ou página de uma notícia):
// { url } ou { falha, rede }
async function enderecoDe(url, seguinte = true) {
  if (!seguro(url)) return { falha: "endereço inválido" };
  const gn = seguinte && idGoogleNews(url);
  if (gn) {
    const d = await destinoGoogleNews(gn);
    if (!d.url) return d;
    const r = await enderecoDe(d.url, false);
    return r.falha ? { ...r, falha: `${host(d.url)}: ${r.falha}` } : r;
  }
  if (SEM_PAGINA.test(host(url))) return { falha: "não tem imagem própria" };
  const x = url.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
  if (x) {
    const r = await texto(`https://api.fxtwitter.com/${x[1]}/status/${x[2]}`);
    if (r.falha) return { ...r, falha: `FxTwitter ${r.falha}` };
    try { const u = imagemDoFx(JSON.parse(r.corpo)); return u ? { url: u } : { falha: "post sem fotografia" }; } catch { return { falha: "resposta do FxTwitter inválida" }; }
  }
  const tg = url.match(/^https?:\/\/(?:www\.)?t\.me\/(?:s\/)?([\w]{4,64})\/(\d+)/i);
  if (tg) {
    const r = await texto(`https://t.me/${tg[1]}/${tg[2]}?embed=1&mode=tme`);
    if (r.falha) return r;
    const u = imagemDoTelegram(r.corpo);
    return u ? { url: u } : { falha: "post sem fotografia" };
  }
  const r = await texto(url);
  if (r.falha) return r;
  const u = imagemDaPagina(r.corpo, r.url);
  if (u) return { url: u };
  // o que a página era (uma página de consentimento, de verificação…), para a sonda
  const titulo = (r.corpo.match(/<title[^>]*>([^<]{0,80})/i)?.[1] || "").replace(/\s+/g, " ").trim();
  return { falha: `página sem og:image (${Math.round(r.corpo.length / 1024)} KB${titulo ? `, «${titulo}»` : ""})` };
}

// a imagem: { buf, tipo } ou { falha, rede }
async function descarregar(u, ms = 10000) {
  if (!seguro(u)) return { falha: "endereço inválido" };
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
    if (!r.ok) return { falha: `respondeu ${r.status}` };
    if (!seguro(r.url)) return { falha: "endereço interno" };
    const tipo = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/i.test(tipo)) return { falha: `não é uma imagem (${tipo || "sem tipo"})` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length <= 2000 || buf.length > MAX_IMG) return { falha: `tamanho ${buf.length} bytes` };
    return { buf, tipo };
  } catch (e) { return { falha: motivo(e), rede: true }; }
}

// a fotografia de uma mensagem do Telegram («tg:canal/id»), pela conta do Telegram: { buf, tipo } ou { falha }
async function fotoTelegram(client, ref, ms = 15000) {
  const m = String(ref).match(/^tg:(\w{4,64})\/(\d+)$/);
  if (!m) return { falha: "referência inválida" };
  if (!client) return { falha: "sem ligação ao Telegram" };
  try {
    const dados = await comPrazo((async () => {
      const [msg] = await client.getMessages(m[1], { ids: [Number(m[2])] });
      return temFoto(msg) ? client.downloadMedia(msg, {}) : null;
    })(), ms);
    if (!dados?.length) return { falha: "mensagem sem fotografia" };
    const buf = Buffer.isBuffer(dados) ? dados : Buffer.from(dados);
    const tipo = tipoDe(buf);
    if (!tipo) return { falha: "não é uma imagem" };
    if (buf.length <= 2000 || buf.length > MAX_IMG) return { falha: `tamanho ${buf.length} bytes` };
    return { buf, tipo };
  } catch (e) { return { falha: motivo(e) }; }
}

// «telegram»: devolve a ligação ao Telegram (ou null), para as fotografias das mensagens
export function createImagens({ log = () => {}, telegram = () => null } = {}) {
  const cache = new Map(); // chave → { ts, buf, tipo } | { ts, url, refs } (abre-a o browser) | { ts, sem: true, refs }
  const aCaminho = new Map(); // chave → promessa
  let bytes = 0;
  const estado = { pedidos: 0, peloServidor: 0, peloBrowser: 0, sem: 0 };
  const ultimas = []; // as últimas procuras, com os passos que falharam

  const guardar = (k, v) => {
    const ant = cache.get(k);
    if (ant?.buf) bytes -= ant.buf.length;
    cache.delete(k);
    cache.set(k, v);
    if (v.buf) bytes += v.buf.length;
    while (bytes > MAX_CACHE && cache.size) {
      const [k2, x] = cache.entries().next().value;
      cache.delete(k2);
      if (x.buf) bytes -= x.buf.length;
    }
  };
  // quantas fontes da notícia trazem imagem: se aumentar, procura-se outra vez
  const comImagem = (it) => [it, ...(it.also || [])].filter((f) => f.img).length;

  // «servidor»: o servidor descarrega a imagem e serve-a ele (o site pede assim quando a imagem não abriu no browser).
  // Sem ele, uma imagem com endereço abre-a o próprio browser, e o servidor só descarrega as do Telegram.
  async function procurar(it, servidor) {
    const t0 = Date.now();
    const passos = [];
    const fontes = [it, ...(it.also || [])];
    const refs = fontes.map((f) => f.img).filter(Boolean);
    // 1) a imagem que chegou com a notícia ou com as confirmações: a do feed (RSS, Bluesky)…
    for (const u of refs.filter((r) => !/^tg:/.test(r) && seguro(r))) {
      if (!servidor) return { url: u, de: "feed", passos };
      const r = await descarregar(u);
      if (r.buf) return { ...r, de: `feed (${host(u)})`, passos };
      passos.push(`imagem do feed ${host(u)}: ${r.falha}`);
    }
    // …ou a fotografia da mensagem do Telegram, pela conta do Telegram
    for (const ref of refs.filter((r) => /^tg:/.test(r))) {
      if (Date.now() - t0 > PRAZO_TOTAL) break;
      const r = await fotoTelegram(telegram(), ref);
      if (r.buf) return { ...r, de: "Telegram", passos };
      passos.push(`Telegram ${ref.slice(3)}: ${r.falha}`);
    }
    // 2) a imagem das páginas da notícia e das confirmações
    for (const l of [...new Set(fontes.map((f) => f.url).filter(Boolean))].slice(0, 5)) {
      if (Date.now() - t0 > PRAZO_TOTAL) { passos.push("prazo esgotado"); break; }
      const e = await enderecoDe(l);
      if (!e.url) { passos.push(`página ${host(l)}: ${e.falha}`); continue; }
      if (!seguro(e.url)) { passos.push(`imagem ${host(e.url)}: endereço inválido`); continue; }
      if (!servidor) return { url: e.url, de: `página (${host(l)})`, passos };
      const r = await descarregar(e.url);
      if (r.buf) return { ...r, de: `página (${host(l)})`, passos };
      passos.push(`imagem ${host(e.url)}: ${r.falha}`);
    }
    return { passos };
  }

  // «it»: a notícia (do store), com o endereço dela, a imagem que trouxe e as fontes que a confirmaram.
  // Devolve { buf, tipo } (a imagem), { url } (abre-a o browser) ou null.
  async function imagem(it, { servidor = false } = {}) {
    if (!it?.id) return null;
    const k = servidor ? `${it.id}|servidor` : it.id;
    const c = cache.get(k);
    if (c?.buf) { cache.delete(k); cache.set(k, c); return c; }
    const prazo = c?.url ? PRAZO_ENDERECO : SEM_IMAGEM_MS;
    if (c && Date.now() - c.ts < prazo && comImagem(it) <= c.refs) return c.url ? c : null;
    // não há imagem nenhuma: o servidor também não a vai encontrar
    const sem = cache.get(it.id);
    if (servidor && sem?.sem && Date.now() - sem.ts < SEM_IMAGEM_MS && comImagem(it) <= sem.refs) return null;
    if (aCaminho.has(k)) return aCaminho.get(k);
    const p = (async () => {
      estado.pedidos++;
      const t0 = Date.now();
      let r;
      try { r = await procurar(it, servidor); } catch (e) { r = { passos: [`erro: ${e.message}`] }; }
      const v = r.buf ? { ts: Date.now(), buf: r.buf, tipo: r.tipo } : { ts: Date.now(), refs: comImagem(it), ...(r.url ? { url: r.url } : { sem: true }) };
      if (r.buf) estado.peloServidor++; else if (r.url) estado.peloBrowser++; else estado.sem++;
      guardar(k, v);
      ultimas.unshift({
        id: it.id, titulo: String(it.t?.pt || it.text || "").replace(/==/g, "").split("\n")[0].slice(0, 70), ms: Date.now() - t0, servidor: servidor || undefined,
        resultado: r.buf ? `servida pelo servidor: ${r.de}, ${Math.round(r.buf.length / 1024)} KB` : r.url ? `aberta pelo browser: ${r.de}, ${host(r.url)}` : "sem imagem",
        passos: r.passos,
      });
      if (ultimas.length > 12) ultimas.pop();
      if (!r.buf && !r.url && r.passos.length) log(`[Imagens] ${it.id}: ${r.passos.join(" · ")}`);
      return v.sem ? null : v;
    })().finally(() => aCaminho.delete(k));
    aCaminho.set(k, p);
    return p;
  }

  return { imagem, estado: () => ({ ...estado, emCache: cache.size, mb: Math.round(bytes / 1048576), ultimas }) };
}
