import { test } from "node:test";
import assert from "node:assert/strict";
import { imagemDaPagina, imagemDoTelegram, imagemDoFx, createImagens, tipoDe, temFoto } from "../server/imagens.js";
import { imagemDoItem } from "../server/sources/rss.js";
import { imagemBluesky } from "../server/sources/bluesky.js";

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
    // a imagem da página abre-a o browser: o servidor só leu a página
    const r = await im.imagem(it);
    assert.equal(r.url, "https://cdn.abola.pt/f.jpg");
    assert.ok(pedidos[0].startsWith("https://api.fxtwitter.com/FabrizioRomano/status/123"));
    assert.ok(!pedidos.includes("http://127.0.0.1/interna"), "endereços internos não se pedem");
    assert.ok(!pedidos.includes("https://cdn.abola.pt/f.jpg"));
    // com ?servidor=1 é o servidor que a descarrega
    const s1 = await im.imagem(it, { servidor: true });
    assert.equal(s1.tipo, "image/jpeg");
    assert.equal(s1.buf.length, 5000);
    const n = pedidos.length;
    await im.imagem(it);
    await im.imagem(it, { servidor: true });
    assert.equal(pedidos.length, n, "fica guardada");
    // sem imagem em lado nenhum: não se volta a procurar logo, nem pelo servidor
    assert.equal(await im.imagem({ id: "n2", url: "https://www.abola.pt/sem" }), null);
    const m = pedidos.length;
    assert.equal(await im.imagem({ id: "n2", url: "https://www.abola.pt/sem" }), null);
    assert.equal(await im.imagem({ id: "n2", url: "https://www.abola.pt/sem" }, { servidor: true }), null);
    assert.equal(pedidos.length, m);
    assert.deepEqual([im.estado().peloServidor, im.estado().peloBrowser, im.estado().sem], [1, 1, 1]);
  } finally { globalThis.fetch = original; }
});

test("imagens: a imagem que o feed dá a cada notícia (como o rss-parser a lê)", () => {
  const de = (it) => imagemDoItem(it, it.link);
  // Sky Sports: enclosure com «image/jpg»
  assert.equal(de({ link: "https://www.skysports.com/football/news/1", enclosure: { type: "image/jpg", url: "https://e0.365dm.com/23/10/768x432/a.jpg?2023", length: "1" } }), "https://e0.365dm.com/23/10/768x432/a.jpg?2023");
  // vários media:content: o maior
  assert.equal(de({ link: "https://www.independent.co.uk/x", mediaContent: [{ $: { url: "https://static.independent.co.uk/s.jpg", medium: "image", width: "300" } }, { $: { url: "https://static.independent.co.uk/b.jpg", medium: "image", width: "1200" } }] }), "https://static.independent.co.uk/b.jpg");
  assert.equal(de({ link: "https://www.mirror.co.uk/x", mediaThumbnail: [{ $: { url: "https://i2-prod.mirror.co.uk/t.jpg" } }] }), "https://i2-prod.mirror.co.uk/t.jpg");
  // a miniatura de 98 píxeis não serve para a imagem grande: fica a enclosure
  assert.equal(de({ link: "https://www.mirror.co.uk/y", mediaThumbnail: [{ $: { url: "https://i2-prod.mirror.co.uk/s98.jpg", width: "98" } }] }), undefined);
  assert.equal(de({ link: "https://www.mirror.co.uk/z", mediaThumbnail: [{ $: { url: "https://i2-prod.mirror.co.uk/s98.jpg", width: "98" } }], enclosure: { url: "https://i2-prod.mirror.co.uk/s615.jpg", type: "image/jpeg" } }), "https://i2-prod.mirror.co.uk/s615.jpg");
  // media:group com um vídeo: fica a miniatura, com o endereço completo
  assert.equal(de({ link: "https://x.pt/a", mediaGroup: { "media:content": [{ $: { url: "https://x.pt/v.mp4", medium: "video" }, "media:thumbnail": [{ $: { url: "/thumb.jpg" } }] }] } }), "https://x.pt/thumb.jpg");
  // a primeira <img> do texto, sem o píxel de contagem
  assert.equal(de({ link: "https://maisfutebol.iol.pt/a", content: '<img src="https://feeds.feedburner.com/~r/x/~4/p" width="1" height="1"><p><img src="https://img.iol.pt/image/id/abc/400.jpg"> texto</p>' }), "https://img.iol.pt/image/id/abc/400.jpg");
  assert.equal(de({ link: "https://x.pt/b", enclosure: { url: "https://x.pt/v.mp4", type: "video/mp4" } }), undefined);
  assert.equal(de({ link: "https://x.pt/c", content: "sem imagem" }), undefined);
  assert.equal(de({ link: "https://x.pt/d", enclosure: { url: "javascript:alert(1)", type: "image/jpeg" } }), undefined);
});

