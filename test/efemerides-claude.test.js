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

test("Nesta semana pelo Gemini: a quota esgotada (429) pára a pesquisa em vez de gastar os outros dias", async () => {
  process.env.GEMINI_API_KEY = "gratis";
  process.env.EFEMERIDES_MOTOR = "gemini";
  const { createEfemeridesClaude } = await import("../server/sources/efemerides-claude.js");
  const original = globalThis.fetch;
  let pedidos = 0;
  globalThis.fetch = async () => { pedidos++; return { ok: false, status: 429, text: async () => "You exceeded your current quota" }; };
  try {
    const cl = createEfemeridesClaude();
    const dias = [12, 13, 14, 15, 16, 17, 18].map((d) => ({ iso: `2026-10-${d}`, ano: 2026, mes: 10, dia: d }));
    const sem = { dias, hoje: "2026-10-15" };
    await cl.semana(sem, () => [2025, 2016]);
    assert.equal(pedidos, 1, "um só pedido: os outros dias ficam para depois da pausa");
    assert.match(cl.estado().erros["2026-10-15"], /429/);
    assert.ok(cl.estado().pausaAte > Date.now());
    await cl.semana(sem, () => [2025, 2016]); // ainda em pausa
    assert.equal(pedidos, 1);
  } finally { globalThis.fetch = original; delete process.env.EFEMERIDES_MOTOR; }
});

test("Nesta semana: com o Gemini sem quota (429), o mesmo dia passa ao Groq, que pesquisa na web", async () => {
  process.env.GEMINI_API_KEY = "gratis";
  process.env.GROQ_API_KEY = "groq-gratis";
  process.env.EFEMERIDES_MOTOR = "gemini";
  const { createEfemeridesClaude, motoresDisponiveis } = await import("../server/sources/efemerides-claude.js");
  const { default: fs } = await import("node:fs");
  const ficheiro = new URL("../data/efemerides-claude.json", import.meta.url);
  const existia = fs.existsSync(ficheiro);
  const antes = existia ? fs.readFileSync(ficheiro) : null;
  const original = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    pedidos.push({ url, corpo: JSON.parse(op.body), headers: op.headers });
    if (/generativelanguage/.test(url)) return { ok: false, status: 429, text: async () => "You exceeded your current quota" };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"acontecimentos":[{"ano":2016,"ambito":"portugal","modalidade":"futebol","titulo":"Portugal campeão","descricao":"…","fonte":"https://exemplo.pt","importancia":"alta"}]}' } }] }) };
  };
  try {
    assert.deepEqual(motoresDisponiveis(), ["gemini", "groq"]);
    const cl = createEfemeridesClaude();
    const dias = [12, 13].map((d) => ({ iso: `2026-10-${d}`, ano: 2026, mes: 10, dia: d }));
    await cl.semana({ dias, hoje: "2026-10-12" }, () => [2016]);
    // o Gemini só levou um pedido (fica em pausa); os dois dias foram pelo Groq
    assert.equal(pedidos.filter((p) => /generativelanguage/.test(p.url)).length, 1);
    const groq = pedidos.filter((p) => /api\.groq\.com\/openai\/v1\/chat\/completions$/.test(p.url));
    assert.equal(groq.length, 2);
    assert.equal(groq[0].corpo.model, "groq/compound");
    assert.equal(groq[0].headers.Authorization, "Bearer groq-gratis");
    assert.match(groq[0].corpo.messages[0].content, /APENAS com um objeto JSON/);
    const itens = cl.itens({ dias, hoje: "2026-10-12" });
    assert.equal(itens.length, 2);
    assert.equal(itens[0].motor, "groq");
    assert.equal(itens[0].texto, "Portugal campeão — …");
  } finally {
    globalThis.fetch = original;
    delete process.env.EFEMERIDES_MOTOR;
    delete process.env.GROQ_API_KEY;
    // o que este teste gravou não fica para os outros (os testes correm ao mesmo tempo e leem a mesma pasta data/)
    if (existia) fs.writeFileSync(ficheiro, antes); else fs.rmSync(ficheiro, { force: true });
  }
});

