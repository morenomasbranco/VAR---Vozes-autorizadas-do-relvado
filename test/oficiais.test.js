import { test } from "node:test";
import assert from "node:assert/strict";
import { dataDe, instante, lerEmbutido, lerLista, fusoDe } from "../server/sources/oficiais.js";

test("oficiais: horas no fuso da fonte (Itália não é Lisboa)", () => {
  assert.equal(new Date(dataDe("07/10/2026 15:30", "Europe/Rome").ts).toISOString(), "2026-10-07T13:30:00.000Z");
  assert.equal(new Date(dataDe("07/10/2026 15:30").ts).toISOString(), "2026-10-07T14:30:00.000Z");
  assert.equal(new Date(instante("2026-10-07T15:30:00", "Europe/Rome")).toISOString(), "2026-10-07T13:30:00.000Z");
  assert.equal(new Date(instante("2026-10-07T15:30:00+0200")).toISOString(), "2026-10-07T13:30:00.000Z");
  assert.equal(new Date(instante("2026-01-07T15:30:00Z")).toISOString(), "2026-01-07T15:30:00.000Z");
  assert.equal(fusoDe({ grupo: "it" }), "Europe/Rome");
  assert.equal(fusoDe({ grupo: "it", tz: "UTC" }), "UTC");
});

test("oficiais: datas relativas em várias línguas, e «hoje» num título não é uma data", () => {
  assert.ok(Math.abs(Date.now() - 5 * 60e3 - dataDe("5 minutes ago").ts) < 2000);
  assert.ok(Math.abs(Date.now() - 3 * 3600e3 - dataDe("3 ore fa").ts) < 2000);
  assert.ok(Math.abs(Date.now() - 2 * 3600e3 - dataDe("há 2 horas").ts) < 2000);
  assert.equal(dataDe("Jogo de hoje entre o Benfica e o FC Porto adiado"), null);
  assert.equal(dataDe("Ontem, 18:20").dia, false);
});

