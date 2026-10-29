import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPagina, lerWiki, slugDe, palavraValida, createGlossario } from "../server/glossario.js";
import { indice, procurarLocal } from "../web/src/glossario/pesquisa.js";
import { TERMOS, MODS } from "../web/src/glossario/termos.js";
import { PAISES } from "../web/src/glossario/clubes.js";
import { GRUPOS_COMP } from "../web/src/glossario/competicoes.js";
import { PAISES_GLOS } from "../web/src/glossario/paises.js";
import { OUTROS_NOMES } from "../web/src/glossario/nomes.js";
import { reconhecerClube, reconhecerProva, fichaDoJogo, termosDoJogo } from "../web/src/glossario/jogo.js";
import { titulosDoJogo, todosOsTitulos, plural } from "../web/src/glossario/titulos.js";

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
  // o CSS do cabeçalho fala de «content-reviewer» e de «footer» antes das listas: não se para aí
  const cabecalho = "<html><head><style>.content-reviewer{color:red} footer{}</style><footer-x></head><body>";
  const aosBocados = () => new Response(new ReadableStream({ start(c) { for (const b of [cabecalho, PAGINA, '<div class="content-reviewer">fim</div>']) c.enqueue(enc.encode(b)); c.close(); } }), { status: 200 });
  const comCss = createGlossario({ pedir: falso({ "sinonimos.com.br": aosBocados }).pedir });
  assert.equal((await comCss.procurar("vitória")).sentidos.length, 2);
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
  assert.ok(sin("bávaros").includes("Bayern München"));
  assert.ok(sin("Quinas").includes("Seleção de Portugal"));
  assert.ok(sin("Hexágono").includes("França"));
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
  const mods = new Set(MODS.map((m) => m.id));
  for (const m of ["futebol", "futsal", "hoquei", "basquete", "andebol", "voleibol", "geral", "lingua"]) assert.ok(mods.has(m), m);
  for (const x of TERMOS) {
    assert.ok(x.t && x.d, `termo sem nome ou definição: ${x.t}`);
    assert.ok(mods.has(x.m), `modalidade desconhecida em ${x.t}: ${x.m}`);
  }
  for (const m of ["futebol", "futsal", "hoquei", "basquete", "andebol", "voleibol"]) assert.ok(TERMOS.filter((x) => x.m === m).length >= 10, m);
  // o mesmo termo pode ter um sentido em cada modalidade («assistência» no futebol e no jornalismo), mas não dois na mesma
  const chaves = TERMOS.map((x) => `${x.m}|${x.t}`);
  assert.equal(new Set(chaves).size, chaves.length, `termo repetido: ${chaves.filter((t, i) => chaves.indexOf(t) !== i)}`);
  const paises = new Set(PAISES.map((p) => p.id));
  for (const p of ["pt", "en", "es", "it", "de", "fr", "br", "sa", "tr", "nl", "mundo"]) assert.ok(paises.has(p), p);
  for (const p of PAISES) for (const c of p.clubes) assert.ok(c[0] && c[1] && c[2], `clube incompleto: ${c[0]}`);
  for (const g of GRUPOS_COMP) for (const c of g.provas) assert.ok(c[0] && c[1], `prova incompleta: ${c[0]}`);
  const nomes = PAISES.flatMap((p) => p.clubes.map((c) => c[0]));
  assert.equal(new Set(nomes).size, nomes.length, "clube repetido");
});

