// Glossário › preparar um jogo: reconhece os clubes (ou as seleções) e a competição de um jogo, a partir dos nomes que
// chegam dos resultados (em inglês, com a designação completa…), e junta as palavras que fazem sentido para esse jogo:
// as alcunhas, a cidade e o estádio de cada clube, os sinónimos da competição e dos países, e as expressões úteis.
import { OUTROS_NOMES } from "./nomes.js";
import { PAISES_GLOS } from "./paises.js";
import { norm, lista, BASE } from "./pesquisa.js";

// palavras que não distinguem um clube de outro (siglas da forma jurídica, «de», escalões…)
const VAZIAS = new Set(("fc cf sc ac as ss ssc afc cd ud rc rcd sd ca sl cp club clube de da do dos das the bsc sv vfb vfl tsg fsv ogc " +
  "aj hsc sco losc us fk sk kv bk if cfc calcio futebol football soccer e y and 1 05 04 96 98 1846 1893 1907 1932 " +
  "u21 u20 u19 u17 u23 sub 21 20 19 17 23 w women feminino feminina b").split(" "));
// palavras que aparecem em muitos clubes: sozinhas não chegam para reconhecer um
const COMUNS = new Set(("united city real sporting athletic atletico inter internacional nacional racing olympique borussia dynamo dinamo " +
  "union uniao vitoria academica academico deportivo sport town county rovers wanderers hotspur albion al red bull saint st san santa " +
  "estrela young boys club milan").split(" "));
const fichas = (n) => norm(n).replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !VAZIAS.has(t));
const chave = (n) => fichas(n).join(" ");
const frase = (n) => norm(n).replace(/^sele[cç][aã]o:\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();

// o país (do glossário) de cada coluna de clubes
const PAIS_DA_COLUNA = { pt: "Portugal", en: "Inglaterra", es: "Espanha", it: "Itália", de: "Alemanha", fr: "França", br: "Brasil", sa: "Arábia Saudita", tr: "Turquia", nl: "Países Baixos" };
export function paisDoClube(clube, paisesGlos = PAISES_GLOS) {
  const paisPorNome = (n) => paisesGlos.find((p) => p.n === n) || null;
  if (PAIS_DA_COLUNA[clube.coluna]) return paisPorNome(PAIS_DA_COLUNA[clube.coluna]);
  const m = String(clube.cidade || "").match(/\(([^)]+)\)\s*$/);
  return m ? paisPorNome(m[1]) : null;
}

// um índice por conjunto de dados (o do glossário e o que tem também as palavras de cada um)
const INDICES = new WeakMap();
function indice(dados = BASE) {
  if (INDICES.has(dados)) return INDICES.get(dados);
  const clubes = [];
  for (const p of dados.PAISES) for (const [nome, cidade, alcunhas, estadio, nota] of p.clubes) {
    const c = { nome, cidade, alcunhas: lista(alcunhas), estadio: estadio || null, nota: nota || null, coluna: p.id, bandeira: p.bandeira };
    c.pais = paisDoClube(c, dados.PAISES_GLOS);
    c.chaves = [...new Set([nome, ...(OUTROS_NOMES[nome] || [])].map(chave).filter(Boolean))];
    clubes.push(c);
  }
  const exatos = new Map();
  for (const c of clubes) for (const k of c.chaves) if (!exatos.has(k)) exatos.set(k, c);
  const paises = new Map();
  for (const p of dados.PAISES_GLOS) for (const n of [p.n, ...(p.en || [])]) paises.set(chave(n), p);
  const provas = [];
  for (const g of dados.GRUPOS_COMP) for (const [nome, sin, nota] of g.provas) provas.push({ nome, sinonimos: lista(sin), nota: nota || null, grupo: g.nome, bandeira: g.bandeira, frases: [nome, ...lista(sin)].map(frase).filter(Boolean) });
  const i = { clubes, exatos, paises, provas, paisesGlos: dados.PAISES_GLOS };
  INDICES.set(dados, i);
  return i;
}

