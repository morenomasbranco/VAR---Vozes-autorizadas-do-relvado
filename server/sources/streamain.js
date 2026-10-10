// Vídeos do Streamain (streamain.com): alojamento de vídeos enviados por utilizadores, onde aparecem golos e
// resumos partilhados pouco depois dos jogos. Como o site mistura tudo (não tem categoria de desporto),
// só entram os vídeos cujo título é de futebol. A lista vem já na página; cada vídeo toca no site pelo
// leitor do próprio Streamain (streamain.com/embed/<id>).
import { sleep, lerTexto } from "../util.js";

const PAGINAS = (process.env.STREAMAIN_PAGINAS || "https://streamain.com/en,https://streamain.com/en/videos?page=1")
  .split(",").map((s) => s.trim()).filter(Boolean);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'" };
const decode = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);
const texto = (h) => decode(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Só futebol. O Streamain mistura tudo (jogos de computador, outros desportos, vídeos pessoais), por isso:
//   1. o que é claramente outra coisa fica sempre de fora (foi assim que um vídeo de Minecraft entrou no Feed);
//   2. o título tem de ter uma palavra de futebol (golo, resumo, competição, clube…). Um resultado («2-1»), um
//      «vs» ou um minuto sozinhos não chegam: só contam o resultado com minuto («2-1 67'») ou entre parênteses
//      retos, à maneira do r/soccer («Benfica [2] - 1 Porto»).
const NAO_FUTEBOL = new RegExp([
  "minecraft", "fortnite", "roblox", "\\bgta\\b", "grand theft auto", "call of duty", "warzone", "valorant", "league of legends", "counter[- ]?strike", "\\bcs ?go\\b", "\\bcs2\\b",
  "among us", "pok[eé]mon", "clash (royale|of clans)", "brawl stars", "free ?fire", "apex legends", "overwatch", "genshin", "rocket league", "super mario", "mario kart", "zelda", "elden ring",
  "gameplay", "let'?s play", "speedrun", "walkthrough", "playthrough", "\\bgaming\\b", "\\bgamer\\b", "e-?football", "\\bea ?(sports )?fc ?\\d{2}", "\\bfifa ?\\d{2}\\b", "ultimate team", "\\bpes ?20\\d\\d",
  "\\bnba\\b", "\\bufc\\b", "\\bmma\\b", "boxing", "\\bboxe\\b", "tennis", "t[eé]nis", "\\bf1\\b", "formula ?1", "motogp", "rugby", "\\bnfl\\b", "\\bmlb\\b", "\\bnhl\\b", "hockey", "basketball", "baseball", "cricket", "wrestling", "\\bwwe\\b",
  "unboxing", "asmr", "tiktok compilation", "prank", "reaction to", "music video", "trailer",
].join("|"), "i");
const FUTEBOL = new RegExp([
  "\\bgoal", "\\bgolo", "\\bgol\\b", "golazo", "gola[cç]o", "highlights?", "resumo", "resumen", "sintesi", "melhores momentos",
  "\\[\\d+\\]", "\\b\\d{1,2}\\s?[-–]\\s?\\d{1,2}\\b.*\\b\\d{1,3}(\\+\\d{1,2})?['’](?!s)",
  "football", "soccer", "futebol", "f[uú]tbol", "calcio", "fu(ss|ß)ball", "futsal",
  "premier league", "champions", "europa league", "conference league", "la ?liga", "serie a", "bundesliga", "ligue 1", "liga portugal", "eredivisie", "libertadores", "brasileir[aã]o", "\\bmls\\b", "\\bcopa\\b", "ta[cç]a", "coppa", "pokal", "mundial", "world cup", "\\beuro\\b", "nations league", "\\buefa\\b", "\\bfifa\\b",
  "\\bfc\\b", "\\bsc\\b", "\\bcf\\b", "benfica", "sporting", "\\bporto\\b", "real madrid", "barcelona", "bar[cç]a", "atl[eé]tico", "arsenal", "chelsea", "liverpool", "manchester", "man (city|utd|united)", "tottenham", "newcastle", "juventus", "\\binter\\b", "milan", "napoli", "\\broma\\b", "bayern", "dortmund", "psg", "paris saint", "marseille", "flamengo", "palmeiras", "boca juniors", "river plate",
  "\\bpenalt", "pen[aá]lti", "red card", "\\bvar\\b", "free[- ]kick", "hat[- ]trick", "\\bassist", "goalkeeper", "guarda-redes",
].join("|"), "i");
export const eFutebol = (t) => { const s = String(t || ""); return !NAO_FUTEBOL.test(s) && FUTEBOL.test(s); };
// vídeos do Streamain tirados à mão (o id de 15 caracteres do endereço streamain.com/en/<id>/watch)
export const RECUSADOS = new Set(["luSIbqVpKPbmv8J", ...String(process.env.STREAMAIN_FORA || "").split(",").map((x) => x.trim()).filter(Boolean)]);
export const aceita = (v) => eFutebol(v.title) && !RECUSADOS.has(String(v.post_id || "").replace(/^streamain:/, ""));

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
    log(`[Streamain] vídeos de futebol do Streamain, a cada ${ritmo / 1000} s`);
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
            if (!aceita(v)) continue; // só futebol
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
