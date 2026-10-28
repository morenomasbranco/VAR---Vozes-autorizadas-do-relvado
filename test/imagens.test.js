import { test } from "node:test";
import assert from "node:assert/strict";
import { imagemDaPagina, imagemDoTelegram, imagemDoFx, createImagens } from "../server/imagens.js";

test("imagens: a imagem de partilha de uma página, de um post do Telegram e de um post do X", () => {
  assert.equal(imagemDaPagina('<meta property="og:image" content="/fotos/a.jpg">', "https://www.record.pt/futebol/x"), "https://www.record.pt/fotos/a.jpg");
  assert.equal(imagemDaPagina('<meta content="https://cdn.x.pt/b.webp" name="twitter:image">', "https://x.pt"), "https://cdn.x.pt/b.webp");
  assert.equal(imagemDaPagina("<p>sem imagem</p>", "https://x.pt"), null);
  assert.equal(imagemDoTelegram(`<a class="tgme_widget_message_photo_wrap 1" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/abc.jpg')"></a>`), "https://cdn4.telesco.pe/file/abc.jpg");
  assert.equal(imagemDoFx({ tweet: { media: { photos: [{ url: "https://pbs.twimg.com/media/x.jpg" }] } } }), "https://pbs.twimg.com/media/x.jpg");
  assert.equal(imagemDoFx({ tweet: { media: { videos: [{ thumbnail_url: "https://pbs.twimg.com/v.jpg" }] } } }), "https://pbs.twimg.com/v.jpg");
  assert.equal(imagemDoFx({ tweet: {} }), null);
});

test("imagens: tenta a fonte principal e as que confirmaram; guarda a imagem e o «sem imagem»", async () => {
  const original = globalThis.fetch;
  const pedidos = [];
  const jpeg = Buffer.alloc(5000, 1);
  globalThis.fetch = async (url) => {
    pedidos.push(String(url));
    const u = String(url);
    if (u.includes("api.fxtwitter.com")) return { ok: true, url: u, text: async () => JSON.stringify({ tweet: { text: "sem fotografia" } }) };
    if (u === "https://www.abola.pt/noticia/1") return { ok: true, url: u, text: async () => '<meta property="og:image" content="https://cdn.abola.pt/f.jpg">' };
    if (u === "https://cdn.abola.pt/f.jpg") return { ok: true, url: u, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => jpeg };
    if (u === "http://127.0.0.1/interna") throw new Error("não devia ser pedido");
    return { ok: false, status: 404, url: u, text: async () => "" };
  };
  try {
    const im = createImagens();
    const it = { id: "n1", url: "https://x.com/FabrizioRomano/status/123", also: [{ url: "http://127.0.0.1/interna" }, { url: "https://www.abola.pt/noticia/1" }] };
    const r = await im.imagem(it);
    assert.equal(r.tipo, "image/jpeg");
    assert.equal(r.buf.length, 5000);
    assert.ok(pedidos[0].startsWith("https://api.fxtwitter.com/FabrizioRomano/status/123"));
    assert.ok(!pedidos.includes("http://127.0.0.1/interna"), "endereços internos não se pedem");
    const n = pedidos.length;
    await im.imagem(it);
    assert.equal(pedidos.length, n, "a imagem fica guardada");
    // sem imagem em lado nenhum: não se volta a procurar logo
    assert.equal(await im.imagem({ id: "n2", url: "https://www.abola.pt/sem" }), null);
    const m = pedidos.length;
    assert.equal(await im.imagem({ id: "n2", url: "https://www.abola.pt/sem" }), null);
    assert.equal(pedidos.length, m);
    assert.equal(im.estado().encontradas, 1);
  } finally { globalThis.fetch = original; }
});
