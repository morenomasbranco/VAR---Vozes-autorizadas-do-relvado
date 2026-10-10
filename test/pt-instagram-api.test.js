import { test } from "node:test";
import assert from "node:assert/strict";

process.env.IG_GRAPH_TOKEN = "chave-teste";
process.env.IG_GRAPH_USER_ID = "17841400000000000";
process.env.IG_GRAPH_POR_HORA = "10";
const { grafoAtivo, descobrir, postsDoGrafo, explicarErro, grafoLivre } = await import("../server/pt/instagram-grafo.js");

test("Instagram (API oficial): a consulta à Business Discovery dá os posts no formato das Distritais", async () => {
  assert.ok(grafoAtivo());
  const original = globalThis.fetch;
  let pedido;
  globalThis.fetch = async (url) => {
    pedido = new URL(url);
    return new Response(JSON.stringify({ business_discovery: { id: "1", username: "fcporto", name: "FC Porto", followers_count: 4600000, media_count: 9000, media: { data: [
      { id: "111", caption: "GOLO! 1-0 ⚽", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/a.jpg", permalink: "https://www.instagram.com/p/AAA/", timestamp: "2026-10-09T18:30:00+0000" },
      { id: "222", caption: "Resumo", media_type: "VIDEO", thumbnail_url: "https://scontent.cdninstagram.com/t.jpg", media_url: "https://x/v.mp4", permalink: "https://www.instagram.com/reel/BBB/", timestamp: "2026-10-09T17:00:00+0000" },
    ] } }, id: "17841400000000000" }), { status: 200, headers: { "x-app-usage": '{"call_count":3}' } });
  };
  try {
    const bd = await descobrir("@fcporto");
    assert.equal(pedido.pathname, "/v23.0/17841400000000000");
    assert.match(pedido.searchParams.get("fields"), /^business_discovery\.username\(fcporto\)\{.*media\.limit\(6\)/);
    assert.equal(pedido.searchParams.get("access_token"), "chave-teste");
    const posts = postsDoGrafo(bd, { instagram: "fcporto", nome: "FC Porto", org: "af-porto" });
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[0], { id: "ig:111", handle: "fcporto", clube: "FC Porto", org: "af-porto", ts: Date.parse("2026-10-09T18:30:00Z"), legenda: "GOLO! 1-0 ⚽", url: "https://www.instagram.com/p/AAA/", img: "https://scontent.cdninstagram.com/a.jpg", video: false });
    assert.equal(posts[1].img, "https://scontent.cdninstagram.com/t.jpg"); // num vídeo, a miniatura
    assert.equal(posts[1].video, true);
  } finally { globalThis.fetch = original; }
});

test("Instagram (API oficial): os erros da Meta vêm explicados (conta pessoal, chave, limite, permissão)", async () => {
  assert.equal(explicarErro({ code: 110, message: "Invalid user id" }).tipo, "pessoal");
  assert.equal(explicarErro({ code: 100, error_subcode: 2207013, message: "The user cannot be found" }).tipo, "pessoal");
  assert.equal(explicarErro({ code: 190, message: "Error validating access token" }).tipo, "chave");
  assert.equal(explicarErro({ code: 4, message: "Application request limit reached" }).tipo, "limite");
  assert.equal(explicarErro({ code: 10, message: "Permission denied" }).tipo, "permissao");
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } }), { status: 400 });
  try {
    await assert.rejects(descobrir("fcporto"), (e) => e.tipo === "chave" && /IG_GRAPH_TOKEN/.test(e.message) && e.meta.code === 190);
  } finally { globalThis.fetch = original; }
});

test("Instagram (API oficial): o servidor não passa do limite de pedidos por hora", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ business_discovery: { media: { data: [] } } }));
  try {
    // os testes anteriores já gastaram 2 dos 10 pedidos desta hora
    for (let i = 0; i < 8; i++) { assert.ok(grafoLivre()); await descobrir(`clube${i}`); }
    assert.equal(grafoLivre(), false);
  } finally { globalThis.fetch = original; }
});