test("Nesta semana: o Gemini e o Groq pesquisam o mesmo dia ao mesmo tempo, e o que ambos encontram aparece uma vez", async () => {
  process.env.GEMINI_API_KEY = "gratis";
  process.env.GROQ_API_KEY = "groq-gratis";
  process.env.EFEMERIDES_MOTOR = "gemini";
  const { createEfemeridesClaude } = await import("../server/sources/efemerides-claude.js");
  const { default: fs } = await import("node:fs");
  const ficheiro = new URL("../data/efemerides-claude.json", import.meta.url);
  const existia = fs.existsSync(ficheiro);
  const antes = existia ? fs.readFileSync(ficheiro) : null;
  const original = globalThis.fetch;
  let aCorrer = 0, max = 0;
  const lista = (extra) => JSON.stringify({ acontecimentos: [
    { ano: 2016, ambito: "portugal", modalidade: "futebol", titulo: "Portugal vence a Finlândia em Lisboa", descricao: "…", fonte: "https://a.pt", importancia: "media" },
    extra,
  ] });
  globalThis.fetch = async (url) => {
    aCorrer++; max = Math.max(max, aCorrer);
    await new Promise((r) => setTimeout(r, 20));
    aCorrer--;
    if (/generativelanguage/.test(url)) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: lista({ ano: 2016, ambito: "internacional", modalidade: "ténis", titulo: "Final do torneio de Xangai", descricao: "…", fonte: "https://b.com", importancia: "media" }) }] } }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: lista({ ano: 2016, ambito: "portugal", modalidade: "futsal", titulo: "Benfica conquista a Supertaça de futsal", descricao: "…", fonte: "https://c.pt", importancia: "alta" }).replace("Portugal vence a Finlândia em Lisboa", "Portugal vence Finlândia, em Lisboa") } }] }) };
  };
  try {
    const cl = createEfemeridesClaude();
    const dias = [{ iso: "2026-10-12", ano: 2026, mes: 10, dia: 12 }];
    await cl.semana({ dias, hoje: "2026-10-12" }, () => [2016]);
    assert.equal(max, 2, "os dois motores ao mesmo tempo");
    const itens = cl.itens({ dias, hoje: "2026-10-12" });
    assert.equal(itens.length, 3); // o jogo de Portugal, encontrado pelos dois, aparece uma só vez
    const pt = itens.find((x) => /Finlândia/.test(x.texto));
    assert.deepEqual(pt.motores, ["gemini", "groq"]);
    assert.deepEqual(itens.find((x) => /Xangai/.test(x.texto)).motores, ["gemini"]);
    assert.deepEqual(itens.find((x) => /Supertaça/.test(x.texto)).motores, ["groq"]);
    assert.deepEqual(cl.estado().dias["2026-10-12"], { gemini: 2, groq: 2 });
    // uma segunda volta não volta a pedir o que já está feito
    max = 0;
    await cl.semana({ dias, hoje: "2026-10-12" }, () => [2016]);
    assert.equal(max, 0);
  } finally {
    globalThis.fetch = original;
    delete process.env.EFEMERIDES_MOTOR;
    delete process.env.GROQ_API_KEY;
    if (existia) fs.writeFileSync(ficheiro, antes); else fs.rmSync(ficheiro, { force: true });
  }
});

test("Nesta semana pelo Groq: usa o modelo com pesquisa na web que a conta tiver (a do site não tem o groq/compound)", async () => {
  process.env.GROQ_API_KEY = "groq-gratis";
  const { pesquisarDiaGroq, _groqTeste } = await import("../server/sources/efemerides-claude.js");
  const original = globalThis.fetch;
  const resposta = { ok: true, json: async () => ({ choices: [{ message: { content: '{"acontecimentos":[{"ano":2016,"ambito":"portugal","modalidade":"futebol","titulo":"Golo histórico","descricao":"…","fonte":"https://a.pt","importancia":"alta"}]}' } }] }) };
  try {
    // 1) a lista de modelos da conta só tem o gpt-oss-120b: vai com a ferramenta browser_search
    _groqTeste.limpar();
    let pedidos = [];
    globalThis.fetch = async (url, op = {}) => {
      if (/\/models$/.test(url)) return { ok: true, json: async () => ({ data: [{ id: "openai/gpt-oss-120b" }, { id: "llama-3.3-70b-versatile" }] }) };
      pedidos.push(JSON.parse(op.body));
      return resposta;
    };
    const a = await pesquisarDiaGroq({ ano: 2026, mes: 10, dia: 15 }, [2016]);
    assert.equal(a.length, 1);
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].model, "openai/gpt-oss-120b");
    assert.deepEqual(pedidos[0].tools, [{ type: "browser_search" }]);
    assert.equal(pedidos[0].tool_choice, "required");

    // 2) sem lista de modelos: os que respondem 404 (a conta não os tem) passam ao seguinte, e o que funciona fica escolhido
    _groqTeste.limpar();
    pedidos = [];
    globalThis.fetch = async (url, op = {}) => {
      if (/\/models$/.test(url)) return { ok: false, status: 500, json: async () => ({}) };
      const corpo = JSON.parse(op.body);
      pedidos.push(corpo.model);
      if (corpo.model !== "openai/gpt-oss-120b") return { ok: false, status: 404, text: async () => `{"error":{"message":"The model \`${corpo.model}\` does not exist or you do not have access to it.","code":"model_not_found"}}` };
      return resposta;
    };
    await pesquisarDiaGroq({ ano: 2026, mes: 10, dia: 15 }, [2016]);
    assert.deepEqual(pedidos, ["groq/compound", "groq/compound-mini", "compound-beta", "compound-beta-mini", "openai/gpt-oss-120b"]);
    pedidos = [];
    await pesquisarDiaGroq({ ano: 2026, mes: 10, dia: 16 }, [2016]);
    assert.deepEqual(pedidos, ["openai/gpt-oss-120b"]); // o dia seguinte vai logo ao modelo que funcionou
  } finally {
    globalThis.fetch = original;
    _groqTeste.limpar();
    delete process.env.GROQ_API_KEY;
  }
});
