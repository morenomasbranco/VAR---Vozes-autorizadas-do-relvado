// Comparação de nomes de equipas (sem depender de outros módulos): duas equipas são a mesma se quase todas as
// palavras coincidirem; uma palavra que começa pela outra conta como igual («Desp.» e «Desportivo»).
import { norm } from "../util.js";

const RUIDO = /\b(fc|sc|cf|ac|sl|cd|ad|ca|rc|afc|sad|ud|cs|gd|ss|us|aa|gc|se|ec|clube|club|de|da|do|dos|das|e|the)\b/g;
export const palavras = (n) => norm(n).replace(/[.'’`/-]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(RUIDO, " ").split(/\s+/).filter(Boolean);
export function simil(a, b) {
  const A = palavras(a), B = palavras(b);
  if (!A.length || !B.length) return 0;
  let iguais = 0;
  for (const x of A) if (B.some((y) => x === y || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))))) iguais++;
  return iguais / Math.max(A.length, B.length);
}
// equipa B/C/sub-23 de um lado e principal do outro não são a mesma
const sufixo = (n) => (String(n).trim().match(/\s(B|C|D|sub[- ]?2[23]|u2[23])$/i)?.[1] || "").toUpperCase();
export const mesmaEquipa = (a, b, limiar = 0.67) => sufixo(a) === sufixo(b) && simil(a, b) >= limiar;
