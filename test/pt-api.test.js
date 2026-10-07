import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortugal } from "../server/pt/index.js";

// express mínimo: guarda as rotas e chama-as com pedidos e respostas falsos
function falsoApp() {
  const rotas = { get: [], post: [] };
  const app = {
    get: (p, h) => rotas.get.push([p, h]),
    post: (p, _mw, h) => rotas.post.push([p, h]),
  };
  const casa = (padrao, caminho) => {
    const a = padrao.split("/"), b = caminho.split("/");
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) return null;
    }
    return params;
  };
  const chamar = (metodo, url, { body, auth } = {}) => {
    const [caminho, qs] = url.split("?");
    for (const [p, h] of rotas[metodo]) {
      const params = casa(p, caminho);
      if (!params) continue;
      let out = { status: 200, json: null };
      const res = { status(c) { out.status = c; return res; }, json(j) { out.json = j; return res; } };
      h({ params, query: Object.fromEntries(new URLSearchParams(qs || "")), body, get: (k) => (k === "authorization" ? auth : null) }, res);
      return out;
    }
    throw new Error(`sem rota ${metodo} ${url}`);
  };
  return { app, chamar };
}

test("API: competições, jornada da semana com tabela, jogos de hoje, evidência pela API e correção", () => {
  process.env.PT_TOKEN = "segredo";
  const pt = createPortugal({ log: () => {} });
  const { app, chamar } = falsoApp();
  pt.rotas(app, { json: () => null });
  const comp = pt._upsertComp("fpf-api", { org: "af-braga", nome: "Pro-Nacional", mod: "futebol", fem: false, sub23: false, tipo: "liga", nivel: "distrital", fonte: "fpf", lidoEm: Date.now() });
  const serie = pt._serieDe(comp, "unica", "");
  const agora = Date.now();
  const j = pt._registarJogo(comp, serie, 3, { fpfId: "777", casa: "UD Polvoreira", fora: "SC Ucha", inicio: agora - 10 * 60000 }, "fpf");
  pt._registarJogo(comp, serie, 2, { fpfId: "776", casa: "SC Ucha", fora: "UD Polvoreira", inicio: agora - 7 * 86400e3, hs: 0, as: 2 }, "fpf");

  const c = chamar("get", "/api/pt/competicoes").json;
  assert.ok(c.competicoes.some((x) => x.id === "fpf-api"));
  assert.ok(c.orgs.some((o) => o.key === "af-braga"));

  const d = chamar("get", "/api/pt/competicao/fpf-api").json;
  assert.equal(d.atual, 3);
  assert.equal(d.jornada, 3);
  assert.equal(d.jogos.length, 1);
  assert.equal(d.jogos[0].semInfo, true, "devia estar a decorrer e ninguém disse nada");
  assert.equal(d.tabela[0].equipa, "UD Polvoreira");
  const d2 = chamar("get", "/api/pt/competicao/fpf-api?jornada=2").json;
  assert.equal(d2.jogos[0].estado, "final");
  assert.equal(d2.jogos[0].oficial, true);

  // sem chave não entra
  assert.equal(chamar("post", "/api/pt/evidencia", { body: { texto: "GOLO 1-0" } }).status, 401);
  // story lido noutro computador (retransmissor): a conta é do Instagram do clube
  const r = chamar("post", "/api/pt/evidencia", { auth: "Bearer segredo", body: { itens: [{ id: "relay:1", tipo: "story", conta: j.igCasa || "udpolvoreira", ts: agora - 5 * 60000, texto: "GOLO ⚽ 1-0 aos 4'" }] } }).json;
  assert.equal(r.resultados[0].decisao, "novo");
  const vivo = chamar("get", "/api/pt/aovivo").json.find((x) => x.id === j.id);
  assert.equal(vivo.hs, 1);
  assert.equal(vivo.estado, "direto");
  assert.equal(vivo.golos[0].min, 4);
  assert.equal(vivo.golos[0].minFonte, "explicito");
  assert.ok(vivo.min.texto.startsWith("~"), "minuto atual estimado");
  const t = chamar("get", "/api/pt/tabelas?org=af-braga").json;
  assert.equal(t[0].linhas[0].equipa, "UD Polvoreira");
  assert.ok(t[0].linhas[0].aoVivo);
  // correção da redação
  const corr = chamar("post", `/api/pt/jogo/${encodeURIComponent(j.id)}`, { auth: "Bearer segredo", body: { hs: 2, as: 1, estado: "final" } }).json;
  assert.equal(corr.oficial, true);
  assert.equal(corr.hs, 2);
  const ev = chamar("get", "/api/pt/eventos").json;
  assert.ok(ev.some((e) => e.pt?.jogo === j.id && /Golo/.test(e.t.pt)));
  const est = chamar("get", "/api/pt/estado").json;
  assert.ok(est.evidencias.novo >= 1);
});
