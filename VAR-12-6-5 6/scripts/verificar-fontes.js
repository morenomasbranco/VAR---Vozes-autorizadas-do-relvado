// Confirma cada fonte e mede o atraso real: feeds RSS, canais do Telegram, contas do Bluesky, GOAL API e Gemini.
import "dotenv/config";
import fs from "node:fs";
import { discover, readFeed } from "../server/sources/rss.js";
import { resolveHandle, recentPosts } from "../server/sources/bluesky.js";
import { fetchLive, normalizeMatch, matchLeague } from "../server/sources/results.js";
import { scoreboardUrl, normalizeEvent } from "../server/sources/espn.js";

const fontes = JSON.parse(fs.readFileSync(new URL("../fontes.json", import.meta.url), "utf8"));
const ligas = JSON.parse(fs.readFileSync(new URL("../ligas.json", import.meta.url), "utf8"));
const age = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < -2) return `datada no futuro (${Math.abs(m)} min à frente; o feed tem o fuso mal configurado)`;
  return m < 60 ? `há ${Math.max(0, m)} min` : `há ${Math.round(m / 60)} h`;
};
const row = (ok, nome, detalhe) => console.log(`${ok ? "✓" : "✗"} ${nome.padEnd(22)} ${detalhe}`);

const corrigir = process.argv.includes("--corrigir");
const semFeed = [];
const parados = [];
let arrumado = false;

// testa um endereço: tem de ser um feed válido, com itens, e atualizado na última semana
async function testar(url) {
  const t0 = Date.now();
  const parsed = await readFeed(url);
  const items = parsed?.items || [];
  if (!items.length) throw new Error("o feed não tem itens");
  const datas = items.map((i) => Date.parse(i.isoDate || i.pubDate || i.published || i.updated || "") || 0).filter(Boolean);
  const recente = datas.length ? Math.max(...datas) : 0;
  if (recente && Date.now() - recente > 7 * 86400e3) throw new Error(`parado desde ${age(recente)}`);
  return { url, n: items.length, recente, ms: Date.now() - t0, semData: !datas.length };
}

console.log("\nRSS (cada fonte é testada em todos os endereços indicados, depois no próprio site)");
for (const s of fontes.rss || []) {
  if (s.soGoogle) { semFeed.push(s.nome); row(true, s.nome, "só Google News (sem feed próprio) — atraso de alguns minutos"); continue; }
  const cands = [s.feed, ...(s.feeds || [])].flat().filter(Boolean);
  const falhas = [];
  let bom = null;
  for (const url of cands) {
    try { bom = await testar(url); break; } catch (e) { falhas.push(`${url} → ${e.message}`); }
  }
  if (!bom) {
    try {
      const achado = await discover(s.site);
      if (achado) bom = await testar(achado);
      else falhas.push(`${s.site} → sem feed na página`);
    } catch (e) { falhas.push(`${s.site} → ${e.message}`); }
  }
  if (bom) {
    const idade = bom.recente ? age(bom.recente) : "sem data nos itens";
    row(true, s.nome, `${bom.n} notícias, a mais recente ${idade} (${bom.ms} ms) — ${bom.url}`);
    if (bom.recente && Date.now() - bom.recente > 12 * 3600e3) parados.push(`${s.nome} (${idade})`);
    if (corrigir && bom.url !== s.feed) {
      s.feed = bom.url;
      const resto = cands.filter((u) => u !== bom.url);
      if (resto.length) s.feeds = resto; else delete s.feeds;
      arrumado = true;
    }
  } else {
    semFeed.push(s.nome);
    row(false, s.nome, `sem feed próprio; vai pelo Google News. ${falhas.join(" | ")}`);
    if (corrigir) { delete s.feed; delete s.feeds; arrumado = true; }
  }
  for (const f of bom ? falhas : []) console.log(`   · endereço descartado: ${f}`);
}