test("glossário: preparar um jogo reconhece os clubes, as seleções e a competição pelos nomes dos resultados", () => {
  const nome = (n) => reconhecerClube(n)?.nome || null;
  assert.equal(nome("AC Milan"), "Milan");
  assert.equal(nome("Internazionale"), "Inter");
  assert.equal(nome("Inter Milan"), "Inter");
  assert.equal(nome("Bayern Munich"), "Bayern München");
  assert.equal(nome("Manchester United"), "Manchester United");
  assert.equal(nome("Manchester City"), "Manchester City");
  assert.equal(nome("Sporting CP"), "Sporting");
  assert.equal(nome("Sporting Gijón"), "Sporting Gijón");
  assert.equal(nome("Vitória de Guimarães"), "Vitória SC");
  assert.equal(nome("Paris Saint-Germain"), "PSG");
  assert.equal(nome("Fenerbahce"), "Fenerbahçe");
  assert.equal(nome("Red Star Belgrade"), "Estrela Vermelha");
  assert.equal(nome("Clube que não existe"), null);
  assert.equal(reconhecerProva("Serie A")?.nome, "Serie A");
  assert.equal(reconhecerProva("Liga Portugal")?.nome, "Liga Portugal Betclic");
  assert.equal(reconhecerProva("Seleção: Liga das Nações")?.nome, "Liga das Nações");
  assert.equal(reconhecerProva("Liga Saudita")?.nome, "Saudi Pro League");

  const f = fichaDoJogo({ h: "AC Milan", a: "Juventus", comp: "Serie A" });
  assert.equal(f.casa.clube.nome, "Milan");
  assert.equal(f.fora.clube.nome, "Juventus");
  assert.ok(f.fora.clube.alcunhas.includes("Vecchia Signora"));
  assert.equal(f.prova.nome, "Serie A");
  assert.deepEqual(f.paises.map((p) => p.n), ["Itália"]);
  // uma seleção não é confundida com um clube («Portugal» não é o Sporting Clube de Portugal)
  const s = fichaDoJogo({ h: "Portugal", a: "Wales", comp: "Seleção: Liga das Nações" });
  assert.equal(s.casa.selecao.n, "Portugal");
  assert.equal(s.fora.selecao.n, "País de Gales");
  // dérbi e clássico
  assert.equal(fichaDoJogo({ h: "Inter", a: "Milan" }).termos[0], "dérbi");
  assert.equal(fichaDoJogo({ h: "Benfica", a: "FC Porto" }).termos[0], "clássico");
  const lisboa = fichaDoJogo({ h: "Benfica", a: "Sporting" }).termos;
  assert.equal(lisboa[0], "dérbi");
  assert.equal(lisboa.length, new Set(lisboa).size);
  // todas as expressões sugeridas existem no glossário
  const termos = new Set(TERMOS.map((x) => x.t));
  for (const mod of ["futebol", "futsal", "hoquei", "basquete", "andebol", "voleibol"]) {
    for (const t of termosDoJogo({ casa: null, fora: null, mod })) assert.ok(termos.has(t), `${t} não está no glossário`);
  }
  for (const t of ["dérbi", "clássico"]) assert.ok(termos.has(t), t);
});

test("glossário: os países e os outros nomes dos clubes estão completos", () => {
  for (const p of PAISES_GLOS) assert.ok(p.n && p.b && p.g && p.p && p.s && Array.isArray(p.en), `país incompleto: ${p.n}`);
  const clubes = new Set(PAISES.flatMap((p) => p.clubes.map((c) => c[0])));
  for (const k of Object.keys(OUTROS_NOMES)) assert.ok(clubes.has(k), `outros nomes de um clube que não existe: ${k}`);
});

