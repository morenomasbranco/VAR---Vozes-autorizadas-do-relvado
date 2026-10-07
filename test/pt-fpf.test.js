import { test } from "node:test";
import assert from "node:assert/strict";
import { lerListaCompeticoes, lerPaginaCompeticao } from "../server/pt/fpf.js";

test("lista de competições de uma associação, com o título da secção como contexto", () => {
  const html = `<html><body>
    <h3>Futebol</h3>
    <div class="competition"><a href="/Competition/Details?competitionId=30101&amp;seasonId=106">DIVISÃO DE ELITE - PRÓ-NACIONAL</a></div>
    <div class="competition"><a href="/Competition/Details?competitionId=30102&seasonId=106">CAMP.DIST.JUNIORES SUB-19</a></div>
    <h3>Futsal</h3>
    <a href="/Competition/Details?competitionId=30200&seasonId=106">1ª DIVISÃO SENIORES MASCULINOS</a>
  </body></html>`;
  const l = lerListaCompeticoes(html);
  assert.equal(l.length, 3);
  assert.deepEqual(l.map((c) => c.competitionId), ["30101", "30102", "30200"]);
  assert.equal(l[2].contexto, "Futsal");
  assert.equal(l[0].seasonId, "106");
});

test("página de competição em tabelas: jornadas, jogos com matchId e classificação", () => {
  const html = `<html><head><title>DIVISÃO DE HONRA SÉRIE 1 — Competições</title></head><body>
    <select id="fixtures"><option value="7001">Jornada 1</option><option value="7002" selected>Jornada 2</option><option value="7003">Jornada 3</option></select>
    <h4>Domingo, 11-10-2026</h4>
    <table class="games">
      <tr><td><a href="/Match/GetMatchInformation?matchId=55501">AD Carvalhosa</a></td><td>2 - 1</td><td>ACR Sendim</td><td>15:00</td></tr>
      <tr><td><a href="/Match/GetMatchInformation?matchId=55502">Alfenense</a></td><td>16:00</td><td>1º Maio Figueiró</td></tr>
    </table>
    <table class="classification">
      <thead><tr><th>Pos</th><th>Equipa</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>AD Carvalhosa</td><td>6</td><td>2</td><td>2</td><td>0</td><td>0</td><td>4</td><td>1</td></tr>
        <tr><td>2</td><td>Alfenense</td><td>4</td><td>2</td><td>1</td><td>1</td><td>0</td><td>3</td><td>2</td></tr>
        <tr><td>3</td><td>ACR Sendim</td><td>0</td><td>2</td><td>0</td><td>0</td><td>2</td><td>1</td><td>5</td></tr>
      </tbody>
    </table></body></html>`;
  const p = lerPaginaCompeticao(html);
  assert.equal(p.titulo, "DIVISÃO DE HONRA SÉRIE 1");
  assert.equal(p.jornadas.length, 3);
  assert.equal(p.jornadas.find((j) => j.selecionado).n, 2);
  assert.equal(p.jogos.length, 2);
  const j1 = p.jogos.find((j) => j.fpfId === "55501");
  assert.deepEqual([j1.casa, j1.fora, j1.hs, j1.as], ["AD Carvalhosa", "ACR Sendim", 2, 1]);
  assert.equal(new Date(j1.inicio).toISOString(), "2026-10-11T14:00:00.000Z");
  const j2 = p.jogos.find((j) => j.fpfId === "55502");
  assert.equal(j2.hs, null);
  assert.equal(j2.hora.h, 16);
  const t = p.tabelas[0].linhas;
  assert.equal(t.length, 3);
  assert.deepEqual([t[0].equipa, t[0].pts, t[0].j, t[0].gm, t[0].dg], ["AD Carvalhosa", 6, 2, 4, 3]);
});

test("página em blocos (div): resultado em dois pedaços, data no bloco e jogo adiado", () => {
  const html = `<div class="fixture-games">
    <div class="game row"><div class="date">18/10/2026 15:00</div><div class="home-team"><img alt="SC Rio Tinto" src="a.png"><span>SC Rio Tinto</span></div>
      <div class="score"><span class="home-score">0</span><span class="away-score">3</span></div>
      <div class="away-team"><span>GD Covelo</span></div><a href="/Match/GetMatchInformation?matchId=88001">Ficha de jogo</a></div>
    <div class="game row"><div class="date">18/10/2026</div><div class="home-team">Leça FC</div><div class="score">ADIADO</div><div class="away-team">Padroense FC</div></div>
  </div>`;
  const p = lerPaginaCompeticao(html);
  const a = p.jogos.find((j) => j.casa === "SC Rio Tinto");
  assert.ok(a, JSON.stringify(p.jogos));
  assert.deepEqual([a.fora, a.hs, a.as], ["GD Covelo", 0, 3]);
  assert.equal(a.fpfId, "88001");
  const b = p.jogos.find((j) => j.casa === "Leça FC");
  assert.ok(b, JSON.stringify(p.jogos));
  assert.equal(b.estado, "adiado");
});

test("tabela sem cabeçalho: as colunas descobrem-se pelas contas (P = 3V + E)", () => {
  const html = `<table><tr><td>1</td><td>Clube A</td><td>10</td><td>4</td><td>3</td><td>1</td><td>0</td><td>9</td><td>2</td><td>7</td></tr>
    <tr><td>2</td><td>Clube B</td><td>7</td><td>4</td><td>2</td><td>1</td><td>1</td><td>6</td><td>4</td><td>2</td></tr>
    <tr><td>3</td><td>Clube C</td><td>0</td><td>4</td><td>0</td><td>0</td><td>4</td><td>1</td><td>10</td><td>-9</td></tr></table>`;
  const t = lerPaginaCompeticao(html).tabelas[0].linhas;
  assert.deepEqual([t[0].equipa, t[0].pts, t[0].j, t[0].v, t[0].gs], ["Clube A", 10, 4, 3, 2]);
});
