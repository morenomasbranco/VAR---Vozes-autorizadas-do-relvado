import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortugal } from "../server/pt/index.js";
import { classificar, bonito } from "../server/pt/catalogo.js";
import { tabelaAoVivo } from "../server/pt/tabela.js";

test("catálogo: só sénior de futebol e futsal, e o sub-23 nacional", () => {
  assert.equal(classificar({ nome: 'CAMP.DIST.1ªDIV.JUN. "C"', org: "af-porto" }), null);
  assert.equal(classificar({ nome: "TORNEIO DISTRITAL JUNIORES \"E\" - BENJAMINS - FUT.7", org: "af-porto" }), null);
  assert.equal(classificar({ nome: "CAMPEONATO DISTRITAL SUB-23", org: "af-braga" }), null);
  assert.equal(classificar({ nome: "Campeonato Esperanças", org: "af-lisboa" }), null);
  assert.equal(classificar({ nome: "VETERANOS", org: "af-porto" }), null);
  assert.equal(classificar({ nome: "FUTEBOL DE PRAIA - SENIORES", org: "fpf" }), null);
  assert.equal(classificar({ nome: "CAMPEONATO NACIONAL SUB-23", org: "fpf" }).sub23, true);
  const pro = classificar({ nome: "PRO-NACIONAL", org: "af-porto" });
  assert.deepEqual([pro.mod, pro.nivel, pro.tipo], ["futebol", "distrital", "liga"]);
  assert.equal(classificar({ nome: "1ª DIVISÃO DISTRITAL FUTSAL SENIORES MASCULINOS", org: "af-aveiro" }).mod, "futsal");
  assert.equal(classificar({ nome: "TAÇA AF PORTO SENIORES", org: "af-porto" }).tipo, "taca");
  assert.equal(classificar({ nome: "CAMPEONATO DE PORTUGAL", org: "fpf" }).nivel, "nacional");
  assert.equal(bonito("CAMPEONATO DISTRITAL 1ª DIVISÃO SENIORES"), "Campeonato Distrital 1ª Divisão Seniores");
});

test("tabela: confronto direto desempata e jogos a decorrer contam", () => {
  const jogos = [
    { id: 1, casa: "A", fora: "B", hs: 1, as: 0, estado: "final" },
    { id: 2, casa: "B", fora: "C", hs: 5, as: 0, estado: "final" },
    { id: 3, casa: "C", fora: "A", hs: 1, as: 0, estado: "final" },
    { id: 4, casa: "A", fora: "D", hs: 2, as: 0, estado: "direto" },
  ];
  const t = tabelaAoVivo({ equipas: ["A", "B", "C", "D"], jogos });
  assert.equal(t[0].equipa, "A"); // 6 pontos com o jogo ao vivo
  assert.ok(t[0].aoVivo);
  assert.equal(t[0].mov, 1, "A sobe de 2.º (atrás do B pela diferença de golos) para 1.º com o jogo a decorrer");
  // castigo de 3 pontos na tabela oficial passa para a tabela ao vivo
  const oficial = [{ equipa: "B", j: 2, v: 1, e: 0, d: 1, gm: 5, gs: 1, pts: 0 }];
  const t2 = tabelaAoVivo({ equipas: ["A", "B", "C", "D"], jogos, oficial });
  assert.equal(t2.find((l) => l.equipa === "B").pts, 0);
});