test("glossário: as palavras de cada um juntam-se ao glossário, à pesquisa e ao preparar um jogo", async () => {
  const { VAZIO, acrescentar, apagar, juntar, contar, limpar, fundir } = await import("../web/src/glossario/meus.js");
  let m = VAZIO();
  m = acrescentar(m, "termo", { nome: "vitória", s: "êxito retumbante, sucesso", a: "desaire" });
  m = acrescentar(m, "termo", { nome: "chocolate", m: "futebol", d: "Remate fraco", s: "remate mole" });
  m = acrescentar(m, "clube", { nome: "Milan", alc: "Os do Diabo" });
  m = acrescentar(m, "clube", { nome: "Repesenses", pais: "pt", cidade: "Viseu", alc: "Os da Ribeira" });
  m = acrescentar(m, "prova", { nome: "Serie A", sin: "campeonato transalpino" });
  m = acrescentar(m, "pais", { nome: "Itália", s: "La Nazionale" });
  m = acrescentar(m, "citacao", { t: "Uma frase minha", a: "Moreno" });
  m = acrescentar(m, "ideia", { tema: "Rádio", t: "Uma ideia minha" });
  m = acrescentar(m, "termo", { nome: "" }); // sem nome não acrescenta nada
  assert.equal(contar(m), 12);
  const d = juntar(m);
  // só as palavras que não estavam no glossário ficam assinaladas como da pessoa
  assert.ok(d.minhas.has("êxito retumbante") && !d.minhas.has("sucesso"));
  assert.ok(d.TERMOS.find((x) => x.t === "vitória").s.includes("êxito retumbante"));
  assert.equal(d.TERMOS.find((x) => x.t === "chocolate").d, "Remate fraco");
  assert.ok(d.PAISES.find((p) => p.id === "pt").clubes.some((c) => c[0] === "Repesenses" && c[1] === "Viseu"));
  assert.ok(d.CITACOES.some((c) => c.meu && c.t === "Uma frase minha"));
  // a pesquisa e o preparar um jogo usam as palavras da pessoa
  const g = indice(d);
  assert.ok(procurarLocal(g, "êxito retumbante", "sinonimos").flatMap((r) => r.palavras).includes("triunfo"));
  assert.ok(procurarLocal(g, "Os da Ribeira", "sinonimos").flatMap((r) => r.palavras).includes("Repesenses"));
  const f = fichaDoJogo({ h: "AC Milan", a: "Repesenses", comp: "Serie A" }, d);
  assert.ok(f.casa.clube.alcunhas.includes("Os do Diabo"));
  assert.equal(f.fora.clube.nome, "Repesenses");
  assert.ok(f.prova.sinonimos.includes("campeonato transalpino"));
  // sem as palavras da pessoa, o glossário fica como estava
  assert.ok(!fichaDoJogo({ h: "AC Milan", a: "Juventus" }).casa.clube.alcunhas.includes("Os do Diabo"));
  // apagar uma palavra, uma entrada, uma citação
  m = apagar(m, "clube", "Milan", "alc", "Os do Diabo");
  assert.ok(!m.clubes.Milan);
  m = apagar(m, "termo", "chocolate");
  assert.ok(!m.termos.chocolate);
  m = apagar(m, "citacao", "0");
  assert.equal(m.citacoes.length, 0);
  // importar: um ficheiro mexido à mão não parte nada, e junta-se sem repetir
  assert.deepEqual(limpar({ termos: { x: { s: "a, b" } }, ideias: "lixo", clubes: [1] }).termos.x.s, ["a", "b"]);
  const f2 = fundir(m, { clubes: { Repesenses: { alc: ["Os da Ribeira", "Repe"] } }, ideias: [{ tema: "Rádio", t: "Uma ideia minha" }] });
  assert.deepEqual(f2.clubes.Repesenses.alc, ["Os da Ribeira", "Repe"]);
  assert.equal(f2.ideias.length, 1);
});

test("glossário: preparar um jogo das ligas norte-americanas e de outros países (pelo desporto e pelo país)", () => {
  const f = (h, a, comp, mod, paisNome) => fichaDoJogo({ h, a, comp, mod, paisNome });
  // «Rangers» é o de Glasgow no futebol e o de Nova Iorque no hóquei no gelo
  assert.equal(f("Rangers", "Canucks", "NHL", "hoquei_gelo").casa.clube.nome, "New York Rangers");
  assert.equal(f("Rangers", "Celtic", "Scottish Premiership", "futebol").casa.clube.nome, "Rangers");
  assert.equal(f("Flyers", "Hurricanes", "NHL", "hoquei_gelo").fora.clube.nome, "Carolina Hurricanes");
  assert.equal(f("Hornets", "Bucks", "NBA", "basquetebol").prova.nome, "NBA");
  assert.equal(f("Seahawks", "49ers", "NFL", "futebol_americano").fora.clube.nome, "San Francisco 49ers");
  assert.equal(f("Maple Leafs", "Canadiens", "NHL", "hoquei_gelo").paises[0].n, "Canadá");
  // o Benfica também joga basquetebol
  assert.equal(f("Benfica", "Real Madrid", "EuroLeague", "basquetebol").casa.clube.nome, "Benfica");
  // «Santos» no México é o Santos Laguna, e o «Torneo Apertura» é o do país do jogo
  const mx = f("Atl. San Luis", "Santos", "Torneo Apertura", "futebol", "México");
  assert.equal(mx.casa.clube.nome, "Atlético San Luis");
  assert.equal(mx.fora.clube.nome, "Santos Laguna");
  assert.equal(mx.prova.nome, "Liga MX (México)");
  assert.equal(f("Santos", "Flamengo", "Brasileirão", "futebol", "Brasil").casa.clube.nome, "Santos");
  assert.equal(f("Racing", "Belgrano", "Torneo Clausura", "futebol", "Argentina").prova.nome, "Liga Profesional (Argentina)");
  assert.equal(f("St. Louis", "LA Galaxy", "MLS", "futebol").casa.clube.nome, "St. Louis City");
  assert.equal(f("Qarabag", "Benfica", "Liga dos Campeões", "futebol").casa.clube.pais.n, "Azerbaijão");
});

