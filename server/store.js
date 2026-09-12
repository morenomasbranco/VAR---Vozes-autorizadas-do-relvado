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
export function recent(hours = 3, n = 40) {
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
export function attach(id, source) {
  const it = get(id);
  if (!it || it.postId === source.postId || it.also.some((a) => a.postId === source.postId)) return null;
  it.also.push(source);
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
