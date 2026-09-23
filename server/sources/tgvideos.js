// Vídeos de canais públicos do Telegram (ex.: t.me/twclipshdeuropa), lidos pela página pública do canal
// (https://t.me/s/<canal>). Não precisa de conta nem de sessão: é a mesma página que qualquer browser abre.
// Os vídeos pequenos vêm com o endereço do ficheiro e tocam no próprio site; os grandes abrem no Telegram.
import { sleep, lerTexto } from "../util.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s) => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);
const texto = (html) => decode(String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").trim();

// cada mensagem da página pública começa em data-post="canal/123"
export function lerPagina(html, canal) {
  const out = [];
  const partes = String(html || "").split(/(?=<div class="tgme_widget_message_wrap)/);
  for (const p of partes) {
    const post = p.match(/data-post="([^"/]+)\/(\d+)"/);
    if (!post) continue;
    const temVideo = /tgme_widget_message_video_player|<video\b|tgme_widget_message_roundvideo/.test(p);
    if (!temVideo) continue;
    const n = post[2];
    const thumb = p.match(/tgme_widget_message_video_thumb"[^>]*background-image:url\('([^']+)'\)/)?.[1]
      || p.match(/background-image:url\('([^']+)'\)/)?.[1] || null;
    const mp4 = p.match(/<video[^>]+src="([^"]+)"/)?.[1] || null;
    const t = texto(p.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const quando = Date.parse(p.match(/<time[^>]+datetime="([^"]+)"/)?.[1] || "") || Date.now();
    const titulo = t.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 2).join(" — ").slice(0, 200);
    out.push({
      fonte: "telegram",
      post_id: `tg:${canal.toLowerCase()}:${n}`,
      crosspost_of: null,
      canal,
      title: titulo || `Vídeo de t.me/${canal}`,
      reddit_url: `https://t.me/${canal}/${n}`, // ligação para a publicação original (o nome do campo vem do Reddit)
      video_url: `https://t.me/${canal}/${n}`,
      hls: null,
      mp4: mp4 ? decode(mp4) : null,
      height: null,
      thumbnail: thumb ? decode(thumb) : null,
      author: canal,
      flair: "",
      created_time: quando,
    });
  }
  return out;
}

export function startTgVideos(canais, add, log, estado = {}) {
  if (!canais.length) return;
  const ritmo = Math.max(3, Number(process.env.TELEGRAM_VIDEOS_SEGUNDOS) || 5) * 1000;
  for (const c of canais) {
    const est = (estado[c.canal] = { ok: null, erro: null, ultimo: null });
    (async () => {
      let espera = ritmo;
      for (;;) {
        try {
          const res = await fetch(`https://t.me/s/${c.canal}`, { headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8" } });
          if (!res.ok) throw new Error(`a página do canal respondeu ${res.status}`);
          const lidos = lerPagina(await lerTexto(res), c.canal).map((v) => ({ ...v, regiao: c.regiao || "mundo" }));
          for (const v of lidos) add(v);
          Object.assign(est, { ok: true, erro: null, ultimo: Date.now(), comVideo: lidos.length });
          espera = ritmo;
        } catch (e) {
          Object.assign(est, { ok: false, erro: e.message });
          espera = Math.min(10 * 60e3, espera * 2);
          log(`[Telegram vídeos] ${c.canal}: ${e.message}`);
        }
        await sleep(espera);
      }
    })();
  }
  log(`[Telegram vídeos] a ler ${canais.map((c) => `t.me/${c.canal}`).join(", ")} a cada ${ritmo / 1000} s`);
}