test("glossário: sugestões de títulos para o jogo (antes, durante e depois)", () => {
  const todos = (j) => { const x = todosOsTitulos(fichaDoJogo(j), j); return [...x.criativos, ...x.classicos]; };
  const t = (j, volta) => titulosDoJogo(fichaDoJogo(j), j, volta);
  const antes = { h: "Benfica", a: "Sporting", comp: "Liga Portugal" };
  assert.ok(todos(antes).includes("Liga Portugal: Benfica recebe Sporting"), todos(antes).join(" | "));
  assert.ok(todos(antes).includes("Águias contra Leões: quem pisca primeiro?"));
  assert.ok(todos(antes).includes("Benfica quer fazer do Estádio da Luz uma fortaleza"));
  // dérbi da mesma cidade: o visitante não «chega a Lisboa»
  assert.ok(!todos(antes).some((x) => /chegam a Lisboa/.test(x)));
  const golea = { h: "Benfica", a: "Sporting", hs: 5, as: 0, comp: "Liga Portugal", ft: true };
  for (const x of ["Benfica manda no dérbi (5–0)", "Benfica aplica chapa cinco no Estádio da Luz", "Águias esmagam Leões", "Benfica goleia Sporting por 5–0"]) {
    assert.ok(todos(golea).includes(x), `${x} :: ${todos(golea).join(" | ")}`);
  }
  const fora = { h: "Gil Vicente", a: "FC Porto", hs: 1, as: 3 };
  for (const x of ["FC Porto assalta Barcelos", "FC Porto cala o Estádio Cidade de Barcelos (3–1)", "Dragões superam Gilistas", "FC Porto bate Gil Vicente em Barcelos"]) {
    assert.ok(todos(fora).includes(x), `${x} :: ${todos(fora).join(" | ")}`);
  }
  const nulo = { h: "Bahia", a: "Mirassol", hs: 0, as: 0, comp: "Brasileirão" };
  assert.ok(todos(nulo).includes("Nulo entre Bahia e Mirassol"), todos(nulo).join(" | "));
  assert.ok(todos(nulo).includes("Muita luta, zero golos: Bahia 0–0 Mirassol"));
  // nas ligas norte-americanas, o verbo vai para o plural, conta-se em pontos e não há «golos» nem «chapa»
  const nba = { h: "Cavaliers", a: "Magic", hs: 42, as: 33, comp: "NBA", mod: "basquetebol", vivo: true };
  assert.ok(todos(nba).includes("Cavaliers estão a vencer Magic (42–33)"), todos(nba).join(" | "));
  const nfl = { h: "Cardinals", a: "Lions", hs: 21, as: 45, comp: "NFL", mod: "futebol_americano" };
  assert.ok(todos(nfl).includes("Lions arrasam Cardinals (45–21)"), todos(nfl).join(" | "));
  assert.ok(!todos(nfl).some((x) => /golo|chapa/i.test(x)));
  for (const j of [antes, golea, fora, nulo, nba, nfl]) {
    const lst = t(j);
    assert.ok(lst.length >= 4 && lst.length <= 10, lst.join(" | "));
    assert.equal(new Set(lst).size, lst.length);
    for (const x of todos(j)) assert.ok(!/undefined|null|\s{2}|\s$|\s[,:]/.test(x), x);
    // primeiro os criativos; os clássicos no fim
    const { criativos } = todosOsTitulos(fichaDoJogo(j), j);
    assert.ok(criativos.includes(lst[0]), lst[0]);
  }
  // o mesmo jogo dá sempre as mesmas sugestões; «outras ideias» troca-as
  assert.deepEqual(t(golea), t(golea));
  assert.notDeepEqual(t(golea, 1), t(golea));
});
