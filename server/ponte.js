// Pedidos aos sites que bloqueiam servidores de alojamento (FPF e os sites das associações, Sofascore, Instagram,
// Facebook e os visualizadores anónimos). Todos os caminhos são gratuitos e são experimentados por esta ordem:
//
//   1. o retransmissor de casa (server/retransmissor.js + scripts/retransmissor.js), se houver um ligado: um
//      computador ou um telemóvel antigo, que faz o pedido a partir de uma ligação de casa;
//   2. as pontes em serviços gratuitos, que não precisam de nenhum aparelho ligado:
//        - Cloudflare Worker (deploy/ponte-cloudflare.js) e/ou Netlify Function (netlify/functions/ponte.mjs):
//            PONTE_URL=https://var-ponte.<conta>.workers.dev,https://<site>.netlify.app/ponte   PONTE_CHAVE=…
//        - Google Apps Script (deploy/ponte-google.gs), que sai pelos endereços da Google:
//            PONTE_GOOGLE_URL=https://script.google.com/macros/s/…/exec   PONTE_GOOGLE_CHAVE=…
//      Cada uma tem o seu limite diário do plano gratuito, e o servidor não passa dele;
//   3. direto, do próprio servidor (como antes).
//
// Quando um caminho é recusado por um site (401, 403, 429, 503) ou falha, passa-se ao seguinte, e esse caminho
// fica de lado para esse site durante 15 minutos. O site de cada caminho que funcionou fica em porSite.
// Os outros sites vão sempre diretos. PONTE_HOSTS troca a lista de sites (aceita «*.fpf.pt»).
import { pedirPeloRetransmissor, retransmissorAceita, hostBate, respostaDe } from "./retransmissor.js";

const HOSTS = (process.env.PONTE_HOSTS || "*.fpf.pt,api.sofascore.com,www.sofascore.com,www.instagram.com,i.instagram.com,www.facebook.com,m.facebook.com,imginn.com,www.picnob.com,www.pixwox.com,anonyig.com,storiesig.info,fastdl.app,www.ligaportugal.pt,www.zerozero.pt")
  .split(/[\s,]+/).filter(Boolean);
const hostDe = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
export const bloqueado = (host) => HOSTS.some((p) => hostBate(host, p));

// as pontes configuradas: cada endereço de PONTE_URL (Cloudflare, Netlify…) e a do Google Apps Script
// limite por dia: o do plano gratuito de cada serviço, com margem
function pontes() {
  const out = (process.env.PONTE_URL || "").split(/[\s,]+/).filter(Boolean).map((u, i) => {
    const url = u.replace(/\/$/, "");
    const netlify = /netlify\.(app|com)/i.test(url);
    return { id: i ? `ponte${i + 1}` : "ponte", tipo: "worker", url, nome: netlify ? "Netlify" : /workers\.dev/i.test(url) ? "Cloudflare" : "ponte", limite: Number(process.env[`PONTE${i ? i + 1 : ""}_DIA`]) || (netlify ? 3500 : 90000) };
  });
  if (process.env.PONTE_GOOGLE_URL) out.push({ id: "google", tipo: "google", url: process.env.PONTE_GOOGLE_URL, nome: "Google Apps Script", limite: Number(process.env.PONTE_GOOGLE_DIA) || 18000 });
  return out;
}

export const estadoPonte = { pedidos: 0, erros: 0, ultimoErro: null };
// por caminho: pedidos, recusas, falhas e pedidos de hoje; por site: o último caminho que funcionou
const rotas = {};
const rota = (id) => (rotas[id] ||= { pedidos: 0, recusas: 0, falhas: 0, hoje: 0, dia: null });
const porSite = {};
const castigo = new Map(); // `${host}|${rota}` → até quando fica de lado
const erros = {}; // `${host}|${rota}` → a última coisa que correu mal (para o /api/retransmissor dizer porquê)
const anotar = (host, id, erro) => { erros[`${host}|${id}`] = { erro: String(erro).slice(0, 200), ts: new Date().toISOString() }; };
const diaHoje = () => new Date().toISOString().slice(0, 10);
const usadosHoje = (id) => { const r = rota(id); if (r.dia !== diaHoje()) { r.dia = diaHoje(); r.hoje = 0; } return r.hoje; };
export const estadoEncaminhamento = () => ({
  pontes: pontes().map((p) => ({ id: p.id, nome: p.nome, limiteDia: p.limite, hoje: usadosHoje(p.id) })),
  rotas, porSite,
  deLado: Object.fromEntries([...castigo].filter(([, t]) => t > Date.now()).map(([k, t]) => [k, new Date(t).toISOString()])),
  erros: Object.fromEntries(Object.entries(erros).filter(([, e]) => Date.now() - Date.parse(e.ts) < 6 * 3600e3)),
});

export const temPontes = () => pontes().length > 0;
export const passaPelaPonte = (url) => temPontes() && bloqueado(hostDe(url));
// a FPF (notícias, comunicados, resultados) é o que mais importa: o Instagram, o Facebook e os outros sites só
// podem gastar 70% do limite diário de cada ponte, e os outros 30% ficam guardados para a FPF
const RESERVA_FPF = 0.3;
const eFpf = (host) => hostBate(host, "*.fpf.pt");

