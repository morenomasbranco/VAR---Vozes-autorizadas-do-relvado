// Leitor de HTML pequeno e tolerante, sem dependências: chega para as páginas de resultados da FPF e da Liga,
// que são HTML de servidor (ASP.NET) sem nada de especial. Constrói uma árvore de nós com etiqueta, atributos,
// filhos e texto, e tem as procuras de que os leitores precisam (por etiqueta, por classe, por atributo).
import { entidades } from "../util.js";

const VAZIAS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
// etiquetas que fecham sozinhas a anterior do mesmo tipo quando aparecem (HTML mal fechado)
const FECHA_IRMAO = { li: ["li"], option: ["option"], tr: ["tr"], td: ["td", "th"], th: ["td", "th"], p: ["p"], thead: ["thead", "tbody"], tbody: ["thead", "tbody"] };
const LIMITE = new Set(["table", "ul", "ol", "select", "body", "html", "div"]);

function lerAtributos(s) {
  const out = {};
  const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = entidades(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

export function parse(html) {
  const raiz = { tag: "#root", attrs: {}, children: [], parent: null };
  let atual = raiz;
  const s = String(html || "");
  const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(s))) {
    if (m[0].startsWith("<!--") || m[1]) continue; // comentários, scripts e estilos não contam
    if (m[4] != null || m[0] === "<") {
      const t = m[4] ?? "<";
      if (t.trim()) atual.children.push({ tag: "#text", text: entidades(t), parent: atual });
      continue;
    }
    const tag = m[2].toLowerCase();
    if (m[0][1] === "/") {
      // fecha até à etiqueta correspondente, se estiver aberta
      let n = atual;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) atual = n.parent;
      continue;
    }
    if (FECHA_IRMAO[tag]) {
      // <tr> sem </tr> anterior, <li> sem </li>…: fecha o irmão que ficou aberto (sem passar a fronteira da lista ou tabela)
      for (let n = atual; n && n !== raiz && !LIMITE.has(n.tag); n = n.parent) {
        if (FECHA_IRMAO[tag].includes(n.tag)) { atual = n.parent || raiz; break; }
      }
    }
    const no = { tag, attrs: lerAtributos(m[3] || ""), children: [], parent: atual };
    atual.children.push(no);
    if (!VAZIAS.has(tag) && !/\/\s*$/.test(m[3] || "")) atual = no;
  }
  return raiz;
}

export function* nos(n) {
  for (const c of n.children || []) {
    if (c.tag === "#text") continue;
    yield c;
    yield* nos(c);
  }
}
export const todos = (n, pred) => [...nos(n)].filter(pred);
export const primeiro = (n, pred) => { for (const x of nos(n)) if (pred(x)) return x; return null; };
export const porTag = (n, tag) => todos(n, (x) => x.tag === tag);
export const temClasse = (n, re) => re.test(n.attrs?.class || "");

// texto de um nó, com espaços entre blocos
export function texto(n) {
  if (!n) return "";
  if (n.tag === "#text") return n.text;
  const partes = [];
  for (const c of n.children || []) {
    const t = texto(c);
    if (t) partes.push(t);
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}
// pedaços de texto soltos de um nó, por ordem (serve para ler blocos de jogo sem saber as classes)
export function pedacos(n, out = []) {
  if (!n) return out;
  if (n.tag === "#text") { const t = n.text.replace(/\s+/g, " ").trim(); if (t) out.push(t); return out; }
  if (n.tag === "img" && n.attrs.alt) out.push(`[img:${n.attrs.alt}]`);
  for (const c of n.children || []) pedacos(c, out);
  return out;
}
// todos os valores de atributos de um nó e dos descendentes (href, value, data-*, onclick…)
export function atributos(n) {
  const out = [];
  for (const x of [n, ...nos(n)]) for (const [k, v] of Object.entries(x.attrs || {})) out.push([k, v, x]);
  return out;
}
// sobe na árvore até encontrar um antepassado que cumpra a condição
export function acima(n, pred, max = 8) {
  let p = n?.parent;
  for (let i = 0; p && i < max; i++, p = p.parent) if (pred(p)) return p;
  return null;
}
