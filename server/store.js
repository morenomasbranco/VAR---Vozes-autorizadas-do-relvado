// Armazenamento simples: as últimas notícias em memória, gravadas em data/items.json.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../data/items.json", import.meta.url));
const MAX = Number(process.env.ARQUIVO_MAX) || 30000; // notícias guardadas em data/items.json
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

// procura uma notícia já publicada que seja a mesma: título igual, ligação igual, ou quase todas
// as palavras em comum. Só compara notícias (não resultados) das últimas horas.
export function findSimilar({ titulo, url, ts, src, excluir, horas = 18 }) {
  const limite = (ts || Date.now()) - horas * 3600e3;
  const chave = chaveTitulo(titulo);
  if (!chave) return null;
  const pals = palavras(titulo);
  for (const it of items) {
    if (it.score || it.ts < limite || it.id === excluir) continue;
    if (url && it.url === url) return it;
    const titulos = [it.text?.split("\n")[0], it.t?.pt, it.t?.en].filter(Boolean);
    if (titulos.some((t) => chaveTitulo(t) === chave)) return it;
    // a mesma notícia contada por duas fontes: quase as mesmas palavras e, se possível, fontes diferentes
    if (titulos.some((t) => semelhanca(pals, palavras(t)) >= 0.82 && palavras(t).size >= 4)) {
      if (it.src !== src || !src) return it;
    }
  }
  return null;
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
  // «at» é o momento em que a confirmação entrou no VAR, que é o que interessa mostrar
  // («acabou de confirmar»); «ts» é a hora a que a outra fonte publicou
  it.also.push({ ...source, at: Date.now() });
  it.upd = Date.now();
  const distinct = new Set([it.src, ...it.also.map((a) => a.src)]).size;
  if (distinct >= 3 && !it.boosted) { it.imp = Math.min(5, it.imp + 1); it.boosted = true; }
  dirty = true;
  return it;
}

setInterval(() => {
  if (!dirty) return;
  fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(items));
  dirty = false;
}, 5000).unref();
