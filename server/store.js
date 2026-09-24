// Armazenamento simples: as últimas notícias em memória, gravadas em data/items.json.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../data/items.json", import.meta.url));
const MAX = Number(process.env.ARQUIVO_MAX) || 4000; // notícias guardadas em data/items.json
const TEXTO_MAX = Number(process.env.TEXTO_MAX) || 1500; // caracteres guardados do texto original de cada post
let items = []; // mais recentes primeiro
let dirty = false;

export function load() {
  try { items = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { items = []; }
}

export const count = () => items.length;
export const all = (limit = 1000) => [...items].sort((a, b) => b.ts - a.ts).slice(0, limit);
export const get = (id) => items.find((i) => i.id === id);

// true se o post já foi tratado (como notícia principal ou como fonte adicional)
export const has = (postId) => items.some((i) => i.postId === postId || i.also?.some((a) => a.postId === postId));

// notícias das últimas horas, para o modelo detetar repetidos
export function recent(hours = 3, n = Number(process.env.REPETIDOS_JANELA) || 80) {
  const cutoff = Date.now() - hours * 3600e3;
  return items.filter((i) => i.ts >= cutoff).slice(0, n);
}

export function remove(id) {
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) { items.splice(i, 1); dirty = true; }
}

export const touch = () => { dirty = true; };

export function add(item) {
  // o texto original só serve para mostrar o post e comparar títulos; guardá-lo inteiro era o que enchia a memória
  if (typeof item.text === "string" && item.text.length > TEXTO_MAX) item = { ...item, text: item.text.slice(0, TEXTO_MAX) };
  items.unshift(item);
  if (items.length > MAX) items.length = MAX;
  dirty = true;
}

// junta mais uma fonte a uma notícia existente; com 3 fontes diferentes a importância sobe um nível
// palavras que não distinguem uma notícia de outra
const VAZIAS = new Set(["a","o","as","os","um","uma","de","do","da","dos","das","em","no","na","nos","nas","e","que","com","para","por","ao","aos","à","às","se","sem","mais","the","of","to","in","on","for","and","a","an","is","at","vs","x"]);
const chaveTitulo = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const palavras = (t) => new Set(chaveTitulo(t).split(" ").filter((w) => w.length > 2 && !VAZIAS.has(w)));
const semelhanca = (a, b) => {
  if (!a.size || !b.size) return 0;
  let comuns = 0;
  for (const w of a) if (b.has(w)) comuns++;
  return comuns / Math.min(a.size, b.size); // proporção de palavras da notícia mais curta
};

// a casa editorial de uma fonte: os vários feeds do mesmo jornal (Transfermarkt de cada país, zerozero e
// zerozero Transferências, o feed próprio e o do Google News) contam como uma só fonte
export function chaveFonte(nome, src) {
  const s = String(src || "");
  if (/^transfermarkt/.test(s)) return "transfermarkt";
  if (/^zerozero/.test(s)) return "zerozero";
  return chaveTitulo(String(nome || s).replace(/\([^)]*\)/g, " ")).replace(/^the /, "") || s;
}
const casaDe = (x) => chaveFonte(x.editor || x.name, x.src);
export const mesmaCasa = (a, b) => casaDe(a) === casaDe(b);
const comuns = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
const nomesDestacados = (t) => new Set([...String(t || "").matchAll(/==(.+?)==/g)].map((m) => chaveTitulo(m[1])).filter(Boolean));

// procura uma notícia já publicada que seja a mesma: título igual, ligação igual, ou quase todas
// as palavras em comum (e vinda de outra casa). Só compara notícias (não resultados) das últimas horas.
export function findSimilar({ titulo, url, ts, src, name, editor, excluir, horas = 18 }) {
  const limite = (ts || Date.now()) - horas * 3600e3;
  const chave = chaveTitulo(titulo);
  if (!chave) return null;
  const pals = palavras(titulo);
  const casa = chaveFonte(editor || name, src);
  for (const it of items) {
    if (it.score || it.ts < limite || it.id === excluir) continue;
    if (url && it.url === url) return it;
    const titulos = [it.text?.split("\n")[0], it.t?.pt, it.t?.en].filter(Boolean);
    if (titulos.some((t) => chaveTitulo(t) === chave)) return it;
    // a mesma notícia contada por duas casas diferentes: as mesmas palavras, nos dois sentidos
    if (casaDe(it) === casa) continue;
    const igual = titulos.some((t) => {
      const p = palavras(t);
      if (pals.size < 4 || p.size < 4) return false;
      const c = comuns(pals, p);
      return c >= 4 && c / Math.min(pals.size, p.size) >= 0.8 && c / Math.max(pals.size, p.size) >= 0.6;
    });
    if (igual) return it;
  }
  return null;
}

