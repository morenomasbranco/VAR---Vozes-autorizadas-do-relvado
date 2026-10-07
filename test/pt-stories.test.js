import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTexto } from "../server/pt/stories/parser.js";
import { aplicar, aplicarOficial, novoJogoEstado } from "../server/pt/stories/evidencia.js";
import { minutoEm, minutoDoGolo, textoMinuto } from "../server/pt/stories/relogio.js";

const T0 = Date.parse("2026-10-11T14:00:00Z"); // 15:00 em Lisboa
const min = (m) => T0 + m * 60000;
const jogo = () => novoJogoEstado({ id: "j1", casa: "GD Covelo", fora: "SC Rio Tinto", inicio: T0, mod: "futebol", nomes: { h: ["GD Covelo", "Covelo"], a: ["SC Rio Tinto", "Rio Tinto"] } });
let n = 0;
const story = (lado, texto, ts, extra = {}) => ({ id: `s${++n}`, tipo: "story", conta: lado === "h" ? "gd.covelo" : "scriotinto", lado, texto, ts, ...extra });

test("parser: golo com minuto, resultado e marcador", () => {
  const L = lerTexto("GOLOOOO! ⚽ João Silva 23'\nGD Covelo 1-0 SC Rio Tinto");
  assert.ok(L.eventos.includes("golo"));
  assert.deepEqual([L.placar.a, L.placar.b], [1, 0]);
  assert.equal(L.minuto.min, 23);
  assert.equal(L.marcadores[0], "João Silva");
});

test("parser: intervalo, final e horas que não são resultados", () => {
  assert.ok(lerTexto("INTERVALO | 0-0").eventos.includes("intervalo"));
  const f = lerTexto("RESULTADO FINAL\n2 - 1");
  assert.ok(f.eventos.includes("final"));
  assert.deepEqual([f.placar.a, f.placar.b], [2, 1]);
  assert.equal(lerTexto("Hoje jogamos às 15:30 no Campo da Bela Vista, 12/10").placar, null);
  assert.ok(lerTexto("Final da 1ª parte 1-1").eventos.includes("intervalo"));
  assert.ok(!lerTexto("Final da 1ª parte 1-1").eventos.includes("final"));
  assert.ok(lerTexto("Início da 2ª parte").eventos.includes("recomeco"));
  assert.equal(lerTexto("45+2' golo").minuto.extra, 2);
});

test("golo sem minuto: minuto estimado a partir do story de início", () => {
  const j = jogo();
  aplicar(j, story("h", "Começou o jogo! Vamos Covelo", min(4)));
  assert.equal(j.estado, "direto");
  const r = aplicar(j, story("h", "GOLO! 1-0", min(31)));
  assert.equal(r.decisao, "novo");
  assert.equal(j.hs, 1);
  const g = j.golos[0];
  assert.equal(g.minFonte, "estimado");
  // começou às 15:03 (story às 15:04 menos 1 min de atraso); story do golo às 15:31 → golo às ~15:30 → ~27'
  assert.ok(g.min >= 26 && g.min <= 28, `minuto ${g.min}`);
});

test("o segundo clube confirma em vez de criar outro golo, mesmo escrevendo o resultado ao contrário", () => {
  const j = jogo();
  aplicar(j, story("h", "GOLO 1-0 ⚽ 12'", min(14)));
  const r = aplicar(j, story("a", "Golo sofrido. 0-1", min(16)));
  assert.equal(r.decisao, "confirmacao");
  assert.equal(j.golos.length, 1);
  assert.equal(j.hs, 1); assert.equal(j.as, 0);
  assert.ok(j.confirmado.h && j.confirmado.a);
});

test("visitante com convenção «nós primeiro» marca: o motor orienta pelo estado", () => {
  const j = jogo();
  aplicar(j, story("h", "GOLO 1-0", min(10)));
  const r = aplicar(j, story("a", "GOLOOO do Rio Tinto! 1-1 ⚽ Rui 30'", min(32)));
  assert.equal(r.decisao, "novo");
  assert.equal(j.hs, 1); assert.equal(j.as, 1);
  const r2 = aplicar(j, story("a", "GOLO! Passamos para a frente 2-1", min(60)));
  assert.equal(r2.decisao, "novo");
  assert.equal(j.as, 2, "o 2-1 do visitante é 1-2 em casa-fora");
  assert.equal(j.hs, 1);
  assert.equal(r2.orientacao, "propria_primeiro");
});

