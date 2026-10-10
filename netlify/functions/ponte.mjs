// Ponte do VAR no Netlify (Functions, plano gratuito: 125 000 pedidos por mês). Faz o mesmo que a ponte do
// Cloudflare (deploy/ponte-cloudflare.js), mas sai pelos endereços do Netlify: o servidor experimenta as duas, e
// fica com a que o site aceitar. É publicada com o site, sem mais nada: basta pôr no Netlify a variável
// PONTE_CHAVE (a mesma do servidor) e, no servidor, juntar https://<o-teu-site>.netlify.app/ponte ao PONTE_URL.
// Só aceita pedidos com a chave e só para estes sites.
const SITES = [
  ".fpf.pt", "api.sofascore.com", "www.sofascore.com",
  "www.instagram.com", "i.instagram.com", "www.facebook.com", "m.facebook.com",
  "imginn.com", "www.picnob.com", "www.pixwox.com", "anonyig.com", "storiesig.info", "fastdl.app",
  "www.ligaportugal.pt", "www.zerozero.pt",
  "www.youtube.com", // os diretos e os agendados dos canais das associações (secção Distritais)
];
const permitido = (h) => SITES.some((s) => (s.startsWith(".") ? h === s.slice(1) || h.endsWith(s) : h === s));

export default async (pedido) => {
  const chave = process.env.PONTE_CHAVE || "";
  if (!chave || pedido.headers.get("x-ponte-chave") !== chave) return new Response("chave errada", { status: 401, headers: { "x-ponte": "chave" } });
  let url;
  try { url = new URL(new URL(pedido.url).searchParams.get("u")); } catch { return new Response("endereço inválido", { status: 400 }); }
  if (url.protocol !== "https:" || !permitido(url.hostname)) return new Response("site não permitido", { status: 403, headers: { "x-ponte": "site" } });
  const cab = new Headers();
  for (const [k, v] of pedido.headers) {
    if (/^(x-ponte|x-nf-|x-forwarded|x-real-ip|x-country|client-ip|cf-|host$|connection$|content-length$|accept-encoding$)/i.test(k)) continue;
    cab.set(k, v);
  }
  const r = await fetch(url, {
    method: pedido.method, headers: cab,
    body: ["GET", "HEAD"].includes(pedido.method) ? undefined : await pedido.arrayBuffer(),
    redirect: pedido.headers.get("x-ponte-redirect") === "manual" ? "manual" : "follow",
    signal: AbortSignal.timeout(9000), // o plano gratuito corta as funções aos 10 s
  });
  const h = new Headers();
  for (const [k, v] of r.headers) if (!/^(set-cookie|content-encoding|content-length|transfer-encoding)$/i.test(k)) h.set(k, v);
  h.set("x-ponte", "ok");
  h.set("x-ponte-url", r.url || url.href);
  return new Response(await r.arrayBuffer(), { status: r.status, headers: h });
};

export const config = { path: "/ponte" };