test("hub: story do clube atualiza o jogo, a tabela e o feed; o adversário confirma", () => {
  const eventos = [];
  const pt = createPortugal({ log: () => {}, broadcast: (e, d) => eventos.push([e, d]) });
  const comp = pt._upsertComp("fpf-teste", { org: "af-porto", nome: "Divisão de Honra", mod: "futebol", fem: false, sub23: false, tipo: "liga", nivel: "distrital", fonte: "fpf" });
  const serie = pt._serieDe(comp, "s1", "Série 1");
  const agora = Date.now();
  const inicio = agora - 30 * 60000;
  const j = pt._registarJogo(comp, serie, 5, { fpfId: "999001", casa: "AD Carvalhosa", fora: "ACR Sendim", inicio }, "fpf");
  pt._registarJogo(comp, serie, 5, { fpfId: "999002", casa: "Alfenense", fora: "1º Maio Figueiró", inicio }, "fpf");
  pt._registarJogo(comp, serie, 4, { fpfId: "999003", casa: "ACR Sendim", fora: "Alfenense", inicio: inicio - 7 * 86400e3, hs: 2, as: 2, estado: "final" }, "fpf");
  assert.equal(j.igCasa, "adcarvalhosa");
  assert.equal(j.igFora, "acr_sendim");
  // os alvos do Instagram incluem os clubes destes jogos
  assert.ok(pt.alvos().some((a) => a.handle === "adcarvalhosa"));
  const r1 = pt.evidencia({ id: "ig:story:1", tipo: "story", conta: "adcarvalhosa", ts: agora - 20 * 60000, texto: "GOLOOO! ⚽ 1-0" });
  assert.equal(r1.decisao, "novo");
  assert.equal(j.hs, 1);
  const r2 = pt.evidencia({ id: "ig:story:2", tipo: "story", conta: "acr_sendim", ts: agora - 18 * 60000, texto: "Sofremos. 0-1" });
  assert.equal(r2.decisao, "confirmacao");
  const golo = eventos.filter(([e]) => e === "pt-evento").map(([, d]) => d).find((d) => d.id.includes(":g1"));
  assert.ok(golo, "evento de golo no feed");
  assert.equal(golo.liga, "pt-af-porto");
  assert.ok(golo.pt.confirmado, "o evento do golo passa a dizer que foi confirmado pelos dois clubes");
  const tab = pt._tabela(comp, serie);
  assert.equal(tab[0].equipa, "AD Carvalhosa");
  assert.ok(tab[0].aoVivo);
  assert.equal(pt._jornadaAtual(comp, serie), 5);
  // repetição do mesmo story não faz nada
  assert.equal(pt.evidencia({ id: "ig:story:1", tipo: "story", conta: "adcarvalhosa", ts: agora, texto: "GOLO 1-0" }).decisao, "repetido");
  // conta que não está a jogar
  assert.equal(pt.evidencia({ id: "ig:story:3", tipo: "story", conta: "accroca", ts: agora, texto: "GOLO 1-0" }).decisao, "sem_jogo");
});

test("tabela: uma oficial lida antes dos jogos de domingo não anula os resultados novos", () => {
  const sabado = Date.parse("2026-10-10T20:00:00Z"), domingo = Date.parse("2026-10-11T14:00:00Z");
  const jogos = [
    { id: 1, casa: "A", fora: "B", hs: 1, as: 0, estado: "final", inicio: sabado - 7 * 86400e3 },
    { id: 2, casa: "B", fora: "A", hs: 3, as: 0, estado: "final", inicio: domingo },
  ];
  // oficial de sábado à noite: A com 3 pontos menos 3 de castigo
  const oficial = [{ equipa: "A", j: 1, v: 1, e: 0, d: 0, gm: 1, gs: 0, pts: 0 }, { equipa: "B", j: 1, v: 0, e: 0, d: 1, gm: 0, gs: 1, pts: 0 }];
  const t = tabelaAoVivo({ equipas: ["A", "B"], jogos, oficial, antesDe: sabado + 3600e3 });
  const B = t.find((l) => l.equipa === "B"), A = t.find((l) => l.equipa === "A");
  assert.equal(B.j, 2); assert.equal(B.pts, 3);
  assert.equal(A.j, 2); assert.equal(A.pts, 0, "o castigo mantém-se");
});

test("Streamain: só entram vídeos de futebol (o Minecraft e os outros desportos ficam de fora)", async () => {
  const { eFutebol, aceita } = await import("../server/sources/streamain.js");
  assert.equal(eFutebol("Minecraft but every block is a goal"), false);
  assert.equal(eFutebol("Minecraft Hardcore 1-100 days"), false);
  assert.equal(eFutebol("EA FC 26 Ultimate Team pack opening"), false);
  assert.equal(eFutebol("NBA highlights Lakers vs Celtics"), false);
  assert.equal(eFutebol("Day 1 vs Day 100"), false); // «vs» e números sozinhos não chegam
  assert.equal(eFutebol("Benfica 2-1 Porto - Pavlidis 67'"), true);
  assert.equal(eFutebol("Arouca [1] - 2 Estoril - Yaw Moses 45+2'"), true);
  assert.equal(eFutebol("Mario Götze goal vs Argentina"), true);
  assert.equal(aceita({ post_id: "streamain:luSIbqVpKPbmv8J", title: "Benfica 2-1 Porto" }), false); // tirado à mão
});
