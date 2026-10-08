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
