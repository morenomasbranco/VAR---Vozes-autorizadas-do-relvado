import { test } from "node:test";
import assert from "node:assert/strict";
import { pedidoDaCronica, lerCronica, createProsebot, TAMANHOS, modDaCronica, verificarFactos, fonteDosFactos } from "../server/prosebot.js";

const JOGO = { casa: "FC Porto", fora: "Benfica", hs: 2, as: 1, comp: "Liga Portugal, 8.ª jornada", quando: "sábado, no Estádio do Dragão" };
const NOTAS = "23' golo de Samu, de cabeça\n67' Pavlidis empata\n88' Rodrigo Mora decide de livre direto";

test("prosebot: o pedido leva o jogo, as notas, o tamanho e o vocabulário do glossário", () => {
  const p = pedidoDaCronica({ jogo: JOGO, notas: NOTAS, figura: "Rodrigo Mora", tamanho: "curta", vocabulario: "FC Porto: dragões, azuis e brancos" });
  assert.match(p, /^Modalidade: futebol\. Como se conta um jogo de futebol: duas partes de 45 minutos/);
  assert.match(p, /\nJogo: FC Porto 2–1 Benfica · Liga Portugal, 8\.ª jornada\./);
  assert.match(p, /Quando e onde: sábado, no Estádio do Dragão\./);
  assert.match(p, /Figura do jogo, para quem escreveu as notas: Rodrigo Mora\./);
  assert.ok(p.includes(TAMANHOS.curta));
  assert.match(p, /dragões, azuis e brancos/);
  assert.ok(p.includes(`"""\n${NOTAS}\n"""`));
  // sem resultado: o modelo segue as notas; tamanho desconhecido: o normal
  const q = pedidoDaCronica({ jogo: { casa: "Braga", fora: "Vitória", hs: "", as: null }, notas: NOTAS, tamanho: "enorme" });
  assert.match(q, /Braga – Vitória \(resultado não indicado/);
  assert.ok(q.includes(TAMANHOS.normal));
});

test("prosebot: cada modalidade com o seu tempo, o seu resultado e as suas expressões", () => {
  const a = pedidoDaCronica({ jogo: { casa: "FC Porto", fora: "Sporting", hs: 31, as: 29 }, notas: NOTAS, mod: "andebol", expressoes: "sete metros (livre de sete metros); exclusão (dois minutos)" });
  assert.match(a, /^Modalidade: andebol\./);
  assert.match(a, /exclusão de dois minutos/);
  assert.match(a, /Expressões próprias do andebol, do glossário .*: sete metros \(livre de sete metros\); exclusão/);
  // no basquetebol os resultados passam dos 99 pontos; no voleibol o resultado é em sets
  assert.match(pedidoDaCronica({ jogo: { casa: "Benfica", fora: "Sporting", hs: 102, as: 98 }, notas: NOTAS, mod: "basquetebol" }), /Jogo: Benfica 102–98 Sporting\./);
  const v = pedidoDaCronica({ jogo: { casa: "Benfica", fora: "Sporting", hs: 3, as: 1 }, notas: NOTAS, mod: "voleibol" });
  assert.match(v, /Jogo: Benfica 3–1 Sporting \(em sets\)\./);
  assert.match(v, /Nunca «golo» nem minutos/);
  // as modalidades do glossário e as desconhecidas
  assert.equal(modDaCronica("basquete"), "basquetebol");
  assert.equal(modDaCronica("hoquei"), "hoquei_patins");
  assert.equal(modDaCronica("xadrez"), "futebol");
  assert.match(pedidoDaCronica({ jogo: JOGO, notas: NOTAS, mod: "hoquei" }), /^Modalidade: hóquei em patins\./);
});

test("prosebot: sem equipas ou sem notas, o pedido é recusado (400)", () => {
  assert.throws(() => pedidoDaCronica({ jogo: { casa: "FC Porto" }, notas: NOTAS }), (e) => e.status === 400 && /equipas/.test(e.message));
  assert.throws(() => pedidoDaCronica({ jogo: JOGO, notas: "curto" }), (e) => e.status === 400 && /notas/.test(e.message));
});

test("prosebot: lê a crónica devolvida, com a figura do jogo", () => {
  const c = lerCronica({ titulo_site: "Mora decide o clássico", lead: "O FC Porto vence.", corpo: ["Um.", "", "Dois."], figura: { nome: "Rodrigo Mora", texto: "Decide com um livre." }, notas: [] });
  assert.equal(c.tituloSite, "Mora decide o clássico");
  assert.deepEqual(c.corpo, ["Um.", "Dois."]);
  assert.deepEqual(c.figura, { nome: "Rodrigo Mora", texto: "Decide com um livre." });
  assert.deepEqual(c.citacoes, []);
  assert.equal(lerCronica({ corpo: ["x"], figura: "Samu" }).figura.nome, "Samu");
  assert.equal(lerCronica({ corpo: ["x"], figura: {} }).figura, null);
});

test("prosebot: escreve pelo Groq e diz quem escreveu", async () => {
  const original = globalThis.fetch;
  const antes = { g: process.env.GROQ_API_KEY, m: process.env.IA_MOTORES, ge: process.env.GEMINI_API_KEY, c: process.env.ANTHROPIC_API_KEY };
  try {
    process.env.GROQ_API_KEY = "teste"; delete process.env.IA_MOTORES; delete process.env.GEMINI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    let sistema = "";
    globalThis.fetch = async (url, op) => {
      const corpo = JSON.parse(op.body);
      sistema = corpo.messages[0].content;
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"titulo_site":"Mora decide o clássico no Dragão","lead":"O FC Porto vence o Benfica.","corpo":["Parágrafo."],"figura":{"nome":"Rodrigo Mora","texto":"Livre decisivo."},"notas":["Falta o árbitro."]}' } }] }) };
    };
    const p = createProsebot();
    const r = await p.cronica({ jogo: JOGO, notas: NOTAS });
    assert.equal(r.tituloSite, "Mora decide o clássico no Dragão");
    assert.equal(r.figura.nome, "Rodrigo Mora");
    assert.equal(r.motor, "Groq");
    assert.match(sistema, /crónica/);
    assert.match(sistema, /a mais importante: não inventar nada/);
    assert.match(sistema, /Não acrescentas nada: nem lances, minutos, marcadores/);
    assert.match(sistema, /90 caracteres/); // as regras do zerozero vão no pedido
    assert.match(sistema, /vocabulário da modalidade indicada/);
    assert.equal(p.estado().cronicas, 1);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of [["GROQ_API_KEY", antes.g], ["IA_MOTORES", antes.m], ["GEMINI_API_KEY", antes.ge], ["ANTHROPIC_API_KEY", antes.c]]) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  }
});

