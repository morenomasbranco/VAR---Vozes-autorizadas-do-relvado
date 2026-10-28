import { test } from "node:test";
import assert from "node:assert/strict";
import { curiosidadesEspn, curiosidadesPt, numero, ordinal, data } from "../server/curiosidades-dados.js";
import { createCuriosidades, mensagemIA } from "../server/curiosidades.js";

// um resumo da ESPN com o essencial (o mesmo formato do site.api.espn.com/…/summary)
const RESUMO = {
  header: { competitions: [{ competitors: [{ homeAway: "home", team: { id: "437", displayName: "FC Porto" } }, { homeAway: "away", team: { id: "1929", displayName: "Benfica" } }] }] },
  headToHeadGames: [{ team: { id: "437" }, events: [
    { id: "1", gameDate: "2026-04-05T19:30Z", homeTeamId: "1929", awayTeamId: "437", homeTeamScore: "1", awayTeamScore: "4", leagueName: "Liga Portugal" },
    { id: "2", gameDate: "2025-11-02T20:00Z", homeTeamId: "437", awayTeamId: "1929", homeTeamScore: "2", awayTeamScore: "2", leagueName: "Liga Portugal" },
    { id: "3", gameDate: "2025-03-01T20:00Z", homeTeamId: "437", awayTeamId: "1929", homeTeamScore: "0", awayTeamScore: "1", leagueName: "Liga Portugal" },
  ] }],
  boxscore: { form: [{ team: { id: "437" }, events: [{ gameResult: "W" }, { gameResult: "W" }, { gameResult: "D" }] }, { team: { id: "1929" }, events: [{ gameResult: "L" }, { gameResult: "W" }] }] },
  standings: { groups: [{ standings: { entries: [
    { team: { id: "437" }, stats: [{ name: "rank", value: 1 }, { name: "points", value: 22 }] },
    { team: { id: "1929" }, stats: [{ name: "rank", value: 3 }, { name: "points", value: 9 }] },
  ] } }] },
  gameInfo: { venue: { fullName: "Estádio do Dragão", address: { city: "Porto" } }, officials: [{ displayName: "João Pinheiro", position: { displayName: "Referee" } }] },
};

test("curiosidades (ESPN): historial, último encontro, maior diferença, forma, classificação, estádio e árbitro", () => {
  const c = curiosidadesEspn(RESUMO, { casa: "FC Porto", fora: "Benfica" }).map((x) => x.texto);
  assert.equal(c[0], "Nos últimos três jogos entre FC Porto e Benfica, FC Porto venceu um, Benfica venceu um e houve um empate.");
  assert.equal(c[1], "Último encontro: Benfica 1–4 FC Porto, a 5 de abril de 2026 (Liga Portugal).");
  // a maior diferença é a do último encontro: não se repete
  assert.ok(!c.some((x) => x.startsWith("A maior diferença")));
  assert.equal(c[2], "Forma nos últimos jogos (do mais recente para o mais antigo): FC Porto V V E; Benfica D V.");
  assert.ok(c.includes("Na classificação: FC Porto é primeiro, com 22 pontos; Benfica é terceiro, com nove pontos."));
  assert.ok(c.includes("Palco do jogo: Estádio do Dragão (Porto)."));
  assert.ok(c.includes("Árbitro: João Pinheiro."));
  assert.deepEqual(curiosidadesEspn({}, { casa: "A", fora: "B" }), []);
});

test("curiosidades (Portugal): classificação, forma, golos e jogos desta época", () => {
  const c = curiosidadesPt({
    comp: "Pró-Nacional", serie: null, jornada: 3, equipas: 16, casa: "SC Ucha", fora: "UD Polvoreira", local: "Campo de Ucha",
    linhas: { casa: { pos: 16, pts: 1, j: 1, gm: 1, gs: 1, forma: ["e"] }, fora: { pos: 1, pts: 3, j: 1, gm: 2, gs: 0, forma: ["v"] } },
    entre: [{ casa: "UD Polvoreira", fora: "SC Ucha", hs: 2, as: 0, inicio: Date.parse("2026-10-14T14:00:00Z") }],
  }).map((x) => x.texto);
  assert.equal(c[0], "Na classificação (Pró-Nacional, 3.ª jornada): SC Ucha é 16.º, com um ponto (último); UD Polvoreira é primeiro, com três pontos (lidera).");
  assert.equal(c[1], "Forma nos últimos jogos (do mais recente para o mais antigo): SC Ucha E; UD Polvoreira V.");
  assert.equal(c[2], "Golos nesta época: SC Ucha marcou um e sofreu um num jogo; UD Polvoreira marcou dois e não sofreu golos num jogo.");
  assert.equal(c[3], "Já se defrontaram esta época: UD Polvoreira 2–0 SC Ucha (14 de outubro de 2026).");
  assert.equal(c[4], "Palco do jogo: Campo de Ucha.");
  assert.deepEqual(curiosidadesPt(null), []);
});

test("curiosidades: números e datas como o zerozero os escreve", () => {
  assert.equal(numero(3), "três");
  assert.equal(numero(2, true), "duas");
  assert.equal(numero(14), "14");
  assert.equal(ordinal(9), "nono");
  assert.equal(ordinal(10), "10.º");
  assert.equal(data(Date.parse("2026-10-04T15:00:00Z")), "4 de outubro de 2026");
});

test("curiosidades: os dados vêm logo e a pesquisa na web só a pedido; sem quota, a explicação em português", async () => {
  let pedidosEspn = 0;
  const c = createCuriosidades({ dadosDoJogo: () => ({ espn: { slug: "soccer/por.1", id: "999" } }), espn: async () => { pedidosEspn++; return RESUMO; } });
  const r = await c({ h: "FC Porto", a: "Benfica" });
  assert.ok(r.dados.length >= 5);
  assert.equal(r.web, null);
  await c({ h: "FC Porto", a: "Benfica" });
  assert.equal(pedidosEspn, 1, "os dados ficam guardados uns minutos");
  // pesquisa na web sem nenhuma chave de IA: a explicação, sem o erro técnico
  const antes = { g: process.env.GROQ_API_KEY, ge: process.env.GEMINI_API_KEY, cl: process.env.ANTHROPIC_API_KEY };
  try {
    delete process.env.GROQ_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const w = await c({ h: "FC Porto", a: "Benfica", naWeb: true });
    assert.ok(w.dados.length >= 5);
    assert.equal(w.web, null);
    assert.match(w.webErro, /não está configurada/);
  } finally {
    for (const [k, v] of [["GROQ_API_KEY", antes.g], ["GEMINI_API_KEY", antes.ge], ["ANTHROPIC_API_KEY", antes.cl]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
  assert.match(mensagemIA(Object.assign(new Error("x"), { codigo: "quota" })), /limite gratuito de hoje/);
  assert.match(mensagemIA(new Error("Groq (openai/gpt-oss-20b) respondeu 429: Rate limit reached")), /limite gratuito de hoje/);
  assert.match(mensagemIA(new Error("fetch failed")), /não respondeu agora/);
});
