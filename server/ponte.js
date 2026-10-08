// «Ponte»: os pedidos aos sites que bloqueiam servidores de alojamento (FPF, Sofascore, Instagram, Facebook e os
// visualizadores anónimos) podem passar por um Cloudflare Worker gratuito (deploy/ponte-cloudflare.js). O Worker faz
// o pedido a partir dos endereços do Cloudflare, que estes sites bloqueiam muito menos do que os dos alojamentos.
//
//   PONTE_URL=https://var-ponte.<a-tua-conta>.workers.dev   PONTE_CHAVE=a-mesma-chave-que-está-no-Worker
//
// Sem PONTE_URL, tudo vai direto, como antes. PONTE_HOSTS troca a lista de sites que passam pela ponte.
const HOSTS = new Set((process.env.PONTE_HOSTS || "resultados.fpf.pt,www.fpf.pt,api.sofascore.com,www.sofascore.com,www.instagram.com,i.instagram.com,www.facebook.com,imginn.com,www.picnob.com,www.pixwox.com,anonyig.com,storiesig.info,fastdl.app")
  .split(/[\s,]+/).filter(Boolean));
const base = () => (process.env.PONTE_URL || "").replace(/\/$/, "");
export const estadoPonte = { pedidos: 0, erros: 0, ultimoErro: null };
export const passaPelaPonte = (url) => { try { return !!base() && HOSTS.has(new URL(url).hostname); } catch { return false; } };

export async function buscar(url, opcoes = {}) {
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
