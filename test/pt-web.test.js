import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPesquisa, rondas, jogoEspn, tabelaDeEspn, proximaPesquisa, ALVOS } from "../server/pt/web.js";
import { createPortugal } from "../server/pt/index.js";

const AGORA = Date.parse("2026-10-08T12:00:00Z");

test("pesquisa na web: lê o JSON compacto com tolerância e recusa o que não faz sentido", () => {
  const texto = "Aqui está:\n```json\n" + JSON.stringify({ competicoes: [
    { nome: "Pró-Nacional", serie: "", modalidade: "futebol", feminino: false, fonte: "https://www.zerozero.pt/x", jornadas: [
      { n: 5, jogos: [["SC Maria da Fonte", "Vilaverdense FC", 2, 1, "2026-10-04", "15:00", "final"], ["GD Joane", "GD Joane", 1, 1, "2026-10-04", "15:00", "final"]] },
      { n: 6, jogos: [["Vilaverdense FC", "GD Joane", null, null, "2026-10-11", "15:00", "agendado"], ["X", "Y", 3, 0, "2026-10-11", "15:00", "final"]] },
    ], classificacao: [[1, "SC Maria da Fonte", 5, 4, 1, 0, 12, 3, 13], [2, "Vilaverdense FC", 5, 3, 1, 1, 8, 5, 10]] },
    { nome: "Futsal Sénior", modalidade: "futsal", jornadas: [{ jogos: [{ casa: "A", fora: "B", golosCasa: 4, golosFora: 2, data: "2026-10-03", hora: "21:30", estado: "final" }] }] },
    { nome: "Sem nada", jornadas: [] },
  ] }) + "\n```";
  const l = lerPesquisa(texto, AGORA);
  assert.equal(l.length, 2);
  const [pro, futsal] = l;
  assert.equal(pro.fonte, "https://www.zerozero.pt/x");
  assert.equal(pro.jornadas[0].jogos.length, 1, "a mesma equipa dos dois lados fica de fora");
  assert.deepEqual([pro.jornadas[0].jogos[0].hs, pro.jornadas[0].jogos[0].as, pro.jornadas[0].jogos[0].estado], [2, 1, "final"]);
  assert.equal(new Date(pro.jornadas[0].jogos[0].inicio).toISOString(), "2026-10-04T14:00:00.000Z", "hora de Lisboa");
  assert.equal(pro.jornadas[1].jogos[1].estado, "agendado", "«final» no futuro não é final");
  assert.equal(pro.jornadas[1].jogos[1].hs, null);
  assert.equal(pro.classificacao[0].dg, 9);
  assert.equal(futsal.mod, "futsal");
  assert.equal(futsal.jornadas[0].n, null);
  assert.throws(() => lerPesquisa("não encontrei nada"));
});

test("ESPN: jogo normalizado, classificação e jornadas deduzidas do calendário", () => {
  const ev = (id, dia, h, a, hs, as, state = "post") => ({ id, date: `2026-${dia}T19:00Z`, status: { type: { state, name: state === "post" ? "STATUS_FULL_TIME" : "STATUS_SCHEDULED", completed: state === "post" } },
    competitions: [{ competitors: [{ homeAway: "home", score: String(hs), team: { shortDisplayName: h } }, { homeAway: "away", score: String(as), team: { shortDisplayName: a } }] }] });
  const jogos = [
    ev(1, "08-10", "Benfica", "Porto", 1, 0), ev(2, "08-10", "Sporting", "Braga", 2, 2),
    ev(3, "08-17", "Porto", "Sporting", 0, 0), // Benfica–Braga da 2.ª jornada foi adiado e jogado mais tarde
    ev(4, "08-24", "Benfica", "Sporting", 1, 1, "pre"), ev(5, "08-24", "Braga", "Porto", 0, 0, "pre"),
    ev(6, "09-03", "Braga", "Benfica", 3, 1),
  ].map(jogoEspn);
  assert.equal(jogos[0].casa, "Benfica");
  assert.equal(jogos[0].estado, "final");
  assert.equal(jogos[3].hs, null);
  const r = rondas(jogos);
  assert.equal(r.length, 3);
  assert.deepEqual(r[1].jogos.map((j) => j.casa), ["Porto", "Braga"], "o jogo adiado volta à 2.ª jornada");
  const t = tabelaDeEspn({ children: [{ name: "Liga", standings: { entries: [
    { team: { shortDisplayName: "Porto" }, stats: [{ name: "rank", value: 2 }, { name: "points", value: 4 }, { name: "gamesPlayed", value: 2 }] },
    { team: { shortDisplayName: "Benfica" }, stats: [{ name: "rank", value: 1 }, { name: "points", value: 6 }, { name: "gamesPlayed", value: 2 }, { name: "pointsFor", value: 3 }, { name: "pointsAgainst", value: 1 }] },
  ] } }] });
  assert.deepEqual(t[0].linhas.map((x) => [x.pos, x.equipa, x.pts]), [[1, "Benfica", 6], [2, "Porto", 4]]);
  assert.equal(t[0].linhas[0].dg, 2);
  const taca = rondas(jogos, "taca");
  assert.equal(taca[0].nome, "1.ª eliminatória");
});

