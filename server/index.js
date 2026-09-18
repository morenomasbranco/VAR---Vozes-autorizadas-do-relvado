import "dotenv/config";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import * as store from "./store.js";
import { createEnricher, fallback, RULES, NAO_FUTEBOL, MODALIDADES, modalidadeDe } from "./enrich.js";
import { startRss, eDesporto } from "./sources/rss.js";
import { startTelegram } from "./sources/telegram.js";
import { startBluesky } from "./sources/bluesky.js";
import { startResults } from "./sources/results.js";
import { startEspn } from "./sources/espn.js";
import { createZapping } from "./sources/zapping.js";
import { createStories } from "./stories.js";
import { createDesdobrar, ativo as desdobraAtivo } from "./desdobra.js";
import { createTeams } from "./teams.js";
import { createTradutor, LINGUAS as LINGUAS_EXTRA } from "./traduz.js";
import { slug } from "./util.js";
import { createVideos } from "./videos.js";
import { startReddit } from "./sources/reddit.js";
import { startTgVideos } from "./sources/tgvideos.js";
import { startVsports } from "./sources/vsports.js";
import { createCapas } from "./sources/capas.js";
import { createEfemerides } from "./sources/efemerides.js";

const readJson = (url, fallback) => { try { return JSON.parse(fs.readFileSync(url, "utf8")); } catch { return fallback; } };
const FONTES = readJson(new URL("../fontes.json", import.meta.url), {});
const LIGAS = readJson(new URL("../ligas.json", import.meta.url), []);
const PORT = Number(process.env.PORT) || 3001;
const log = (...a) => console.log(...a);

const RSS = FONTES.rss || [];
const TELEGRAM = FONTES.telegram || [];
const BLUESKY = FONTES.bluesky || [];
const PAIS = Object.fromEntries([...RSS, ...TELEGRAM, ...BLUESKY].map((s) => [s.id, s.pais])); // país de cada fonte, para a bandeira
// coluna dos Destaques a que a fonte pertence (proveniência): pt, en, es, it, de, fr, mundo, portugueses
const COL = Object.fromEntries([...RSS, ...TELEGRAM, ...BLUESKY].map((s) => [s.id, s.col]));
const SOURCES = [
  ...[...RSS, ...TELEGRAM, ...BLUESKY].map((s) => ({ handle: s.id, name: s.nome, pais: s.pais, col: s.col })),
  { handle: "resultados", name: "Resultados em direto", col: "mundo" },
];

const ESTADO_RSS = new Map(); // estado de cada feed: qual está em uso, se responde e há quanto tempo trouxe algo

store.load();
// cartões de jogos em direto que ficaram gravados de uma sessão anterior e que já não são atualizados há muito
// (o servidor reiniciou depois de o jogo acabar): saem, para o jogo não aparecer como a decorrer
for (const it of store.all(100000)) {
  if (it.board && it.id.endsWith(":live") && Date.now() - (it.upd || it.ts) > 20 * 60000) store.remove(it.id);
}
// notícias de jornais generalistas guardadas antes de o filtro de desporto ficar mais apertado
// (política, economia, sociedade do Observador e companhia): saem no arranque
const SO_DESPORTO = new Set(RSS.filter((s) => s.soDesporto).map((s) => s.id));
for (const it of store.all(100000)) {
  if (!SO_DESPORTO.has(it.src) || it.score) continue;
  // só sai o que não tem nada de desporto: nem palavras, nem clubes, nem secções, nem modalidade
  if (it.equipas?.length || it.cats?.length || it.mod) continue;
  if (!eDesporto(`${it.text || ""} ${it.t?.pt || ""} ${(it.b?.pt || []).join(" ")} ${it.url || ""}`)) store.remove(it.id);
}
const stories = createStories({ broadcast: (e, d) => broadcast(e, d), log });
const clients = new Set();
const status = { x: "ligado", fila: 0, publicadas: 0, juntas: 0, ignoradas: 0, semTraducao: 0 };

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
const clamp = (n, a, b) => Math.min(b, Math.max(a, Math.round(Number(n) || a)));

// canal português que transmite o jogo, vindo do Zapping do zerozero
function comTv(item) {
  if (!item.score) return item;
  const tv = zapping.find(item.score.h, item.score.a, item.ts || Date.now(), item.mod);
  if (tv) item.tv = tv;
  return item;
}

function publish(item) {
  // resultados sem emblemas (GOAL API): procura-os pelo nome das equipas
  if (item.score && !item.equipas?.some((e) => e.logo)) item.equipas = teams.resolve([{ nome: item.score.h }, { nome: item.score.a }]);
  comTv(item);
  if (store.get(item.id)) return;
  store.add({ also: [], ...item, postId: item.postId || item.id });
  status.publicadas++;
  broadcast("item", store.get(item.id));
}

