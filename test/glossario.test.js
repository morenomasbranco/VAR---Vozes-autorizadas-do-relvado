import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPagina, slugDe, palavraValida, createGlossario } from "../server/glossario.js";
import { indice, procurarLocal } from "../web/src/glossario/pesquisa.js";
import { TERMOS } from "../web/src/glossario/termos.js";
import { PAISES } from "../web/src/glossario/clubes.js";
import { GRUPOS_COMP } from "../web/src/glossario/competicoes.js";

// excertos das páginas reais (sinonimos.com.br e antonimos.com.br, outubro de 2026)
const PAGINA = `<div class="content-detail"><div class="content-detail--subtitle">Qualquer tipo de conquista ou triunfo:</div><p class="syn-list syn-list-1"><em class="syn-number">1</em> <a href="/conquista/" class="sinonimo">conquista</a>, <a href="/triunfo/" class="sinonimo">triunfo</a>, <a href="/exito/" class="sinonimo">&ecirc;xito</a>, sucesso.</p></div>
<div class="content-detail"><div class="content-detail--subtitle">Vit&#243;ria militar:</div><p class="syn-list syn-list-2"><em class="syn-number">2</em> vencimento, <a href="/batalha/">batalha</a> ganha</p></div>`;
const ANTONIMOS = `<p id="total" class="word-count">17 <strong>antônimos</strong> de vitória</p> <div class="content-detail"><div class="content-detail--subtitle">Contrário de triunfo:</div><p class="ant-list"><em class="ant-number">1</em> <a href="/derrota/">derrota</a>, <a href="/fracasso/">fracasso</a>, <a href="/espalhanco/">espalhanço</a>.</p></div>`;

test("glossário (internet): lê os sinónimos e os antónimos de cada sentido da página", () => {
  const s = lerPagina(PAGINA, "sinonimos");
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { sentido: "Qualquer tipo de conquista ou triunfo", palavras: ["conquista", "triunfo", "êxito", "sucesso"] });
  assert.deepEqual(s[1], { sentido: "Vitória militar", palavras: ["vencimento", "batalha ganha"] });
  assert.deepEqual(lerPagina(ANTONIMOS, "antonimos"), [{ sentido: "Contrário de triunfo", palavras: ["derrota", "fracasso", "espalhanço"] }]);
  assert.deepEqual(lerPagina(ANTONIMOS, "sinonimos"), []);
  assert.deepEqual(lerPagina("<p>nada</p>", "sinonimos"), []);
});

test("glossário (internet): o endereço da palavra e as palavras aceites", () => {
  assert.equal(slugDe("Vitória"), "vitoria");
  assert.equal(slugDe("ponto nevrálgico"), "ponto-nevralgico");
  assert.equal(slugDe("pé-de-meia"), "pe-de-meia");
  assert.ok(palavraValida("Bávaros"));
  assert.ok(palavraValida("guarda-redes"));
  assert.ok(!palavraValida(""));
  assert.ok(!palavraValida("../etc"));
  assert.ok(!palavraValida("a".repeat(41)));
});

test("glossário (internet): guarda as respostas e não volta a pedir a mesma palavra", async () => {
  const pedidos = [];
  const pedir = async (url) => {
    pedidos.push(url);
    if (url.includes("/inexistente/")) return new Response("", { status: 404 });
    return new Response(url.includes("antonimos") ? ANTONIMOS : PAGINA, { status: 200 });
  };
  const g = createGlossario({ pedir });
  const r = await g.procurar("vitória", "sinonimos");
  assert.equal(r.fonte, "www.sinonimos.com.br");
  assert.equal(r.sentidos.length, 2);
  await g.procurar("Vitória", "sinonimos");
  assert.equal(pedidos.length, 1);
  assert.equal((await g.procurar("vitória", "antonimos")).fonte, "www.antonimos.com.br");
  assert.equal(pedidos[1], "https://www.antonimos.com.br/vitoria/");
  assert.deepEqual((await g.procurar("inexistente", "sinonimos")).sentidos, []);
  await assert.rejects(g.procurar("<script>", "sinonimos"), /inválida/);
  await assert.rejects(g.procurar("vitória", "outro"), /tipo/);
  const falha = createGlossario({ pedir: async () => new Response("", { status: 503 }) });
  await assert.rejects(falha.procurar("golo"), /503/);
  assert.equal(falha.estado().erros, 1);
});

test("glossário: sinónimos e antónimos no próprio glossário (termos, clubes e competições)", () => {
  const g = indice();
  const sin = (p) => procurarLocal(g, p, "sinonimos").flatMap((r) => r.palavras);
  const ant = (p) => procurarLocal(g, p, "antonimos").flatMap((r) => r.palavras);
  assert.ok(sin("estádio").includes("reduto"));
  assert.ok(sin("Reduto").includes("estádio"));
  assert.ok(sin("equipa").includes("conjunto"));
  assert.ok(sin("torcedor").includes("adepto")); // «torcedor (BR)» também conta
  assert.ok(sin("Dragões").includes("FC Porto"));
  assert.ok(sin("bávaros").includes("Bayern de Munique"));
  assert.ok(sin("Champions").includes("Liga dos Campeões"));
  assert.ok(sin("ludopédio").includes("futebol"));
  assert.ok(!sin("estádio").includes("estádio"));
  assert.ok(ant("vitória").includes("derrota"));
  assert.ok(ant("desaire").includes("vitória")); // «desaire» é sinónimo de «derrota»
  assert.ok(ant("derrota").includes("triunfo")); // ao contrário: «derrota» é antónimo de «vitória»
  assert.ok(ant("titular").includes("suplente"));
  assert.deepEqual(procurarLocal(g, "xptoabc", "sinonimos"), []);
  assert.deepEqual(procurarLocal(g, "", "sinonimos"), []);
});

test("glossário: os dados estão completos (cada termo, clube e competição tem o que precisa)", () => {
  const mods = new Set(["futebol", "futsal", "hoquei", "basquete", "geral", "lingua"]);
  for (const x of TERMOS) {
    assert.ok(x.t && x.d, `termo sem nome ou definição: ${x.t}`);
    assert.ok(mods.has(x.m), `modalidade desconhecida em ${x.t}: ${x.m}`);
  }
  for (const m of ["futebol", "futsal", "hoquei", "basquete"]) assert.ok(TERMOS.filter((x) => x.m === m).length >= 10, m);
  const paises = new Set(PAISES.map((p) => p.id));
  for (const p of ["pt", "en", "es", "it", "de", "fr", "br", "sa", "tr", "nl", "mundo"]) assert.ok(paises.has(p), p);
  for (const p of PAISES) for (const c of p.clubes) assert.ok(c[0] && c[1] && c[2], `clube incompleto: ${c[0]}`);
  for (const g of GRUPOS_COMP) for (const c of g.provas) assert.ok(c[0] && c[1], `prova incompleta: ${c[0]}`);
  const nomes = PAISES.flatMap((p) => p.clubes.map((c) => c[0]));
  assert.equal(new Set(nomes).size, nomes.length, "clube repetido");
});
