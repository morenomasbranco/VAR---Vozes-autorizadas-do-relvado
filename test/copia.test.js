import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fazerCopia, restaurar, limparTexto } from "../server/copia.js";
import { vale } from "../scripts/copia-dados.js";

const pastaNova = () => `${fs.mkdtempSync(path.join(os.tmpdir(), "copia-"))}/`;

test("cópia: leva os resultados sem erros nem chaves", () => {
  const pasta = pastaNova();
  fs.writeFileSync(`${pasta}pt.json`, JSON.stringify({ comps: { a: { id: "a" } }, jogos: { j1: { id: "j1", viaUrl: "https://x.pt/?key=SEGREDO123&p=1" }, j2: { id: "j2" } }, pesquisa: { af: { proxima: 5, erro: "falhou em https://g.com/?key=AIzaSyA1234567890123456789012345678901" } } }));
  const c = fazerCopia({ pasta, agora: 7 });
  assert.deepEqual(c.resumo, { competicoes: 1, jogos: 2 });
  assert.equal(c.ts, 7);
  assert.equal(c.ficheiros["pt.json"].pesquisa.af.erro, undefined);
  assert.equal(c.ficheiros["pt.json"].pesquisa.af.proxima, 5);
  assert.equal(c.ficheiros["pt.json"].jogos.j1.viaUrl, "https://x.pt/?key=…&p=1");
  assert.equal(c.ficheiros["pt-eventos.json"], undefined);
  assert.doesNotMatch(JSON.stringify(c), /SEGREDO|AIza/);
  assert.equal(limparTexto("access_token=EAAB123&x"), "access_token=…&x");
});

test("cópia: repõe os ficheiros só quando o servidor arranca sem dados", async () => {
  const origem = pastaNova();
  fs.writeFileSync(`${origem}pt.json`, JSON.stringify({ comps: { a: {} }, jogos: { j: {} } }));
  fs.writeFileSync(`${origem}youtube-canais.json`, JSON.stringify({ c: 1 }));
  const gz = zlib.gzipSync(JSON.stringify(fazerCopia({ pasta: origem })));
  const pedir = async () => new Response(gz);
  const destino = pastaNova();
  const r = await restaurar({ pasta: destino, pedir, log: () => {} });
  assert.equal(r.feito, true);
  assert.deepEqual(r.escritos.sort(), ["pt.json", "youtube-canais.json"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(`${destino}pt.json`, "utf8")).jogos, { j: {} });
  const outra = await restaurar({ pasta: destino, pedir, log: () => {} });
  assert.equal(outra.feito, false); // já há dados: não se mexe
  const falha = await restaurar({ pasta: pastaNova(), pedir: async () => new Response("", { status: 404 }), log: () => {} });
  assert.equal(falha.feito, false);
  assert.match(falha.motivo, /404/);
});

test("cópia: não se troca uma cópia boa por uma vazia ou muito mais pequena", () => {
  const agora = 10 * 86400e3;
  assert.equal(vale({ resumo: { jogos: 0 } }, null, agora).ok, false);
  assert.equal(vale({ resumo: { competicoes: 3, jogos: 10 } }, null, agora).ok, true);
  assert.equal(vale({ resumo: { jogos: 100 } }, { ts: agora - 3600e3, resumo: { jogos: 1000 } }, agora).ok, false);
  assert.equal(vale({ resumo: { jogos: 100 } }, { ts: agora - 5 * 86400e3, resumo: { jogos: 1000 } }, agora).ok, true);
  assert.equal(vale({ resumo: { jogos: 900 } }, { ts: agora - 3600e3, resumo: { jogos: 1000 } }, agora).ok, true);
});
