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

// «Distritais»: o retransmissor também lê os perfis dos clubes para a secção Distritais (de casa, o Instagram
// responde onde recusa os servidores). O site diz que clubes ler; RELAY_DISTRITAIS=0 desliga.
if (process.env.RELAY_DISTRITAIS !== "0") (async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const GAP = Math.max(3, Number(process.env.RELAY_DISTRITAIS_SEGUNDOS) || 6) * 1000;
  const auth = { Authorization: `Bearer ${TOKEN}` };
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  let lidos = 0;
  for (;;) {
    try {
      const r = await fetch(`${URL_SITE}/api/distritais/alvos?n=5`, { headers: auth });
      const handles = r.ok ? await r.json() : [];
      if (!handles.length) { await espera(60e3); continue; }
      for (const h of handles) {
        const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(h)}`, {
          headers: { "User-Agent": UA, "X-IG-App-ID": "936619743392459", Accept: "*/*", Referer: "https://www.instagram.com/", ...(cookie ? { Cookie: cookie } : {}) },
        });
        if ([401, 403, 429].includes(res.status)) { console.log(`[relay] Distritais: o Instagram pediu uma pausa (${res.status}); volto daqui a 15 min`); await espera(15 * 60e3); break; }
        const j = await res.json().catch(() => null);
        const edges = (j?.data?.user?.edge_owner_to_timeline_media?.edges || []).slice(0, 6).map(({ node: n }) => ({ node: {
          id: n.id, shortcode: n.shortcode, taken_at_timestamp: n.taken_at_timestamp, thumbnail_src: n.thumbnail_src, display_url: n.display_url,
          is_video: n.is_video, accessibility_caption: n.accessibility_caption, edge_media_to_caption: n.edge_media_to_caption,
        } }));
        if (j?.data?.user) {
          await fetch(`${URL_SITE}/api/distritais/posts`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ itens: [{ handle: h, edges }] }) });
          if (++lidos % 25 === 0) console.log(`[relay] Distritais: ${lidos} perfis de clubes enviados`);
        }
        await espera(GAP);
      }
    } catch (e) { console.log(`[relay] Distritais: ${e.message}`); await espera(60e3); }
  }
})();
