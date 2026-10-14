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
