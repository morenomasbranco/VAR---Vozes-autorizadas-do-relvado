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

test("ponte de casa: o servidor deixa o pedido, o computador de casa leva-o e devolve a resposta", async () => {
  const { rotasPonte, buscar: buscarP, estadoPonte } = await import("../server/ponte.js");
  const rotas = {};
  const app = { get: (p, h) => { rotas[`GET ${p}`] = h; }, post: (p, _mw, h) => { rotas[`POST ${p}`] = h; } };
  rotasPonte(app, { json: () => null }, (req) => req.get("authorization") === "Bearer t");
  const res = () => { const r = { out: null, code: 200, status(c) { r.code = c; return r; }, json(x) { r.out = x; return r; } }; return r; };
  const req = (extra = {}) => ({ get: (k) => (k === "authorization" ? "Bearer t" : null), query: {}, on: () => {}, ...extra });
  // sem chave não entra
  const r0 = res(); await rotas["GET /api/ponte/trabalho"]({ ...req(), get: () => null }, r0); assert.equal(r0.code, 401);
  // o computador de casa fica à espera de trabalho; o servidor faz um pedido à FPF
  const r1 = res();
  const pedeTrabalho = rotas["GET /api/ponte/trabalho"](req(), r1);
  const resposta = buscarP("https://resultados.fpf.pt/Competition/GetCompetitionsByAssociation?associationId=224&seasonId=106", { headers: { "User-Agent": "VAR" } });
  await pedeTrabalho;
  assert.equal(r1.out.length, 1);
  assert.equal(r1.out[0].url, "https://resultados.fpf.pt/Competition/GetCompetitionsByAssociation?associationId=224&seasonId=106");
  assert.equal(r1.out[0].cabecalhos["User-Agent"], "VAR");
  assert.equal(estadoPonte.casa.ligada, true);
  // a resposta volta
  const r2 = res();
  rotas["POST /api/ponte/resposta"](req({ body: { id: r1.out[0].id, status: 200, cabecalhos: { "content-type": "text/html", "content-encoding": "gzip" }, corpo: Buffer.from("<a href='/Competition/Details?competitionId=1&seasonId=106'>Pro-Nacional</a>").toString("base64") } }), r2);
  const r = await resposta;
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Pro-Nacional/);
  assert.equal(r.headers.get("content-encoding"), null);
  // os outros sites continuam diretos
  const original = globalThis.fetch;
  let direto = null;
  globalThis.fetch = async (u) => { direto = u; return new Response("ok"); };
  try { await buscarP("https://www.record.pt/"); } finally { globalThis.fetch = original; }
  assert.equal(direto, "https://www.record.pt/");
});
