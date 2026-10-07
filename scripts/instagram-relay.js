// Retransmissor dos stories: corre num computador de casa (onde o Instagram desconfia menos do que de um servidor
// de alojamento), lê os stories e posts dos clubes que estão a jogar e envia o texto para o site.
//
//   VAR_URL=https://o-teu-site PT_TOKEN=uma-chave-tua [IG_SESSIONID=...] npm run instagram-relay
// (sem IG_SESSIONID, usa os visualizadores anónimos, como o servidor)
//
// O servidor diz que contas vigiar (/api/pt/alvos: só os clubes com jogo a decorrer, a começar ou acabado há
// pouco) e recebe o texto lido (/api/pt/evidencia). O OCR corre aqui: instala o Tesseract para ler o texto das
// imagens (macOS: brew install tesseract tesseract-lang · Ubuntu: sudo apt install tesseract-ocr tesseract-ocr-por)
// e o ffmpeg para os vídeos. Sem eles, fica o texto automático do Instagram e, se houver GEMINI_API_KEY, o Gemini.
import "dotenv/config";
import fs from "node:fs";
import { createInstagram, cookieDoEnv } from "../server/pt/stories/instagram.js";
import { createAnonimo } from "../server/pt/stories/anonimo.js";
import { verificar } from "../server/pt/stories/ocr.js";

const URL_SITE = (process.env.VAR_URL || "http://localhost:3001").replace(/\/$/, "");
const TOKEN = process.env.PT_TOKEN || process.env.VIDEOS_RELAY_TOKEN;
const cookie = cookieDoEnv();
if (!TOKEN) { console.error("Falta PT_TOKEN (a mesma chave que está no .env do servidor)."); process.exit(1); }
if (!cookie) console.log("[relay] sem IG_SESSIONID: os stories são lidos pelos visualizadores anónimos (sem conta)");

const FICHEIRO = new URL("../data/instagram-relay.json", import.meta.url);
let memoria = {};
try { memoria = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { /* primeira vez */ }
const gravar = () => { try { fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(memoria)); } catch { /* */ } };

let alvos = [];
async function lerAlvos() {
  try {
    const r = await fetch(`${URL_SITE}/api/pt/alvos`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
    alvos = await r.json();
  } catch (e) { console.log(`[relay] lista de clubes a vigiar: ${e.message}`); }
}
await lerAlvos();
setInterval(lerAlvos, 60e3);

const ocr = await verificar();
console.log(`[relay] OCR: ${ocr.tesseract ? "tesseract" : "sem tesseract"}${ocr.ffmpeg ? " + ffmpeg" : ""} · ${alvos.length} clube(s) a vigiar agora · a enviar para ${URL_SITE}`);

const entregar = async (p) => {
  try {
    const r = await fetch(`${URL_SITE}/api/pt/evidencia`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ itens: [p] }) });
    const j = await r.json().catch(() => ({}));
    console.log(`[relay] @${p.conta} ${p.tipo}: ${j.resultados?.[0]?.decisao || r.status} — ${String(p.texto).replace(/\s+/g, " ").slice(0, 80)}`);
  } catch (e) { console.log(`[relay] envio falhou: ${e.message}`); }
};
if (!cookie) createAnonimo({ alvos: () => alvos, entregar, log: (...a) => console.log(...a) });
else createInstagram({
  cookie,
  alvos: () => alvos,
  info: (h) => memoria[h] || {},
  guardar: (h, c) => { memoria[h] = { ...memoria[h], ...c }; gravar(); },
  log: (...a) => console.log(...a),
  entregar,
});
