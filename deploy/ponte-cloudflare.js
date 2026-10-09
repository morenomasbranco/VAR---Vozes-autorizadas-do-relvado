// Ponte do VAR no Cloudflare (Workers, plano gratuito: 100 000 pedidos por dia).
// Os sites dos resultados e das redes sociais bloqueiam os servidores de alojamento; este Worker faz os pedidos
// por eles, a partir dos endereços do Cloudflare. Só aceita pedidos com a chave abaixo e só para estes sites.
//
// 1. Muda a CHAVE para um texto só teu (e põe o mesmo texto no servidor, na variável PONTE_CHAVE).
// 2. Cola este ficheiro inteiro no editor do Worker e carrega em «Deploy». Ver deploy/GUIA-PONTE.md.
const CHAVE = "muda-esta-chave";

// «.fpf.pt» serve para todos os sites da FPF: resultados.fpf.pt, www.fpf.pt e os das associações (afporto.fpf.pt…)
const SITES = [
  ".fpf.pt", "api.sofascore.com", "www.sofascore.com",
  "www.instagram.com", "i.instagram.com", "www.facebook.com", "m.facebook.com",
  "imginn.com", "www.picnob.com", "www.pixwox.com", "anonyig.com", "storiesig.info", "fastdl.app",
  "www.ligaportugal.pt", "www.zerozero.pt",
];
const permitido = (h) => SITES.some((s) => (s.startsWith(".") ? h === s.slice(1) || h.endsWith(s) : h === s));

export default {
  async fetch(pedido) {
    const aqui = new URL(pedido.url);
    const alvo = aqui.searchParams.get("u");
    if (pedido.headers.get("x-ponte-chave") !== CHAVE || CHAVE === "muda-esta-chave") {
      return new Response("chave errada", { status: 401, headers: { "x-ponte": "chave" } });
    }
    let url;
    try { url = new URL(alvo); } catch { return new Response("endereço inválido", { status: 400 }); }
    if (!permitido(url.hostname)) return new Response("site não permitido", { status: 403, headers: { "x-ponte": "site" } });
    // os cabeçalhos do servidor (navegador, idioma, sessão do Instagram…) seguem; os da ponte e do Cloudflare não
    const cab = new Headers();
    for (const [k, v] of pedido.headers) {
      if (/^(x-ponte|cf-|x-forwarded|x-real-ip|host$|connection$|content-length$)/i.test(k)) continue;
      cab.set(k, v);
    }
    const r = await fetch(url.toString(), {
      method: pedido.method,
      headers: cab,
      body: ["GET", "HEAD"].includes(pedido.method) ? undefined : pedido.body,
      redirect: pedido.headers.get("x-ponte-redirect") === "manual" ? "manual" : "follow",
    });
    const h = new Headers(r.headers);
    h.delete("set-cookie");
    h.set("x-ponte", "ok");
    h.set("x-ponte-url", r.url || url.toString()); // o endereço final, depois dos redirecionamentos
    return new Response(r.body, { status: r.status, headers: h });
  },
};
