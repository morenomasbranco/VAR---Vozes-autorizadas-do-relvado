// Lê os diretos e os agendados dos canais de YouTube das associações, do Canal 11 e da FPF e envia-os ao site.
// Corre nas GitHub Actions (.github/workflows/youtube-diretos.yml), que chegam ao YouTube quando o servidor do site
// não chega (o YouTube não responde ao Northflank). Faz uma volta a todos os canais a cada RELAY_SEGUNDOS (120) e
// envia o resultado para SITE/api/distritais/diretos/relay com um token OIDC do GitHub (o servidor confirma-o).
// Fora das Actions (sem token), só mostra o que leu: node scripts/youtube-relay.js
import { canaisBase, urlCanal, lerStreams, lerLive, horaMarcada } from "../server/pt/youtube.js";

const SITE = (process.env.SITE || "").replace(/\/$/, "");
const FIM = Date.now() + (Number(process.env.DURACAO_MIN) || 0) * 60e3; // 0: uma volta só
const VOLTA = Math.max(30, Number(process.env.RELAY_SEGUNDOS) || 120) * 1000;
const CAB = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Accept-Language": "pt-PT,pt;q=0.9", Cookie: "CONSENT=YES+cb; SOCS=CAI" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const horas = new Map(); // videoId → início de um agendado

async function pagina(url) {
  const r = await fetch(url, { headers: CAB, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`o YouTube respondeu ${r.status}`);
  return r.text();
}

async function token() {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: chave } = process.env;
  if (!url || !chave) return null;
  const r = await fetch(`${url}&audience=var-youtube`, { headers: { Authorization: `Bearer ${chave}` } });
  return (await r.json()).value || null;
}

async function volta() {
  const porCanal = {};
  const resumo = [];
  for (const c of canaisBase()) {
    const base = urlCanal(c.canal);
    if (!base) continue;
    try {
      let st = lerStreams(await pagina(`${base}/streams`));
      let lista = st?.lista;
      if (!st) { const d = lerLive(await pagina(`${base}/live`)); lista = d ? [d] : []; }
      for (const d of lista) {
        if (!d.marcada || d.inicio) continue;
        if (!horas.has(d.videoId)) { try { horas.set(d.videoId, horaMarcada(await pagina(`https://www.youtube.com/watch?v=${d.videoId}`))); } catch { /* fica para a próxima */ } }
        d.inicio = horas.get(d.videoId) || null;
      }
      porCanal[c.id] = lista;
      if (st?.canal) porCanal[`${c.id}#nome`] = st.canal;
      if (lista.length) resumo.push(`${c.id}: ${lista.map((d) => `${d.aoVivo ? "AO VIVO" : "agendado"} ${d.titulo}`).join(" | ")}`);
    } catch (e) { resumo.push(`${c.id}: erro ${e.message}`); }
    await sleep(800);
  }
  return { porCanal, resumo };
}

do {
  const t0 = Date.now();
  const { porCanal, resumo } = await volta();
  const n = Object.keys(porCanal).filter((k) => !k.includes("#")).length;
  console.log(`${new Date().toISOString()} · ${n} canais lidos`);
  for (const l of resumo) console.log(`   ${l}`);
  if (SITE) {
    try {
      const t = await token();
      if (!t) console.log("   (sem token do GitHub: não envio)");
      else {
        const r = await fetch(`${SITE}/api/distritais/diretos/relay`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ canais: porCanal }), signal: AbortSignal.timeout(30000) });
        console.log(`   enviado ao site: ${r.status} ${(await r.text()).slice(0, 200)}`);
      }
    } catch (e) { console.log(`   não consegui enviar ao site: ${e.message}`); }
  }
  if (Date.now() >= FIM) break;
  await sleep(Math.max(5000, VOLTA - (Date.now() - t0)));
} while (Date.now() < FIM);
