// «Ponte»: os pedidos aos sites que bloqueiam servidores de alojamento (FPF, Sofascore, Instagram, Facebook e os
// visualizadores anónimos) podem passar por um Cloudflare Worker gratuito (deploy/ponte-cloudflare.js). O Worker faz
// o pedido a partir dos endereços do Cloudflare, que estes sites bloqueiam muito menos do que os dos alojamentos.
//
//   PONTE_URL=https://var-ponte.<a-tua-conta>.workers.dev   PONTE_CHAVE=a-mesma-chave-que-está-no-Worker
//
// Sem PONTE_URL, tudo vai direto, como antes. PONTE_HOSTS troca a lista de sites que passam pela ponte.
//
// «Ponte de casa»: há sites (a FPF, por exemplo) que também recusam o Cloudflare. Para esses, um computador de casa
// corre o scripts/ponte-casa.js: vai buscando ao servidor os pedidos por fazer (/api/ponte/trabalho), fá-los pela
// ligação de casa e devolve as respostas (/api/ponte/resposta). Enquanto a ponte de casa estiver ligada, os pedidos
// a estes sites passam por ela; quando se desliga, voltam ao Cloudflare (se houver) ou vão diretos.
import crypto from "node:crypto";
const HOSTS = new Set((process.env.PONTE_HOSTS || "resultados.fpf.pt,www.fpf.pt,api.sofascore.com,www.sofascore.com,www.instagram.com,i.instagram.com,www.facebook.com,imginn.com,www.picnob.com,www.pixwox.com,anonyig.com,storiesig.info,fastdl.app")
  .split(/[\s,]+/).filter(Boolean));
const base = () => (process.env.PONTE_URL || "").replace(/\/$/, "");
export const estadoPonte = { pedidos: 0, erros: 0, ultimoErro: null, casa: { ultimoContacto: null, pedidos: 0, erros: 0, ultimoErro: null, pendentes: 0 } };
const doSite = (url) => { try { return HOSTS.has(new URL(url).hostname); } catch { return false; } };
export const passaPelaPonte = (url) => !!base() && doSite(url);

// ───────── ponte de casa ─────────
const PRAZO_CASA_MS = 40e3;
const porFazer = []; // pedidos à espera de um computador de casa
const aEspera = new Map(); // id → { ok, nao, tempo }
const acordar = new Set(); // pedidos do computador de casa à espera de trabalho (long polling)
let contacto = 0;
export const casaLigada = () => Date.now() - contacto < 60e3;
Object.defineProperty(estadoPonte.casa, "ligada", { get: casaLigada, enumerable: true });
const cabecalhosSimples = (h) => (h instanceof Headers ? Object.fromEntries(h) : { ...(h || {}) });
function viaCasa(url, opcoes) {
  estadoPonte.casa.pedidos++;
  return new Promise((ok, nao) => {
    const id = crypto.randomUUID();
    const tempo = setTimeout(() => {
      aEspera.delete(id);
      const i = porFazer.findIndex((t) => t.id === id);
      if (i >= 0) porFazer.splice(i, 1);
      estadoPonte.casa.erros++;
      nao(new Error("a ponte de casa não respondeu em 40 s"));
    }, PRAZO_CASA_MS);
    tempo.unref?.();
    aEspera.set(id, { ok, nao, tempo });
    porFazer.push({ id, url, metodo: opcoes.method || "GET", cabecalhos: cabecalhosSimples(opcoes.headers), redirect: opcoes.redirect || "follow" });
    estadoPonte.casa.pendentes = porFazer.length;
    for (const f of acordar) f();
  });
}

export function rotasPonte(app, express, autorizado) {
  // o computador de casa pede trabalho: devolve logo o que houver, ou espera até 25 s por um pedido novo
  app.get("/api/ponte/trabalho", async (req, res) => {
    if (!autorizado(req)) return res.status(401).json({ erro: "chave PT_TOKEN em falta ou errada" });
    contacto = Date.now();
    estadoPonte.casa.ultimoContacto = contacto;
    const n = Math.min(Number(req.query.n) || 4, 10);
    if (!porFazer.length) {
      await new Promise((r) => { const f = () => { acordar.delete(f); clearTimeout(t); r(); }; const t = setTimeout(f, 25e3); acordar.add(f); res.once?.("close", f); });
    }
    contacto = Date.now();
    const lote = porFazer.splice(0, n);
    estadoPonte.casa.pendentes = porFazer.length;
    res.json(lote);
  });
  // a resposta de um pedido feito em casa
  app.post("/api/ponte/resposta", express.json({ limit: "15mb" }), (req, res) => {
    if (!autorizado(req)) return res.status(401).json({ erro: "chave PT_TOKEN em falta ou errada" });
    contacto = Date.now();
    const { id, status, cabecalhos, corpo, erro } = req.body || {};
    const e = aEspera.get(id);
    if (!e) return res.json({ ok: false, motivo: "fora de prazo" });
    aEspera.delete(id);
    clearTimeout(e.tempo);
    if (erro) {
      estadoPonte.casa.erros++;
      estadoPonte.casa.ultimoErro = { erro, ts: Date.now() };
      e.nao(new Error(`ponte de casa: ${erro}`));
    } else {
      const h = new Headers();
      for (const [k, v] of Object.entries(cabecalhos || {})) if (!/^(content-encoding|content-length|transfer-encoding|set-cookie)$/i.test(k)) h.set(k, v);
      const semCorpo = [101, 204, 205, 304].includes(+status);
      e.ok(new Response(semCorpo ? null : Buffer.from(corpo || "", "base64"), { status: Math.min(599, Math.max(200, +status || 200)), headers: h }));
    }
    res.json({ ok: true });
  });
}

export async function buscar(url, opcoes = {}) {
  if (casaLigada() && doSite(url)) return viaCasa(url, opcoes);
  if (!passaPelaPonte(url)) return fetch(url, opcoes);
  estadoPonte.pedidos++;
  try {
    const r = await fetch(`${base()}/?u=${encodeURIComponent(url)}`, { ...opcoes, headers: { ...(opcoes.headers || {}), "x-ponte-chave": process.env.PONTE_CHAVE || "", ...(opcoes.redirect === "manual" ? { "x-ponte-redirect": "manual" } : {}) } });
    if (r.status === 401 && r.headers.get("x-ponte") === "chave") throw new Error("a ponte recusou a chave (PONTE_CHAVE diferente da do Worker)");
    return r;
  } catch (e) {
    estadoPonte.erros++;
    estadoPonte.ultimoErro = { url, erro: e.message, ts: Date.now() };
    throw e;
  }
}