// cria ou atualiza um cartão (usado pelos cartões de jogos em direto)
function upsert(item) {
  comTv(item);
  const cur = store.get(item.id);
  if (!cur) return publish(item);
  Object.assign(cur, item, { ts: cur.ts, upd: Date.now() });
  store.touch();
  broadcast("update", cur);
}
function removeItem(id) {
  if (!store.get(id)) return;
  store.remove(id);
  broadcast("remove", { id });
}

// Publicar primeiro, tratar depois: cada post aparece no site no segundo em que chega, com o texto original.
// Quando o Gemini responde (poucos segundos depois), o cartão é atualizado com título, secções e tradução;
// se afinal não for notícia, ou já existir noutra fonte, o cartão sai e junta-se ao existente.
const teams = createTeams({ log });
const tradutor = createTradutor({ log }); // tradução automática para francês, alemão, italiano e espanhol
const zapping = createZapping({ log });
// sem Gemini, os três grandes ainda recebem o emblema a partir das secções
const BIG3_NAMES = { porto: "FC Porto", sporting: "Sporting CP", benfica: "Benfica" };
const equipasOf = (ai) => teams.resolve(ai.equipas?.length ? ai.equipas : (ai.seccoes || []).filter((c) => BIG3_NAMES[c]).map((c) => ({ nome: BIG3_NAMES[c], papel: "envolvido" })));
// rede de segurança: junta às secções do Gemini as que as regras reconhecem no texto,
// para uma notícia do Sporting ou do Porto não ficar de fora da secção do clube
function secoes(post, ai) {
  const texto = `${post.text} ${ai.titulo_pt || ""} ${(ai.pontos_pt || []).join(" ")}`;
  const cats = new Set([...(ai.seccoes || []), ...RULES.filter(([, re]) => re.test(texto)).map(([c]) => c)]);
  if (NAO_FUTEBOL.test(texto)) cats.add("modalidades"); // outras modalidades nunca ficam sem secção
  // «Portugueses pelo mundo» é só para quem está fora de Portugal
  if (cats.has("portugueses") && (ai.pais_tema === "pt" || !ai.pais_tema)) cats.delete("portugueses");
  return [...cats];
}
// modalidade concreta: a que o Gemini indicou, ou a que as palavras do texto revelam
function modalidade(post, ai) {
  const dada = MODALIDADES[ai.modalidade] ? ai.modalidade : null;
  return dada || modalidadeDe(`${post.text} ${ai.titulo_pt || ""}`) || null;
}
const toItem = (post, ai) => ({
  orig: ai.idioma,
  raw: !!ai.bruto,
  cats: secoes(post, ai),
  mod: modalidade(post, ai) || undefined,
  t: { pt: ai.titulo_pt, en: ai.titulo_en },
  b: { pt: ai.pontos_pt || [], en: ai.pontos_en || [] },
  imp: clamp(ai.importancia, 1, 5),
  paisTema: /^[a-z]{2}(-[a-z]{3})?$/.test(ai.pais_tema || "") ? ai.pais_tema : undefined,
  equipas: equipasOf(ai),
});

function refine(post, ai) {
  const it = store.get(post.postId);
  if (!it) return;
  const drop = () => { store.remove(it.id); broadcast("remove", { id: it.id }); };
  if (!ai || !ai.relevante) { status.ignoradas++; return drop(); }
  if (ai.bruto) status.semTraducao++;
  if (ai.igual_a && ai.igual_a !== it.id) {
    const merged = store.attach(ai.igual_a, { src: post.src, name: post.name, postId: post.postId, url: post.url, ts: post.ts });
    if (merged) { status.juntas++; drop(); broadcast("update", merged); pista(merged); return; }
  }
  // segunda rede: o título traduzido pode revelar que é a mesma notícia de outra já publicada
  const dup = store.findSimilar({ titulo: ai.titulo_pt, ts: it.ts, src: post.src, excluir: it.id });
  if (dup && !dup.pending) {
    const merged = store.attach(dup.id, { src: post.src, name: post.name, postId: post.postId, url: post.url, ts: post.ts });
    if (merged) {
      status.juntas++;
      drop();
      broadcast("update", merged);
      pista(merged);
      return;
    }
  }
  Object.assign(it, toItem(post, ai), { pending: false });
  store.touch();
  broadcast("update", it);
  pista(it); // notícias de grande importância também dão pistas
}

