import { test } from "node:test";
import assert from "node:assert/strict";
import { pedirIA, _iaTeste } from "../server/ia.js";

const CHAVES = ["GROQ_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "IA_MOTORES", "IA_CLAUDE_MODEL", "IA_CLAUDE_ESFORCO"];
async function comAmbiente(env, fetchFalso, fn) {
  const original = globalThis.fetch;
  const antes = Object.fromEntries(CHAVES.map((k) => [k, process.env[k]]));
  try {
    for (const k of CHAVES) delete process.env[k];
    Object.assign(process.env, env);
    _iaTeste.limpar();
    globalThis.fetch = fetchFalso;
    await fn();
  } finally {
    globalThis.fetch = original;
    _iaTeste.limpar();
    for (const [k, v] of Object.entries(antes)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
}
const groqOk = (conteudo, fim = "stop") => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: conteudo }, finish_reason: fim }], usage: { total_tokens: 100, completion_tokens: 90 } }) });

test("IA: uma resposta do Groq cortada no limite de tokens (ou sem JSON) passa ao modelo seguinte", async () => {
  const pedidos = [];
  await comAmbiente({ GROQ_API_KEY: "g" }, async (url, op) => {
    const corpo = JSON.parse(op.body);
    pedidos.push(corpo);
    if (pedidos.length === 1) return groqOk("<think>a pensar no que escrever, sem acabar", "length");
    if (pedidos.length === 2) return groqOk("Aqui vai a crónica, sem JSON.");
    return groqOk('{"lead": "ok"}');
  }, async () => {
    const r = await pedirIA({ sistema: "s", pedido: "p", modelosGroq: ["a", "b", "c"] });
    assert.deepEqual(r.json, { lead: "ok" });
    assert.equal(r.modelo, "c");
    assert.deepEqual(pedidos.map((x) => x.model), ["a", "b", "c"]);
    // no Groq não se indica o máximo de tokens: o limite por minuto do plano gratuito contava-o como gasto
    assert.ok(pedidos.every((x) => x.max_completion_tokens == null && x.max_tokens == null));
  });
});

test("IA: com «ordem», o Claude primeiro (com o esforço, o fallback e o máximo de tokens); recusado, passa ao Groq", async () => {
  const pedidos = [];
  await comAmbiente({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "c" }, async (url, op) => {
    pedidos.push({ url: String(url), cab: op.headers, corpo: JSON.parse(op.body) });
    if (String(url).includes("anthropic")) {
      if (pedidos.length === 1) return { ok: true, status: 200, json: async () => ({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"lead": "do Claude"}' }], usage: { input_tokens: 10, output_tokens: 20 } }) };
      return { ok: true, status: 200, json: async () => ({ stop_reason: "refusal", stop_details: { category: "general_harms" }, content: [] }) };
    }
    return groqOk('{"lead": "do Groq"}');
  }, async () => {
    const r = await pedirIA({ sistema: "s", pedido: "p", ordem: ["claude", "groq"], maxTokens: 16000 });
    assert.equal(r.motor, "Claude");
    assert.deepEqual(r.json, { lead: "do Claude" });
    const c = pedidos[0];
    assert.match(c.url, /\/v1\/messages$/);
    assert.equal(c.corpo.model, "claude-opus-5-5");
    assert.equal(c.corpo.max_tokens, 16000);
    assert.deepEqual(c.corpo.output_config, { effort: "medium" });
    assert.equal(c.corpo.fallbacks, "default");
    assert.equal(c.cab["anthropic-beta"], "server-side-fallback-2026-07-01");
    assert.equal(c.corpo.temperature, undefined, "o Claude não aceita a temperatura");
    // o Claude recusa: o pedido segue para o Groq
    const r2 = await pedirIA({ sistema: "s", pedido: "p2", ordem: ["claude", "groq"] });
    assert.equal(r2.motor, "Groq");
    assert.deepEqual(r2.json, { lead: "do Groq" });
    // sem «ordem», a ordem de sempre (o Groq primeiro)
    const n = pedidos.length;
    const r3 = await pedirIA({ sistema: "s", pedido: "p3" });
    assert.equal(r3.motor, "Groq");
    assert.match(pedidos[n].url, /groq/);
  });
});

test("IA: no Gemini, cada modelo tem a sua quota: sem ela (ou sem o modelo), passa ao seguinte, e a resposta vem em modo JSON", async () => {
  const pedidos = [];
  const quotaDoDia = JSON.stringify({ error: { code: 429, message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } });
  await comAmbiente({ GEMINI_API_KEY: "k" }, async (url, op) => {
    const modelo = String(url).match(/models\/([^:]+):/)[1];
    pedidos.push({ modelo, corpo: JSON.parse(op.body) });
    if (modelo === "m1") return { ok: false, status: 429, text: async () => quotaDoDia };
    if (modelo === "m2") return { ok: false, status: 404, text: async () => "model not found" };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"lead": "do Gemini"}' }] }, finishReason: "STOP" }] }) };
  }, async () => {
    const r = await pedirIA({ sistema: "s", pedido: "p", modelosGemini: ["m1", "m2", "m3"] });
    assert.equal(r.motor, "Gemini");
    assert.equal(r.modelo, "m3");
    assert.deepEqual(r.json, { lead: "do Gemini" });
    assert.deepEqual(pedidos.map((x) => x.modelo), ["m1", "m2", "m3"]);
    assert.equal(pedidos[2].corpo.generationConfig.responseMimeType, "application/json");
    // o modelo sem a quota do dia e o que não existe ficam de parte: o pedido seguinte vai direto ao m3
    await pedirIA({ sistema: "s", pedido: "p2", modelosGemini: ["m1", "m2", "m3"] });
    assert.deepEqual(pedidos.slice(3).map((x) => x.modelo), ["m3"]);
    // com pesquisa na web não há modo JSON (o Gemini não aceita os dois juntos)
    await pedirIA({ sistema: "s", pedido: "p3", pesquisa: true, modelosGemini: ["m3"] });
    assert.equal(pedidos.at(-1).corpo.generationConfig.responseMimeType, undefined);
    assert.deepEqual(pedidos.at(-1).corpo.tools, [{ google_search: {} }]);
  });
});

test("IA: com «motores», o Claude fica de fora mesmo havendo chave (as crónicas só usam os gratuitos)", async () => {
  const hosts = [];
  await comAmbiente({ GEMINI_API_KEY: "k", GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "c" }, async (url) => {
    hosts.push(new URL(String(url)).hostname);
    if (String(url).includes("generativelanguage")) return { ok: false, status: 429, text: async () => "Quota exceeded, retry in 30s" };
    return groqOk('{"lead": "do Groq"}');
  }, async () => {
    const r = await pedirIA({ sistema: "s", pedido: "p", motores: ["gemini", "groq"], ordem: ["gemini", "groq"], modelosGemini: ["m1"] });
    assert.equal(r.motor, "Groq");
    assert.ok(!hosts.some((h) => /anthropic/.test(h)), "o Claude não é chamado");
    assert.deepEqual(hosts.slice(0, 2), ["generativelanguage.googleapis.com", "api.groq.com"]);
  });
});