test("pesquisa na web: mais vezes nas tardes de jogos, menos a meio da semana", () => {
  assert.equal(proximaPesquisa(Date.parse("2026-10-10T15:00:00Z")), 3 * 3600e3); // sábado à tarde
  assert.equal(proximaPesquisa(Date.parse("2026-10-07T10:00:00Z")), 12 * 3600e3); // quarta de manhã
  assert.equal(proximaPesquisa(Date.parse("2026-10-07T10:00:00Z"), { aDecorrer: true }), 90 * 60e3);
  assert.equal(ALVOS.filter((a) => a.org.startsWith("af-")).length, 22);
});

test("pesquisa na web: competições, jornadas e classificação entram na vista Portugal, sem repetir as que já vêm de outra fonte", () => {
  const pt = createPortugal({ log: () => {} });
  const alvo = ALVOS.find((a) => a.id === "af-braga");
  const agora = Date.now();
  const dia = (d) => new Date(agora + d * 86400e3).toISOString().slice(0, 10);
  const comps = lerPesquisa(JSON.stringify({ competicoes: [{ nome: "Pró-Nacional", fonte: "https://afbraga.pt/x", jornadas: [
    { n: 5, jogos: [["SC Maria da Fonte", "Vilaverdense FC", 2, 1, dia(-3), "15:00", "final"]] },
    { n: 6, jogos: [["Vilaverdense FC", "GD Joane", null, null, dia(4), "15:00", "agendado"]] },
  ], classificacao: [[1, "SC Maria da Fonte", 5, 4, 1, 0, 12, 3, 13], [2, "Vilaverdense FC", 5, 3, 1, 1, 8, 5, 10], [3, "GD Joane", 5, 0, 0, 5, 1, 9, 0]] },
  { nome: "Juniores A", jornadas: [{ n: 1, jogos: [["A", "B", 1, 0, dia(-3), "11:00", "final"]] }] }] }), agora);
  pt._guardarPesquisa(alvo, comps, { tabela: true });
  const web = Object.values(pt._st.comps).filter((c) => c.fonte === "web");
  assert.equal(web.length, 1, "a formação fica de fora");
  assert.equal(web[0].org, "af-braga");
  assert.equal(web[0].nivel, "distrital");
  const serie = Object.values(web[0].series)[0];
  assert.deepEqual(Object.keys(serie.jornadas).map(Number), [5, 6]);
  const final = Object.values(pt._st.jogos).find((j) => j.casa === "SC Maria da Fonte");
  assert.equal(final.estado, "final");
  assert.equal(final.via, "web");
  assert.equal(final.viaUrl, "https://afbraga.pt/x");
  assert.equal(pt._tabela(web[0], serie)[0].equipa, "SC Maria da Fonte");
  // a segunda leitura (nomes ligeiramente diferentes) atualiza em vez de duplicar
  pt._guardarPesquisa(alvo, lerPesquisa(JSON.stringify({ competicoes: [{ nome: "Pro Nacional", jornadas: [{ n: 6, jogos: [["Vilaverdense", "GD Joane", 1, 1, dia(-0.1), "15:00", "direto"]] }] }] }), agora), {});
  assert.equal(Object.values(pt._st.comps).filter((c) => c.fonte === "web").length, 1);
  const vivo = Object.values(pt._st.jogos).find((j) => j.casa === "Vilaverdense FC");
  assert.equal(vivo.estado, "direto");
  assert.equal(vivo.hs, 1);
  assert.equal(Object.values(pt._st.jogos).filter((j) => /Vilaverdense/.test(j.casa)).length, 1);

  // a mesma competição a chegar também por outra fonte lida há pouco: só essa fica à vista
  const rotas = [];
  pt.rotas({ get: (c, h) => rotas.push([c, h]), post: () => {} }, { json: () => null });
  const lista = () => { let out; rotas.find(([c]) => c === "/api/pt/competicoes")[1]({ query: {} }, { json: (j) => { out = j; } }); return out.competicoes.filter((c) => c.org === "af-braga").map((c) => c.id); };
  assert.deepEqual(lista(), [web[0].id]);
  const outra = pt._upsertComp("sofa-123", { org: "af-braga", nome: "Pró-Nacional AF Braga", mod: "futebol", fem: false, tipo: "liga", nivel: "distrital", fonte: "sofa", lidoEm: Date.now() });
  pt._registarJogo(outra, pt._serieDe(outra, "unica", ""), 1, { sofaId: 55, casa: "SC Maria da Fonte", fora: "GD Joane", inicio: agora - 20 * 86400e3, hs: 1, as: 0, estado: "final" }, "sofa");
  pt._guardarPesquisa(alvo, [], {}); // (força a revisão das competições repetidas)
  assert.deepEqual(lista(), ["sofa-123"]);
});

test("Distritais: a API junta às colunas as notícias e os comunicados de cada associação", () => {
  const noticia = { id: "afbraga-noticias:1", grupo: "af", assoc: "af-braga", org: "AF Braga", tipo: "comunicado", titulo: "Comunicado Oficial n.º 20", url: "https://afbraga.pt/c/20", ts: Date.now() };
  const pt = createPortugal({ log: () => {}, noticiasDistritais: (org) => (!org || org === "af-braga" ? { "af-braga": [noticia] } : {}) });
  const rotas = [];
  pt.rotas({ get: (c, h) => rotas.push([c, h]), post: () => {} }, { json: () => null });
  let out;
  rotas.find(([c]) => c === "/api/distritais")[1]({ query: {} }, { json: (j) => { out = j; } });
  assert.equal(out.orgs.length, 22, "uma coluna por associação, mesmo sem clubes com redes");
  assert.deepEqual(out.noticias["af-braga"].map((x) => x.titulo), ["Comunicado Oficial n.º 20"]);
});