// Desdobramento: as notícias mais fortes viram pista de trabalho — o fio da história, o que pode
// acontecer a seguir e as consequências, tudo a partir do que o site já tem. Quando não há chave do
// Gemini, matéria suficiente ou orçamento de pedidos, fica a pista simples de tema em destaque.
const desdobrar = createDesdobrar({ log });
const nomesDe = (it) => [...new Set([
  ...(it.equipas || []).map((e) => e.nome),
  ...[...String(it.t?.pt || "").matchAll(/==(.+?)==/g)].map((m) => m[1]),
])].filter(Boolean);

function pista(item) {
  if (!item || item.score || item.pending) return;
  const fontes = 1 + (item.also?.length || 0);
  if (fontes < 2 && (item.imp || 0) < 4) return;
  if (!desdobraAtivo) return stories.onTrending(item);
  desdobrar(item, store.related({ id: item.id, nomes: nomesDe(item) }))
    .then((out) => (out ? stories.onNoticia(item, out) : stories.onTrending(item)));
}

// só as notícias já tratadas servem de referência para detetar repetidos
const enrich = createEnricher({ recent: () => store.recent().filter((i) => !i.pending), log });
const seen = new Set(); // posts já recebidos (recolha inicial, religações)
function onPost(post) {
  if (seen.has(post.postId) || store.has(post.postId)) return;
  if (seen.size > 20000) seen.clear();
  seen.add(post.postId);
  // a mesma notícia já publicada por outra fonte: junta-se em vez de aparecer de novo
  const igual = store.findSimilar({ titulo: post.text.split("\n")[0], url: post.url, ts: post.ts, src: post.src });
  if (igual) {
    const merged = store.attach(igual.id, { src: post.src, name: post.name, postId: post.postId, url: post.url, ts: post.ts });
    if (merged) {
      status.juntas++;
      broadcast("update", merged);
      pista(merged);
      return;
    }
  }
  publish({ id: post.postId, src: post.src, name: post.name, via: post.via, url: post.url, ts: post.ts, text: post.text, pais: PAIS[post.src], tsAprox: post.tsAprox, pending: true, ...toItem(post, fallback(post)) });
  status.fila++;
  enrich(post).then((ai) => { status.fila--; refine(post, ai); });
}

// Feed de vídeos (golos, resumos, defesas, VAR, expulsões): Reddit e canais públicos do Telegram
const VIDEOS_CFG = FONTES.videos || {};
const ESTADO_VIDEOS = { reddit: {}, telegram: {}, vsports: {} };
const videos = createVideos({
  broadcast: (e, d) => broadcast(e, d),
  log,
  jogos: () => store.all(800).filter((i) => i.score),
  emblemas: teams,
});

// Capas dos jornais desportivos do dia e da última semana (página de jornais de desporto do SAPO)
const capas = createCapas({ log, broadcast: (e, d) => broadcast(e, d) });

// «Neste dia»: o que aconteceu no desporto no dia de hoje, há 1, 2, 3, 4, 5, 10, 15… 100 anos
const efemerides = createEfemerides({ log, broadcast: (e, d) => broadcast(e, d), ligas: LIGAS });