// o clube com este nome (ou null, se não houver um claro)
export function reconhecerClube(nome, dados) {
  const { clubes, exatos } = indice(dados);
  const k = chave(nome);
  if (!k) return null;
  if (exatos.has(k)) return exatos.get(k);
  const fs = k.split(" ");
  let melhor = null, nota = 0, empate = false;
  for (const c of clubes) {
    for (const ck of c.chaves) {
      const cf = ck.split(" ");
      const comuns = fs.filter((t) => cf.includes(t));
      if (!comuns.some((t) => !COMUNS.has(t) && t.length >= 3)) continue;
      const n = comuns.length / Math.max(fs.length, cf.length);
      if (n < 0.5) continue;
      if (n > nota) { melhor = c; nota = n; empate = false; } else if (n === nota && melhor !== c) empate = true;
    }
  }
  return empate ? null : melhor;
}

// a seleção (o país) com este nome
export const reconhecerPais = (nome, dados) => indice(dados).paises.get(chave(nome)) || null;

// a competição com este nome: igual ao nome ou a um sinónimo; ou um deles começa pelo outro
export function reconhecerProva(nome, dados) {
  const f = frase(nome);
  if (!f) return null;
  const { provas } = indice(dados);
  return provas.find((p) => p.frases.includes(f))
    || provas.find((p) => p.frases.some((x) => Math.min(x.length, f.length) >= 6 && (x.startsWith(f) || f.startsWith(x))))
    || null;
}

const GRANDES_PT = new Set(["Benfica", "FC Porto", "Sporting"]);
// as expressões do glossário que dão jeito para este jogo
export function termosDoJogo({ casa, fora, mod = "futebol" }) {
  const t = ["jogo", "embate", "visitado", "visitante", "anfitrião", "estádio", "reduto", "vitória", "derrota", "empate", "abrir o marcador", "reviravolta"];
  const cc = casa?.clube, fc = fora?.clube;
  if (cc && fc) {
    const cidade = (c) => norm(c.cidade.replace(/\s*\(.*$/, ""));
    if (cidade(cc) === cidade(fc)) t.unshift("dérbi");
    if (GRANDES_PT.has(cc.nome) && GRANDES_PT.has(fc.nome)) t.unshift(cc.nome === "FC Porto" || fc.nome === "FC Porto" ? "clássico" : "dérbi");
  }
  if (mod === "basquete") t.push("triplo", "afundanço", "ressalto", "lance livre", "duplo-duplo", "buzzer beater");
  else if (mod === "futsal") t.push("pivô", "fixo", "guarda-redes avançado", "faltas acumuladas");
  else if (mod === "hoquei") t.push("stick", "rinque", "cartão azul", "livre direto (hóquei)");
  else t.push("golo", "goleada", "ponta de lança", "guarda-redes", "grande penalidade", "descontos");
  return [...new Set(t)];
}

// a ficha de um jogo: { casa, fora, prova, paises, termos }; casa e fora: { nome, clube } ou { nome, selecao }
export function fichaDoJogo({ h, a, comp, mod = "futebol" }, dados) {
  const lado = (nome) => {
    if (!nome) return null;
    // primeiro as seleções («Portugal» não é o Sporting Clube de Portugal)
    const selecao = reconhecerPais(nome, dados);
    if (selecao) return { nome, selecao };
    const clube = reconhecerClube(nome, dados);
    return clube ? { nome, clube } : { nome };
  };
  const casa = lado(h), fora = lado(a);
  const prova = comp ? reconhecerProva(comp, dados) : null;
  const paises = [];
  for (const l of [casa, fora]) {
    const p = l?.selecao || l?.clube?.pais;
    if (p && !paises.includes(p)) paises.push(p);
  }
  return { casa, fora, prova, paises, termos: termosDoJogo({ casa, fora, mod }), mod };
}

// para escolher à mão: os nomes de todos os clubes e países, e de todas as competições
export const nomesParaEscolher = (dados) => {
  const { clubes, provas, paisesGlos } = indice(dados);
  return { equipas: [...clubes.map((c) => c.nome), ...paisesGlos.map((p) => p.n)], provas: provas.map((p) => p.nome) };
};
