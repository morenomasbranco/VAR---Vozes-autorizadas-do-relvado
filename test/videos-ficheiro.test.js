import { test } from "node:test";
import assert from "node:assert/strict";
import { createVideos } from "../server/videos.js";

test("vídeos: um vídeo sem ficheiro volta a ser procurado e passa a tocar no site quando a fonte o tiver", async () => {
  const avisos = [];
  const videos = createVideos({ broadcast: (e, d) => avisos.push([e, d]) });
  let pronto = false;
  videos.procurarFicheiro("sporttv", async (s) => (pronto && s.entry === "1_abcdefgh" ? { hls: "https://exemplo.pt/a.m3u8", mp4: null, iframe: null } : null));
  const v = await videos.add({
    fonte: "sporttv", post_id: "sporttv:1_abcdefgh", canal: "sporttv", title: "Golo! FC Famalicão 0 - [1] FC Alverca 14'",
    video_url: "https://www.sporttv.pt/videos/1/golos/video/1_abcdefgh/golo", reddit_url: "https://www.sporttv.pt/videos/1/golos/video/1_abcdefgh/golo",
    hls: null, mp4: null, iframe: null, entry: "1_abcdefgh", created_time: Date.now(),
  });
  assert.equal(v.embed, null);
  await videos.procurarEmFalta(); // a Kaltura ainda não tem o vídeo
  assert.equal(videos.latest()[0].embed, null);
  pronto = true;
  await videos.procurarEmFalta();
  assert.deepEqual(videos.latest()[0].embed, { tipo: "hls", src: "https://exemplo.pt/a.m3u8", mp4: null });
  assert.ok(avisos.some(([e, d]) => e === "video-update" && d.embed?.tipo === "hls"));
});

test("vídeos: os golos do streamin tocam pelo endereço fixo do ficheiro; os do servidor não arrancam em miniatura", async () => {
  const { embedDe } = await import("../server/videos.js");
  assert.deepEqual(embedDe({ video_url: "https://streamin.link/v/a19b237d" }), { tipo: "mp4", src: "https://c-cdn.streamin.top/uploads/a19b237d.mp4" });
  assert.deepEqual(embedDe({ video_url: "https://t.me/twclipshdeuropa/6600", mp4: "/api/videos/tg/twclipshdeuropa/6600" }), { tipo: "mp4", src: "/api/videos/tg/twclipshdeuropa/6600", servidor: true });
  assert.equal(embedDe({ video_url: "https://t.me/twclipshdeuropa/6600" }), null);
});

test("vídeos grandes do Telegram: o intervalo pedido pelo leitor e o envio aos bocados", async () => {
  const { intervalo, enviarVideoTelegram } = await import("../server/tgvideo.js");
  assert.deepEqual(intervalo("bytes=0-", 1000), { ini: 0, fim: 999, parcial: true });
  assert.deepEqual(intervalo("bytes=100-199", 1000), { ini: 100, fim: 199, parcial: true });
  assert.deepEqual(intervalo("bytes=-100", 1000), { ini: 900, fim: 999, parcial: true });
  assert.deepEqual(intervalo(undefined, 1000), { ini: 0, fim: 999, parcial: false });
  assert.equal(intervalo("bytes=1000-", 1000), null);
  assert.equal(intervalo("bytes=0-", 50e6).fim, 8 * 1024 * 1024 - 1); // no máximo 8 MB de cada vez

  // um ficheiro de 1,5 MB e um cliente falso que dá os pedaços de 512 KB a partir do início pedido
  const tamanho = 1536 * 1024;
  const ficheiro = Buffer.alloc(tamanho, 0).map((_, i) => i % 251);
  const cliente = {
    getMessages: async () => [{ media: { document: { size: tamanho, mimeType: "video/mp4", dcId: 4 } } }],
    async *iterDownload({ offset, requestSize, limit }) {
      for (let i = 0, p = Number(offset); i < limit && p < tamanho; i++, p += requestSize) yield ficheiro.subarray(p, p + requestSize);
    },
  };
  const pedir = async (range) => {
    const partes = [];
    const cab = {};
    const res = { statusCode: 0, headersSent: false, status(c) { this.statusCode = c; return this; }, setHeader: (k, v) => { cab[k] = v; }, write: (b) => { partes.push(Buffer.from(b)); return true; }, end() {}, once() {}, json() {} };
    await enviarVideoTelegram(cliente, "canal", "1", { headers: range ? { range } : {}, on() {} }, res);
    return { status: res.statusCode, cab, corpo: Buffer.concat(partes) };
  };
  const a = await pedir("bytes=600000-700000"); // atravessa a fronteira de dois pedaços
  assert.equal(a.status, 206);
  assert.equal(a.cab["Content-Range"], `bytes 600000-700000/${tamanho}`);
  assert.ok(a.corpo.equals(ficheiro.subarray(600000, 700001)));
  const b = await pedir(null);
  assert.equal(b.status, 200);
  assert.ok(b.corpo.equals(ficheiro));
});
