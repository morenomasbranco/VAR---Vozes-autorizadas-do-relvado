import { test } from "node:test";
import assert from "node:assert/strict";
import { pedidoDaCronica, lerCronica, createProsebot, TAMANHOS } from "../server/prosebot.js";

const JOGO = { casa: "FC Porto", fora: "Benfica", hs: 2, as: 1, comp: "Liga Portugal, 8.ª jornada", quando: "sábado, no Estádio do Dragão" };
const NOTAS = "23' golo de Samu, de cabeça\n67' Pavlidis empata\n88' Rodrigo Mora decide de livre direto";

test("prosebot: o pedido leva o jogo, as notas, o tamanho e o vocabulário do glossário", () => {
  const p = pedidoDaCronica({ jogo: JOGO, notas: NOTAS, figura: "Rodrigo Mora", tamanho: "curta", vocabulario: "FC Porto: dragões, azuis e brancos" });
  assert.match(p, /^Jogo: FC Porto 2–1 Benfica · Liga Portugal, 8\.ª jornada\./);
  assert.match(p, /Quando e onde: sábado, no Estádio do Dragão\./);
  assert.match(p, /Figura do jogo, para quem escreveu as notas: Rodrigo Mora\./);
  assert.ok(p.includes(TAMANHOS.curta));
  assert.match(p, /dragões, azuis e brancos/);
  assert.ok(p.includes(`"""\n${NOTAS}\n"""`));
  // sem resultado: o modelo segue as notas; tamanho desconhecido: o normal
  const q = pedidoDaCronica({ jogo: { casa: "Braga", fora: "Vitória", hs: "", as: null }, notas: NOTAS, tamanho: "enorme" });
  assert.match(q, /Braga – Vitória \(resultado não indicado/);
  assert.ok(q.includes(TAMANHOS.normal));
});

test("prosebot: sem equipas ou sem notas, o pedido é recusado (400)", () => {
  assert.throws(() => pedidoDaCronica({ jogo: { casa: "FC Porto" }, notas: NOTAS }), (e) => e.status === 400 && /equipas/.test(e.message));
  assert.throws(() => pedidoDaCronica({ jogo: JOGO, notas: "curto" }), (e) => e.status === 400 && /notas/.test(e.message));
});

test("prosebot: lê a crónica devolvida, com a figura do jogo", () => {
  const c = lerCronica({ titulo_site: "Mora decide o clássico", lead: "O FC Porto vence.", corpo: ["Um.", "", "Dois."], figura: { nome: "Rodrigo Mora", texto: "Decide com um livre." }, notas: [] });
  assert.equal(c.tituloSite, "Mora decide o clássico");
  assert.deepEqual(c.corpo, ["Um.", "Dois."]);
  assert.deepEqual(c.figura, { nome: "Rodrigo Mora", texto: "Decide com um livre." });
  assert.deepEqual(c.citacoes, []);
  assert.equal(lerCronica({ corpo: ["x"], figura: "Samu" }).figura.nome, "Samu");
  assert.equal(lerCronica({ corpo: ["x"], figura: {} }).figura, null);
});

test("prosebot: escreve pelo Groq e diz quem escreveu", async () => {
  const original = globalThis.fetch;
  const antes = { g: process.env.GROQ_API_KEY, m: process.env.IA_MOTORES, ge: process.env.GEMINI_API_KEY, c: process.env.ANTHROPIC_API_KEY };
  try {
    process.env.GROQ_API_KEY = "teste"; delete process.env.IA_MOTORES; delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    let sistema = "";
    globalThis.fetch = async (url, op) => {
      const corpo = JSON.parse(op.body);
      sistema = corpo.messages[0].content;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"titulo_site":"Mora decide o clássico no Dragão","lead":"O FC Porto vence o Benfica.","corpo":["Parágrafo."],"figura":{"nome":"Rodrigo Mora","texto":"Livre decisivo."},"notas":["Falta o árbitro."]}' } }] }) };
    };
    const p = createProsebot();
    const r = await p.cronica({ jogo: JOGO, notas: NOTAS });
    assert.equal(r.tituloSite, "Mora decide o clássico no Dragão");
    assert.equal(r.figura.nome, "Rodrigo Mora");
    assert.equal(r.motor, "Groq");
    assert.match(sistema, /crónica/);
    assert.match(sistema, /Nunca inventas lances/);
    assert.match(sistema, /90 caracteres/); // as regras do zerozero vão no pedido
    assert.equal(p.estado().cronicas, 1);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of [["GROQ_API_KEY", antes.g], ["IA_MOTORES", antes.m], ["GEMINI_API_KEY", antes.ge], ["ANTHROPIC_API_KEY", antes.c]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});
