import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar, passaPelaPonte } from "../server/ponte.js";

test("ponte: os sites que bloqueiam servidores passam pelo Worker, com a chave; os outros vão diretos", async () => {
  process.env.PONTE_URL = "https://var-ponte.exemplo.workers.dev/";
  process.env.PONTE_CHAVE = "segredo";
  const pedidos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, op = {}) => { pedidos.push({ url, op }); return { ok: true, status: 200, headers: new Map() }; };
  try {
    assert.ok(passaPelaPonte("https://resultados.fpf.pt/Competition/Details?competitionId=1"));
    assert.ok(!passaPelaPonte("https://www.record.pt/"));
    await buscar("https://resultados.fpf.pt/Competition/GetCompetitionsByAssociation?associationId=224&seasonId=106", { headers: { "User-Agent": "X" } });
    assert.equal(pedidos[0].url, "https://var-ponte.exemplo.workers.dev/?u=https%3A%2F%2Fresultados.fpf.pt%2FCompetition%2FGetCompetitionsByAssociation%3FassociationId%3D224%26seasonId%3D106");
    assert.equal(pedidos[0].op.headers["x-ponte-chave"], "segredo");
    assert.equal(pedidos[0].op.headers["User-Agent"], "X");
    await buscar("https://www.instagram.com/api/v1/users/web_profile_info/?username=x", { redirect: "manual" });
    assert.equal(pedidos[1].op.headers["x-ponte-redirect"], "manual");
    await buscar("https://www.record.pt/");
    assert.equal(pedidos[2].url, "https://www.record.pt/");
  } finally {
    globalThis.fetch = original;
    delete process.env.PONTE_URL;
    delete process.env.PONTE_CHAVE;
  }
});

test("pontes gratuitas: Google Apps Script e Netlify; uma ponte recusada pelo site passa à seguinte; 30% do dia guardado para a FPF", async () => {
  process.env.PONTE_URL = "https://var.netlify.app/ponte";
  process.env.PONTE_CHAVE = "k";
  process.env.PONTE_GOOGLE_URL = "https://script.google.com/macros/s/X/exec";
  process.env.PONTE_GOOGLE_CHAVE = "g";
  process.env.PONTE_DIA = "10"; // limite do dia da ponte do Netlify, pequeno para o teste
  const { buscar, caminhos } = await import("../server/ponte.js");
  const pedidos = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, op = {}) => {
    pedidos.push(String(url));
    if (String(url).startsWith("https://var.netlify.app/ponte?u=")) {
      // a FPF recusa o Netlify; o Facebook aceita
      return /fpf\.pt/.test(decodeURIComponent(String(url))) ? new Response("bloqueado", { status: 403 }) : new Response("pelo Netlify", { status: 200 });
    }
    if (String(url).startsWith("https://script.google.com/")) {
      const b = JSON.parse(op.body);
      assert.equal(b.chave, "g");
      return new Response(JSON.stringify({ status: 200, headers: { "content-type": "text/html" }, url: `${b.u}?final`, corpo: Buffer.from("pelo Google").toString("base64") }));
    }
    return new Response("direto", { status: 403 });
  };
  try {
    const ids = (u) => caminhos(u).map((c) => c.id);
    assert.deepEqual(ids("https://www.fpf.pt/noticias"), ["ponte", "google", "direto"]);
    const r = await buscar("https://www.fpf.pt/noticias", { headers: { "User-Agent": "X" } });
    assert.equal(await r.text(), "pelo Google");
    assert.equal(r.url, "https://www.fpf.pt/noticias?final");
    assert.deepEqual(ids("https://www.fpf.pt/outra"), ["google", "direto"]); // o Netlify ficou de lado para a FPF
    // o Instagram só pode gastar 70% do dia de cada ponte: com 7 pedidos de 10 gastos no Netlify, já não passa por ele
    for (let i = 0; i < 6; i++) await buscar(`https://www.facebook.com/plugins/page.php?i=${i}`).catch(() => {});
    assert.ok(!ids("https://www.instagram.com/x").includes("ponte"));
    assert.ok(ids("https://afbraga.fpf.pt/x").includes("ponte"));
  } finally {
    globalThis.fetch = original;
    for (const k of ["PONTE_URL", "PONTE_CHAVE", "PONTE_GOOGLE_URL", "PONTE_GOOGLE_CHAVE", "PONTE_DIA"]) delete process.env[k];
  }
});

test("pontes: uma ponte pendurada não gasta o prazo todo; passa-se à seguinte e ela fica de lado", async () => {
  process.env.PONTE_URL = "https://pendurada.workers.dev";
  process.env.PONTE_PRAZO_SEGUNDOS = "3";
  const { buscar, caminhos } = await import(`../server/ponte.js?pendurada`);
  const original = globalThis.fetch;
  globalThis.fetch = (url, op = {}) => {
    if (String(url).startsWith("https://pendurada.workers.dev")) return new Promise((_, nao) => op.signal?.addEventListener("abort", () => nao(op.signal.reason)));
    return Promise.resolve(new Response("direto", { status: 200 }));
  };
  try {
    const t = Date.now();
    const r = await buscar("https://resultados.fpf.pt/x", { signal: AbortSignal.timeout(20000) });
    assert.equal(await r.text(), "direto");
    assert.ok(Date.now() - t < 5000);
    assert.deepEqual(caminhos("https://resultados.fpf.pt/y").map((c) => c.id), ["direto"]);
  } finally {
    globalThis.fetch = original;
    delete process.env.PONTE_URL;
    delete process.env.PONTE_PRAZO_SEGUNDOS;
  }
});

test("pontes: o teste à mão diz o que cada via respondeu, e os erros ficam anotados por site", async () => {
  process.env.PONTE_GOOGLE_URL = "https://script.google.com/macros/s/T/exec";
  const { testarCaminhos, buscar, estadoEncaminhamento } = await import(`../server/ponte.js?teste`);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://script.google.com/")) return new Response(JSON.stringify({ erro: "Exception: Address unavailable: https://www.fpf.pt/" }));
    return new Response("<html><title>FPF</title></html>", { status: 403 });
  };
  try {
    const r = await testarCaminhos("https://www.fpf.pt/");
    assert.equal(r[0].via, "Google Apps Script");
    assert.match(r[0].erro, /Address unavailable/);
    assert.equal(r[1].estado, 403);
    assert.equal(r[1].titulo, "FPF");
    await assert.rejects(testarCaminhos("https://www.record.pt/"), /não está na lista/);
    await buscar("https://www.fpf.pt/x");
    const e = estadoEncaminhamento().erros;
    assert.match(e["www.fpf.pt|google"].erro, /Address unavailable/);
    assert.match(e["www.fpf.pt|direto"].erro, /403/);
  } finally {
    globalThis.fetch = original;
    delete process.env.PONTE_GOOGLE_URL;
  }
});
