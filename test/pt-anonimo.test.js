import { test } from "node:test";
import assert from "node:assert/strict";
import { lerResposta } from "../server/pt/stories/anonimo.js";
import { createPortugal } from "../server/pt/index.js";

test("visualizador anónimo: resposta JSON com itens à Instagram", () => {
  const j = JSON.stringify({ result: [
    { pk: "111", taken_at: 1791900000, media_type: 1, image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/v/t51.2885-15/1_2_3_n.jpg?x=1" }] }, accessibility_caption: 'Pode ser uma imagem de texto que diz "GOLO 1-0"' },
    { pk: "112", taken_at: 1791900300, media_type: 2, video_versions: [{ url: "https://scontent.cdninstagram.com/o1/v/t16/f2/m69/4_5_6_n.mp4?x=2" }] },
  ] });
  const r = lerResposta(j);
  assert.equal(r.length, 2);
  assert.equal(r[0].id, "111");
  assert.equal(r[0].ts, 1791900000000);
  assert.match(r[0].alt, /GOLO 1-0/);
  assert.equal(r[1].video, true);
});

test("visualizador anónimo: página HTML com imagens, vídeos e datas", () => {
  const html = `<div class="profile"><img src="https://scontent.cdninstagram.com/v/t51.2885-19/999_1_1_n.jpg?s150x150" alt="foto de perfil"></div>
    <div class="item" data-created="1791300000"><img src="https://scontent-mad1-1.cdninstagram.com/v/t51.2885-15/77_88_99_n.jpg?stp=dst&amp;x=1" alt="GOLO! 2-1 ⚽ 67'"></div>
    <div class="item"><video src="https://scontent.cdninstagram.com/o1/v/t16/f1/m78/55_66_77_n.mp4?efg=1"></video></div>`;
  const r = lerResposta(html);
  assert.equal(r.length, 2, JSON.stringify(r));
  assert.equal(r[0].ts, 1791300000000);
  assert.match(r[0].alt, /2-1/);
  assert.ok(!r[0].url.includes("&amp;"));
  assert.equal(r[1].video, true);
});

test("formulário dos leitores: um envio espera confirmação, dois iguais de pessoas diferentes contam", async () => {
  const pt = createPortugal({ log: () => {} });
  const comp = pt._upsertComp("fpf-leitor", { org: "af-porto", nome: "1ª Divisão", mod: "futebol", tipo: "liga", nivel: "distrital", fonte: "fpf" });
  const serie = pt._serieDe(comp, "s1", "Série 1");
  const j = pt._registarJogo(comp, serie, 2, { fpfId: "555001", casa: "Clube Alfa", fora: "Clube Beta", inicio: Date.now() - 40 * 60000 }, "fpf");
  const a = await pt.leitor({ jogoId: j.id, hs: 0, as: 1, min: "33", marcador: "Rui Costa", ip: "1.1.1.1" });
  assert.equal(a.aceite, false);
  assert.equal(j.as, null);
  const outra = await pt.leitor({ jogoId: j.id, hs: 0, as: 1, ip: "1.1.1.1" }); // a mesma pessoa não confirma
  assert.equal(outra.aceite, false);
  const b = await pt.leitor({ jogoId: j.id, hs: 0, as: 1, ip: "2.2.2.2" });
  assert.equal(b.aceite, true);
  assert.equal(j.hs, 0); assert.equal(j.as, 1);
  assert.equal(j.golos[0].lado, "a");
  // a seguir, um envio que bate com o resultado é confirmação imediata
  const c = await pt.leitor({ jogoId: j.id, hs: 0, as: 1, ip: "3.3.3.3" });
  assert.equal(c.decisao, "confirmacao");
  assert.equal((await pt.leitor({ jogoId: "nao-existe", hs: 1, as: 0, ip: "4.4.4.4" })).ok, false);
});
