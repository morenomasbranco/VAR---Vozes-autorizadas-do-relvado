// Pedidos aos sites que bloqueiam servidores de alojamento (FPF e os sites das associações, Sofascore, Instagram,
// Facebook e os visualizadores anónimos). Há três caminhos, experimentados por esta ordem:
//
//   1. o retransmissor de casa (server/retransmissor.js + scripts/retransmissor.js): um computador ou telemóvel
//      ligado ao servidor por WebSocket, que faz o pedido a partir de uma ligação de casa. É o mais fiável;
//   2. a ponte no Cloudflare (deploy/ponte-cloudflare.js), um Worker gratuito:
//        PONTE_URL=https://var-ponte.<a-tua-conta>.workers.dev   PONTE_CHAVE=a-mesma-chave-que-está-no-Worker
//   3. direto, do próprio servidor (como antes).
//
// Quando um caminho é recusado por um site (401, 403, 429, 503) ou falha, passa-se ao seguinte, e esse caminho
// fica de lado para esse site durante 15 minutos. Os outros sites vão sempre diretos. PONTE_HOSTS troca a lista
// de sites (aceita «*.fpf.pt» para todos os subdomínios).
import { pedirPeloRetransmissor, retransmissorAceita, hostBate } from "./retransmissor.js";

const HOSTS = (process.env.PONTE_HOSTS || "*.fpf.pt,api.sofascore.com,www.sofascore.com,www.instagram.com,i.instagram.com,www.facebook.com,m.facebook.com,imginn.com,www.picnob.com,www.pixwox.com,anonyig.com,storiesig.info,fastdl.app,www.ligaportugal.pt,www.zerozero.pt")
  .split(/[\s,]+/).filter(Boolean);
const base = () => (process.env.PONTE_URL || "").replace(/\/$/, "");
const hostDe = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
export const bloqueado = (host) => HOSTS.some((p) => hostBate(host, p));

export const estadoPonte = { pedidos: 0, erros: 0, ultimoErro: null };
// por caminho: pedidos, recusas e falhas; por site: o último caminho que funcionou
const rotas = { casa: { pedidos: 0, recusas: 0, falhas: 0 }, ponte: { pedidos: 0, recusas: 0, falhas: 0 }, direto: { pedidos: 0, recusas: 0, falhas: 0 } };
const porSite = {};
const castigo = new Map(); // `${host}|${rota}` → até quando fica de lado
export const estadoEncaminhamento = () => ({ rotas, porSite, deLado: Object.fromEntries([...castigo].filter(([, t]) => t > Date.now()).map(([k, t]) => [k, new Date(t).toISOString()])) });

export const passaPelaPonte = (url) => !!base() && bloqueado(hostDe(url));

const RECUSA = new Set([401, 403, 429, 503]);
const CASTIGO_MS = 15 * 60e3;

async function pelaPonte(url, opcoes) {
  estadoPonte.pedidos++;
  try {
    const r = await fetch(`${base()}/?u=${encodeURIComponent(url)}`, { ...opcoes, headers: { ...(opcoes.headers || {}), "x-ponte-chave": process.env.PONTE_CHAVE || "", ...(opcoes.redirect === "manual" ? { "x-ponte-redirect": "manual" } : {}) } });
    if (r.status === 401 && r.headers?.get?.("x-ponte") === "chave") throw Object.assign(new Error("a ponte recusou a chave (PONTE_CHAVE diferente da do Worker)"), { daPonte: true });
    // o Worker antigo não conhece este site: não é o site a recusar, é a ponte (cola outra vez o deploy/ponte-cloudflare.js)
    if (r.status === 403 && r.headers?.get?.("x-ponte") === "site") throw Object.assign(new Error("a ponte não tem este site na lista (atualiza o Worker)"), { daPonte: true, longo: true });
    // o endereço da resposta é o do Worker: fica o da página pedida (ou aquele para onde o site redirecionou)
    try { Object.defineProperty(r, "url", { value: r.headers?.get?.("x-ponte-url") || url, configurable: true }); } catch { /* resposta sem url */ }
    return r;
  } catch (e) {
    estadoPonte.erros++;
    estadoPonte.ultimoErro = { url, erro: e.message, ts: Date.now() };
    throw e;
  }
}

const CAMINHOS = {
  casa: (url, op) => pedirPeloRetransmissor(url, op),
  ponte: (url, op) => pelaPonte(url, op),
  direto: (url, op) => fetch(url, op),
};

// os caminhos possíveis para este endereço, pela ordem de preferência, sem os que estão de lado
export function caminhos(url, agora = Date.now()) {
  const host = hostDe(url);
  if (!bloqueado(host)) return ["direto"];
  const todos = [retransmissorAceita(url) && "casa", base() && "ponte", "direto"].filter(Boolean);
  const livres = todos.filter((r) => (castigo.get(`${host}|${r}`) || 0) <= agora);
  // todos de lado: experimenta-se só o preferido, para não multiplicar pedidos recusados
  return livres.length ? livres : todos.slice(0, 1);
}

export async function buscar(url, opcoes = {}) {
  const host = hostDe(url);
  const lista = caminhos(url);
  let ultimaResposta = null, ultimoErro = null;
  for (let i = 0; i < lista.length; i++) {
    const r = lista[i];
    const haMais = i + 1 < lista.length;
    rotas[r].pedidos++;
    try {
      const res = await CAMINHOS[r](url, opcoes);
      if (RECUSA.has(res.status) && haMais) {
        rotas[r].recusas++;
        castigo.set(`${host}|${r}`, Date.now() + CASTIGO_MS);
        try { await res.body?.cancel?.(); } catch { /* */ }
        ultimaResposta = res;
        continue;
      }
      if (RECUSA.has(res.status)) rotas[r].recusas++;
      else { castigo.delete(`${host}|${r}`); porSite[host] = { caminho: r, ts: Date.now() }; }
      return res;
    } catch (e) {
      if (e?.name === "AbortError" || e?.name === "TimeoutError" || opcoes.signal?.aborted) throw e; // o prazo de quem pediu acabou
      rotas[r].falhas++;
      ultimoErro = e;
      if (!e?.semRetransmissor) castigo.set(`${host}|${r}`, Date.now() + (e?.longo ? 6 * 3600e3 : CASTIGO_MS));
      if (e?.message?.includes("recusou a chave") && !haMais) throw e;
    }
  }
  if (ultimaResposta) return ultimaResposta;
  throw ultimoErro || new Error("sem caminho para o site");
}
