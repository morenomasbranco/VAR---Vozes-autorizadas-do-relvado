import { test } from "node:test";
import assert from "node:assert/strict";
import { createFrases, lerFrases, fraseValida } from "../server/frases.js";
import { _iaTeste } from "../server/ia.js";

test("frases: lê as alternativas da IA (sem aspas, sem repetidas) e valida a frase", () => {
  const r = lerFrases({ sentido: "ganhar sem margem", alternativas: ["«vencer pela margem mínima»", { texto: "Vencer pela margem mínima" }, { texto: "triunfo suado", nota: "mais informal" }, { texto: "" }, 3] });
  assert.equal(r.sentido, "ganhar sem margem");
  assert.deepEqual(r.alternativas, [{ texto: "vencer pela margem mínima", nota: null }, { texto: "triunfo suado", nota: "mais informal" }]);
  assert.deepEqual(lerFrases(null), { sentido: "", alternativas: [] });
  assert.ok(fraseValida("jogar em casa"));
  assert.ok(!fraseValida("ab"));
  assert.ok(!fraseValida("x".repeat(161)));
  assert.ok(!fraseValida("123 456"));
});

test("frases: pede à IA os sinónimos ou os antónimos de uma frase e guarda a resposta", async () => {
  const original = globalThis.fetch;
  const antes = { g: process.env.GROQ_API_KEY, ge: process.env.GEMINI_API_KEY, c: process.env.ANTHROPIC_API_KEY, m: process.env.IA_MOTORES };
  const pedidos = [];
  try {
    process.env.GROQ_API_KEY = "teste"; delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.IA_MOTORES;
    _iaTeste.limpar();
    globalThis.fetch = async (url, op) => {
      pedidos.push(JSON.parse(op.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"sentido": "ganhar com folga", "alternativas": [{"texto": "vencer por números expressivos"}, {"texto": "golear", "nota": "se foram muitos golos"}]}' }, finish_reason: "stop" }] }) };
    };
    const f = createFrases();
    const r = await f.procurar("  ganhou por muitos  ", "sinonimos");
    assert.equal(r.frase, "ganhou por muitos");
    assert.equal(r.motor, "Groq");
    assert.deepEqual(r.alternativas.map((a) => a.texto), ["vencer por números expressivos", "golear"]);
    assert.match(pedidos[0].messages[1].content, /Frase: «ganhou por muitos»\nProcuro: sinónimos/);
    assert.match(pedidos[0].messages[0].content, /português de Portugal/);
    await f.procurar("Ganhou por muitos", "sinonimos");
    assert.equal(pedidos.length, 1, "a mesma frase não volta a gastar a quota");
    await f.procurar("ganhou por muitos", "antonimos");
    assert.match(pedidos[1].messages[1].content, /Procuro: antónimos/);
    await assert.rejects(f.procurar("ab"), (e) => e.status === 400);
    assert.equal(f.estado().pedidos, 2);
  } finally {
    globalThis.fetch = original;
    _iaTeste.limpar();
    for (const [k, v] of [["GROQ_API_KEY", antes.g], ["GEMINI_API_KEY", antes.ge], ["ANTHROPIC_API_KEY", antes.c], ["IA_MOTORES", antes.m]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});
