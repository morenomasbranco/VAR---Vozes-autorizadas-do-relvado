import { test } from "node:test";
import assert from "node:assert/strict";
import { paginaDoFacebook, createLogos } from "../server/pt/logos.js";

test("logótipos: a página de Facebook a partir do endereço do clube", () => {
  assert.equal(paginaDoFacebook("https://www.facebook.com/onze.esperancas/"), "onze.esperancas");
  assert.equal(paginaDoFacebook("https://m.facebook.com/AcademicoViseuFC"), "AcademicoViseuFC");
  assert.equal(paginaDoFacebook("https://www.facebook.com/profile.php?id=100064567890123"), "100064567890123");
  assert.equal(paginaDoFacebook("https://www.facebook.com/p/Clube-Desportivo-Cinfaes-100057890123456/"), "100057890123456");
  assert.equal(paginaDoFacebook("https://www.facebook.com/people/Lusitano-FC/100012345678901/"), "100012345678901");
  assert.equal(paginaDoFacebook("facebook.com/sclamego"), "sclamego");
  assert.equal(paginaDoFacebook("https://www.facebook.com/groups/123456"), null);
  assert.equal(paginaDoFacebook("https://www.instagram.com/clube"), null);
  assert.equal(paginaDoFacebook(""), null);
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
function fakeClubes() {
  const lista = { "Lusitano Vildemoinhos": { nome: "Lusitano FCV", facebook: "https://www.facebook.com/lusitanofcv/" }, "Sem Facebook": { nome: "Sem Facebook" }, "Silhueta FC": { nome: "Silhueta", facebook: "https://www.facebook.com/silhueta.fc" } };
  return { encontrar: (nome) => lista[nome] || null };
}

test("logótipos: a imagem vem da Graph API, fica guardada e os clubes sem página ou com a silhueta ficam sem logótipo", async () => {
  const pedidos = [];
  const pedir = async (url) => {
    pedidos.push(url);
    if (url.includes("/lusitanofcv/picture")) return Response.json({ data: { url: "https://scontent.fbcdn.net/lusitano.png", is_silhouette: false } });
    if (url.includes("/silhueta.fc/picture")) return Response.json({ data: { url: "https://scontent.fbcdn.net/s.png", is_silhouette: true } });
    if (url.includes("fbcdn")) return new Response(PNG, { headers: { "content-type": "image/png" } });
    return Response.json({ error: { message: "nada" } }, { status: 400 });
  };
  const l = createLogos({ clubes: fakeClubes(), pedir });
  assert.equal(l.endereco("Lusitano Vildemoinhos", "af-viseu"), "/api/distritais/logo?nome=Lusitano%20Vildemoinhos&org=af-viseu");
  assert.equal(l.endereco("Sem Facebook", "af-viseu"), null);
  assert.equal(l.endereco("Clube desconhecido", "af-viseu"), null);
  const img = await l.logo("Lusitano Vildemoinhos", "af-viseu");
  assert.equal(img.tipo, "image/png");
  assert.deepEqual([...img.buf], [...PNG]);
  assert.match(pedidos[0], /graph\.facebook\.com\/v23\.0\/lusitanofcv\/picture\?type=large&redirect=false/);
  await l.logo("Lusitano Vildemoinhos", "af-viseu");
  assert.equal(pedidos.length, 2); // a segunda vez vem do que ficou guardado
  assert.equal(await l.logo("Silhueta FC", "af-viseu"), null);
  assert.equal(await l.logo("Sem Facebook", "af-viseu"), null);
  assert.equal(l.estado().ok, 1);
  assert.equal(l.estado().semLogo, 1);
});

test("logótipos: um erro da Meta não parte nada (fica sem logótipo e anotado)", async () => {
  const l = createLogos({ clubes: fakeClubes(), pedir: async () => Response.json({ error: { message: "(#100) não" } }, { status: 400 }) });
  assert.equal(await l.logo("Lusitano Vildemoinhos", "af-viseu"), null);
  assert.match(l.estado().ultimoErro.erro, /não/);
});

test("logótipos: se a Meta mandar logo a imagem usa-se essa; um erro volta a ser tentado ao fim de meia hora", async () => {
  let agora = 0;
  let falha = true;
  const pedir = async (url) => {
    if (url.includes("/lusitanofcv/picture")) return falha ? new Response("<html>ups</html>", { headers: { "content-type": "text/html" } }) : new Response(PNG, { headers: { "content-type": "image/png" } });
    return new Response("", { status: 404 });
  };
  const l = createLogos({ clubes: fakeClubes(), pedir, agora: () => agora });
  assert.equal(await l.logo("Lusitano Vildemoinhos", "af-viseu"), null);
  assert.match(l.estado().ultimoErro.erro, /text\/html: <html>ups/);
  falha = false;
  agora += 10 * 60e3;
  assert.equal(await l.logo("Lusitano Vildemoinhos", "af-viseu"), null); // ainda dentro da meia hora
  agora += 25 * 60e3;
  assert.equal((await l.logo("Lusitano Vildemoinhos", "af-viseu")).tipo, "image/png");
});