if (arrumado) {
  fs.writeFileSync(new URL("../fontes.json", import.meta.url), `${JSON.stringify(fontes, null, 2)}\n`);
  console.log("\n→ fontes.json arrumado: o endereço que funciona passou a ser o principal e os que falharam foram retirados.");
} else if (!corrigir) {
  console.log("\n→ corre com --corrigir para gravar no fontes.json o endereço que funciona de cada fonte.");
}
console.log(`\nResumo: ${(fontes.rss || []).length - semFeed.length} fonte(s) com feed próprio (segundos de atraso), ${semFeed.length} pelo Google News (minutos).`);
if (semFeed.length) console.log(`  Pelo Google News: ${semFeed.join(", ")}`);
if (parados.length) console.log(`  Com feed lento ou pouco movimento (nada nas últimas 12 h): ${parados.join(", ")}`);

console.log("\nBluesky");
for (const s of fontes.bluesky || []) {
  try {
    const did = await resolveHandle(s.handle);
    const posts = await recentPosts(did, 5);
    const newest = posts[0] ? Date.parse(posts[0].record.createdAt) : 0;
    row(true, s.nome, `último post ${newest ? age(newest) : "—"}`);
  } catch (e) { row(false, s.nome, e.message); }
}

console.log("\nTelegram");
if (!(fontes.telegram || []).length) console.log("  (sem canais)");
else if (!process.env.TG_SESSION) console.log("  ✗ falta TG_SESSION no .env — corre npm run telegram-login");
else {
  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions/index.js");
  const client = new TelegramClient(new StringSession(process.env.TG_SESSION), Number(process.env.TG_API_ID), process.env.TG_API_HASH, { connectionRetries: 3 });
  client.setLogLevel("error");
  await client.connect();
  for (const s of fontes.telegram) {
    try {
      const [m] = await client.getMessages(s.canal, { limit: 1 });
      row(true, s.nome, m ? `última mensagem ${age(m.date * 1000)}` : "canal sem mensagens");
    } catch (e) { row(false, s.nome, e.message); }
  }
  await client.disconnect();
}

console.log("\nZapping (canal de cada jogo)");
{
  const { createZapping } = await import("../server/sources/zapping.js");
  const z = createZapping({ log: () => {} });
  z.start();
  await new Promise((r) => setTimeout(r, 3000));
  const lista = z.all();
  const e = z.estado();
  row(lista.length > 0, "zerozero Zapping", e.erro || `${lista.length} transmissões — a próxima: ${lista[0] ? `${lista[0].casa} x ${lista[0].fora} (${lista[0].canal})` : "—"}`);
}

console.log("\nResultados em direto (ESPN)");
for (const lg of ligas.filter((l) => l.espn)) {
  try {
    const res = await fetch(scoreboardUrl(lg));
    if (!res.ok) { row(false, lg.nome, `a ESPN respondeu ${res.status}`); continue; }
    const events = ((await res.json()).events || []).map(normalizeEvent);
    const live = events.filter((e) => e.state === "in").length;
    row(true, lg.nome, `${events.length} jogo(s) hoje, ${live} a decorrer`);
  } catch (e) { row(false, lg.nome, e.message); }
}

console.log("\nResultados em direto (GOAL API, para as ligas sem ESPN)");
if (!process.env.GOAL_API_KEY) console.log("  ✗ falta GOAL_API_KEY no .env");
else {
  try {
    const { raw, quota } = await fetchLive();
    const matches = raw.map(normalizeMatch);
    const mine = matches.filter((m) => matchLeague(m, ligas));
    row(true, "GOAL API", `${raw.length} jogos em direto, ${mine.length} das tuas ligas; pedidos restantes hoje: ${quota.remaining ?? "?"}`);
    if (raw[0]) console.log(`  exemplo lido: ${JSON.stringify(matches[0])}`);
    if (raw[0] && !matches[0].id) console.log(`  formato por reconhecer — exemplo em bruto: ${JSON.stringify(raw[0]).slice(0, 500)}`);
  } catch (e) { row(false, "GOAL API", e.message); }
}

console.log("\nGemini");
if (!process.env.GEMINI_API_KEY) console.log("  ✗ falta GEMINI_API_KEY no .env");
else {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Responde só: ok" }] }] }),
  });
  row(res.ok, model, res.ok ? "a responder" : `${res.status} ${(await res.text()).slice(0, 150)}`);
}
console.log("");
process.exit(0);