test("nomes no texto decidem a orientação", () => {
  const j = jogo();
  const r = aplicar(j, story("a", "Rio Tinto 0-1 Covelo", min(20)));
  assert.equal(j.hs, 1); assert.equal(j.as, 0);
  assert.equal(r.orientacao, "propria_primeiro");
});

test("story atrasado com resultado antigo fica como histórico", () => {
  const j = jogo();
  aplicar(j, story("h", "GOLO 1-0", min(10)));
  aplicar(j, story("h", "GOLO 2-0", min(40)));
  const r = aplicar(j, story("a", "0-1 ao intervalo... perdão", min(41)));
  assert.equal(r.decisao, "historico");
  assert.equal(j.hs, 2);
});

test("stories perdidos: de 0-0 para 2-1 cria três golos e só o último leva minuto", () => {
  const j = jogo();
  aplicar(j, story("h", "Começou", min(2)));
  aplicar(j, story("h", "GOLO 2-1 ⚽ 70'", min(80)));
  assert.equal(j.golos.length, 3);
  assert.equal(j.golos.at(-1).lado, "h");
  assert.equal(j.golos.at(-1).min, 70);
  assert.equal(j.golos[0].minFonte, "desconhecido");
});

test("intervalo, recomeço e final pelo story; resultado oficial fecha o jogo", () => {
  const j = jogo();
  aplicar(j, story("h", "Apito inicial!", min(1)));
  aplicar(j, story("h", "INTERVALO 0-0", min(49)));
  assert.equal(j.estado, "intervalo");
  aplicar(j, story("a", "Começou a 2ª parte", min(65)));
  assert.equal(j.estado, "direto");
  aplicar(j, story("a", "GOLO! 1-0 para nós", min(80)));
  assert.equal(j.as, 1, "golo do visitante, que escreve o próprio resultado primeiro");
  const g = j.golos[0];
  assert.ok(g.min > 45 && g.min < 70, `minuto ${g.min}`);
  aplicar(j, story("h", "Final. 0-1", min(115)));
  assert.equal(j.estado, "final");
  assert.equal(j.oficial, false);
  aplicarOficial(j, { hs: 0, as: 1 });
  assert.equal(j.oficial, true);
  assert.equal(j.golosIncompletos, false);
});

test("golo sem resultado, repetido pelo mesmo clube, conta uma vez", () => {
  const j = jogo();
  aplicar(j, story("h", "GOLOOOOO ⚽⚽⚽", min(20)));
  aplicar(j, story("h", "Golo de Tiago Mendes", min(22)));
  assert.equal(j.hs, 1);
  assert.equal(j.golos.length, 1);
  assert.equal(j.golos[0].marcador, "Tiago Mendes");
});

test("antevisões e onze inicial não mexem no jogo", () => {
  const j = jogo();
  assert.equal(aplicar(j, story("h", "Dia de jogo! Hoje às 15h vamos a jogo. Venha apoiar", min(-120))).decisao, "ignorado");
  assert.equal(aplicar(j, story("h", "Onze inicial", min(-30))).decisao, "ignorado");
  assert.equal(j.hs, null);
});

test("relógio: sem stories usa a hora marcada; futsal anda mais devagar", () => {
  const j = jogo();
  assert.equal(minutoEm(j, min(-5)), null);
  const m = minutoEm(j, min(30));
  assert.equal(m.confianca, "baixa");
  assert.ok(m.min >= 27 && m.min <= 29);
  const segunda = minutoEm(j, min(90));
  assert.equal(segunda.parte, 2);
  const fs = minutoEm({ ...j, relogio: { inicio: T0 } }, T0 + 19 * 60000, "futsal");
  assert.ok(fs.min >= 10 && fs.min <= 11, `futsal ${fs.min}`);
  assert.equal(textoMinuto({ min: 45, extra: 2, fonte: "estimado" }), "~45'+2'");
  assert.equal(minutoDoGolo({ ...j, relogio: { inicio: T0, intervalo: min(47) } }, min(52)).min, 45);
});
