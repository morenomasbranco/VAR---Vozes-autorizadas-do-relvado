import { test } from "node:test";
import assert from "node:assert/strict";
import { arrumar, ptbr, pareceBrasil, avisos, numeros } from "../web/src/glossario/declaracoes.js";
import { REGRAS, REGRAS_TEXTO } from "../web/src/glossario/regras-zerozero.js";
import { lerPeca, interno } from "../server/declaracoes.js";
import { lerCuriosidades } from "../server/curiosidades.js";
import { lerJson, pedirIA } from "../server/ia.js";

test("declarações: aspas «», ponto final dentro ou fora das aspas e maiúscula depois dos dois pontos", () => {
  assert.equal(arrumar('O treinador disse: "estamos preparados".'), "O treinador disse: «Estamos preparados.»");
  assert.equal(arrumar('"Foi um jogo difícil.", acrescentou Marco.'), "«Foi um jogo difícil», acrescentou Marco.");
  assert.equal(arrumar("A exibição foi «fantástica»."), "A exibição foi «fantástica».");
  assert.equal(arrumar("«Sabemos o que valemos».", { perguntaResposta: true }), "«Sabemos o que valemos.»");
  assert.equal(arrumar('Disse "isto é o "nosso" momento" ontem.'), "Disse «isto é o “nosso” momento» ontem.");
});

test("declarações: números como o zerozero os escreve", () => {
  assert.equal(numeros("Marcou 3 golos e fez 2 assistências em 11 jogos."), "Marcou três golos e fez duas assistências em 11 jogos.");
  assert.equal(numeros("Ganhou 1 vez, em 4 de outubro, por 2-1, aos 9', num 4-3-3, às 9h00."), "Ganhou uma vez, em 4 de outubro, por 2-1, aos 9', num 4-3-3, às 9h00.");
  assert.equal(numeros("90% dos 6140 adeptos"), "90 por cento dos 6.140 adeptos");
  assert.equal(numeros("Custou 60.000.000 € e mais 15M€ em 2024"), "Custou 60 milhões de euros e mais 15 milhões de euros em 2024");
  assert.equal(numeros("o 1.º lugar e a 3.ª vez na Liga 2 e na Fórmula 1"), "o primeiro lugar e a terceira vez na Liga 2 e na Fórmula 1");
});

test("declarações: do português do Brasil para o de Portugal", () => {
  const br = "O time está trabalhando muito. Eu me sinto feliz com o técnico e a torcida. O goleiro do Antônio chutou e foi gol. Me sinto pronto pra jogar no gramado.";
  assert.ok(pareceBrasil(br));
  assert.equal(ptbr(br), "A equipa está a trabalhar muito. Eu sinto-me feliz com o treinador e a massa adepta. O guarda-redes do António rematou e foi golo. Sinto-me pronto para jogar no relvado.");
  assert.equal(ptbr("Se ganharmos, vamos à final. O departamento técnico decide."), "Se ganharmos, vamos à final. O departamento técnico decide.");
  assert.ok(!pareceBrasil("A equipa está a trabalhar bem e o treinador gosta do plantel."));
});

test("declarações: os avisos das regras que a máquina não corrige", () => {
  const a = avisos("Hoje o FC Porto venceu no Chipre e a FPF gostou.\nO jogo foi bom.\nOs adeptos gostaram.", { titulo: "Treinador: «Estamos prontos». Foram 3 passes decisivos.", lead: "x" });
  const regras = a.map((x) => x.regra);
  for (const r of ["Títulos", "Referências temporais", "Nomes próprios", "Siglas", "Atenções", "Discurso direto"]) assert.ok(regras.includes(r), r);
  assert.ok(a.some((x) => /90|ponto final/.test(x.msg)));
  assert.ok(a.some((x) => /contribuições/.test(x.msg)));
  assert.ok(!a.some((x) => /FC/.test(x.msg)), "FC dispensa explicação");
  assert.deepEqual(avisos("A equipa venceu por dois golos.", { titulo: "Sporting vence em Braga e segue isolado" }), []);
});

test("declarações: as regras do zerozero estão todas no texto dado à IA", () => {
  assert.ok(REGRAS.length >= 10);
  for (const g of REGRAS) assert.ok(REGRAS_TEXTO.includes(g.t));
  assert.ok(REGRAS_TEXTO.includes("90 caracteres"));
});

test("declarações: lê a peça devolvida pela IA, com tolerância", () => {
  const j = lerJson('<think>{ rascunho }</think>\n```json\n{"lingua_original":"pt-BR","titulo_site":"Farioli: «Vamos lutar»","corpo":["Um.", "", "Dois."],"citacoes":"«Vamos lutar», disse.","notas":null}\n```');
  const p = lerPeca(j);
  assert.equal(p.lingua, "pt-BR");
  assert.equal(p.tituloSite, "Farioli: «Vamos lutar»");
  assert.deepEqual(p.corpo, ["Um.", "Dois."]);
  assert.deepEqual(p.citacoes, ["«Vamos lutar», disse."]);
  assert.deepEqual(p.notas, []);
  assert.equal(p.lead, "");
});

test("declarações: não se vai buscar vídeos a endereços internos", () => {
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "172.16.3.1", "192.168.0.10", "169.254.169.254", "[::1]"]) assert.ok(interno(h), h);
  for (const h of ["t.me", "streamff.pro", "cdn4.telesco.pe", "172.15.0.1"]) assert.ok(!interno(h), h);
});

test("curiosidades: só as que têm texto, com fonte quando é um endereço", () => {
  const c = lerCuriosidades({ curiosidades: [{ texto: "O FC Porto venceu os últimos três jogos com o Benfica no Dragão.", fonte: "https://www.zerozero.pt" }, "Curto", { texto: "Sem fonte mas com texto suficiente para contar.", fonte: "zerozero" }] });
  assert.equal(c.length, 2);
  assert.equal(c[0].fonte, "https://www.zerozero.pt");
  assert.equal(c[1].fonte, null);
});

test("IA: um modelo do Groq sem quota passa ao seguinte, e sem chaves diz o que falta", async () => {
  const original = globalThis.fetch;
  const antes = { g: process.env.GROQ_API_KEY, ge: process.env.GEMINI_API_KEY, c: process.env.ANTHROPIC_API_KEY, m: process.env.IA_MOTORES };
  const pedidos = [];
  try {
    delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.IA_MOTORES;
    delete process.env.GROQ_API_KEY;
    await assert.rejects(pedirIA({ sistema: "s", pedido: "p" }), /chave de IA/);
    process.env.GROQ_API_KEY = "teste";
    globalThis.fetch = async (url, op) => {
      const corpo = JSON.parse(op.body);
      pedidos.push(corpo.model);
      if (pedidos.length === 1) return { ok: false, status: 429, text: async () => "rate limit" };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"texto": "ok"}' } }] }) };
    };
    const r = await pedirIA({ sistema: "s", pedido: "p", uso: "teste" });
    assert.deepEqual(r.json, { texto: "ok" });
    assert.equal(r.motor, "Groq");
    assert.equal(pedidos.length, 2);
    assert.notEqual(pedidos[0], pedidos[1]);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of [["GROQ_API_KEY", antes.g], ["GEMINI_API_KEY", antes.ge], ["ANTHROPIC_API_KEY", antes.c], ["IA_MOTORES", antes.m]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});
