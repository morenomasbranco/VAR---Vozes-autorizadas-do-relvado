import { test } from "node:test";
import assert from "node:assert/strict";
import { createTradutor } from "../server/traduz.js";

// guarda e repõe as chaves e o fetch
async function comAmbiente(env, fetchFalso, fn) {
  const original = globalThis.fetch;
  const antes = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  try {
    for (const [k, v] of Object.entries(env)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    globalThis.fetch = fetchFalso;
    await fn();
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of Object.entries(antes)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
}

test("tradutor: os títulos em português passam primeiro pelo modelo de linguagem do Groq, com os nomes marcados", async () => {
  const pedidos = [];
  await comAmbiente({ GROQ_API_KEY: "teste", IA_MOTORES: null, GEMINI_API_KEY: null, ANTHROPIC_API_KEY: null }, async (url, op) => {
    pedidos.push(String(url));
    const corpo = JSON.parse(op.body);
    assert.equal(corpo.model, "openai/gpt-oss-20b");
    assert.equal(corpo.reasoning_effort, "low");
    assert.match(corpo.messages[1].content, /Real Madrid make move for ==Mac Allister==/);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"traducoes":[{"i":0,"titulo":"Real Madrid avança por ==Mac Allister=="}]}' } }] }) };
  }, async () => {
    const t = createTradutor({ log: () => {} });
    const [r] = await t.pedir("pt", [{ id: "x1", titulo: "Real Madrid make move for ==Mac Allister==" }]);
    assert.deepEqual(r, { id: "x1", t: "Real Madrid avança por ==Mac Allister==", b: [] });
    assert.equal(pedidos.length, 1);
    assert.ok(pedidos[0].includes("api.groq.com"));
    assert.equal(t.estado().viaIA, 1);
  });
});

test("tradutor: sem a IA (sem quota ou um nome perdido), segue para o Google Tradutor", async () => {
  const pedidos = [];
  await comAmbiente({ GROQ_API_KEY: "teste", IA_MOTORES: null, GEMINI_API_KEY: null, ANTHROPIC_API_KEY: null }, async (url) => {
    pedidos.push(String(url));
    if (String(url).includes("groq")) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"traducoes":[{"i":0,"titulo":"Mac Allister no Real Madrid"}]}' } }] }) };
    return { ok: true, status: 200, json: async () => [[["O Real Madrid avança por Mac Allister", "x"]], null, "en"] };
  }, async () => {
    const t = createTradutor({ log: () => {} });
    const [r] = await t.pedir("pt", [{ id: "x2", titulo: "Real Madrid make move for ==Mac Allister==" }]);
    assert.equal(r.t, "O Real Madrid avança por ==Mac Allister==");
    assert.ok(pedidos.some((u) => u.includes("translate")));
  });
});
