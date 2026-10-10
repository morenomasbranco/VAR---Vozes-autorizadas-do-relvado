// Vídeos da Sport TV (sporttv.pt/videos): golos, resumos e lances dos jogos que a Sport TV transmite,
// publicados minutos depois, com o título no formato «Golo! Croácia 1 - [2] Espanha 89'».
// A página é servida já com a lista (não precisa de browser). Os vídeos estão alojados na Kaltura
// (partner 3064643): a miniatura sai do próprio identificador do vídeo; o ficheiro para tocar no site
// é procurado no manifesto da Kaltura e, se a Kaltura o recusar, no leitor da Kaltura (SPORTTV_UICONF)
// ou, em último caso, o vídeo abre no site da Sport TV.
import { sleep, lerTexto } from "../util.js";

const PAGINAS = (process.env.SPORTTV_PAGINAS || "https://www.sporttv.pt/videos/1/mais-recentes6,https://www.sporttv.pt/videos/1/mais-recentes")
  .split(",").map((s) => s.trim()).filter(Boolean);
const PARTNER = process.env.SPORTTV_PARTNER || "3064643";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'" };
const decode = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);
const texto = (h) => decode(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// «há 5 minutos», «há uma hora», «há 2 dias», «agora» → instante aproximado
const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, "três": 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
export function relativo(s, agora = Date.now()) {
  const t = String(s || "").toLowerCase();
  if (/\bagora\b|segundos?\b/.test(t)) return agora;
  const m = t.match(/h[aá]\s+(\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(minuto|hora|dia|semana|m[eê]s)/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? +m[1] : NUM[m[1]] || 1;
  const un = { minuto: 60e3, hora: 3600e3, dia: 86400e3, semana: 7 * 86400e3 }[m[2]] || 30 * 86400e3;
  return agora - n * un;
}

// O cartão de cada vídeo traz, antes do título, a etiqueta «Novo» e a duração («1:25»), e depois a hora
// («há 5 minutos»): sem isto, «Novo 1:25 Golo! FC Vizela 0 [2] Sporting CP B 45+1'» era lido como o jogo
// «Novo 1–25 Golo! FC Vizela».
const ETIQUETA = /^(?:novo|nova|novidade|new|exclusivo|exclusive|v[ií]deo|em direto|live|destaque|\d{1,2}:\d{2}(?::\d{2})?)\s*[|·•-]?\s+/i;
export function limparTitulo(t) {
  let s = String(t || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 5 && ETIQUETA.test(s); i++) s = s.replace(ETIQUETA, "");
  return s
    .replace(/\s+h[aá]\s+(?:\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez)\s+(?:minuto|hora|dia|semana|m[eê]s)e?s?\s*$/i, "")
    .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/, "")
    .trim();
}
export const tituloSujo = (t) => limparTitulo(t) !== String(t || "").replace(/\s+/g, " ").trim();

// ligações …/videos/{cat}/{slug}/video/{entryId}/{slug}: título, miniatura e hora de cada vídeo
export function lerPagina(html, base = "https://www.sporttv.pt/") {
  const src = String(html || "");
  const out = new Map();
  const re = /<a\b[^>]*href="([^"]*\/videos\/\d+\/[^"/]+\/video\/(\d_[a-z0-9]{8})\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(src))) {
    const [, href, entry, dentro] = m;
    const perto = src.slice(m.index, m.index + m[0].length + 1200);
    // o título: o atributo title da ligação, o texto do elemento do título, ou todo o texto do cartão (limpo)
    const doAtributo = decode(m[0].match(/^<a\b[^>]*\btitle="([^"]+)"/i)?.[1] || "");
    const doElemento = texto(dentro.match(/<(h[1-6]|p|span|div)\b[^>]*class="[^"]*(?:title|titulo)[^"]*"[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || "");
    const titulo = limparTitulo(doAtributo.length >= 6 ? doAtributo : doElemento.length >= 6 ? doElemento : texto(dentro) || decode(dentro.match(/\balt="([^"]+)"/)?.[1] || ""));
    const prev = out.get(entry);
    if (prev && (prev.title.length >= titulo.length || !titulo)) continue;
    if (!titulo || titulo.length < 4) { if (!prev) out.set(entry, null); continue; }
    let url;
    try { url = new URL(decode(href), base).href.replace(/[?#].*$/, ""); } catch { continue; }
    const quando = relativo(texto(perto.slice(m[0].length)).slice(0, 200));
    out.set(entry, {
      fonte: "sporttv",
      post_id: `sporttv:${entry}`,
      crosspost_of: null,
      canal: "sporttv",
      regiao: "mundo",
      title: titulo.slice(0, 200),
      reddit_url: url, // ligação para a publicação original
      video_url: url,
      hls: null, mp4: null, height: null, iframe: null,
      thumbnail: `https://cdnapisec.kaltura.com/p/${PARTNER}/thumbnail/entry_id/${entry}/width/720/type/1/quality/85`,
      author: "Sport TV",
      flair: "",
      created_time: quando,
      entry,
    });
  }
  return [...out.values()].filter(Boolean);
}

// O ficheiro do vídeo: primeiro os manifestos públicos da Kaltura (HLS e MP4); se o vídeo tiver controlo de
// acesso e todos recusarem, o leitor da Kaltura numa moldura (precisa do uiconf, lido do site ou do .env).
const tentados = new Map(); // entryId → { hls, mp4, iframe }
let uiconf = process.env.SPORTTV_UICONF || null;
let uiconfV7 = /^v7:/.test(uiconf || "");
let procurouUiconf = false;
async function procurarUiconf(paginaVideo) {
  if (uiconf || procurouUiconf) return;
  procurouUiconf = true;
  try {
    const r = await fetch(paginaVideo, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    const html = await lerTexto(r);
    const achar = (t) => t.match(/embedPlaykitJs\/uiconf_id\/(\d+)/) || t.match(/uiconf_?id["'\s:=/]+(\d{6,})/i);
    let m = achar(html);
    if (m) { uiconfV7 = /embedPlaykitJs/.test(m[0]); uiconf = m[1]; return; }
    // os scripts do próprio site (o leitor costuma estar configurado num deles)
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/gi)].map((x) => new URL(decode(x[1]), r.url).href)
      .filter((u) => /sporttv|kaltura|player|main|app|chunk/i.test(u)).slice(0, 8);
    for (const s of scripts) {
      try {
        const t = await (await fetch(s, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) })).text();
        m = achar(t);
        if (m) { uiconfV7 = /embedPlaykitJs/.test(m[0]); uiconf = m[1]; return; }
      } catch { /* script seguinte */ }
    }
  } catch { /* fica sem leitor */ }
}
async function responde(url, tipo) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Range: "bytes=0-2047" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (tipo === "hls") { const t = await r.text(); return /#EXTM3U/.test(t) ? r.url : null; }
    return /video|octet-stream/i.test(ct) ? r.url : null;
  } catch { return null; }
}
export async function ficheiro(v) {
  if (tentados.has(v.entry)) return tentados.get(v.entry);
  const res = { hls: null, mp4: null, iframe: null };
  tentados.set(v.entry, res);
  if (tentados.size > 2000) tentados.delete(tentados.keys().next().value);
  const p = PARTNER;
  const base = `https://cdnapisec.kaltura.com/p/${p}/sp/${p}00/playManifest/entryId/${v.entry}`;
  res.hls = await responde(`${base}/format/applehttp/protocol/https/a.m3u8`, "hls")
    || await responde(`https://cdnapisec.kaltura.com/p/${p}/playManifest/entryId/${v.entry}/format/applehttp/protocol/https/a.m3u8`, "hls");
  if (!res.hls) res.mp4 = await responde(`${base}/format/url/protocol/https/flavorParamId/0/a.mp4`, "mp4");
  if (!res.hls && !res.mp4) {
    await procurarUiconf(v.video_url);
    if (uiconf) {
      const id = uiconf.replace(/^v7:/, "");
      res.iframe = uiconfV7
        ? `https://cdnapisec.kaltura.com/p/${p}/embedPlaykitJs/uiconf_id/${id}?iframeembed=true&entry_id=${v.entry}&config[playback]={"autoplay":true,"muted":true}`
        : `https://cdnapisec.kaltura.com/p/${p}/sp/${p}00/embedIframeJs/uiconf_id/${id}/partner_id/${p}?iframeembed=true&playerId=kplayer&entry_id=${v.entry}&flashvars[autoPlay]=true&flashvars[mute]=true`;
    }
  }
  return res;
}

export function startSportTv(add, log, estado = {}) {
  if (process.env.SPORTTV === "0") return;
  const ritmo = Math.max(10, Number(process.env.SPORTTV_SEGUNDOS) || 20) * 1000;
  const vistos = new Set();
  let primeira = true;
  (async () => {
    log(`[Sport TV] vídeos da Sport TV, a cada ${ritmo / 1000} s`);
    let espera = ritmo;
    let pagina = 0;
    for (;;) {
      try {
        const url = PAGINAS[pagina];
        const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9" } });
        if (!res.ok) throw Object.assign(new Error(`a Sport TV respondeu ${res.status} em ${url}`), { status: res.status });
        const lidos = lerPagina(await lerTexto(res), res.url || url);
        if (!lidos.length) throw new Error(`não encontrei vídeos em ${url} (a Sport TV pode ter mudado a página)`);
        // do mais antigo para o mais recente; sem hora na página: na primeira leitura só se regista, depois vale a hora de chegada
        for (const v of lidos.reverse()) {
          if (vistos.has(v.post_id)) continue;
          vistos.add(v.post_id);
          if (!v.created_time) { if (primeira) continue; v.created_time = Date.now(); }
          const f = await ficheiro(v);
          add({ ...v, ...f });
        }
        if (vistos.size > 5000) vistos.clear();
        primeira = false;
        Object.assign(estado, { ok: true, erro: null, ultimo: Date.now(), comVideo: lidos.length, pagina: url, leitor: uiconf ? `uiconf ${uiconf}` : null });
        espera = ritmo;
      } catch (e) {
        Object.assign(estado, { ok: false, erro: e.message });
        if (e.status === 404 && pagina < PAGINAS.length - 1) pagina++; // endereço mudou: experimenta o seguinte
        else espera = Math.min(10 * 60e3, espera * 2);
        log(`[Sport TV] ${e.message}`);
      }
      await sleep(espera);
    }
  })();
}
