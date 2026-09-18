// Retransmissor do Reddit: corre num computador de casa (PC, portátil ou Raspberry Pi), que o Reddit não
// bloqueia como bloqueia os servidores de alojamento. Lê os subreddits de vídeos do fontes.json e envia as
// publicações com vídeo para o servidor do VAR, que as classifica, junta os repetidos e as mostra no site.
//
//   VAR_URL=https://o-teu-site VIDEOS_RELAY_TOKEN=a-mesma-chave-do-servidor npm run reddit-relay
//
// Tenta primeiro o JSON (a cada 5 s, quase em tempo real). Se o Reddit o recusar também a este endereço,
// passa para o RSS, que aceita cerca de um pedido por minuto.
import "dotenv/config";
import fs from "node:fs";
import Parser from "rss-parser";
import { deJson, deRss, bloqueado } from "../server/sources/reddit.js";

const FONTES = JSON.parse(fs.readFileSync(new URL("../fontes.json", import.meta.url), "utf8"));
const SUBS = FONTES.videos?.reddit || [];
const VAR_URL = (process.env.VAR_URL || "").replace(/\/+$/, "");
const CHAVE = process.env.VIDEOS_RELAY_TOKEN;
const UA = process.env.REDDIT_USER_AGENT || "web:var-feed-relay:1.0 (agregador de videos de futebol)";
const JSON_S = Math.max(3, Number(process.env.RELAY_JSON_SEGUNDOS) || 5) * 1000;
const RSS_S = Math.max(30, Number(process.env.REDDIT_RSS_SEGUNDOS) || 60) * 1000;
const caminho = `/r/${SUBS.map((s) => s.sub).join("+")}/new`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rss = new Parser({ timeout: 10000, customFields: { item: [["media:thumbnail", "thumb", { keepArray: false }], ["category", "cat", { keepArray: false }]] } });

if (!VAR_URL || !CHAVE) {
  console.log("Falta VAR_URL (endereço do site) ou VIDEOS_RELAY_TOKEN (a mesma chave posta no servidor).");
  process.exit(1);
}

const enviados = new Set();
let modo = "json";
let falhas = 0;

async function ler() {
  const url = modo === "json" ? `https://www.reddit.com${caminho}.json?limit=100&raw_json=1` : `https://www.reddit.com${caminho}/.rss?limit=100`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: modo === "json" ? "application/json" : "application/atom+xml" } });
  const corpo = await res.text();
  if (!res.ok || bloqueado(res, corpo)) throw Object.assign(new Error(`o Reddit respondeu ${res.status}${res.ok ? " com uma página de bloqueio" : ""}`), { status: res.ok ? 403 : res.status });
  if (modo === "json") return (JSON.parse(corpo)?.data?.children || []).map((c) => deJson(c.data, SUBS));
  return ((await rss.parseString(corpo)).items || []).map((it) => deRss(it, SUBS));
}

async function enviar(posts) {
  const res = await fetch(`${VAR_URL}/api/videos/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CHAVE}` },
    body: JSON.stringify({ posts, via: modo }),
  });
  if (!res.ok) throw new Error(`o servidor do VAR respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

console.log(`[Relay] ${SUBS.map((s) => `r/${s.sub}`).join(", ")} → ${VAR_URL}`);
for (;;) {
  let espera = modo === "json" ? JSON_S : RSS_S;
  try {
    const novos = (await ler()).filter((p) => p && !enviados.has(p.post_id));
    falhas = 0;
    // mesmo sem vídeos novos, avisa o servidor de que o retransmissor está vivo
    const r = await enviar(novos);
    novos.forEach((p) => enviados.add(p.post_id));
    if (enviados.size > 5000) enviados.clear();
    if (novos.length) console.log(`[Relay] ${new Date().toLocaleTimeString("pt-PT")} ${novos.length} vídeo(s) enviado(s), ${r.aceites} aceite(s) (${modo})`);
  } catch (e) {
    console.log(`[Relay] ${e.message}`);
    if (modo === "json" && [403, 429].includes(e.status) && ++falhas >= 2) {
      modo = "rss";
      console.log("[Relay] o JSON também é recusado a este endereço; passo ao RSS (um pedido por minuto)");
      espera = 2000;
    } else espera = Math.min(5 * 60e3, espera * 2);
  }
  await sleep(espera);
}
