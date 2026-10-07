// Vídeos do Streamain (streamain.com): alojamento de vídeos enviados por utilizadores, onde aparecem golos e
// resumos partilhados pouco depois dos jogos. Como o site mistura tudo (não tem categoria de desporto),
// só entram os vídeos cujo título é de desporto. A lista vem já na página; cada vídeo toca no site pelo
// leitor do próprio Streamain (streamain.com/embed/<id>).
import { sleep, lerTexto } from "../util.js";

const PAGINAS = (process.env.STREAMAIN_PAGINAS || "https://streamain.com/en,https://streamain.com/en/videos?page=1")
  .split(",").map((s) => s.trim()).filter(Boolean);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'" };
const decode = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);
const texto = (h) => decode(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// vocabulário de desporto: golos, resumos, competições, clubes e modalidades, em várias línguas
const DESPORTO = new RegExp([
  "\\bgoal", "\\bgolo", "\\bgol\\b", "golazo", "gola[cç]o", "highlights?", "resumo", "resumen", "sintesi", "melhores momentos",
  "\\bvs\\.?\\s", "\\b\\d{1,2}\\s?[-–]\\s?\\d{1,2}\\b", "\\[\\d+\\]", "\\b\\d{1,3}(\\+\\d{1,2})?['’](?!s)",
  "football", "soccer", "futebol", "f[uú]tbol", "calcio", "fu(ss|ß)ball", "futsal", "basket", "\\bnba\\b", "\\bufc\\b", "\\bmma\\b", "boxing", "boxe",
  "tennis", "t[eé]nis", "\\bf1\\b", "formula ?1", "motogp", "rugby", "hockey", "h[oó]quei", "andebol", "handball", "volei", "volley", "cycling", "ciclismo", "\\bnfl\\b", "\\bmlb\\b",
  "premier league", "champions", "europa league", "conference league", "la ?liga", "serie a", "bundesliga", "ligue 1", "liga portugal", "eredivisie", "libertadores", "brasileir[aã]o", "\\bmls\\b", "\\bcopa\\b", "\\bcup\\b", "ta[cç]a", "coppa", "pokal", "mundial", "world cup", "\\beuro\\b", "nations league",
  "\\bfc\\b", "\\bsc\\b", "\\bcf\\b", "benfica", "sporting", "porto", "real madrid", "barcelona", "bar[cç]a", "atl[eé]tico", "arsenal", "chelsea", "liverpool", "manchester", "man (city|utd|united)", "tottenham", "newcastle", "juventus", "\\binter\\b", "milan", "napoli", "\\broma\\b", "bayern", "dortmund", "psg", "paris saint", "marseille", "flamengo", "palmeiras", "boca", "river plate",
  "\\bpenalt", "pen[aá]lti", "\\bsave\\b", "red card", "\\bvar\\b", "free[- ]kick", "hat[- ]trick", "\\bassist",
].join("|"), "i");
export const eDesporto = (t) => DESPORTO.test(String(t || ""));

// …/en/<id de 15 caracteres>/watch, com o título e a miniatura (…/thumbnails/<id>_<epoch>_thumb.jpg) por perto
export function lerPagina(html, base = "https://streamain.com/en") {
  const src = String(html || "");
  const out = new Map();
  const re = /<a\b[^>]*href="([^"]*\/([A-Za-z0-9]{15})\/watch)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  let fimAnterior = 0;
  while ((m = re.exec(src))) {
    const [, href, id, dentro] = m;
    const antes = src.slice(Math.max(fimAnterior, m.index - 1500), m.index);
    const depois = src.slice(m.index + m[0].length, m.index + m[0].length + 600);
    fimAnterior = m.index + m[0].length;
    const titulo = texto(dentro) || decode(m[0].match(/\btitle="([^"]+)"/)?.[1] || "") || decode(dentro.match(/\balt="([^"]+)"/)?.[1] || "");
    const img = (dentro.match(/(?:data-src|src)="([^"]*\/thumbnails\/[^"]+)"/i) || [...antes.matchAll(/(?:data-src|src)="([^"]*\/thumbnails\/[^"]+)"/gi)].pop())?.[1] || null;
    const prev = out.get(id);
    if (prev && ((prev.title || "").length >= titulo.length || !titulo) && (prev.thumbnail || !img)) continue;
    let url;
    try { url = new URL(decode(href), base).href; } catch { continue; }
    let thumb = null;
    try { thumb = img ? new URL(decode(img), base).href : null; } catch { thumb = null; }
    // a miniatura traz a hora do envio em segundos (…_1759837260_thumb.jpg); só se usa se for plausível
    const ep = Number(thumb?.match(/_(\d{10})_thumb/)?.[1]) * 1000;
    const quando = ep && ep <= Date.now() + 120e3 && Date.now() - ep < 30 * 86400e3 ? Math.min(ep, Date.now())
      : Date.parse(texto(depois).match(/[A-Z][a-z]{2} \d{1,2}, \d{4} \d{1,2}:\d{2} [AP]M/)?.[0] || "") || null;
    out.set(id, {
      fonte: "streamain",
      post_id: `streamain:${id}`,
      crosspost_of: null,
      canal: "streamain",
      regiao: "mundo",
      title: (titulo || prev?.title || "").slice(0, 200),
      reddit_url: url,
      video_url: url,
      hls: null, mp4: null, height: null,
      iframe: `https://streamain.com/embed/${id}`,
      thumbnail: thumb || prev?.thumbnail || null,
      author: "Streamain",
      flair: "",
      created_time: quando || prev?.created_time || null,
    });
  }
  return [...out.values()].filter((v) => v.title);
}

export function startStreamain(add, log, estado = {}) {
  if (process.env.STREAMAIN === "0") return;
  const ritmo = Math.max(10, Number(process.env.STREAMAIN_SEGUNDOS) || 30) * 1000;
  const vistos = new Set();
  let primeira = true;
  (async () => {
    log(`[Streamain] vídeos de desporto do Streamain, a cada ${ritmo / 1000} s`);
    let espera = ritmo;
    for (;;) {
      let lidos = 0, aceites = 0;
      const erros = [];
      for (const url of PAGINAS) {
        try {
          const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en;q=0.9,pt;q=0.8" } });
          if (!res.ok) throw new Error(`o Streamain respondeu ${res.status} em ${url}`);
          const lista = lerPagina(await lerTexto(res), res.url || url);
          lidos += lista.length;
          for (const v of lista.reverse()) {
            if (vistos.has(v.post_id)) continue;
            vistos.add(v.post_id);
            if (!eDesporto(v.title)) continue; // só desporto
            if (!v.created_time) { if (primeira) continue; v.created_time = Date.now(); }
            aceites++;
            add(v);
          }
        } catch (e) { erros.push(e.message); }
      }
      if (vistos.size > 20000) vistos.clear();
      primeira = false;
      if (!lidos) {
        const erro = erros[0] || "não encontrei vídeos na página (o Streamain pode ter mudado o formato)";
        Object.assign(estado, { ok: false, erro });
        log(`[Streamain] ${erro}`);
        espera = Math.min(10 * 60e3, espera * 2);
      } else {
        Object.assign(estado, { ok: true, erro: erros[0] || null, ultimo: Date.now(), lidos, aceites: (estado.aceites || 0) + aceites });
        espera = ritmo;
      }
      await sleep(espera);
    }
  })();
}
