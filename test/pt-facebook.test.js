import { test } from "node:test";
import assert from "node:assert/strict";
import { paginaFacebook, lerPlugin, urlPlugin } from "../server/pt/facebook.js";
import { aplicar, novoJogoEstado } from "../server/pt/stories/evidencia.js";

const clube = { nome: "GD Covelo", org: "af-porto", facebook: "https://www.facebook.com/gdcovelo/" };

test("Facebook: endereço da página e do plugin", () => {
  assert.deepEqual(paginaFacebook("https://www.facebook.com/onze.esperancas/"), { chave: "onze.esperancas", url: "https://www.facebook.com/onze.esperancas/" });
  assert.equal(paginaFacebook("https://www.facebook.com/profile.php?id=100063519462640").chave, "id100063519462640");
  assert.equal(paginaFacebook("https://www.facebook.com/groups/123/"), null);
  assert.match(urlPlugin("https://www.facebook.com/gdcovelo/"), /plugins\/page\.php\?href=https%3A%2F%2Fwww\.facebook\.com%2Fgdcovelo%2F&tabs=timeline/);
});

test("Facebook: posts do plugin de página (hora, texto, ligação e imagem)", () => {
  const t1 = Math.floor(Date.now() / 1000) - 3600, t2 = t1 - 86400;
  const html = `<div class="_1dwg"><a href="/gdcovelo/posts/pfbid0abc?__cft__[0]=x"><abbr data-utime="${t1}">1 h</abbr></a>
    <div class="_5pbx userContent"><p>RESULTADO FINAL<br>GD Covelo 2-1 SC Rio Tinto</p><p>⚽ Tiago Mendes 12', 80'</p></div>
    <img src="https://scontent.xx.fbcdn.net/v/t39/p50x50/perfil.jpg" width="40"><img class="scaledImageFitWidth img" src="https://scontent.xx.fbcdn.net/v/t39/foto.jpg?a=1&amp;b=2">
    <span>Gosto</span><span>Comentar</span></div>
    <div><a href="https://www.facebook.com/gdcovelo/photos/a.1/987/"><abbr data-utime="${t2}">ontem</abbr></a><div class="userContent"><p>Treino de preparação</p></div></div>`;
  const l = lerPlugin(html, clube);
  assert.equal(l.length, 2);
  assert.equal(l[0].ts, t1 * 1000);
  assert.match(l[0].legenda, /RESULTADO FINAL\nGD Covelo 2-1 SC Rio Tinto/);
  assert.doesNotMatch(l[0].legenda, /Gosto|Comentar/);
  assert.equal(l[0].url, "https://www.facebook.com/gdcovelo/posts/pfbid0abc");
  assert.equal(l[0].img, "https://scontent.xx.fbcdn.net/v/t39/foto.jpg?a=1&b=2");
  assert.equal(l[0].rede, "facebook");
  assert.equal(l[1].legenda, "Treino de preparação");
});

test("Facebook e Instagram do mesmo clube: o mesmo golo não conta duas vezes", () => {
  const T0 = Date.now() - 60 * 60e3;
  const j = novoJogoEstado({ id: "jf", casa: "GD Covelo", fora: "SC Rio Tinto", inicio: T0, mod: "futebol", nomes: { h: ["GD Covelo"], a: ["SC Rio Tinto"] } });
  aplicar(j, { id: "s1", tipo: "story", conta: "gd.covelo", lado: "h", texto: "Começou!", ts: T0 + 2 * 60e3 });
  assert.equal(aplicar(j, { id: "s2", tipo: "story", conta: "gd.covelo", lado: "h", texto: "GOLOOO ⚽", ts: T0 + 20 * 60e3 }).decisao, "novo");
  const r = aplicar(j, { id: "f1", tipo: "facebook", conta: "fb:gdcovelo", lado: "h", texto: "Golo de Tiago Mendes!", ts: T0 + 31 * 60e3 });
  assert.equal(r.decisao, "confirmacao");
  assert.equal(j.hs, 1);
  assert.equal(j.golos[0].marcador, "Tiago Mendes");
});

test("Distritais: o mesmo post no Instagram e no Facebook fica só um", async () => {
  const { semRepetidos } = await import("../server/pt/distritais.js");
  const t = Date.now() - 3600e3;
  const ig = { id: "ig:1", rede: "instagram", clube: "GD Covelo", ts: t, legenda: "RESULTADO FINAL | GD Covelo 2-1 SC Rio Tinto ⚽ Tiago Mendes #vamoscovelo", url: "https://www.instagram.com/p/x/" };
  const fb = { id: "fb:1", rede: "facebook", clube: "GD Covelo", ts: t + 10 * 60e3, legenda: "RESULTADO FINAL GD Covelo 2-1 SC Rio Tinto ⚽ Tiago Mendes", url: "https://www.facebook.com/gdcovelo/posts/1", img: "https://scontent.xx.fbcdn.net/a.jpg" };
  const outro = { id: "fb:2", rede: "facebook", clube: "GD Covelo", ts: t + 20 * 60e3, legenda: "Treino de recuperação amanhã às 10h no sintético", url: "https://www.facebook.com/gdcovelo/posts/2" };
  const l = semRepetidos([fb, ig, outro]);
  assert.equal(l.length, 2);
  const r = l.find((p) => p.id === "ig:1");
  assert.ok(r, "fica o primeiro a sair");
  assert.deepEqual(r.tambem, [{ rede: "facebook", url: "https://www.facebook.com/gdcovelo/posts/1" }]);
  assert.equal(r.img, "https://scontent.xx.fbcdn.net/a.jpg");
});
