import "dotenv/config";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import * as store from "./store.js";
import { createEnricher, fallback, RULES, NAO_FUTEBOL, MODALIDADES, modalidadeDe } from "./enrich.js";
import { startRss } from "./sources/rss.js";
import { startTelegram } from "./sources/telegram.js";
import { startBluesky } from "./sources/bluesky.js";
import { startResults } from "./sources/results.js";
import { startEspn } from "./sources/espn.js";
import { createZapping } from "./sources/zapping.js";
import { createStories } from "./stories.js";
import { createDesdobrar, ativo as desdobraAtivo } from "./desdobra.js";
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
// coluna dos Destaques a que a fonte pertence (proveniência): pt, en, es, it, de, fr, mundo, portugueses
const COL = Object.fromEntries([...RSS, ...TELEGRAM, ...BLUESKY].map((s) => [s.id, s.col]));
const SOURCES = [
  ...[...RSS, ...TELEGRAM, ...BLUESKY].map((s) => ({ handle: s.id, name: s.nome, pais: s.pais, col: s.col })),
  { handle: "resultados", name: "Resultados em direto", col: "mundo" },
];

const ESTADO_RSS = new Map(); // estado de cada feed: qual está em uso, se responde e há quanto tempo trouxe algo

store.load();
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

startRss(RSS, onPost, log, ESTADO_RSS);
zapping.start();
startTelegram(TELEGRAM, onPost, log).catch((e) => log("[Telegram]", e.message));
startBluesky(BLUESKY, onPost, log).catch((e) => log("[Bluesky]", e.message));
// resultados: ESPN para as ligas que a têm; GOAL API para as restantes e como reserva se a ESPN bloquear
const goal = startResults(LIGAS.filter((l) => !l.espn), publish, log);
const espnLeagues = startEspn(LIGAS.filter((l) => l.espn), { publish, upsert, remove: removeItem, log, onBlocked: (lg) => goal.add([lg]), onFinal: stories.onFinal });
stories.watch(espnLeagues);
teams.load(espnLeagues);
setTimeout(() => stories.backfill(espnLeagues), 15000); // depois de as fontes arrancarem