const RECUSA = new Set([401, 403, 429, 503]);
const CASTIGO_MS = 15 * 60e3;
// um caminho que não responde (alguns sites deixam os pedidos pendurados em vez de recusar) não pode gastar o prazo
// todo de quem pediu: cada caminho tem o seu prazo e, se o passar, fica de lado e passa-se ao seguinte
const PRAZO_CAMINHO_MS = Math.max(3, Number(process.env.PONTE_PRAZO_SEGUNDOS) || 8) * 1000;
// o Google Apps Script é mais lento a arrancar (o pedido passa por dois servidores da Google antes de sair)
const PRAZO_GOOGLE_MS = Math.max(5, Number(process.env.PONTE_GOOGLE_PRAZO_SEGUNDOS) || 20) * 1000;
const prazoDe = (c) => (c.tipo === "google" ? PRAZO_GOOGLE_MS : PRAZO_CAMINHO_MS);
const erroPonte = (msg, extra = {}) => Object.assign(new Error(msg), { daPonte: true, ...extra });
const cabecalhos = (h) => (!h ? {} : typeof h.entries === "function" && !Array.isArray(h) ? Object.fromEntries(h.entries()) : Array.isArray(h) ? Object.fromEntries(h) : { ...h });

// Cloudflare Worker ou Netlify Function: GET/POST para ?u=<endereço>, com a chave num cabeçalho
async function pelaPonte(p, url, opcoes) {
  estadoPonte.pedidos++;
  try {
    const sep = p.url.includes("?") ? "&" : /\/\/[^/]+$/.test(p.url) ? "/?" : "?"; // «https://x.workers.dev» → «…/?u=»
    const r = await fetch(`${p.url}${sep}u=${encodeURIComponent(url)}`, { ...opcoes, headers: { ...cabecalhos(opcoes.headers), "x-ponte-chave": process.env.PONTE_CHAVE || "", ...(opcoes.redirect === "manual" ? { "x-ponte-redirect": "manual" } : {}) } });
    if (r.status === 401 && r.headers?.get?.("x-ponte") === "chave") throw erroPonte(`a ponte ${p.nome} recusou a chave (PONTE_CHAVE diferente da do ${p.nome})`, { longo: true });
    // a ponte não conhece este site: não é o site a recusar, é a ponte (cola outra vez o código da ponte)
    if (r.status === 403 && r.headers?.get?.("x-ponte") === "site") throw erroPonte(`a ponte ${p.nome} não tem este site na lista (atualiza o código dela)`, { longo: true });
    // o endereço da resposta é o da ponte: fica o da página pedida (ou aquele para onde o site redirecionou)
    try { Object.defineProperty(r, "url", { value: r.headers?.get?.("x-ponte-url") || url, configurable: true }); } catch { /* resposta sem url */ }
    return r;
  } catch (e) {
    estadoPonte.erros++;
    estadoPonte.ultimoErro = { ponte: p.nome, url, erro: e.message, ts: Date.now() };
    throw e;
  }
}

// Google Apps Script: POST com o pedido em JSON; a resposta vem em JSON (estado, cabeçalhos, endereço, corpo)
async function peloGoogle(p, url, opcoes) {
  estadoPonte.pedidos++;
  try {
    const metodo = String(opcoes.method || "GET").toUpperCase();
    const corpo = opcoes.body != null && !["GET", "HEAD"].includes(metodo) ? Buffer.from(typeof opcoes.body === "string" || opcoes.body instanceof Uint8Array ? opcoes.body : String(opcoes.body)).toString("base64") : undefined;
    const r = await fetch(p.url, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow", signal: opcoes.signal,
      body: JSON.stringify({ chave: process.env.PONTE_GOOGLE_CHAVE || process.env.PONTE_CHAVE || "", u: url, metodo, cabecalhos: cabecalhos(opcoes.headers), corpo, redirect: opcoes.redirect || "follow" }),
    });
    const j = await r.json().catch(() => null);
    if (!j) throw erroPonte(`a ponte do Google respondeu ${r.status} sem JSON (está publicada como «Aplicação Web», com acesso «Qualquer pessoa»?)`, { longo: r.status === 404 || r.status === 401 });
    if (j.erro === "chave") throw erroPonte("a ponte do Google recusou a chave (PONTE_GOOGLE_CHAVE diferente da CHAVE do script)", { longo: true });
    if (j.erro === "site") throw erroPonte("a ponte do Google não tem este site na lista (atualiza o script)", { longo: true });
    if (j.erro) throw erroPonte(`ponte do Google: ${j.erro}`, { quota: /quota|limit|too many/i.test(j.erro) });
    return respostaDe(j);
  } catch (e) {
    estadoPonte.erros++;
    estadoPonte.ultimoErro = { ponte: p.nome, url, erro: e.message, ts: Date.now() };
    throw e;
  }
}

