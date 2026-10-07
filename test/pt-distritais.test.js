import { test } from "node:test";
import assert from "node:assert/strict";
import { createDistritais, dePost, lerPerfilAnonimo } from "../server/pt/distritais.js";

const clube = { nome: "GD Covelo", instagram: "gd.covelo", org: "af-porto" };
const node = (id, horasAtras, legenda) => ({ id, shortcode: `sc${id}`, taken_at_timestamp: Math.floor((Date.now() - horasAtras * 3600e3) / 1000), thumbnail_src: `https://scontent.cdninstagram.com/v/${id}.jpg`, edge_media_to_caption: { edges: [{ node: { text: legenda } }] } });

test("Distritais: post do Instagram e página de um visualizador anónimo", () => {
  const p = dePost(node("1", 2, "Vitória! 2-1"), clube);
  assert.equal(p.url, "https://www.instagram.com/p/sc1/");
  assert.equal(p.org, "af-porto");
  assert.equal(p.legenda, "Vitória! 2-1");
  const html = `<div class="item"><a href="/p/AbC123x/"><div class="img"><img src="https://scontent.cdninstagram.com/a.jpg?x=1&amp;y=2" alt="Jogo de domingo: vitória por 3-0"></div></a><span data-created="${Math.floor(Date.now() / 1000) - 600}"></span></div>`;
  const l = lerPerfilAnonimo(html, clube);
  assert.equal(l.length, 1);
  assert.equal(l[0].url, "https://www.instagram.com/p/AbC123x/");
  assert.equal(l[0].img, "https://scontent.cdninstagram.com/a.jpg?x=1&y=2");
  assert.match(l[0].legenda, /vitória por 3-0/);
});

test("Distritais: feed por associação; na primeira leitura não anuncia, depois cada post novo segue para o site", () => {
  const enviados = [];
  const d = createDistritais({ clubes: { clubes: [clube, { nome: "SC Rio Tinto", instagram: "scriotinto", org: "af-porto" }, { nome: "Sem Instagram", org: "af-braga" }] }, broadcast: (ev, x) => enviados.push([ev, x]) });
  d.deEdges("gd.covelo", [{ node: node("1", 30, "Treino") }, { node: node("2", 5, "Resultado final 2-1") }]);
  assert.equal(enviados.length, 0, "posts antigos da primeira leitura não são anunciados");
  d.deEdges("gd.covelo", [{ node: node("3", 0.1, "GOLO! 1-0") }, { node: node("2", 5, "Resultado final 2-1 (editado)") }]);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0][0], "distrital");
  assert.equal(enviados[0][1].legenda, "GOLO! 1-0");
  const f = d.feed();
  assert.deepEqual(f.orgs.map((o) => [o.key, o.clubes]), [["af-porto", 2]]);
  assert.deepEqual(f.posts["af-porto"].map((p) => p.legenda), ["GOLO! 1-0", "Resultado final 2-1 (editado)", "Treino"]);
  d.deEdges("desconhecido", [{ node: node("9", 1, "x") }]);
  assert.equal(d.feed().posts["af-porto"].length, 3);
});

test("Distritais: visualizador com ligações /post/<id> e retransmissor", () => {
  const html = `<a href="/post/3456789012345678901/"><img data-src="https://scontent.cdninstagram.com/b.jpg" alt="Resultado final 1-1"></a>`;
  const l = lerPerfilAnonimo(html, clube);
  assert.equal(l[0].url, "https://www.instagram.com/gd.covelo/");
  const d = createDistritais({ clubes: { clubes: [clube] } });
  assert.deepEqual(d.paraRetransmissor(3), ["gd.covelo"]);
  assert.deepEqual(d.paraRetransmissor(3), [], "o clube já pedido não é dado outra vez");
  assert.equal(d.doRetransmissor("gd.covelo", [{ node: node("7", 1, "GOLO!") }]), true);
  assert.equal(d.feed().posts["af-porto"][0].legenda, "GOLO!");
  assert.equal(d.estado().vias.retransmissor.ok, 1);
});
