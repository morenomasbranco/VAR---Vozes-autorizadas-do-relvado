// Retransmissor de casa: a «API própria» do VAR para os sites que bloqueiam os servidores de alojamento.
//
// A FPF (resultados.fpf.pt, www.fpf.pt e os sites das associações), o Instagram, o Facebook e o Sofascore recusam
// os pedidos que vêm de servidores de alojamento (Northflank, Oracle…) e, muitas vezes, também os que vêm do
// Cloudflare. De uma ligação de casa (ou de um telemóvel), respondem normalmente. O retransmissor é um pequeno
// programa (scripts/retransmissor.js) que corre num computador de casa, num Raspberry Pi ou num telemóvel Android
// (Termux): liga-se ao servidor por WebSocket e faz por ele os pedidos a esses sites, em tempo real.
//
// Não é preciso abrir portas no router: é o retransmissor que se liga ao servidor. Cada pedido segue pela ligação
// aberta e a resposta volta pelo mesmo caminho, em poucas centenas de milissegundos. Todos os leitores do servidor
// que já usam a ponte (server/ponte.js) passam a usar o retransmissor sem mais nada: as notícias da FPF, as
// competições e os resultados das distritais, os posts do Instagram e do Facebook dos clubes, os stories.
//
// Chave: a mesma PT_TOKEN do retransmissor dos stories (ou RETRANSMISSOR_CHAVE). Sem chave, não aceita ligações.
import crypto from "node:crypto";

const CAMINHO = "/api/retransmissor";
const PRAZO_MS = 30e3;
const chave = () => process.env.RETRANSMISSOR_CHAVE || process.env.PT_TOKEN || process.env.VIDEOS_RELAY_TOKEN || "";

const ligacoes = new Set(); // { ws, nome, desde, pedidos, erros, aCorrer }
const pendentes = new Map(); // id → { resolve, reject, temporizador, lig }
const ouvintes = new Set();
export const estadoRetransmissor = { pedidos: 0, erros: 0, ultimoOk: null, ultimoErro: null, ligacoesTotal: 0, ultimaLigacao: null, ultimaSaida: null };

export const retransmissorLigado = () => [...ligacoes].some((l) => l.ws.readyState === 1);
// chamado quando um retransmissor se liga (por exemplo, para voltar a ler a FPF logo)
export const aoLigarRetransmissor = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

export function resumoRetransmissor() {
  return {
    ligado: retransmissorLigado(),
    chave: !!chave(),
    ligacoes: [...ligacoes].map((l) => ({ nome: l.nome, desde: l.desde, browser: !!l.browser, sessoes: l.sessoes || null, pedidos: l.pedidos, erros: l.erros, aCorrer: l.aCorrer, hosts: l.hosts || null })),
    ...estadoRetransmissor,
  };
}

// o retransmissor com menos pedidos em curso (e que aceite este site)
function escolher(host) {
  const vivas = [...ligacoes].filter((l) => l.ws.readyState === 1 && (!l.hosts || l.hosts.some((h) => hostBate(host, h))));
  return vivas.sort((a, b) => a.aCorrer - b.aCorrer)[0] || null;
}
// «*.fpf.pt» ou «.fpf.pt» servem para todos os subdomínios
export function hostBate(host, padrao) {
  const p = String(padrao || "").toLowerCase().replace(/^\*\./, ".");
  const h = String(host || "").toLowerCase();
  return p.startsWith(".") ? h === p.slice(1) || h.endsWith(p) : h === p;
}
export const retransmissorAceita = (url) => { try { return !!escolher(new URL(url).hostname); } catch { return false; } };

// cabeçalhos do pedido num objeto simples (Headers, lista de pares ou objeto)
const objetoDe = (h) => (!h ? {} : typeof h.entries === "function" && !Array.isArray(h) ? Object.fromEntries(h.entries()) : Array.isArray(h) ? Object.fromEntries(h) : { ...h });

// faz o pedido pelo retransmissor e devolve uma Response, como o fetch
export function pedirPeloRetransmissor(url, opcoes = {}) {
  let host;
  try { host = new URL(url).hostname; } catch { return Promise.reject(new Error("endereço inválido")); }
  const lig = escolher(host);
  if (!lig) return Promise.reject(Object.assign(new Error("nenhum retransmissor ligado"), { semRetransmissor: true }));
  if (opcoes.signal?.aborted) return Promise.reject(Object.assign(new Error("pedido cancelado"), { name: "AbortError" }));
  const id = crypto.randomUUID();
  estadoRetransmissor.pedidos++;
  lig.pedidos++;
  lig.aCorrer++;
  return new Promise((resolve, reject) => {
    const fim = (erro, valor) => {
      const p = pendentes.get(id);
      if (!p) return;
      pendentes.delete(id);
      clearTimeout(p.temporizador);
      lig.aCorrer = Math.max(0, lig.aCorrer - 1);
      if (opcoes.signal) opcoes.signal.removeEventListener?.("abort", abortar);
      if (erro) {
        lig.erros++;
        estadoRetransmissor.erros++;
        estadoRetransmissor.ultimoErro = { url, erro: erro.message, ts: Date.now() };
        reject(erro);
      } else {
        estadoRetransmissor.ultimoOk = Date.now();
        resolve(valor);
      }
    };
    const abortar = () => { fim(Object.assign(new Error("pedido cancelado"), { name: "AbortError" })); try { lig.ws.send(JSON.stringify({ t: "cancelar", id })); } catch { /* fechado */ } };
    opcoes.signal?.addEventListener?.("abort", abortar, { once: true });
    const temporizador = setTimeout(() => fim(new Error(`o retransmissor não respondeu em ${PRAZO_MS / 1000} s`)), PRAZO_MS);
    temporizador.unref?.();
    pendentes.set(id, { lig, temporizador, fim });
    let corpo;
    if (opcoes.body != null && !["GET", "HEAD"].includes(String(opcoes.method || "GET").toUpperCase())) {
      corpo = Buffer.from(typeof opcoes.body === "string" ? opcoes.body : opcoes.body instanceof Uint8Array ? opcoes.body : String(opcoes.body)).toString("base64");
    }
    try {
      lig.ws.send(JSON.stringify({ t: "pedido", id, url, method: opcoes.method || "GET", headers: objetoDe(opcoes.headers), corpo, redirect: opcoes.redirect || "follow" }));
    } catch (e) { fim(e); }
  });
}

