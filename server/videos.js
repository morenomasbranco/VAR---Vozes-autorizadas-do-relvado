// Feed automático de vídeos de futebol: golos, resumos, defesas, VAR, expulsões e fintas publicados no
// Reddit e no Telegram. Aqui estão a classificação, a leitura do título (equipas, resultado, jogador,
// minuto), a deteção de repetidos entre fontes e o arquivo, gravado em data/videos.json.
// As fontes (server/sources/reddit.js, server/sources/tgvideos.js) só entregam publicações em bruto;
// uma fonte nova (X, outro canal, outra API) entra pelo mesmo add() sem mexer no resto.
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { norm } from "./util.js";
import { simil } from "./sources/zapping.js";
import { aceita as aceitaStreamain } from "./sources/streamain.js";

const FILE = new URL("../data/videos.json", import.meta.url);
const MAX = Number(process.env.VIDEOS_MAX) || 800;
const IDADE_MAX = (Number(process.env.VIDEOS_HORAS) || 72) * 3600e3;
const JANELA_REPETIDO = 45 * 60e3; // o mesmo lance publicado por duas fontes aparece com poucos minutos de diferença

/* ───────── Categorias ───────── */
// A ordem de decisão vai do mais específico para o mais geral:
// 1) expulsões e VAR (um golo anulado ou um vermelho com o resultado no título continuam a ser isso);
// 2) o resultado com a equipa que marcou entre parênteses retos, formato do r/soccer para golos;
// 3) defesas ditas por extenso («great save», «grande defesa», «penálti defendido»);
// 4) golos ditos por extenso; 5) resumos e melhores momentos; 6) fintas; 7) lances perigosos, que também são highlights.
const RE = {
  red: /red card|straight red|sent off|sending off|second yellow|double yellow|yellow[- ]red|\bexpuls|cart[aã]o vermelho|vermelho direto|segundo amarelo|duplo amarelo|tarjeta roja|roja directa|doble amarilla|cartellino rosso|espulsion|carton rouge|rote karte|gelb[- ]rot|🟥/i,
  var: /\bvar\b|disallowed|ruled out|chalked off|overturned|golo anulado|gol anulado|\banulad[oa]\b|\banula(do)? o golo|fora de jogo|offside|penalty (overturned|decision|call|shout|not given|review)|pen[aá]lti (anulado|revertido|revisto)|\bvideo ?(review|referee)|revis[aã]o (do |de )?v[ií]deo|\bvar check|gol annullato|but refus[ée]|tor aberkannt/i,
  save: /\b(great|incredible|amazing|brilliant|double|triple|fantastic|huge|crucial|stunning|superb|world[- ]class|reflex|unreal|insane|outstanding|massive)\s+(save|stop)|\bsaves? (a |the )?(pen|penalty|shot|header|free[- ]kick)|penalty (saved|stopped)|pen(alty)? save|keeper (denies|saves)|\bdenies\b|grande defesa|defesa (incr[ií]vel|brilhante|espetacular|fant[aá]stica|enorme|apertada|de reflexos|a dobrar|tripla|dupla)|\bdefes[ãa]o|defende (o |um )?pen[aá]lti|pen[aá]lti defendido|paradon|parad[oó]n|gran parada|parata|parade\b|arr[eê]t (d[ée]cisif|incroyable)|🧤/i,
  goal: /\bgoal\b|\bgoals\b|\bgol\b|\bgolo\b|\bgola[cç]o\b|\bgolazo\b|\bgolea(da)?\b|\bscores?\b|\bscored\b|\bnets\b|\bheader\b|\bfree[- ]kick\b|\bpenalty (goal|scored|converted)|\bown goal\b|autogolo|\bmarca (o|um|de|na|no)\b|\bmarcou\b|\bbis(a)?\b|\bhat[- ]trick\b|\bdoppietta\b|\btreffer\b|⚽/i,
  highlight: /highlights|extended|resumo|sum[aá]rio|compacto|melhores (momentos|lances)|best moments|all goals|todos os golos|todos los goles|tutti i gol|alle tore|\bresumen\b|\bsintesi\b|\br[ée]sum[ée]\b|\bzusammenfassung\b|\bbest bits\b/i,
  skill: /\bskill|nutmeg|\bdribbl|\bfinta|\bdrible|\bcueca\b|t[uú]nel\b|rabona|el[aá]stico|\bruleta|roulette|\bflick\b|\bbicycle kick|\bbicicleta\b|\bpisadinha|\bhabilidade|\bcaneta\b|\btrivela\b|\bchap[eé]u\b|\bsombrero\b|\bossinho/i,
  lance: /\bchance\b|\bmiss(ed)?\b|\bsitter\b|\bfalhan[cç]o|\bfalha(do)?\b|\boportunidade|\bocasi[oó]n|\bclearance|\bgoal[- ]line|\btackle|\bassist\b|\bassist[eê]ncia|\bwoodwork|\bhits? the (post|bar|crossbar)|\bposte\b|\bbarra\b|\btrave\b|\bcorte\b/i,
};
export const CATEGORIA_IDS = ["goal", "highlight", "save", "red", "var", "skill", "other"];

