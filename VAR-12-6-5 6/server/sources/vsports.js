// Vídeos oficiais da Liga Portugal (VSPORTS, vsports.pt): cada golo da Liga Portugal Betclic, da Liga 2 e das
// taças é publicado ali poucos minutos depois de acontecer, com o formato fixo
// «GOLO! Braga, J. Wind aos 83', Braga 1-0 Estoril», e os resumos no fim de cada jogo.
// É um site público português, que não bloqueia servidores de alojamento como o Reddit.
import { sleep } from "../util.js";
import { simil } from "./zapping.js";

const PAGINA = process.env.VSPORTS_PAGINA || "https://vsports.pt/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'" };
const decode = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);
const texto = (h) => decode(String(h || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// «2026-09-14 22:34:05», hora de Lisboa → instante
function deLisboa(s) {
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const palpite = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const fuso = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", timeZoneName: "longOffset" }).format(new Date(palpite));
  const o = fuso.match(/GMT([+-])(\d{2}):(\d{2})/);
  return palpite - (o ? (o[1] === "-" ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000 : 0);
}

// título → equipas, resultado, jogador, minuto e categoria
export function lerTitulo(t) {
  const g = t.match(/^GOLO!\s*(.+?),\s*(.+?)\s+aos\s+(\d+)'?(?:\s*\+\s*(\d+)'?)?,\s*(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)$/i);
  if (g) {
    const [, equipa, jogador, min, extra, home, hs, as, away] = g;
    const autogolo = /\(p\.?\s?b\.?\)/i.test(jogador);
    const casa = simil(equipa, home) >= simil(equipa, away);
    return {
      categoria: "goal",
      info: {
        home_team: home.trim(), away_team: away.trim(), score: `${hs}-${as}`, scorer_side: casa ? "home" : "away",
        player: `${jogador.replace(/\s*\(p\.?\s?b\.?\)\s*/i, "").trim()}${autogolo ? " (a.g.)" : ""}`, minute: extra ? `${min}+${extra}` : min, opponent: null,
      },
    };
  }
  const r = t.match(/^(.*?)(?:\s*\([^)]*\))?:?\s*Resumo\s+(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+)$/i);
  if (r) return { categoria: "highlight", competicao: r[1].trim() || null, info: { home_team: r[2].trim(), away_team: r[5].trim(), score: `${r[3]}-${r[4]}`, scorer_side: null, player: null, minute: null, opponent: null } };
  return { categoria: null, info: null };
}

// ligações para os vídeos (…/vsports/vod/…) e para os resumos (…/vsports/jogo/…/story)
export function lerPagina(html) {
  const src = String(html || "");
  const out = new Map();
  const re = /<a\b[^>]*href="([^"]*vsports\.pt\/vsports\/(?:vod\/[^"]+|jogo\/[^"]+\/story)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  let fimAnterior = 0; // a miniatura de um vídeo está entre a ligação anterior e a dele
  while ((m = re.exec(src))) {
    const inicioBloco = fimAnterior;
    fimAnterior = m.index + m[0].length;
    const href = decode(m[1]).replace(/\?.*$/, "");
    const titulo = texto(m[2]);
    if (!/^GOLO!|Resumo\s/i.test(titulo)) continue;
    const id = href.match(/-(\d+)\/story$/)?.[1] || href.match(/\/(\d+)\/story$/)?.[1];
    if (!id) continue;
    const chave = `${/\/vod\//.test(href) ? "vod" : "jogo"}:${id}`;
    const depois = src.slice(m.index, m.index + m[0].length + 800);
    const antes = src.slice(Math.max(inicioBloco, m.index - 800), m.index);
    const quando = deLisboa(depois.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || "");
    const img = (m[2].match(/<img\b[^>]*(?:data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)
      || [...antes.matchAll(/(?:data-src|src|background-image:\s*url\(['"]?)=?"?([^"')\s]+\.(?:jpe?g|png|webp))/gi)].pop())?.[1] || null;
    const prev = out.get(chave);
    if (prev && (prev.thumbnail || !img)) continue;
    const { categoria, info, competicao } = lerTitulo(titulo);
    out.set(chave, {
      fonte: "vsports",
      post_id: `vsports:${chave}`,
      crosspost_of: null,
      canal: "vsports",
      regiao: "pt",
      title: titulo,
      reddit_url: href, // ligação para a publicação original
      video_url: href,
      hls: null, mp4: null, height: null,
      thumbnail: img && !/logo|badge|Campo\.webp|\/team\//i.test(img) ? decode(img).replace(/^\/\//, "https://") : null,
      author: "VSPORTS",
      flair: "",
      created_time: quando || Date.now(),
      categoria, info, competicao,
    });
  }
  return [...out.values()];
}

export function startVsports(add, log, estado = {}) {
  if (process.env.VSPORTS === "0") return;
  const ritmo = Math.max(10, Number(process.env.VSPORTS_SEGUNDOS) || 20) * 1000;
  (async () => {
    log(`[VSPORTS] golos e resumos oficiais da Liga Portugal, a cada ${ritmo / 1000} s`);
    let espera = ritmo;
    for (;;) {
      try {
        const res = await fetch(PAGINA, { headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9" } });
        if (!res.ok) throw new Error(`o VSPORTS respondeu ${res.status}`);
        const lidos = lerPagina(await res.text());
        if (!lidos.length) throw new Error("não encontrei vídeos na página (o VSPORTS pode ter mudado o formato)");
        lidos.sort((a, b) => a.created_time - b.created_time).forEach((v) => add(v));
        Object.assign(estado, { ok: true, erro: null, ultimo: Date.now(), comVideo: lidos.length });
        espera = ritmo;
      } catch (e) {
        Object.assign(estado, { ok: false, erro: e.message });
        espera = Math.min(10 * 60e3, espera * 2);
        log(`[VSPORTS] ${e.message}`);
      }
      await sleep(espera);
    }
  })();
}
