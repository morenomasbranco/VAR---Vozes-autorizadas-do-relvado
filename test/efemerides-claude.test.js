import { test } from "node:test";
import assert from "node:assert/strict";

test("Nesta semana pelo Claude: retoma a pesquisa interrompida e guarda a lista da ferramenta", async () => {
  process.env.ANTHROPIC_API_KEY = "teste";
  const { pesquisarDia } = await import("../server/sources/efemerides-claude.js");
  const pedidos = [];
  const respostas = [
    { stop_reason: "pause_turn", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "13 outubro 2016 futebol" } }] },
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "guardar_efemerides", input: { acontecimentos: [
      { ano: 2016, ambito: "portugal", modalidade: "futebol", titulo: "Portugal vence", descricao: "…", fonte: "https://exemplo.pt", importancia: "alta" },
    ] } }] },
  ];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, op) => {
    pedidos.push({ url, corpo: JSON.parse(op.body), headers: op.headers });
    return { ok: true, json: async () => respostas.shift() };
  };
  try {
    const lista = await pesquisarDia({ ano: 2026, mes: 10, dia: 13 }, [2025, 2016, 1926]);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].ambito, "portugal");
    assert.equal(pedidos.length, 2);
    const c = pedidos[0].corpo;
    assert.equal(c.model, "claude-opus-5-5");
    assert.equal(c.fallbacks, "default");
    assert.equal(pedidos[0].headers["anthropic-beta"], "server-side-fallback-2026-07-01");
    assert.ok(c.tools.some((t) => t.type === "web_search_20260209"));
    assert.match(c.messages[0].content, /13 de outubro/);
    assert.match(c.messages[0].content, /1926 \(há 100 anos\)/);
    // a segunda volta reenvia a resposta interrompida, sem mensagem nova do utilizador
    assert.equal(pedidos[1].corpo.messages.length, 2);
    assert.equal(pedidos[1].corpo.messages[1].role, "assistant");
  } finally { globalThis.fetch = original; }
});

test("Nesta semana pelo Gemini (gratuito): pesquisa Google e JSON lido do texto", async () => {
  process.env.GEMINI_API_KEY = "gratis";
  const { pesquisarDiaGemini, lerJsonGemini } = await import("../server/sources/efemerides-claude.js");
  const pedidos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, op) => {
    pedidos.push({ url, corpo: JSON.parse(op.body), headers: op.headers });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n{"acontecimentos":[{"ano":1926,"ambito":"portugal","modalidade":"futebol","titulo":"Fundação de um clube","descricao":"…","fonte":"https://exemplo.pt","importancia":"alta"},{"ano":"x","titulo":"sem ano"}]}\n```' }] } }] }) };
  };
  try {
    const lista = await pesquisarDiaGemini({ ano: 2026, mes: 10, dia: 13 }, [2025, 1926]);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].ano, 1926);
    assert.match(pedidos[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/);
    assert.equal(pedidos[0].headers["x-goog-api-key"], "gratis");
    assert.deepEqual(pedidos[0].corpo.tools, [{ google_search: {} }]);
    assert.match(pedidos[0].corpo.systemInstruction.parts[0].text, /APENAS com um objeto JSON/);
    assert.doesNotMatch(pedidos[0].corpo.systemInstruction.parts[0].text, /guardar_efemerides/);
  } finally { globalThis.fetch = original; }
  assert.throws(() => lerJsonGemini("não encontrei nada"), /JSON/);
  assert.deepEqual(lerJsonGemini('{"acontecimentos": []}'), []);
});
