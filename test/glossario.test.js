import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPagina, lerWiki, slugDe, palavraValida, createGlossario } from "../server/glossario.js";
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

const WIKITEXT = `={{-pt-}}=
==Substantivo==
'''vitória'''
# triunfo
==={{-sin-}}===
* [[triunfo]], [[êxito]]
* [[conquista|conquistas]]
==={{-ant-}}===
* [[derrota]]
* [[Categoria:Desporto]]
={{-es-}}=
==={{-sin-}}===
* [[victoria]]`;

test("glossário (Wikcionário): os sinónimos e antónimos da parte em português", () => {
  assert.deepEqual(lerWiki(WIKITEXT, "sinonimos"), [{ sentido: null, palavras: ["triunfo", "êxito", "conquista"] }]);
  assert.deepEqual(lerWiki(WIKITEXT, "antonimos"), [{ sentido: null, palavras: ["derrota"] }]);
  assert.deepEqual(lerWiki("={{-pt-}}=\n==Substantivo==\n# coisa", "sinonimos"), []);
});

// um pedir() de mentira: o site de sinónimos, o de antónimos e o Wikcionário
const falso = (sites = {}) => {
  const pedidos = [];
  const pedir = async (url) => {
    pedidos.push(url);
    for (const [k, f] of Object.entries(sites)) if (url.includes(k)) return f(url);
    return new Response("", { status: 404 });
  };
  return { pedir, pedidos };
};
const pagina = (html) => () => new Response(html, { status: 200 });
const wiki = (texto) => () => Response.json(texto ? { parse: { wikitext: texto } } : { error: { code: "missingtitle" } });

test("glossário (internet): guarda as respostas e não volta a pedir a mesma palavra", async () => {
  const { pedir, pedidos } = falso({ "sinonimos.com.br": pagina(PAGINA), "antonimos.com.br": pagina(ANTONIMOS) });
  const g = createGlossario({ pedir });
  const r = await g.procurar("vitória", "sinonimos");
  assert.equal(r.fonte, "www.sinonimos.com.br");
  assert.equal(r.sentidos.length, 2);
  await g.procurar("Vitória", "sinonimos");
  assert.equal(pedidos.length, 1);
  assert.equal((await g.procurar("vitória", "antonimos")).fonte, "www.antonimos.com.br");
  assert.equal(pedidos[1], "https://www.antonimos.com.br/vitoria/");
  await assert.rejects(g.procurar("<script>", "sinonimos"), /inválida/);
  await assert.rejects(g.procurar("vitória", "outro"), /tipo/);
  assert.equal(g.estado().fontes["www.sinonimos.com.br"].ok, 1);
});

test("glossário (internet): quando o site não tem a palavra, falha ou não responde, vai ao Wikcionário", async () => {
  // o site não tem a palavra (404): o Wikcionário tem
  let f = falso({ "pt.wiktionary.org": wiki(WIKITEXT) });
  let r = await createGlossario({ pedir: f.pedir }).procurar("vitória");
  assert.equal(r.fonte, "pt.wiktionary.org");
  assert.deepEqual(r.sentidos[0].palavras, ["triunfo", "êxito", "conquista"]);
  assert.match(f.pedidos[1], /pt\.wiktionary\.org\/w\/api\.php\?.*page=vit%C3%B3ria/);
  // o site falha (503)
  f = falso({ "sinonimos.com.br": () => new Response("", { status: 503 }), "pt.wiktionary.org": wiki(WIKITEXT) });
  r = await createGlossario({ pedir: f.pedir }).procurar("vitória");
  assert.equal(r.fonte, "pt.wiktionary.org");
  // o site fica pendurado
  f = falso({ "sinonimos.com.br": () => new Promise(() => {}), "pt.wiktionary.org": wiki(WIKITEXT) });
  const g = createGlossario({ pedir: f.pedir, prazo: 50 });
  r = await g.procurar("vitória");
  assert.equal(r.fonte, "pt.wiktionary.org");
  assert.match(g.estado().fontes["www.sinonimos.com.br"].ultimo.erro, /sem resposta/);
  // nenhum tem a palavra: lista vazia (sem erro)
  f = falso({ "pt.wiktionary.org": wiki(null) });
  assert.deepEqual((await createGlossario({ pedir: f.pedir }).procurar("xptoabc")).sentidos, []);
  // os dois falham: erro
  f = falso({ "sinonimos.com.br": () => new Response("", { status: 503 }), "pt.wiktionary.org": () => new Response("", { status: 500 }) });
  const falha = createGlossario({ pedir: f.pedir });
  await assert.rejects(falha.procurar("golo"), /503/);
  assert.equal(falha.estado().erros, 1);
  // um pedido pendurado (que nem responde nem falha) acaba no prazo
  const pendurado = createGlossario({ pedir: () => new Promise(() => {}), prazo: 50 });
  await assert.rejects(pendurado.procurar("golo"), /sem resposta/);
  assert.match(pendurado.estado().ultimoErro.erro, /sem resposta/);
});

test("glossário (internet): a página que chega devagar e para a meio serve com o que já chegou", async () => {
  const enc = new TextEncoder();
  const corpo = new ReadableStream({ start(c) { c.enqueue(enc.encode(PAGINA)); } }); // nunca fecha
  const f = falso({ "sinonimos.com.br": () => new Response(corpo, { status: 200 }) });
  const g = createGlossario({ pedir: f.pedir, prazo: 80 });
  const r = await g.procurar("vitória");
  assert.equal(r.fonte, "www.sinonimos.com.br");
  assert.deepEqual(r.sentidos[0].palavras, ["conquista", "triunfo", "êxito", "sucesso"]);
  assert.equal(g.estado().fontes["www.sinonimos.com.br"].ultimo.completo, false);
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
