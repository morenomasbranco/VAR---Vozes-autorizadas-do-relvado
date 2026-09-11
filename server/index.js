import "dotenv/config";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import * as store from "./store.js";
import { createEnricher, fallback } from "./enrich.js";
import { startRss } from "./sources/rss.js";
import { startTelegram } from "./sources/telegram.js";
import { startBluesky } from "./sources/bluesky.js";
import { startResults } from "./sources/results.js";
import { startEspn } from "./sources/espn.js";
import { createStories } from "./stories.js";
import { createTeams } from "./teams.js";
import { slug } from "./util.js";

const readJson = (url, fallback) => { try { return JSON.parse(fs.readFileSync(url, "utf8")); } catch { return fallback; } };
const FONTES = readJson(new URL("../fontes.json", import.meta.url), {});
const LIGAS = readJson(new URL("../ligas.json", import.meta.url), []);
const PORT = Number(process.env.PORT) || 3001;
const log = (...a) => console.log(...a);

const RSS = FONTES.rss || [];
const TELEGRAM = FONTES.telegram || [];
const BLUESKY = FONTES.bluesky || [];
const PAIS = Object.fromEntries([...RSS, ...TELEGRAM, ...BLUESKY].map((s) => [s.id, s.pais])); // país de cada fonte, para a bandeira
const SOURCES = [
  ...[...RSS, ...TELEGRAM, ...BLUESKY].map((s) => ({ handle: s.id, name: s.nome, pais: s.pais })),
  { handle: "resultados", name: "Resultados em direto" },
];

store.load();
const stories = createStories({ broadcast: (e, d) => broadcast(e, d), log });
const clients = new Set();
const status = { x: "ligado", fila: 0, publicadas: 0, juntas: 0, ignoradas: 0, semTraducao: 0 };

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
const clamp = (n, a, b) => Math.min(b, Math.max(a, Math.round(Number(n) || a)));

function publish(item) {
  // resultados sem emblemas (GOAL API): procura-os pelo nome das equipas
  if (item.score && !item.equipas?.some((e) => e.logo)) item.equipas = teams.resolve([{ nome: item.score.h }, { nome: item.score.a }]);
  if (store.get(item.id)) return;
  store.add({ also: [], ...item, postId: item.postId || item.id });
  status.publicadas++;
  broadcast("item", store.get(item.id));
}

// cria ou atualiza um cartão (usado pelos cartões de jogos em direto)
function upsert(item) {
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
// sem Gemini, os três grandes ainda recebem o emblema a partir das secções
const BIG3_NAMES = { porto: "FC Porto", sporting: "Sporting CP", benfica: "Benfica" };
const equipasOf = (ai) => teams.resolve(ai.equipas?.length ? ai.equipas : (ai.seccoes || []).filter((c) => BIG3_NAMES[c]).map((c) => ({ nome: BIG3_NAMES[c], papel: "envolvido" })));
const toItem = (post, ai) => ({
  orig: ai.idioma,
  raw: !!ai.bruto,
  cats: [...new Set(ai.seccoes || [])],
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
    if (merged) { status.juntas++; drop(); broadcast("update", merged); stories.onTrending(merged); return; }
  }
  Object.assign(it, toItem(post, ai), { pending: false });
  store.touch();
  broadcast("update", it);
}

// só as notícias já tratadas servem de referência para detetar repetidos
const enrich = createEnricher({ recent: () => store.recent().filter((i) => !i.pending), log });
const seen = new Set(); // posts já recebidos (recolha inicial, religações)
function onPost(post) {
  if (seen.has(post.postId) || store.has(post.postId)) return;
  if (seen.size > 20000) seen.clear();
  seen.add(post.postId);
  publish({ id: post.postId, src: post.src, name: post.name, via: post.via, url: post.url, ts: post.ts, text: post.text, pais: PAIS[post.src], pending: true, ...toItem(post, fallback(post)) });
  status.fila++;
  enrich(post).then((ai) => { status.fila--; refine(post, ai); });
}

const app = express();
const ORIGINS = (process.env.ALLOWED_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) res.set({ "Access-Control-Allow-Origin": origin, Vary: "Origin" });
  next();
});
app.get("/api/items", (req, res) => res.json(store.all(Number(req.query.limit) || 400)));
app.get("/api/sources", (req, res) => res.json(SOURCES));
app.get("/api/leagues", (req, res) => res.json(LIGAS.filter((l) => l.espn || process.env.GOAL_API_KEY).map((l) => ({ key: slug(l.nome), nome: l.nome, nome_en: l.nome_en || l.nome, pais: l.bandeira }))));
app.get("/api/stories", (req, res) => res.json(stories.all()));
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
if (fs.existsSync(dist)) app.use(express.static(dist));

app.listen(PORT, () => log(`[VAR] servidor em http://localhost:${PORT}`));

startRss(RSS, onPost, log);
startTelegram(TELEGRAM, onPost, log).catch((e) => log("[Telegram]", e.message));
startBluesky(BLUESKY, onPost, log).catch((e) => log("[Bluesky]", e.message));
// resultados: ESPN para as ligas que a têm; GOAL API para as restantes e como reserva se a ESPN bloquear
const goal = startResults(LIGAS.filter((l) => !l.espn), publish, log);
const espnLeagues = startEspn(LIGAS.filter((l) => l.espn), { publish, upsert, remove: removeItem, log, onBlocked: (lg) => goal.add([lg]), onFinal: stories.onFinal });
stories.watch(espnLeagues);
teams.load(espnLeagues);
setTimeout(() => stories.backfill(espnLeagues), 15000); // depois de as fontes arrancarem