// flair do Reddit que diz diretamente o que é o vídeo (os subreddits portugueses usam «Golo», «Resumo»…)
const FLAIR = [
  ["red", /vermelho|red card|expuls|cart[aã]o/i], ["var", /\bvar\b|anulad/i], ["save", /defesa|save/i],
  ["goal", /golo|\bgol\b|goal/i], ["highlight", /resumo|highlight|melhores/i], ["skill", /skill|finta|drible/i],
];

export function categoria(titulo, flair = "") {
  const t = String(titulo || "");
  const f = String(flair || "").replace(/:[a-z_]+:/gi, "").trim();
  // a flair de um subreddit que a usa para dizer o que é o vídeo manda (não a genérica «Media»)
  if (f && !/^(media|video|v[ií]deo|outros?|other)$/i.test(f)) for (const [id, re] of FLAIR) if (re.test(f)) return id;
  if (RE.red.test(t)) return "red";
  if (RE.var.test(t)) return "var";
  // resultado com a equipa que marcou entre parênteses retos: é golo
  const temMarcador = /\[\d+\]\s*[-–x:]\s*\d+|\d+\s*[-–x:]\s*\[\d+\]/.test(t);
  if (temMarcador) return "goal";
  if (RE.save.test(t)) return "save";
  if (RE.highlight.test(t)) return "highlight"; // «Resumo: Benfica 3-1 Porto» é resumo, não golo
  if (RE.goal.test(t)) return "goal";
  // resultado seguido de minuto («Benfica 1-0 Porto - Pavlidis 67'») também é golo
  if (/\b\d+\s*[-–x]\s*\d+\b.*\d{1,3}(\+\d{1,2})?\s*['’]/.test(t)) return "goal";
  if (RE.skill.test(t)) return "skill";
  if (RE.lance.test(t)) return "highlight";
  // «defesa» sozinho é ambíguo (é também a posição); só com um guarda-redes ou um lance por perto
  if (/\bdefesa\b/i.test(t) && /guarda-redes|\bgr\b|remate|livre|cabeceamento/i.test(t)) return "save";
  return "other";
}

/* ───────── Leitura do título ───────── */
const limpa = (s) => String(s || "")
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ") // emojis
  .replace(/^\s*(goal|golo|gola[cç]o|gol|golazo|red card|save|var|highlights?|resumo|skill)[\s:!|-]+/i, "")
  .replace(/\s+/g, " ").trim();

// «Benfica [1] - 0 Porto - Vangelis Pavlidis 67'», «GOAL Benfica 1-0 Porto - Pavlidis 67'», «Benfica 1 x [1] Porto | Samu 90+2'»
export function extrair(titulo) {
  const t = limpa(titulo);
  const out = { home_team: null, away_team: null, score: null, scorer_side: null, player: null, minute: null, opponent: null };
  const m = t.match(/^(.+?)\s+(\[?)(\d{1,2})(\]?)\s*[-–x:]\s*(\[?)(\d{1,2})(\]?)\s+(.+)$/i);
  if (m) {
    // «Gol do Palmeiras! — Palmeiras 1x0 Santos»: a equipa da casa é o que vem depois do último separador
    out.home_team = m[1].split(/\s[—–|-]\s|[!:]\s/).pop().replace(/\s*\((?:pen|penalty|og|agg)[^)]*\)\s*$/i, "").trim();
    out.score = `${m[3]}-${m[6]}`;
    if (m[2] && m[4]) out.scorer_side = "home";
    else if (m[5] && m[7]) out.scorer_side = "away";
    const resto = m[8];
    // a equipa de fora vai até ao separador seguinte (« - », « | », « : » ou «, »)
    const sep = resto.match(/^(.+?)(?:\s+[-–—|:]|,)\s+(.+)$/);
    out.away_team = (sep ? sep[1] : resto).trim();
    const cauda = sep ? sep[2] : "";
    if (!sep) {
      // «Benfica 1-0 Porto Pavlidis 67'»: sem separador, o minuto no fim ainda se aproveita
      const mm = out.away_team.match(/^(.+?)\s+(\d{1,3}(?:\s*\+\s*\d{1,2})?)\s*['’]\s*$/);
      if (mm) { out.away_team = mm[1]; out.minute = mm[2].replace(/\s/g, ""); }
    }
    if (cauda) lerJogador(cauda, out);
  } else {
    // sem resultado no título («Rodri red card vs Arsenal 34'», «Great save by Diogo Costa vs Sporting»):
    // o que vem antes do «vs» é quase sempre o jogador, e o que vem depois é o adversário; as equipas do
    // jogo ficam por saber, porque não dá para dizer com segurança de que equipa é o jogador
    const semCat = t.replace(/\b(great|incredible|amazing|brilliant|stunning|superb|fantastic|crucial|huge|double|triple|straight)?\s*(save|red card|second yellow|skill|goal|golo|gol|disallowed goal|chance|miss|nutmeg|dribble|finta|defesa|expuls[aã]o)\b(\s+(by|from|de|do|da|of))?/gi, " ").replace(/\s+/g, " ").trim();
    const minuto = semCat.match(/(\d{1,3}(?:\s*\+\s*\d{1,2})?)\s*['’]\s*$/);
    if (minuto) out.minute = minuto[1].replace(/\s/g, "");
    const corpo = semCat.replace(/(\d{1,3}(?:\s*\+\s*\d{1,2})?)\s*['’]\s*$/, "").replace(/[-–|:,!]\s*$/, "").trim();
    const vs = corpo.match(/^(.{2,40}?)\s+(?:vs?\.?|v|contra|against)\s+(.{2,40})$/i);
    const quem = (vs ? vs[1] : corpo.split(/\s[—–|-]\s|[!:]\s/).pop()).trim();
    if (quem && quem.split(" ").length <= 4 && /^\p{Lu}/u.test(quem)) out.player = quem;
    if (vs) out.opponent = vs[2].trim();
  }
  if (out.player && /^(resumo|highlights?|melhores momentos|golo|goal|gol|extended|todos os golos|all goals)$/i.test(out.player)) out.player = null;
  for (const k of ["home_team", "away_team"]) if (out[k] && (out[k].length > 40 || !/\p{L}/u.test(out[k]))) out[k] = null;
  return out;
}
function lerJogador(cauda, out) {
  const c = cauda.replace(/\((?:pen|penalty|p|og|o\.g\.|great goal|header|free[- ]kick)[^)]*\)/gi, " ").replace(/\s+/g, " ").trim();
  const mm = c.match(/^(.*?)\s*(\d{1,3}(?:\s*\+\s*\d{1,2})?)\s*['’]/);
  if (mm) {
    out.minute = mm[2].replace(/\s/g, "");
    const p = mm[1].replace(/[-–,|:]\s*$/, "").trim();
    if (p && p.length <= 40) out.player = p;
  } else if (c.length <= 40 && /\p{L}/u.test(c)) out.player = c;
}

/* ───────── Endereço do vídeo ───────── */
// o mesmo vídeo tem endereços diferentes consoante quem o partilha; a chave canónica compara-os
export function chaveVideo(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|mobile|old|new)\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  if (host === "v.redd.it") return `vr:${path.split("/")[1]}`;
  if (host === "youtu.be") return `yt:${path.slice(1)}`;
  if (/(^|\.)youtube\.com$/.test(host)) {
    const id = u.searchParams.get("v") || path.match(/\/(shorts|embed|live)\/([\w-]+)/)?.[2];
    return id ? `yt:${id}` : null;
  }
  if (host === "streamable.com") return `st:${path.replace(/^\/(e|o|s)\//, "/").split("/")[1]}`;
  if (/(^|\.)(x|twitter)\.com$/.test(host)) { const id = path.match(/status\/(\d+)/)?.[1]; return id ? `x:${id}` : null; }
  if (host === "t.me") return `tg:${path.slice(1).toLowerCase()}`;
  if (/(^|\.)instagram\.com$/.test(host)) { const id = path.match(/\/(p|reels?|tv)\/([\w-]+)/)?.[2]; return id ? `ig:${id}` : null; }
  if (host === "sporttv.pt") { const id = path.match(/\/video\/(\d_[a-z0-9]{8})/i)?.[1]; if (id) return `stv:${id}`; }
  if (host === "streamain.com") { const id = path.match(/\/(?:embed|[a-z]{2})\/([A-Za-z0-9]{15})(?:\/watch)?$/)?.[1]; if (id) return `sm:${id}`; }
  return `${host}${path}`.toLowerCase();
}
// como o site pode reproduzir o vídeo sem sair da página
export function embedDe(v) {
  const k = chaveVideo(v.video_url) || "";
  if (k.startsWith("yt:")) return { tipo: "iframe", src: `https://www.youtube-nocookie.com/embed/${k.slice(3)}?autoplay=1` };
  if (k.startsWith("st:")) return { tipo: "iframe", src: `https://streamable.com/e/${k.slice(3)}?autoplay=1` };
  if (v.hls) return { tipo: "hls", src: v.hls, mp4: v.mp4 || null };
  // leitor do próprio alojamento (Streamain, Kaltura da Sport TV), quando não há ficheiro direto
  if (!v.mp4 && v.iframe) return { tipo: "iframe", src: v.iframe };
  if (v.mp4) return { tipo: /\.m3u8(\?|$)/i.test(v.mp4) ? "hls" : "mp4", src: v.mp4 };
  // Instagram sem ficheiro direto (conteúdo com direitos): o leitor oficial do Instagram, dentro do cartão
  if (k.startsWith("ig:")) return { tipo: "iframe", src: `https://www.instagram.com/p/${k.slice(3)}/embed/` };
  return null; // os restantes (streamin, dubz, X…) abrem no site de origem
}

// miniatura que se sabe tirar do próprio endereço, para quando a fonte não a trouxe
export function miniaturaDe(v) {
  const k = chaveVideo(v.video_url) || "";
  if (k.startsWith("yt:")) return `https://i.ytimg.com/vi/${k.slice(3)}/hqdefault.jpg`;
  return null;
}

/* ───────── Arquivo e deduplicação ───────── */
const PT_REGIAO = new Set(["pt"]);
const idade = (v) => Date.now() - v.created_time;

export function createVideos({ broadcast = () => {}, log = () => {}, jogos = () => [], emblemas = null } = {}) {
  let videos = [];
  try { videos = JSON.parse(fs.readFileSync(FILE, "utf8")).filter((v) => idade(v) < IDADE_MAX); } catch { videos = []; }
  // os do Streamain guardados antes do filtro só de futebol: o que não passa no filtro sai
  videos = videos.filter((v) => !(v.sources?.length && v.sources.every((x) => x.fonte === "streamain" && !aceitaStreamain(x))));
  // as regras da classificação mudam com o tempo: os vídeos guardados são revistos à entrada
  // (os da VSPORTS trazem a categoria do próprio site e ficam como estão)
  for (const v of videos) {
    if (v.sources?.some((x) => x.canal === "vsports")) continue;
    const nova = v.sources?.map((x) => categoria(x.title)).find((c) => c !== "other") || categoria(v.title);
    if (nova !== "other" || v.category === "other") v.category = nova;
  }
  const vistos = new Set(videos.flatMap((v) => v.sources.map((s) => s.post_id)));
  const estado = { recebidos: 0, aceites: 0, repetidos: 0, ignorados: 0, fontes: {} };
  let sujo = false;

  setInterval(() => {
    if (!sujo) return;
    try {
      fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(videos));
      sujo = false;
    } catch (e) { log(`[Vídeos] não consegui gravar: ${e.message}`); }
  }, 30000).unref();

  // jogo em curso ou acabado há pouco com as mesmas equipas: dá a competição e confirma que o jogo existe
  function jogoDe(home, away, ts) {
    if (!home || !away) return null;
    let melhor = null;
    let nota = 0;
    for (const it of jogos()) {
      if (!it.score || Math.abs((it.upd || it.ts) - ts) > 4 * 3600e3) continue;
      const a = simil(it.score.h, home), b = simil(it.score.a, away);
      const direto = a >= 0.5 && b >= 0.5 ? a + b : 0;
      const trocado = simil(it.score.h, away) >= 0.5 && simil(it.score.a, home) >= 0.5 ? 1 : 0; // títulos com as equipas trocadas
      const n = Math.max(direto, trocado);
      if (n > nota) { nota = n; melhor = it; }
    }
    return melhor;
  }

  // o mesmo lance: as mesmas equipas e o mesmo resultado, e o mesmo minuto ou o mesmo jogador quando os há
  const mesmoLance = (a, b) => {
    if (!a.home_team || !b.home_team || !a.away_team || !b.away_team) return false;
    if (Math.abs(a.created_time - b.created_time) > JANELA_REPETIDO) return false;
    if (simil(a.home_team, b.home_team) < 0.5 || simil(a.away_team, b.away_team) < 0.5) return false;
    if (a.score !== b.score) return false;
    if (a.minute && b.minute) return parseInt(a.minute, 10) === parseInt(b.minute, 10);
    if (a.player && b.player) return simil(a.player, b.player) >= 0.5;
    return a.category === "goal" && b.category === "goal"; // o mesmo resultado só acontece uma vez num jogo
  };

  // fonte principal de um vídeo com várias fontes: nos jogos portugueses manda a fonte portuguesa;
  // de resto, quem publicou primeiro, e entre dois ao mesmo tempo, o de melhor qualidade
  const principal = (v) => [...v.sources].sort((a, b) =>
    (v.portugues ? (PT_REGIAO.has(b.regiao) - PT_REGIAO.has(a.regiao)) : 0)
    || a.created_time - b.created_time
    || (b.height || 0) - (a.height || 0))[0];

  function aplicaPrincipal(v) {
    const p = principal(v);
    Object.assign(v, {
      source: p.fonte, subreddit: p.subreddit || null, canal: p.canal || null, author: p.author,
      title: p.title, reddit_url: p.reddit_url, video_url: p.video_url,
      thumbnail: p.thumbnail || v.sources.find((x) => x.thumbnail)?.thumbnail || v.thumbnail || miniaturaDe(p) || null,
      hls: p.hls || null, mp4: p.mp4 || null, iframe: p.iframe || null, height: p.height || null, created_time: p.created_time,
    });
    v.embed = embedDe(v);
  }

  // Miniaturas guardadas em memória: os endereços das imagens do Reddit e do Telegram expiram ou recusam ser
  // abertos a partir de outro site, e era por isso que muitos cartões ficavam sem imagem. A imagem é descarregada
  // logo que o vídeo chega e o site passa a pedi-la ao servidor (/api/videos/thumb/:id).
  const imagens = new Map(); // endereço da miniatura → { buf, tipo }
  const IMG_MAX = Number(process.env.MINIATURAS_MAX) || 600;
  const UA_IMG = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  async function descarregaImagem(url) {
    if (!url) return null;
    if (imagens.has(url)) return imagens.get(url);
    if (/^frame:/.test(url)) return null; // fotograma que saiu da memória: volta a ser tirado
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": UA_IMG, Accept: "image/*,*/*;q=0.5" } });
      const tipo = r.headers.get("content-type") || "";
      if (!r.ok || !/^image\//i.test(tipo)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 3e6) return null;
      imagens.set(url, { buf, tipo });
      if (imagens.size > IMG_MAX) imagens.delete(imagens.keys().next().value);
      return imagens.get(url);
    } catch { return null; }
  }
  // Fotograma tirado do próprio vídeo com o ffmpeg (1.º segundo), para os vídeos que chegam sem imagem ou com uma
  // que já não abre: fica pronto em um ou dois segundos. No máximo dois de cada vez, para não esgotar a memória.
  const FFMPEG = process.env.FFMPEG || "ffmpeg";
  let ffmpegFalta = false;
  let aCorrer = 0;
  const espera = [];
  const vez = () => (aCorrer < 2 ? (aCorrer++, Promise.resolve()) : new Promise((r) => espera.push(r)));
  const larga = () => { const r = espera.shift(); if (r) r(); else aCorrer--; };
  function umFotograma(src, seg) {
    return new Promise((ok) => {
      const pr = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-user_agent", UA_IMG, "-ss", String(seg), "-i", src,
        "-frames:v", "1", "-vf", "scale=480:-2", "-f", "image2", "-c:v", "mjpeg", "-q:v", "5", "pipe:1"], { stdio: ["ignore", "pipe", "ignore"] });
      const partes = [];
      const fim = setTimeout(() => pr.kill("SIGKILL"), 10000);
      pr.stdout.on("data", (d) => partes.push(d));
      pr.on("error", (e) => { if (e.code === "ENOENT") ffmpegFalta = true; clearTimeout(fim); ok(null); });
      pr.on("close", () => { clearTimeout(fim); const b = Buffer.concat(partes); ok(b.length > 500 ? b : null); });
    });
  }
  async function fotograma(v) {
    const src = v.mp4 || v.hls || (v.embed && v.embed.tipo !== "iframe" ? v.embed.src : null);
    if (!src || ffmpegFalta) return null;
    await vez();
    try {
      const buf = (await umFotograma(src, 1)) || (await umFotograma(src, 0));
      if (!buf) return null;
      const chave = `frame:${v.video_id}`;
      imagens.set(chave, { buf, tipo: "image/jpeg" });
      if (imagens.size > IMG_MAX) imagens.delete(imagens.keys().next().value);
      return chave;
    } finally { larga(); }
  }

  // Vídeos «todos pretos»: o brilho médio (0–255) de uma imagem ou de um instante do vídeo, pelo ffmpeg reduzido a
  // 32×18 em tons de cinzento. Uma miniatura escura faz experimentar outros instantes do vídeo; se forem todos
  // escuros, o vídeo fica marcado («escuro») e sai dos Destaques.
  const ESCURO_MEDIA = Number(process.env.VIDEOS_ESCURO_MEDIA) || 16;
  function brilhoDe({ buf = null, src = null, seg = 0 }) {
    return new Promise((ok) => {
      const entrada = buf ? ["-i", "pipe:0"] : ["-user_agent", UA_IMG, "-ss", String(seg), "-i", src];
      const pr = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", ...entrada, "-frames:v", "1", "-vf", "scale=32:18,format=gray", "-f", "rawvideo", "pipe:1"], { stdio: [buf ? "pipe" : "ignore", "pipe", "ignore"] });
      const partes = [];
      const fim = setTimeout(() => pr.kill("SIGKILL"), 10000);
      pr.stdout.on("data", (d) => partes.push(d));
      pr.on("error", (e) => { if (e.code === "ENOENT") ffmpegFalta = true; clearTimeout(fim); ok(null); });
      pr.on("close", () => {
        clearTimeout(fim);
        const b = Buffer.concat(partes);
        if (b.length < 100) return ok(null);
        const ord = [...b].sort((x, y) => x - y);
        ok({ media: b.reduce((t, x) => t + x, 0) / b.length, p95: ord[Math.floor(ord.length * 0.95)] });
      });
      if (buf) { pr.stdin.on("error", () => {}); pr.stdin.end(buf); }
    });
  }
  const escuro = (b) => b && b.media <= ESCURO_MEDIA && b.p95 <= ESCURO_MEDIA * 2.5;
  async function verEscuro(v) {
    if (!v || v.escuro !== undefined || ffmpegFalta) return;
    const img = v.thumbnail && await descarregaImagem(v.thumbnail);
    const src = v.mp4 || v.hls || (v.embed && v.embed.tipo !== "iframe" ? v.embed.src : null);
    if (!img && !src) return;
    await vez();
    let mudou = false;
    try {
      const b = img ? await brilhoDe({ buf: img.buf }) : null;
      if (img && !b) return; // o ffmpeg não leu a imagem: fica por saber
      if (b && !escuro(b)) { v.escuro = false; return; }
      // miniatura escura (ou nenhuma): outros instantes do vídeo; o primeiro com imagem passa a ser a miniatura
      for (const seg of src ? [2, 5, 10, 20] : []) {
        const x = await brilhoDe({ src, seg });
        if (x && !escuro(x)) {
          const f = await umFotograma(src, seg);
          if (f) {
            const chave = `frame:${v.video_id}:${seg}`;
            imagens.set(chave, { buf: f, tipo: "image/jpeg" });
            if (imagens.size > IMG_MAX) imagens.delete(imagens.keys().next().value);
            v.thumbnail = chave;
            const prin = principal(v);
            if (prin) prin.thumbnail = chave; // senão a fonte principal voltava a pôr a miniatura escura
          }
          v.escuro = false;
          mudou = true;
          return;
        }
      }
      v.escuro = true;
      mudou = true;
    } finally {
      larga();
      if (mudou) { v.upd = Date.now(); sujo = true; broadcast("video-update", v); }
    }
  }

  async function hashMiniatura(url) {
    const img = await descarregaImagem(url);
    return img ? crypto.createHash("sha1").update(img.buf).digest("hex") : null;
  }

  // Alojamentos de vídeo (streamin, streamff, dubz…) que só dão uma página: vai-se buscar o ficheiro de vídeo
  // que a página indica (og:video, <video>, <source>), para o vídeo tocar sozinho no site, mesmo em miniatura.
  const SEM_PAGINA = /^(yt|st|x|tg|vr|ig|stv|sm):/;
  const resolvidos = new Map(); // chave do vídeo → endereço do ficheiro (ou null)
  const imagensDaPagina = new Map(); // chave do vídeo → imagem indicada pela página
  async function ficheiroDaPagina(url) {
    const k = chaveVideo(url);
    if (!k || SEM_PAGINA.test(k)) return null;
    if (resolvidos.has(k)) return resolvidos.get(k);
    resolvidos.set(k, null);
    if (resolvidos.size > 3000) resolvidos.clear();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", Accept: "text/html,*/*" } });
      if (!r.ok) return null;
      if (/^video\//i.test(r.headers.get("content-type") || "")) { resolvidos.set(k, url); return url; } // já era o ficheiro
      const html = (await r.text()).slice(0, 2e6);
      const img = [
        html.match(/<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i)?.[1],
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i)?.[1],
        html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
        html.match(/<video[^>]+poster=["']([^"']+)["']/i)?.[1],
        html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/i)?.[1],
      ].filter(Boolean).map((u) => { try { return new URL(u.replace(/&amp;/g, "&").replace(/\\\//g, "/"), r.url).href; } catch { return null; } }).find(Boolean);
      if (img) imagensDaPagina.set(k, img);
      const cand = [
        html.match(/<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i)?.[1],
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i)?.[1],
        html.match(/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i)?.[1],
        html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i)?.[1],
        html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1],
        html.match(/"contentUrl"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i)?.[1],
        html.match(/["'](https?:[^"'\s]+\.(?:mp4|m3u8)(?:\?[^"'\s]*)?)["']/i)?.[1],
      ].filter(Boolean).map((u) => { try { return new URL(u.replace(/&amp;/g, "&").replace(/\\\//g, "/"), r.url).href; } catch { return null; } }).filter(Boolean);
      const f = cand.find((u) => /^https:/.test(u)) || cand[0] || null;
      resolvidos.set(k, f);
      return f;
    } catch { return null; }
  }
  // miniatura do Streamable, pelo oEmbed público (sem chave)
  async function miniaturaStreamable(url) {
    try {
      const r = await fetch(`https://api.streamable.com/oembed.json?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return null;
      const j = await r.json();
      return j.thumbnail_url ? new URL(j.thumbnail_url, "https://streamable.com").href : null;
    } catch { return null; }
  }
  async function resolver(v) {
    if (!v || (v.embed && v.thumbnail && imagens.has(v.thumbnail))) return;
    const antes = `${v.embed?.src || ""}|${v.thumbnail || ""}`;
    const p = v.sources.find((x) => x.video_url === v.video_url);
    if (!v.embed) {
      const f = await ficheiroDaPagina(v.video_url);
      if (f && p) p.mp4 = f;
    }
    // sem miniatura, ou com uma que já não abre: a da página do vídeo, a do Streamable, ou a de outra fonte
    aplicaPrincipal(v); // o ficheiro encontrado na página já conta para o fotograma
    if (!v.thumbnail || !(await descarregaImagem(v.thumbnail))) {
      // o mais rápido: um fotograma do próprio vídeo
      const f = await fotograma(v);
      if (f) { if (p) p.thumbnail = f; v.thumbnail = f; }
    }
    if (!v.thumbnail || !(await descarregaImagem(v.thumbnail))) {
      const k = chaveVideo(v.video_url) || "";
      if (!imagensDaPagina.has(k) && !k.startsWith("st:") && !SEM_PAGINA.test(k)) await ficheiroDaPagina(v.video_url);
      const cands = [imagensDaPagina.get(k), k.startsWith("st:") ? await miniaturaStreamable(v.video_url) : null, ...v.sources.map((x) => x.thumbnail), miniaturaDe(v)];
      for (const c of cands) {
        if (c && await descarregaImagem(c)) { if (p) p.thumbnail = c; v.thumbnail = c; break; }
      }
    }
    aplicaPrincipal(v);
    if (`${v.embed?.src || ""}|${v.thumbnail || ""}` === antes) return;
    v.upd = Date.now();
    sujo = true;
    broadcast("video-update", v);
  }

  // A miniatura (para detetar o mesmo vídeo com endereços diferentes) é descarregada fora da fila, em paralelo:
  // dentro da fila, cada vídeo esperava até 4 s pelo anterior, e numa rajada de golos os últimos chegavam minutos
  // depois. As publicações continuam a entrar uma de cada vez, para duas fontes com o mesmo vídeo não darem dois cartões.
  let fila = Promise.resolve();
  const add = (raw) => {
    if (!raw?.post_id || vistos.has(raw.post_id)) { estado.recebidos++; return Promise.resolve(null); }
    const hash = hashMiniatura(raw.thumbnail);
    const p = fila.then(async () => addUm(raw, await hash)).catch((e) => { log(`[Vídeos] ${e.message}`); return null; });
    fila = p;
    p.then(async (v) => { await resolver(v); await verEscuro(v); }).catch(() => {});
    return p;
  };

  // entrada de uma publicação em bruto; devolve o vídeo criado ou aquele a que foi juntada
  async function addUm(raw, hashPronto) {
    estado.recebidos++;
    estado.fontes[raw.fonte] = (estado.fontes[raw.fonte] || 0) + 1;
    if (!raw.video_url || !raw.post_id || vistos.has(raw.post_id)) return null;
    if (Date.now() - raw.created_time > IDADE_MAX) return null;
    vistos.add(raw.post_id);
    if (vistos.size > 20000) { vistos.clear(); videos.forEach((v) => v.sources.forEach((s) => vistos.add(s.post_id))); }

    // fontes com formato fixo (ex.: VSPORTS) já trazem os dados lidos; as outras são lidas aqui pelo título
    const info = raw.info ? { ...extrair(""), ...raw.info } : extrair(raw.title);
    const cat = raw.categoria || categoria(raw.title, raw.flair);
    const fonte = { ...raw, video_key: chaveVideo(raw.video_url) };
    for (const k of ["flair", "info", "categoria", "competicao"]) delete fonte[k];

    // 1.º o endereço do vídeo, 2.º a publicação original de que esta é partilha, 3.º a miniatura, 4.º o lance
    let igual = videos.find((v) => v.sources.some((s) => (fonte.video_key && s.video_key === fonte.video_key)
      || (raw.crosspost_of && s.post_id === raw.crosspost_of) || (s.crosspost_of && s.crosspost_of === raw.post_id)));
    const thumbnail_hash = igual ? null : hashPronto;
    if (!igual && thumbnail_hash) igual = videos.find((v) => v.thumbnail_hash === thumbnail_hash);
    const candidato = { ...info, category: cat, created_time: raw.created_time };
    if (!igual) igual = videos.find((v) => mesmoLance(v, candidato));

    if (igual) {
      igual.sources.push(fonte);
      if (raw.regiao === "pt") igual.portugues = true;
      for (const k of ["home_team", "away_team", "score", "player", "minute"]) if (!igual[k] && info[k]) igual[k] = info[k];
      // a categoria mais específica ganha: um «highlight» ou «other» visto noutra fonte como golo, VAR… passa a isso
      const PESO = { red: 5, var: 5, save: 4, goal: 3, skill: 2, highlight: 1, other: 0 };
      if ((PESO[cat] || 0) > (PESO[igual.category] || 0)) igual.category = cat;
      aplicaPrincipal(igual);
      igual.upd = Date.now();
      estado.repetidos++;
      sujo = true;
      broadcast("video-update", igual);
      return igual;
    }

    const jogo = jogoDe(info.home_team, info.away_team, raw.created_time);
    const v = {
      video_id: `v:${raw.post_id}`,
      ...info,
      teams: info.home_team && info.away_team ? { home: info.home_team, away: info.away_team } : null,
      category: cat,
      competition: jogo?.score?.comp || raw.competicao || null,
      liga: jogo?.liga || null,
      paisTema: jogo?.paisTema || null,
      portugues: raw.regiao === "pt" || jogo?.paisTema === "pt",
      thumbnail: raw.thumbnail || null,
      thumbnail_hash,
      sources: [fonte],
      first_seen: Date.now(),
    };
    if (emblemas && v.teams) {
      try { v.equipas = emblemas.resolve([{ nome: v.teams.home }, { nome: v.teams.away }]); } catch { /* sem emblemas */ }
    }
    aplicaPrincipal(v);
    videos.unshift(v);
    videos.sort((a, b) => b.created_time - a.created_time);
    if (videos.length > MAX) videos.length = MAX;
    estado.aceites++;
    sujo = true;
    broadcast("video", v);
    return v;
  }

  // vídeos guardados de antes, ainda sem ficheiro que toque no site: tenta-se, devagar, depois do arranque
  setTimeout(async () => {
    for (const v of videos.filter((x) => idade(x) < 12 * 3600e3).slice(0, 200)) { await resolver(v); await verEscuro(v).catch(() => {}); await new Promise((r) => setTimeout(r, 500)); }
  }, 20000).unref?.();

  const limpar = () => { const antes = videos.length; videos = videos.filter((v) => idade(v) < IDADE_MAX); if (videos.length !== antes) sujo = true; };
  setInterval(limpar, 10 * 60e3).unref();

  function latest({ limit = 60, categoria: cat = null, fonte = null } = {}) {
    return videos
      .filter((v) => (!cat || cat === "all" || v.category === cat || (cat === "cards" && v.category === "red")))
      .filter((v) => !fonte || v.sources.some((s) => s.fonte === fonte))
      .slice(0, Math.min(limit, 300));
  }
  const ignorar = () => { estado.ignorados++; };
  const contagem = () => videos.reduce((o, v) => { o[v.category] = (o[v.category] || 0) + 1; return o; }, {});

  async function miniatura(id) {
    const v = videos.find((x) => x.video_id === id);
    if (!v) return null;
    for (const u of [v.thumbnail, ...v.sources.map((x) => x.thumbnail), miniaturaDe(v)]) {
      const img = u && await descarregaImagem(u);
      if (img) return img;
    }
    return { v }; // sem imagem nenhuma: o servidor desenha uma
  }

  return { add, latest, ignorar, miniatura, estado: () => ({ ...estado, total: videos.length, categorias: contagem() }) };
}

export const _test = { limpa, norm };
