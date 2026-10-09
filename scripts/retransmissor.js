// Retransmissor do VAR: corre em casa (computador, Raspberry Pi ou telemóvel Android com o Termux) e faz, pelo
// servidor, os pedidos aos sites que bloqueiam os servidores de alojamento: a FPF (resultados.fpf.pt, www.fpf.pt e
// os sites das associações), o Instagram, o Facebook e o Sofascore. Com ele ligado, a secção Ligas e Federações
// recebe as notícias da FPF no minuto em que saem, as Distritais recebem os posts dos clubes e a vista Portugal
// dos Resultados lê as competições, os jogos e as classificações oficiais de todas as associações.
//
//   VAR_URL=https://o-teu-site PT_TOKEN=a-mesma-chave-do-servidor npm run retransmissor
//
// Também corre sozinho, sem o resto do projeto (Node 22 ou mais recente):  node retransmissor.js
// Variáveis opcionais:
//   RETRANSMISSOR_NOME       nome que aparece no /api/diagnostico (por omissão, o nome do computador)
//   RETRANSMISSOR_PARALELO   pedidos ao mesmo tempo (4)
//   RETRANSMISSOR_HOSTS      sites que este retransmissor aceita fazer (por omissão, só os que bloqueiam o servidor)
//   IG_SESSIONID / FB_COOKIE sessão de Instagram / cookies de Facebook usados aqui, se o servidor não mandar os seus
//
// Não é preciso abrir portas no router: é o retransmissor que se liga ao servidor, e volta a ligar-se sozinho se a
// ligação cair. Só faz pedidos aos sites da lista, por isso o servidor não o pode usar para mais nada.
import os from "node:os";

try { await import("dotenv/config"); } catch { /* sem o dotenv: só as variáveis do sistema */ }

const SITE = (process.env.VAR_URL || "http://localhost:3001").replace(/\/$/, "");
const CHAVE = process.env.RETRANSMISSOR_CHAVE || process.env.PT_TOKEN || process.env.VIDEOS_RELAY_TOKEN;
const NOME = (process.env.RETRANSMISSOR_NOME || os.hostname() || "casa").slice(0, 40);
const PARALELO = Math.max(1, Number(process.env.RETRANSMISSOR_PARALELO) || 4);
const HOSTS = (process.env.RETRANSMISSOR_HOSTS || "*.fpf.pt,api.sofascore.com,www.sofascore.com,www.instagram.com,i.instagram.com,www.facebook.com,m.facebook.com,imginn.com,www.picnob.com,www.pixwox.com,anonyig.com,storiesig.info,fastdl.app,www.ligaportugal.pt,www.zerozero.pt,*.cdninstagram.com,*.fbcdn.net")
  .split(/[\s,]+/).filter(Boolean);
const MAX_BYTES = 20 * 1024 * 1024;
const IG = process.env.IG_SESSIONID ? `sessionid=${process.env.IG_SESSIONID}` : process.env.IG_COOKIE || null;
const FB = process.env.FB_COOKIE || null;

if (!CHAVE) { console.error("Falta a PT_TOKEN (a mesma chave que está nas variáveis do servidor)."); process.exit(1); }

const bate = (h, p) => (p = p.toLowerCase().replace(/^\*\./, "."), h = h.toLowerCase(), p.startsWith(".") ? h === p.slice(1) || h.endsWith(p) : h === p);
const aceita = (url) => { try { const u = new URL(url); return u.protocol === "https:" && HOSTS.some((p) => bate(u.hostname, p)); } catch { return false; } };

// WebSocket: o do próprio Node (22+) ou, se não houver, o pacote «ws» do projeto
let WS = globalThis.WebSocket;
if (!WS) { try { WS = (await import("ws")).default; } catch { console.error("Este Node não tem WebSocket: instala o Node 22 (ou corre «npm install» na pasta do projeto)."); process.exit(1); } }

const conta = { pedidos: 0, erros: 0, bytes: 0, porSite: {} };
const emCurso = new Map(); // id → AbortController
const fila = [];
let aCorrer = 0;
let ws = null;
let espera = 2000;

function enviar(m) { try { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); } catch { /* ligação a fechar */ } }

