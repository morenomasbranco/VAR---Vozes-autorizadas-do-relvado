// Confirma cada fonte e mede o atraso real: feeds RSS, canais do Telegram, contas do Bluesky, GOAL API e Gemini.
import "dotenv/config";
import fs from "node:fs";
import { discover, readFeed } from "../server/sources/rss.js";
import { resolveHandle, recentPosts } from "../server/sources/bluesky.js";
import { fetchLive, normalizeMatch, matchLeague } from "../server/sources/results.js";
import { scoreboardUrl, normalizeEvent } from "../server/sources/espn.js";

const fontes = JSON.parse(fs.readFileSync(new URL("../fontes.json", import.meta.url), "utf8"));
const ligas = JSON.parse(fs.readFileSync(new URL("../ligas.json", import.meta.url), "utf8"));
const age = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`; };
const row = (ok, nome, detalhe) => console.log(`${ok ? "✓" : "✗"} ${nome.padEnd(22)} ${detalhe}`);

console.log("\nRSS");
for (const s of fontes.rss || []) {
  try {
    const feed = s.feed || (await discover(s.site));
    if (!feed) { row(false, s.nome, `sem feed encontrado em ${s.site}; procura-o no site e põe-no em "feed"`); continue; }
    const t0 = Date.now();
    const parsed = await readFeed(feed);
    const items = parsed?.items || [];
    const newest = Math.max(...items.map((i) => Date.parse(i.isoDate || i.pubDate) || 0));
    row(items.length > 0, s.nome, `${items.length} notícias, a mais recente ${newest ? age(newest) : "sem data"} (${Date.now() - t0} ms) — ${feed}`);
  } catch (e) { row(false, s.nome, e.message); }
}

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