const app = express();
const ORIGINS = (process.env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin" });
  next();
});
app.get("/api/items", (req, res) => res.json(store.all(Math.min(Number(req.query.limit) || 1000, 5000))));
app.get("/api/sources", (req, res) => res.json(SOURCES));
// estado de cada fonte: por onde está a ser lida, se está a responder e a hora da última notícia que trouxe
app.get("/api/fontes", (req, res) => {
  const ultima = new Map();
  for (const it of store.all(4000)) {
    for (const src of [it.src, ...(it.also || []).map((a) => a.src)]) {
      if (!ultima.has(src) || ultima.get(src) < it.ts) ultima.set(src, it.ts);
    }
  }
  const via = { ...Object.fromEntries(TELEGRAM.map((s) => [s.id, "Telegram"])), ...Object.fromEntries(BLUESKY.map((s) => [s.id, "Bluesky"])), resultados: "ESPN" };
  res.json(SOURCES.map((s) => {
    const e = ESTADO_RSS.get(s.handle);
    return {
      handle: s.handle, nome: s.name, pais: s.pais, col: s.col,
      via: e?.via || via[s.handle] || null,
      feed: e?.feed || null,
      ok: e ? e.ok : null,
      erro: e?.erro || null,
      itens: e?.itens ?? null,
      ms: e?.ms ?? null,
      ultima: ultima.get(s.handle) || null,
    };
  }));
});
app.get("/api/leagues", (req, res) => res.json(LIGAS.filter((l) => l.espn || process.env.GOAL_API_KEY).map((l) => ({ key: slug(l.nome), nome: l.nome, nome_en: l.nome_en || l.nome, pais: l.bandeira, mod: l.mod }))));
app.get("/api/stories", (req, res) => res.json(stories.all()));
app.get("/api/zapping", (req, res) => res.json(zapping.all())); // grelha de transmissões (canal de cada jogo)
app.get("/api/zapping/estado", (req, res) => res.json(zapping.estado()));
app.get("/api/stories/estado", (req, res) => res.json(stories.estado())); // diagnóstico da recuperação de pistas
app.get("/api/tradutor/estado", (req, res) => res.json(tradutor.estado()));
// tradução automática para as línguas extra: o site pede os títulos que está a mostrar
// e recebe-os traduzidos; cada tradução fica guardada na notícia e segue para todos os leitores
app.post("/api/traduzir", express.json({ limit: "64kb" }), async (req, res) => {
  const lang = String(req.body?.lang || "");
  if (!LINGUAS_EXTRA[lang]) return res.status(400).json({ erro: "língua não suportada" });
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 40).map(String) : [];
  // "titulo": só o título, para o feed todo; "tudo": título e pontos, para a secção que está aberta
  const soTitulo = req.body?.campos === "titulo";
  const itens = {};
  const faltam = [];
  for (const id of ids) {
    const it = store.get(id);
    if (!it) continue;
    const temTitulo = !!it.t?.[lang];
    const temPontos = !!it.b?.[lang];
    if (temTitulo && (soTitulo || temPontos)) { itens[id] = { t: it.t[lang], b: it.b?.[lang] }; continue; }
    const pedido = { id: it.id };
    if (!temTitulo) pedido.titulo = it.t?.pt || it.t?.en || it.text?.split("\n")[0] || "";
    if (!soTitulo && !temPontos) pedido.pontos = it.b?.pt?.length ? it.b.pt : it.b?.en || [];
    if (pedido.titulo || pedido.pontos?.length) faltam.push(pedido);
  }
  const feitas = faltam.length ? await tradutor.pedir(lang, faltam) : [];
  for (const r of feitas) {
    const it = r && store.get(r.id);
    if (!it) continue;
    if (r.t) it.t = { ...it.t, [lang]: r.t };
    if (r.b?.length) it.b = { ...it.b, [lang]: r.b };
    store.touch();
    itens[r.id] = { t: it.t?.[lang], b: it.b?.[lang] };
    broadcast("update", it); // quem já está a ler nesta língua recebe a tradução sem pedir nada
  }
  res.json({ lang, campos: soTitulo ? "titulo" : "tudo", itens, faltam: ids.length - Object.keys(itens).length });
});
// vídeos mais recentes, já sem repetidos; ?categoria=goal|highlight|save|red|var|skill|other e ?limit=
app.get(["/api/videos/latest", "/videos/latest"], (req, res) => {
  const lista = videos.latest({ limit: Number(req.query.limit) || 60, categoria: req.query.categoria || null });
  res.json(lista.map((v) => ({
    video_id: v.video_id, title: v.title, thumbnail: v.thumbnail, video_url: v.video_url, reddit_url: v.reddit_url,
    category: v.category, teams: v.teams, home_team: v.home_team, away_team: v.away_team, score: v.score, scorer_side: v.scorer_side,
    player: v.player, minute: v.minute, opponent: v.opponent, competition: v.competition, liga: v.liga, paisTema: v.paisTema, equipas: v.equipas,
    source: v.subreddit ? `r/${v.subreddit}` : v.canal === "vsports" ? "VSPORTS" : v.canal ? `t.me/${v.canal}` : v.source, subreddit: v.subreddit, author: v.author,
    sources: v.sources.map((x) => ({ fonte: x.fonte, subreddit: x.subreddit || null, canal: x.canal || null, url: x.reddit_url, created_time: x.created_time })),
    embed: v.embed, created_time: v.created_time, first_seen: v.first_seen,
  })));
});
app.get("/api/videos/estado", (req, res) => res.json({ ...videos.estado(), fontes: ESTADO_VIDEOS }));
// Retransmissor: um computador de casa lê o Reddit (os servidores de alojamento são bloqueados pelo Reddit)
// e envia para aqui as publicações com vídeo. Protegido pela chave VIDEOS_RELAY_TOKEN do .env.
const CAMPOS_RELAY = ["fonte", "post_id", "crosspost_of", "subreddit", "regiao", "title", "reddit_url", "video_url", "hls", "mp4", "height", "thumbnail", "author", "flair", "created_time"];
app.post("/api/videos/relay", express.json({ limit: "512kb" }), (req, res) => {
  const chave = process.env.VIDEOS_RELAY_TOKEN;
  if (!chave || req.get("authorization") !== `Bearer ${chave}`) return res.status(401).json({ erro: "chave do retransmissor em falta ou errada" });
  const posts = Array.isArray(req.body?.posts) ? req.body.posts.slice(0, 200) : [];
  let aceites = 0;
  for (const p of posts) {
    if (!p || typeof p !== "object") continue;
    const limpo = Object.fromEntries(CAMPOS_RELAY.filter((k) => p[k] != null).map((k) => [k, typeof p[k] === "string" ? p[k].slice(0, 1000) : p[k]]));
    if (typeof limpo.post_id !== "string" || !/^https?:\/\//.test(limpo.video_url || "")) continue;
    limpo.fonte = "reddit";
    limpo.created_time = Number(limpo.created_time) || Date.now();
    videos.add(limpo);
    aceites++;
  }
  ESTADO_VIDEOS.relay = { ultimo: Date.now(), recebidos: posts.length, aceites, via: req.body?.via || null };
  res.json({ ok: true, aceites });
});
app.get("/api/capas", (req, res) => res.json(capas.hoje())); // só as capas que são mesmo de hoje
app.get("/api/capas/semana", (req, res) => res.json(capas.semana())); // as da última semana, com o dia de cada uma
app.get("/api/capas/estado", (req, res) => res.json(capas.estado()));
app.get("/api/capas/img/:id", async (req, res) => {
  try {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || "")) ? String(req.query.dia) : null;
    const img = await capas.imagem(String(req.params.id), dia);
    if (!img) return res.status(404).end();
    res.set({ "Content-Type": img.tipo, "Cache-Control": "public, max-age=900" }).send(img.buf);
  } catch (e) {
    res.status(502).json({ erro: e.message });
  }
});
app.get("/api/efemerides", (req, res) => res.json(efemerides.para(String(req.query.lang || "pt"))));
app.get("/api/efemerides/estado", (req, res) => res.json(efemerides.estado()));
app.get("/api/status", (req, res) => res.json({ ...status, clientes: clients.size, noticias: store.count() }));
app.get("/api/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write(`event: status\ndata: ${JSON.stringify({ x: status.x })}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
});
setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000).unref();