// os caminhos possíveis para este endereço, pela ordem de preferência, sem os que estão de lado nem os que já
// gastaram o limite do dia
export function caminhos(url, agora = Date.now()) {
  const host = hostDe(url);
  if (!bloqueado(host)) return [{ id: "direto" }];
  const todos = [
    retransmissorAceita(url) && { id: "casa" },
    ...pontes().filter((p) => usadosHoje(p.id) < p.limite * (eFpf(host) ? 1 : 1 - RESERVA_FPF)),
    { id: "direto" },
  ].filter(Boolean);
  const livres = todos.filter((r) => (castigo.get(`${host}|${r.id}`) || 0) <= agora);
  // todos de lado: experimenta-se só o preferido, para não multiplicar pedidos recusados
  return livres.length ? livres : todos.slice(0, 1);
}

function fazer(c, url, opcoes) {
  if (c.id === "casa") return pedirPeloRetransmissor(url, opcoes);
  if (c.id === "direto") return fetch(url, opcoes);
  rota(c.id).hoje = usadosHoje(c.id) + 1;
  return c.tipo === "google" ? peloGoogle(c, url, opcoes) : pelaPonte(c, url, opcoes);
}

export async function buscar(url, opcoes = {}) {
  const host = hostDe(url);
  const lista = caminhos(url);
  let ultimaResposta = null, ultimoErro = null;
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    const haMais = i + 1 < lista.length;
    rota(c.id).pedidos++;
    // o último caminho fica com o prazo de quem pediu; os outros, com o seu
    // (o temporizador para assim que a resposta chega, para não cortar a leitura de uma página grande)
    const ctl = haMais ? new AbortController() : null;
    const temporizador = ctl && setTimeout(() => ctl.abort(Object.assign(new Error("sem resposta"), { name: "TimeoutError" })), prazoDe(c));
    const prazo = ctl?.signal;
    const signal = prazo ? (opcoes.signal ? AbortSignal.any([opcoes.signal, prazo]) : prazo) : opcoes.signal;
    try {
      const res = await fazer(c, url, { ...opcoes, signal }).finally(() => clearTimeout(temporizador));
      if (RECUSA.has(res.status)) anotar(host, c.id, `o site respondeu ${res.status}`);
      if (RECUSA.has(res.status) && haMais) {
        rota(c.id).recusas++;
        castigo.set(`${host}|${c.id}`, Date.now() + CASTIGO_MS);
        try { await res.body?.cancel?.(); } catch { /* */ }
        ultimaResposta = res;
        continue;
      }
      if (RECUSA.has(res.status)) rota(c.id).recusas++;
      else { castigo.delete(`${host}|${c.id}`); porSite[host] = { caminho: c.nome || c.id, ts: Date.now() }; }
      return res;
    } catch (e) {
      if (opcoes.signal?.aborted) { anotar(host, c.id, "acabou o prazo de quem pediu antes de esta via responder"); throw e; }
      rota(c.id).falhas++;
      ultimoErro = prazo?.aborted ? Object.assign(new Error(`${c.nome || c.id}: sem resposta em ${prazoDe(c) / 1000} s`), { status: 0 }) : e;
      anotar(host, c.id, ultimoErro.message);
      if (e?.quota && c.id !== "casa" && c.id !== "direto") rota(c.id).hoje = Infinity; // a quota do dia acabou nesse serviço
      else if (!e?.semRetransmissor) castigo.set(`${host}|${c.id}`, Date.now() + (e?.longo ? 6 * 3600e3 : CASTIGO_MS));
    }
  }
  if (ultimaResposta) return ultimaResposta;
  throw ultimoErro || new Error("sem caminho para o site");
}

// Teste à mão (/api/retransmissor/testar?u=…): experimenta cada caminho para um endereço, sem mexer no que fica de
// lado, e diz o que cada um respondeu e quanto demorou
export async function testarCaminhos(url) {
  const host = hostDe(url);
  if (!bloqueado(host)) throw new Error(`${host || "esse endereço"} não está na lista dos sites que passam pelas pontes`);
  const todos = [retransmissorAceita(url) && { id: "casa", nome: "retransmissor de casa" }, ...pontes(), { id: "direto", nome: "direto do servidor" }].filter(Boolean);
  const out = [];
  for (const c of todos) {
    const t = Date.now();
    try {
      const res = await fazer(c, url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", Accept: "text/html,application/json,*/*", "Accept-Language": "pt-PT,pt;q=0.9" }, signal: AbortSignal.timeout(30000) });
      const texto = await res.text();
      const titulo = texto.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
      out.push({ via: c.nome || c.id, estado: res.status, ok: res.ok, ms: Date.now() - t, tamanho: texto.length, titulo: titulo?.slice(0, 120) || undefined, inicio: titulo ? undefined : texto.replace(/\s+/g, " ").slice(0, 160) });
    } catch (e) {
      out.push({ via: c.nome || c.id, erro: e.message, ms: Date.now() - t });
    }
  }
  return out;
}