test("oficiais: lista de notícias que vem no JSON da página (sites feitos no browser)", () => {
  const dados = { props: { pageProps: { news: [
    { title: "Serie A: the Matchday 7 fixtures are confirmed", slug: "serie-a-matchday-7-fixtures", publishedAt: "2026-10-07T09:15:00.000Z" },
    { title: "Coppa Italia round of 16 schedule announced", url: "/serie-a/news/coppa-italia-r16", date: "2026-10-06" },
    { title: "Uma ligação para outro lado qualquer", url: "/club/inter" },
  ] } } };
  const l = lerEmbutido(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(dados)}</script>`, "https://en.legaseriea.it/serie-a/news", "/serie-a/news/[a-z0-9-]{6,}", "Europe/Rome");
  assert.equal(l.length, 2);
  assert.equal(l[0].url, "https://en.legaseriea.it/serie-a/news/serie-a-matchday-7-fixtures");
  assert.equal(new Date(l[0].ts).toISOString(), "2026-10-07T09:15:00.000Z");
  assert.equal(l[1].dia, true);
  const h = lerLista('<li><a href="/serie-a/news/derby-della-capitale">Lazio beat Roma in the derby, 2-1</a><span>07/10/2026 11:00</span></li>', "https://en.legaseriea.it/serie-a/news", "/serie-a/news/[a-z0-9-]{6,}", "Europe/Rome");
  assert.equal(new Date(h[0].ts).toISOString(), "2026-10-07T09:00:00.000Z");
});

test("oficiais: as notícias das associações vão para as Distritais, com a associação certa", async () => {
  const { arrumar, fontesImprensa, createOficiais } = await import("../server/sources/oficiais.js");
  const { associacaoDoTexto } = await import("../server/pt/catalogo.js");
  assert.equal(associacaoDoTexto("Comunicado Oficial da A.F. Lisboa n.º 12"), "af-lisboa");
  assert.equal(associacaoDoTexto("Associação de Futebol do Porto distingue árbitros"), "af-porto");
  assert.equal(associacaoDoTexto("SC Braga vence em Guimarães"), null);
  // uma notícia da FPF sobre uma associação sai da coluna «Portugal»
  const fpf = arrumar({ grupo: "pt", org: "FPF", titulo: "AF Viseu recebe ação de formação de treinadores" });
  assert.deepEqual([fpf.grupo, fpf.assoc], ["af", "af-viseu"]);
  const nacional = arrumar({ grupo: "pt", org: "FPF", titulo: "Seleção Nacional convocada para a Liga das Nações" });
  assert.equal(nacional.grupo, "pt");
  // pelo Google News («site:fpf.pt»), uma notícia do site de uma associação não é da FPF: vai para a associação
  const viseu = arrumar({ grupo: "pt", org: "FPF", via: "Google News", titulo: "UD Vilamaiorense e CD Santacruzense com transmissão em direto", meio: "Associação de Futebol de Viseu", site: "https://afviseu.fpf.pt" });
  assert.deepEqual([viseu.grupo, viseu.assoc, viseu.fora], ["af", "af-viseu", undefined]);
  const soPeloSite = arrumar({ grupo: "pt", org: "FPF", via: "Google News", titulo: "Jornada 5 com transmissão em direto", site: "https://afvr.fpf.pt" });
  assert.deepEqual([soPeloSite.grupo, soPeloSite.assoc], ["af", "af-vila-real"]);
  // o que é mesmo da FPF ou da Liga fica; a imprensa pelo Google News fica de fora da coluna «Portugal»
  assert.equal(arrumar({ grupo: "pt", org: "FPF", via: "Google News", titulo: "Seleção Nacional convocada", meio: "FPF", site: "https://www.fpf.pt" }).fora, undefined);
  assert.equal(arrumar({ grupo: "pt", org: "Liga Portugal", via: "Google News", titulo: "Comunicado oficial n.º 12", meio: "Liga Portugal", site: "https://www.ligaportugal.pt" }).fora, undefined);
  assert.equal(arrumar({ grupo: "pt", org: "FPF", via: "Google News", titulo: "FPF anuncia novo selecionador", meio: "Record", site: "https://www.record.pt" }).fora, true);
  assert.equal(arrumar({ grupo: "pt", org: "FPF", via: "Google News", titulo: "Liga das Nações: a convocatória", meio: "Federação Portuguesa de Futebol" }).fora, undefined);
  // as das fontes das associações ficam com a associação da fonte
  assert.equal(arrumar({ grupo: "af", org: "AF Viana do Castelo", titulo: "Calendários" }, { grupo: "af", org: "AF Viana do Castelo" }).assoc, "af-viana");
  const imp = fontesImprensa();
  assert.equal(imp.length, 22);
  assert.ok(imp.every((s) => s.grupo === "af" && s.tipo === "imprensa" && s.leitor === "google" && s.assoc));
  // a secção «Ligas e Federações» já não tem a coluna das associações
  const o = createOficiais({ config: { grupos: [{ id: "pt", nome: "Portugal" }, { id: "af", nome: "Associações de Futebol" }], fontes: [] } });
  assert.deepEqual(o.grupos().map((g) => g.id), ["pt"]);
  assert.deepEqual(o.lista().filter((x) => x.grupo === "af"), []);
});

test("Portugal: pelo Google News, os lances, os resumos e as fichas de jogadores ficam de fora, e as notícias apanhadas pela pesquisa dos comunicados passam a notícia", async () => {
  const { arrumar, naoENoticia } = await import("../server/sources/oficiais.js");
  const g = (titulo, tipo = "noticia", org = "Liga Portugal", site = "https://www.ligaportugal.pt") => arrumar({ grupo: "pt", tipo, titulo, org, via: "Google News", meio: org, site });
  assert.equal(g("GOLO! Sporting CP, L. Suárez aos 66', SC Braga 1-1 Sporting CP").fora, true);
  assert.equal(g("SC Braga, Jogada, Pau Victor aos 52'").fora, true);
  assert.equal(g("Liga Portugal Betclic (8ªJ): Resumo Moreirense FC 0-1 Gil Vicente FC").fora, true);
  assert.equal(g("Bruno Lourenço Pereira").fora, true);
  assert.equal(g("Cascavel decisivo").fora, undefined);
  assert.equal(naoENoticia("COMUNICADO OFICIAL"), false);
  const fpf = (t) => g(t, "comunicado", "FPF", "https://www.fpf.pt");
  assert.equal(fpf("França foi mais feliz").tipo, "noticia");
  assert.equal(fpf("Portugal vence a Chéquia").tipo, "noticia");
  assert.equal(fpf("CONSELHO DE DISCIPLINA").tipo, "comunicado");
  assert.equal(fpf("Nomeações profissionais").tipo, "comunicado");
  assert.equal(fpf("França foi mais feliz").fora, undefined);
});
