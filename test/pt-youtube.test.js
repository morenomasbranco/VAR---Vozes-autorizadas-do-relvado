import { test } from "node:test";
import assert from "node:assert/strict";
import { lerLive, lerPesquisaCanais, urlCanal, canaisBase } from "../server/pt/youtube.js";
import { norm } from "../server/util.js";

const pagina = (extra) => `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=AbCdEfGhIjK"><meta name="title" content="AF Viseu TV | Vilamaiorense x Santacruzense &amp; mais"></head><body><script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"AbCdEfGhIjK","title":"Vilamaiorense x Santacruzense","isLive":${extra.isLive},"author":"AF Viseu"},"microformat":{"playerMicroformatRenderer":{"ownerChannelName":"Associação de Futebol de Viseu","liveBroadcastDetails":{"isLiveNow":${extra.isLiveNow},"startTimestamp":"2026-10-10T15:00:00+00:00"}}}${extra.upcoming || ""}};</script></body></html>`;

test("YouTube: a página «/live» de um canal diz se está em direto, se há uma transmissão marcada, ou nada", () => {
  const d = lerLive(pagina({ isLive: true, isLiveNow: true }));
  assert.equal(d.videoId, "AbCdEfGhIjK");
  assert.equal(d.aoVivo, true);
  assert.equal(d.titulo, "AF Viseu TV | Vilamaiorense x Santacruzense & mais");
  assert.equal(d.canal, "Associação de Futebol de Viseu");
  assert.equal(d.imagem, "https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault_live.jpg");
  const m = lerLive(pagina({ isLive: false, isLiveNow: false, upcoming: ',"isUpcoming":true,"scheduledStartTime":"1791640800"' }));
  assert.equal(m.aoVivo, false);
  assert.equal(m.marcada, true);
  assert.equal(m.inicio, 1791640800000);
  // um vídeo antigo (o canal não está a transmitir) não conta
  assert.equal(lerLive(pagina({ isLive: false, isLiveNow: false })), null);
  assert.equal(lerLive("<html>canal sem nada</html>"), null);
});

test("YouTube: a pesquisa de canais e o reconhecimento do canal de cada associação", () => {
  const html = `..."channelRenderer":{"channelId":"UCaaaaaaaaaaaaaaaaaaaaaa","title":{"simpleText":"Viseu Fan Club"}}..."channelRenderer":{"channelId":"UCbbbbbbbbbbbbbbbbbbbbbb","title":{"simpleText":"Associação de Futebol de Viseu"}}...`;
  const canais = lerPesquisaCanais(html);
  assert.deepEqual(canais.map((c) => c.titulo), ["Viseu Fan Club", "Associação de Futebol de Viseu"]);
  const viseu = canaisBase().find((c) => c.id === "af-viseu");
  const re = new RegExp(viseu.reconhece, "i");
  assert.equal(canais.find((c) => re.test(norm(c.titulo))).id, "UCbbbbbbbbbbbbbbbbbbbbbb");
  assert.ok(re.test(norm("AF Viseu TV")));
  assert.ok(!re.test(norm("Académico de Viseu")));
  // a AF Lisboa e a FPF já têm o canal; os endereços aceitam o id, o @nome ou o endereço todo
  assert.equal(urlCanal(canaisBase().find((c) => c.id === "af-lisboa").canal), "https://www.youtube.com/channel/UCXSPgjw-KXn86J_upO98LWg");
  assert.equal(urlCanal("@FPF.Oficial"), "https://www.youtube.com/@FPF.Oficial");
  assert.equal(urlCanal("https://www.youtube.com/@x/"), "https://www.youtube.com/@x");
  assert.equal(canaisBase().length, 24); // 22 associações, Canal 11 e FPF
});