test("prosebot: o tamanho é um máximo e o que a crónica diz sem estar nas notas fica para confirmar", () => {
  const p = pedidoDaCronica({ jogo: JOGO, notas: NOTAS, tamanho: "longa" });
  assert.match(p, /Tamanho: até cerca de 700 palavras.*é um máximo.*nunca inventes para encher/);
  const pedido = { jogo: JOGO, notas: NOTAS, figura: "Rodrigo Mora", vocabulario: "FC Porto: Dragões; Benfica: águias" };
  const c = {
    tituloSite: "Rodrigo Mora decide o clássico", lead: "O FC Porto vence o Benfica por 2-1, na 8.ª jornada da Liga Portugal.",
    corpo: [
      "Os Dragões entram melhor e Samu marca aos 23 minutos, de cabeça.",
      "Aos 41 minutos, Otamendi vê amarelo depois de travar Pepê. Com 50 mil adeptos, o 4-3-3 asfixia as águias.",
      "Pavlidis empata, mas Rodrigo Mora decide de livre direto, com cinco remates enquadrados.",
    ],
    figura: { nome: "Rodrigo Mora", texto: "Decide." },
  };
  const v = verificarFactos(c, fonteDosFactos(pedido));
  const tem = (re) => assert.ok(v.some((x) => re.test(x)), `${re} em ${JSON.stringify(v)}`);
  tem(/o 41 não está nas notas/);
  tem(/o 50 não está nas notas/);
  tem(/o 4 não está nas notas/);
  tem(/«cinco remates»: o 5 não está nas notas/);
  tem(/«Otamendi» não aparece/);
  tem(/«Pepê» não aparece/);
  // o que está nas notas e no pedido não se assinala
  for (const ok of ["Samu", "Pavlidis", "Rodrigo Mora", "Dragões", "Liga Portugal", "23", "2-1"]) assert.ok(!v.some((x) => x.includes(`«${ok}»`) || x.includes(`o ${ok} não`)), ok);
  assert.ok(!v.some((x) => /«Com»|«Aos»|«Os»/.test(x)), "as palavras do início das frases não são nomes");
});
