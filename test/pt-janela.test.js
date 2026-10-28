import { test } from "node:test";
import assert from "node:assert/strict";
import { createPortugal, naJanela, eEquipa } from "../server/pt/index.js";

// express mínimo (como no pt-api.test.js): guarda as rotas e chama-as com pedidos e respostas falsos
function falsoApp() {
  const rotas = { get: [], post: [] };
  const app = { get: (p, h) => rotas.get.push([p, h]), post: (p, _mw, h) => rotas.post.push([p, h]) };
  const chamar = (url) => {
    const [caminho, qs] = url.split("?");
    for (const [p, h] of rotas.get) {
      const a = p.split("/"), b = caminho.split("/");
      if (a.length !== b.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < a.length; i++) { if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) ok = false; }
      if (!ok) continue;
      const out = { status: 200, json: null };
      const res = { status(c) { out.status = c; return res; }, json(j) { out.json = j; return res; } };
      h({ params, query: Object.fromEntries(new URLSearchParams(qs || "")), get: () => null }, res);
      return out;
    }
    throw new Error(`sem rota ${url}`);
  };
  return { app, chamar };
}

test("janela do jogo: só com a hora conhecida, de um pouco antes do apito até um pouco depois do fim provável", () => {
  const agora = Date.parse("2026-10-28T15:30:00Z");
  assert.equal(naJanela({ inicio: agora - 30 * 60e3 }, agora), true);
  assert.equal(naJanela({ inicio: agora + 10 * 60e3 }, agora), true); // um pouco antes do apito
  assert.equal(naJanela({ inicio: agora + 60 * 60e3 }, agora), false);
  assert.equal(naJanela({ inicio: agora - 3 * 3600e3 }, agora), false); // já acabou há muito
  assert.equal(naJanela({ inicio: agora - 30 * 60e3, semHora: true }, agora), false); // sem hora não se sabe
  assert.equal(naJanela({ inicio: null }, agora), false);
});

test("distritais: sem hora não é «a decorrer»; a pesquisa na web só põe em direto dentro da hora do jogo", () => {
  const pt = createPortugal({ log: () => {} });
  const { app, chamar } = falsoApp();
  pt.rotas(app, { json: () => null });
  const comp = pt._upsertComp("fpf-janela", { org: "af-viana", nome: "1ª Divisão", mod: "futebol", fem: false, sub23: false, tipo: "liga", nivel: "distrital", fonte: "fpf", lidoEm: Date.now() });
  const serie = pt._serieDe(comp, "unica", "");
  const agora = Date.now();

  // sem hora (a FPF põe 15:00 por defeito): não aparece «a decorrer (sem informação)»
  const sem = pt._registarJogo(comp, serie, 5, { fpfId: "s1", casa: "SC Valenciano", fora: "GD Castelense", inicio: agora - 30 * 60e3, semHora: true }, "fpf");
  assert.equal(sem.semHora, true);
  const vSem = chamar(`/api/pt/jogo/${encodeURIComponent(sem.id)}`).json;
  assert.equal(vSem.semInfo, false);
  assert.equal(vSem.porConfirmar, false);
  // uma data sem hora não apaga a hora conhecida do mesmo dia
  const comHora = pt._registarJogo(comp, serie, 5, { fpfId: "h1", casa: "AD Fachense", fora: "Atlético dos Arcos", inicio: agora - 20 * 60e3, semHora: false }, "fpf");
  pt._registarJogo(comp, serie, 5, { casa: "AD Fachense", fora: "Atlético dos Arcos", inicio: comHora.inicio - 15 * 60e3, semHora: true, estado: "agendado" }, "web");
  assert.equal(pt._st.jogos[comHora.id].inicio, comHora.inicio);
  assert.equal(pt._st.jogos[comHora.id].semHora, false);

  // a pesquisa na web diz «a decorrer» num jogo que começou há três horas: não conta
  const velho = pt._registarJogo(comp, serie, 5, { fpfId: "v1", casa: "SU Cardielense", fora: "CD Lanheses", inicio: agora - 3 * 3600e3 }, "fpf");
  pt._registarJogo(comp, serie, 5, { casa: "SU Cardielense", fora: "CD Lanheses", hs: 1, as: 0, estado: "direto", inicio: velho.inicio }, "web");
  assert.equal(pt._st.jogos[velho.id].estado, "agendado");
  // e num jogo que começou há meia hora conta, com o acontecimento do início (com o nível da competição)
  pt._registarJogo(comp, serie, 5, { casa: "AD Fachense", fora: "Atlético dos Arcos", hs: 0, as: 1, estado: "direto", inicio: comHora.inicio }, "web");
  assert.equal(pt._st.jogos[comHora.id].estado, "direto");
  const ev = chamar("/api/pt/eventos").json.filter((e) => e.pt?.jogo === comHora.id);
  assert.ok(ev.length >= 1);
  assert.equal(ev[0].pt.nivel, "distrital");
  assert.equal(ev[0].pt.org, "af-viana");
});