test("imagens: a imagem de um post do Bluesky e a fotografia de uma mensagem do Telegram", () => {
  const did = "did:plc:abc123";
  assert.equal(imagemBluesky(did, { embed: { images: [{ image: { ref: { $link: "bafkfoto" } } }] } }), "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc123/bafkfoto@jpeg");
  assert.equal(imagemBluesky(did, { embed: { external: { uri: "https://x.pt", thumb: { ref: { $link: "bafkcapa" } } } } }), "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc123/bafkcapa@jpeg");
  assert.equal(imagemBluesky(did, { embed: { record: {}, media: { images: [{ image: { ref: { $link: "bafkcit" } } }] } } }), "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc123/bafkcit@jpeg");
  assert.equal(imagemBluesky(did, { embed: { video: { ref: { $link: "bafkvid" } } } }), "https://video.bsky.app/watch/did%3Aplc%3Aabc123/bafkvid/thumbnail.jpg");
  assert.equal(imagemBluesky(did, { text: "só texto" }), undefined);
  assert.ok(temFoto({ media: { className: "MessageMediaPhoto" } }));
  assert.ok(temFoto({ media: { className: "MessageMediaWebPage", webpage: { photo: {} } } }));
  assert.ok(!temFoto({ media: { className: "MessageMediaWebPage", webpage: {} } }));
  assert.ok(!temFoto({ media: { className: "MessageMediaDocument" } }) && !temFoto(null));
  assert.equal(tipoDe(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(tipoDe(Buffer.from("RIFF0000WEBPVP8 ", "latin1")), "image/webp");
  assert.equal(tipoDe(Buffer.from("<html>", "latin1")), null);
});

test("imagens: a do feed abre-a o browser; o servidor descarrega-a se lhe pedirem; o Telegram pela conta", async () => {
  const original = globalThis.fetch;
  const pedidos = [];
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(6000, 7)]);
  globalThis.fetch = async (url) => {
    const u = String(url);
    pedidos.push(u);
    if (u === "https://cdn.record.pt/ok.jpg") return { ok: true, url: u, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => jpeg };
    if (u === "https://e0.365dm.com/lento.jpg") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    if (u === "https://www.skysports.com/news/1") throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
    throw new Error(`pedido inesperado: ${u}`);
  };
  try {
    let pedidosTg = 0;
    const cliente = {
      getMessages: async (canal, { ids }) => { pedidosTg++; return [{ id: ids[0], media: { className: canal === "semfoto" ? "MessageMediaDocument" : "MessageMediaPhoto" } }]; },
      downloadMedia: async () => jpeg,
    };
    const im = createImagens({ telegram: () => cliente });
    // a imagem do feed: o browser abre-a, sem o servidor pedir nada
    const a = await im.imagem({ id: "a", url: "https://www.record.pt/noticia/1", img: "https://cdn.record.pt/ok.jpg" });
    assert.equal(a.url, "https://cdn.record.pt/ok.jpg");
    assert.equal(pedidos.length, 0);
    // com ?servidor=1, descarrega-a o servidor
    const a2 = await im.imagem({ id: "a", url: "https://www.record.pt/noticia/1", img: "https://cdn.record.pt/ok.jpg" }, { servidor: true });
    assert.equal(a2.tipo, "image/jpeg");
    assert.deepEqual(pedidos, ["https://cdn.record.pt/ok.jpg"]);
    // o servidor não chega à imagem nem à página: fica registado porquê
    assert.equal(await im.imagem({ id: "b", url: "https://www.skysports.com/news/1", img: "https://e0.365dm.com/lento.jpg" }, { servidor: true }), null);
    const ub = im.estado().ultimas.find((x) => x.id === "b");
    assert.deepEqual(ub.passos, ["imagem do feed e0.365dm.com: sem resposta", "página www.skysports.com: ECONNRESET"]);
    // a fotografia de uma mensagem do Telegram vem pela conta (a mensagem sem fotografia passa à seguinte)
    const c = await im.imagem({ id: "c", url: "https://x.com/a/status/1", img: "tg:semfoto/5", also: [{ url: "https://t.me/canal/9", img: "tg:canal/9" }] });
    assert.equal(c.tipo, "image/jpeg");
    assert.equal(pedidosTg, 2);
    assert.match(im.estado().ultimas[0].resultado, /servidor: Telegram/);
    // sem ligação ao Telegram, o motivo fica registado
    const sem = createImagens({ telegram: () => null });
    assert.equal(await sem.imagem({ id: "d", img: "tg:canal/9" }), null);
    assert.deepEqual(sem.estado().ultimas[0].passos, ["Telegram canal/9: sem ligação ao Telegram"]);
    // a notícia guardada sem imagem procura-se outra vez quando chega uma fonte com imagem
    const e = await sem.imagem({ id: "d", img: "tg:canal/9", also: [{ img: "https://cdn.record.pt/ok.jpg" }] });
    assert.equal(e.url, "https://cdn.record.pt/ok.jpg");
  } finally { globalThis.fetch = original; }
});