// em produção (npm run build), o próprio servidor entrega o site
const dist = fileURLToPath(new URL("../web/dist", import.meta.url));
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  // qualquer endereço que não seja da API devolve a app (abrir /mercado diretamente dava 404)
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(`${dist}/index.html`);
  });
}

app.listen(PORT, () => log(`[VAR] servidor em http://localhost:${PORT}`));

startRss(RSS, onPost, log, ESTADO_RSS);
zapping.start();
startReddit(VIDEOS_CFG.reddit || [], (p) => videos.add(p), log, ESTADO_VIDEOS.reddit, { relayAtivo: () => Date.now() - (ESTADO_VIDEOS.relay?.ultimo || 0) < 3 * 60e3 });
startTgVideos(VIDEOS_CFG.telegram || [], (p) => videos.add(p), log, ESTADO_VIDEOS.telegram);
startVsports((p) => videos.add(p), log, ESTADO_VIDEOS.vsports);
capas.start();
efemerides.start();
startTelegram(TELEGRAM, onPost, log).catch((e) => log("[Telegram]", e.message));
startBluesky(BLUESKY, onPost, log).catch((e) => log("[Bluesky]", e.message));
// resultados: ESPN para as ligas que a têm; GOAL API para as restantes e como reserva se a ESPN bloquear
const goal = startResults(LIGAS.filter((l) => !l.espn), publish, log, { upsert, remove: removeItem });
const espnLeagues = startEspn(LIGAS.filter((l) => l.espn), { publish, upsert, remove: removeItem, log, onBlocked: (lg) => goal.add([lg]), onFinal: stories.onFinal });
stories.watch(espnLeagues);
// quando o diretório de emblemas fica pronto, as notícias já guardadas recebem o país de cada clube
// (serve para pôr cada notícia na coluna certa da página inicial)
teams.load(espnLeagues).then(() => {
  let n = 0;
  for (const it of store.all(100000)) {
    for (const e of it.equipas || []) {
      if (e.pais) continue;
      const t = teams.find(e.nome);
      if (t?.pais) { e.pais = t.pais; n++; }
    }
  }
  if (n) { store.touch(); log(`[Emblemas] país acrescentado a ${n} clubes de notícias guardadas`); }
}).catch((e) => log(`[Emblemas] ${e.message}`));
setTimeout(() => stories.backfill(espnLeagues), 15000); // depois de as fontes arrancarem
