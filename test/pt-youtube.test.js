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
  // 22 associações (a AF Viana com dois canais), Canal 11 e FPF
  assert.equal(canaisBase().length, 25);
  assert.deepEqual(canaisBase().filter((c) => c.assoc === "af-viana").map((c) => c.id), ["af-viana", "af-viana:2"]);
  assert.equal(canaisBase().find((c) => c.id === "af-ponta-delgada").canal, "@afpd_tv");
  assert.equal(canaisBase().find((c) => c.id === "canal11").canal, "@Canal11Oficial");
  // todas as associações têm canal conhecido (as que não tivessem seriam procuradas pelo nome)
  assert.deepEqual(canaisBase().filter((c) => !c.canal).map((c) => c.id), []);
  assert.equal(canaisBase().find((c) => c.id === "af-coimbra").canal, "@af.coimbra");
});

test("YouTube: o separador «Diretos» (/streams) dá as transmissões a decorrer e as agendadas, e deixa de fora as que já acabaram", async () => {
  const { lerStreams } = await import("../server/pt/youtube.js");
  const item = (r) => ({ richItemRenderer: { content: { videoRenderer: r } } });
  const badge = { thumbnailBadgeViewModel: { text: "AO VIVO", badgeStyle: "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE" } };
  const lockup = {
    contentId: "Lockup00001", contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    metadata: { lockupMetadataViewModel: { title: { content: "Tondela B x Mangualde" } } },
    contentImage: { thumbnailViewModel: { overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [badge] } }] } },
  };
  const dados = {
    metadata: { channelMetadataRenderer: { title: "AF Viseu TV" } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { richGridRenderer: { contents: [
      item({ videoId: "LiveLiveLiv", title: { runs: [{ text: "Vilamaiorense x Santacruzense" }] }, viewCountText: { runs: [{ text: "143" }, { text: " a ver" }] }, badges: [{ metadataBadgeRenderer: { style: "BADGE_STYLE_TYPE_LIVE_NOW", label: "EM DIRETO" } }], thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: "LIVE" } }] }),
      item({ videoId: "Agendado001", title: { runs: [{ text: "Lusitano FCV x Penalva" }] }, upcomingEventData: { startTime: "1791640800" }, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: "UPCOMING" } }] }),
      item({ videoId: "Antigo00001", title: { runs: [{ text: "Jogo da semana passada" }] }, thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: "DEFAULT" } }] }),
      { richItemRenderer: { content: { lockupViewModel: lockup } } },
    ] } } } }] } },
  };
  const html = `<html><script>var ytInitialData = ${JSON.stringify(dados)};</script></html>`;
  const st = lerStreams(html);
  assert.equal(st.canal, "AF Viseu TV");
  assert.equal(st.vistos, 4);
  assert.deepEqual(st.lista.map((d) => d.videoId), ["LiveLiveLiv", "Agendado001", "Lockup00001"]);
  const [vivo, agendado, novo] = st.lista;
  assert.equal(vivo.aoVivo, true); assert.equal(vivo.espetadores, 143); assert.equal(vivo.titulo, "Vilamaiorense x Santacruzense");
  assert.equal(agendado.aoVivo, false); assert.equal(agendado.marcada, true); assert.equal(agendado.inicio, 1791640800000);
  assert.equal(novo.aoVivo, true); assert.equal(novo.titulo, "Tondela B x Mangualde");
  // um canal sem nada agendado nem em direto: lista vazia; uma página sem os dados: null (usa-se a «/live»)
  assert.deepEqual(lerStreams(html.replace(/BADGE_STYLE_TYPE_LIVE_NOW|THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE|AO VIVO|UPCOMING|upcomingEventData/g, "nada").replace(/"style":"LIVE"/g, '"style":"DEFAULT"')).lista, []);
  assert.equal(lerStreams("<html>nada</html>"), null);
  // os canais da AF Viseu e da AF Porto já vêm certos
  assert.equal(canaisBase().find((c) => c.id === "af-viseu").canal, "@AFViseuTV");
  assert.equal(canaisBase().find((c) => c.id === "af-porto").canal, "@associacaodefuteboldoporto");
});

test("YouTube: a hora de um agendado lê-se na página do vídeo", async () => {
  const { horaMarcada } = await import("../server/pt/youtube.js");
  assert.equal(horaMarcada('..."liveBroadcastDetails":{"isLiveNow":false,"startTimestamp":"2026-10-11T14:00:00+00:00"}...'), Date.parse("2026-10-11T14:00:00Z"));
  assert.equal(horaMarcada('..."upcomingEventData":{"scheduledStartTime":"1791640800"}...'), 1791640800000);
  assert.equal(horaMarcada("nada"), null);
});