async function fazer(m) {
  const host = (() => { try { return new URL(m.url).hostname; } catch { return "?"; } })();
  if (!aceita(m.url)) return enviar({ t: "erro", id: m.id, erro: `site não permitido neste retransmissor (${host})`, status: 403 });
  const ctl = new AbortController();
  emCurso.set(m.id, ctl);
  const prazo = setTimeout(() => ctl.abort(), 25e3);
  conta.pedidos++;
  conta.porSite[host] = (conta.porSite[host] || 0) + 1;
  try {
    const headers = {};
    for (const [k, v] of Object.entries(m.headers || {})) if (!/^(host|connection|content-length|accept-encoding|x-ponte.*)$/i.test(k)) headers[k] = v;
    const temCookie = Object.keys(headers).some((k) => /^cookie$/i.test(k));
    if (!temCookie && IG && /(^|\.)instagram\.com$/.test(host)) headers.Cookie = IG;
    if (!temCookie && FB && /(^|\.)facebook\.com$/.test(host)) headers.Cookie = FB;
    const res = await fetch(m.url, {
      method: m.method || "GET", headers, redirect: m.redirect === "manual" ? "manual" : "follow", signal: ctl.signal,
      body: m.corpo && !["GET", "HEAD"].includes(String(m.method || "GET").toUpperCase()) ? Buffer.from(m.corpo, "base64") : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`resposta grande demais (${Math.round(buf.length / 1e6)} MB)`);
    conta.bytes += buf.length;
    const h = {};
    res.headers.forEach((v, k) => { if (k !== "set-cookie") h[k] = v; });
    enviar({ t: "resposta", id: m.id, status: res.status, headers: h, url: res.url || m.url, redirecionado: res.redirected, corpo: buf.length ? buf.toString("base64") : null });
  } catch (e) {
    conta.erros++;
    enviar({ t: "erro", id: m.id, erro: ctl.signal.aborted ? "o site não respondeu a tempo" : e.message });
  } finally {
    clearTimeout(prazo);
    emCurso.delete(m.id);
  }
}

function andar() {
  while (aCorrer < PARALELO && fila.length) {
    const m = fila.shift();
    aCorrer++;
    fazer(m).finally(() => { aCorrer--; andar(); });
  }
}

function ligar() {
  const url = `${SITE.replace(/^http/, "ws")}/api/retransmissor?chave=${encodeURIComponent(CHAVE)}&nome=${encodeURIComponent(NOME)}`;
  ws = new WS(url);
  ws.onopen = () => {
    espera = 2000;
    console.log(`[retransmissor] ligado a ${SITE} como «${NOME}»: a fazer os pedidos à FPF, ao Instagram, ao Facebook e ao Sofascore pelo servidor`);
    enviar({ t: "ola", hosts: HOSTS, versao: 1 });
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString()); } catch { return; }
    if (m.t === "pedido") { fila.push(m); andar(); }
    else if (m.t === "cancelar") { emCurso.get(m.id)?.abort(); const i = fila.findIndex((x) => x.id === m.id); if (i >= 0) fila.splice(i, 1); }
  };
  ws.onclose = (ev) => {
    const motivo = ev?.code === 1006 && espera === 2000 ? "" : ev?.reason ? ` (${ev.reason})` : "";
    console.log(`[retransmissor] ligação fechada${motivo}; volto a ligar daqui a ${Math.round(espera / 1000)} s`);
    fila.length = 0;
    for (const c of emCurso.values()) c.abort();
    setTimeout(ligar, espera);
    espera = Math.min(60e3, espera * 2);
  };
  ws.onerror = (e) => { if (espera >= 16e3) console.log(`[retransmissor] erro na ligação: ${e?.message || e?.error?.message || "sem resposta (a chave está certa? o endereço VAR_URL está certo?)"}`); };
}

setInterval(() => {
  if (!conta.pedidos) return;
  const sites = Object.entries(conta.porSite).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, n]) => `${h} ${n}`).join(", ");
  console.log(`[retransmissor] ${conta.pedidos} pedidos (${conta.erros} com erro, ${(conta.bytes / 1e6).toFixed(1)} MB) nos últimos 5 min: ${sites}`);
  Object.assign(conta, { pedidos: 0, erros: 0, bytes: 0, porSite: {} });
}, 5 * 60e3);

console.log(`[retransmissor] a ligar a ${SITE}…`);
ligar();