test("curiosidades: a posição, a forma e os jogos desta época entre as duas equipas", () => {
  const pt = createPortugal({ log: () => {} });
  const comp = pt._upsertComp("fpf-info", { org: "af-braga", nome: "Pró-Nacional", mod: "futebol", fem: false, sub23: false, tipo: "liga", nivel: "distrital", fonte: "fpf", lidoEm: Date.now() });
  const serie = pt._serieDe(comp, "unica", "");
  const agora = Date.now();
  pt._registarJogo(comp, serie, 1, { fpfId: "i1", casa: "UD Polvoreira", fora: "SC Ucha", inicio: agora - 14 * 86400e3, hs: 2, as: 0, estado: "final" }, "fpf");
  pt._registarJogo(comp, serie, 2, { fpfId: "i2", casa: "SC Ucha", fora: "GD Prado", inicio: agora - 7 * 86400e3, hs: 1, as: 1, estado: "final" }, "fpf");
  pt._registarJogo(comp, serie, 3, { fpfId: "i3", casa: "SC Ucha", fora: "UD Polvoreira", inicio: agora - 10 * 60e3 }, "fpf");
  const info = pt.infoJogo("SC Ucha", "UD Polvoreira");
  assert.equal(info.comp, "Pró-Nacional");
  assert.equal(info.jornada, 3);
  assert.equal(info.linhas.fora.pos, 1);
  assert.equal(info.linhas.fora.pts, 3);
  assert.deepEqual(info.entre, [{ casa: "UD Polvoreira", fora: "SC Ucha", hs: 2, as: 0, inicio: info.entre[0].inicio }]);
  assert.equal(pt.infoJogo("Equipa Inexistente", "Outra"), null);
});

test("distritais: datas e cabeçalhos lidos como equipas não são equipas, e um adiamento sem data não vira acontecimento", () => {
  for (const n of ["25 out", "9 set", "Jogos", "(Interrompido)", "12:30", "x"]) assert.equal(eEquipa(n), false, n);
  for (const n of ["Técnico FC", "SC Beira-Mar \"B\"", "1º Dezembro", "A.C. Cucujães \"Sub/23\""]) assert.equal(eEquipa(n), true, n);
  const pt = createPortugal({ log: () => {} });
  const { app, chamar } = falsoApp();
  pt.rotas(app, { json: () => null });
  const comp = pt._upsertComp("fpf-adiado", { org: "af-aveiro", nome: "Taça Pecol", mod: "futebol", fem: false, sub23: false, tipo: "taca", nivel: "distrital", fonte: "fpf", lidoEm: Date.now() });
  const serie = pt._serieDe(comp, "unica", "");
  // o jogo mal lido (sem data, com uma data no lugar da equipa) e um jogo bom mas sem data, os dois «adiados»
  const mau = pt._registarJogo(comp, serie, 1, { fpfId: "a1", casa: "Romariz FC", fora: "4 out", estado: "adiado" }, "fpf");
  const semData = pt._registarJogo(comp, serie, 1, { fpfId: "a2", casa: "Canedo FC", fora: "AA Avanca", estado: "adiado" }, "fpf");
  const ev = chamar("/api/pt/eventos").json;
  assert.ok(!ev.some((e) => e.pt?.jogo === mau.id || e.pt?.jogo === semData.id));
});