// confirma o que o modelo diz ser a mesma notícia: os dois títulos têm de partilhar o nome em destaque
// e mais alguma palavra, ou uma boa parte das palavras
export function mesmoFacto(titulo, alvo) {
  const tAlvo = alvo.t?.pt || alvo.text?.split("\n")[0] || "";
  const a = palavras(String(titulo || "").replace(/==/g, " "));
  const b = palavras(tAlvo.replace(/==/g, " "));
  if (!a.size || !b.size) return false;
  const c = comuns(a, b);
  const nA = nomesDestacados(titulo), nB = nomesDestacados(tAlvo);
  const nomeComum = [...nA].some((n) => nB.has(n));
  return (nomeComum && c >= 2) || (c >= 3 && c / Math.min(a.size, b.size) >= 0.5);
}

// notícias já publicadas que falam das mesmas equipas ou das mesmas pessoas, para dar
// contexto ao desdobramento (o fio da história). Só títulos já tratados, nunca resultados.
export function related({ id, nomes = [], dias = 14, n = 5 }) {
  const chaves = nomes.map((x) => chaveTitulo(x)).filter((x) => x.length > 2);
  if (!chaves.length) return [];
  const limite = Date.now() - dias * 86400e3;
  const out = [];
  for (const it of items) {
    if (it.id === id || it.score || it.pending || it.ts < limite) continue;
    const alvo = chaveTitulo([it.t?.pt, it.t?.en, ...(it.equipas || []).map((e) => e.nome)].filter(Boolean).join(" "));
    if (chaves.some((c) => alvo.includes(c))) out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

export function attach(id, source) {
  const it = get(id);
  if (!it || it.postId === source.postId || it.also.some((a) => a.postId === source.postId)) return null;
  // não é confirmação: a mesma casa que deu a notícia, uma casa que já confirmou, ou um agregador sem jornal conhecido
  if (source.agregador || mesmaCasa(it, source) || it.also.some((a) => mesmaCasa(a, source))) return null;
  const { agregador, ...fonte } = source; // eslint-disable-line no-unused-vars
  // «at» é o momento em que a confirmação entrou no VAR, que é o que interessa mostrar
  // («acabou de confirmar»); «ts» é a hora a que a outra fonte publicou
  it.also.push({ ...fonte, at: Date.now() });
  it.upd = Date.now();
  const distinct = new Set([casaDe(it), ...it.also.map(casaDe)]).size;
  if (distinct >= 3 && !it.boosted) { it.imp = Math.min(5, it.imp + 1); it.boosted = true; }
  dirty = true;
  return it;
}

// confirmações guardadas antes destas regras: saem as da própria casa, as repetidas e as de agregadores
export function limparConfirmacoes(agregadores) {
  let n = 0;
  for (const it of items) {
    if (!it.also?.length) continue;
    const vistas = new Set([casaDe(it)]);
    const antes = it.also.length;
    it.also = it.also.filter((a) => {
      if (agregadores.has(a.src) && !a.editor) return false;
      const k = casaDe(a);
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    if (it.also.length !== antes) { n += antes - it.also.length; dirty = true; }
  }
  return n;
}

// gravar de 30 em 30 s: cada gravação cria uma cópia de tudo em texto, e a cada 5 s isso era o bastante
// para o recolector de lixo não acompanhar e o processo esgotar o heap
setInterval(() => {
  if (!dirty) return;
  try {
    fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(items));
    dirty = false;
  } catch (e) {
    console.log("[Arquivo] não consegui gravar:", e.message);
  }
}, Number(process.env.ARQUIVO_INTERVALO) || 30000).unref();