// a resposta que chega do retransmissor, como uma Response do fetch
export function respostaDe(m) {
  const status = Number(m.status) || 502;
  const corpo = m.corpo ? Buffer.from(m.corpo, "base64") : null;
  const semCorpo = [101, 204, 205, 304].includes(status) || status < 200;
  const headers = new Headers();
  for (const [k, v] of Object.entries(m.headers || {})) {
    if (/^(content-encoding|content-length|transfer-encoding|connection)$/i.test(k)) continue; // o corpo já vem descomprimido
    try { headers.set(k, String(v)); } catch { /* cabeçalho estranho */ }
  }
  const res = new Response(semCorpo ? null : corpo, { status: status < 200 ? 502 : status, headers });
  Object.defineProperty(res, "url", { value: m.url || "" });
  Object.defineProperty(res, "redirected", { value: !!m.redirecionado });
  return res;
}

// uma ligação aberta (o WebSocket do retransmissor, ou um objeto com send/on nos testes)
export function registar(ws, nome = "casa", { log = () => {} } = {}) {
  const lig = { ws, nome: String(nome || "casa").slice(0, 40), desde: Date.now(), pedidos: 0, erros: 0, aCorrer: 0, hosts: null, vivo: true };
  ligacoes.add(lig);
  estadoRetransmissor.ligacoesTotal++;
  estadoRetransmissor.ultimaLigacao = Date.now();
  log(`[Retransmissor] «${lig.nome}» ligado (${ligacoes.size} ligado${ligacoes.size > 1 ? "s" : ""}): os sites que bloqueiam o servidor passam a ser lidos por ele`);
  lig.receber = (dados) => {
    let m;
    try { m = typeof dados === "object" && !Buffer.isBuffer(dados) ? dados : JSON.parse(String(dados)); } catch { return; }
    if (!m || typeof m !== "object") return;
    if (m.t === "ola") {
      if (Array.isArray(m.hosts) && m.hosts.length) lig.hosts = m.hosts.map(String).slice(0, 200);
      // o retransmissor com browser diz se tem as contas de Instagram e de Facebook com sessão iniciada
      lig.browser = !!m.browser;
      lig.sessoes = m.sessoes && typeof m.sessoes === "object" ? { instagram: !!m.sessoes.instagram, facebook: !!m.sessoes.facebook } : null;
      return;
    }
    const p = pendentes.get(m.id);
    if (!p || p.lig !== lig) return;
    if (m.t === "resposta") p.fim(null, respostaDe(m));
    else if (m.t === "erro") p.fim(Object.assign(new Error(`retransmissor: ${m.erro || "falhou"}`), { status: m.status || 0 }));
  };
  lig.sair = () => {
    if (!ligacoes.delete(lig)) return;
    estadoRetransmissor.ultimaSaida = Date.now();
    for (const p of [...pendentes.values()]) if (p.lig === lig) p.fim(new Error("o retransmissor desligou-se"));
    log(`[Retransmissor] «${lig.nome}» desligado (${lig.pedidos} pedidos feitos)`);
  };
  for (const fn of ouvintes) { try { fn(lig); } catch { /* */ } }
  return lig;
}

export async function ligarRetransmissor(servidorHttp, { log = () => {} } = {}) {
  // o pacote «ws» só é carregado aqui: o resto do servidor (e os testes) não precisam dele
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ noServer: true, maxPayload: 25 * 1024 * 1024 });
  servidorHttp.on("upgrade", (req, socket, cabeca) => {
    let u;
    try { u = new URL(req.url, "http://x"); } catch { return; }
    if (u.pathname !== CAMINHO) return; // outros WebSockets (se houver) não são connosco
    const dada = u.searchParams.get("chave") || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const certa = chave();
    const igual = certa && dada.length === certa.length && crypto.timingSafeEqual(Buffer.from(dada), Buffer.from(certa));
    if (!igual) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      log(`[Retransmissor] ligação recusada: ${certa ? "chave errada" : "falta a PT_TOKEN no servidor"}`);
      return;
    }
    wss.handleUpgrade(req, socket, cabeca, (ws) => wss.emit("connection", ws, req, u));
  });

  wss.on("connection", (ws, req, u) => {
    const lig = registar(ws, u.searchParams.get("nome"), { log });
    ws.on("pong", () => { lig.vivo = true; });
    ws.on("message", (dados) => lig.receber(dados));
    ws.on("close", lig.sair);
    ws.on("error", lig.sair);
  });

  // batimento: uma ligação que não responde em 30 s é fechada (o retransmissor volta a ligar-se sozinho)
  setInterval(() => {
    for (const l of ligacoes) {
      if (!l.ws.ping) continue;
      if (!l.vivo) { try { l.ws.terminate(); } catch { /* */ } l.sair(); continue; }
      l.vivo = false;
      try { l.ws.ping(); } catch { /* */ }
    }
  }, 30e3).unref();
  if (!chave()) log("[Retransmissor] sem PT_TOKEN no servidor: o retransmissor de casa não se pode ligar");
  return wss;
}
