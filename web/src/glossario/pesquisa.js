// Glossário › pesquisa de sinónimos e antónimos no próprio glossário: cada termo, clube e competição é um grupo de
// palavras equivalentes; os antónimos vêm dos termos (e ao contrário: se «derrota» é antónimo de «vitória», os
// sinónimos de «vitória» são antónimos de «derrota»).
import { MODS, TERMOS } from "./termos.js";
import { PAISES } from "./clubes.js";
import { GRUPOS_COMP } from "./competicoes.js";

export const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// para comparar: sem as notas entre parênteses («torcedor (BR)» → «torcedor»)
export const nucleo = (t) => norm(String(t).replace(/\s*\([^)]*\)/g, ""));
export const lista = (t) => String(t || "").split(/\s*·\s*/).filter(Boolean);
export const unicos = (arr, tirar = "") => {
  const vistos = new Set([nucleo(tirar)]);
  return arr.filter((p) => { const k = nucleo(p); if (!k || vistos.has(k)) return false; vistos.add(k); return true; });
};

// o índice de pesquisa: cada termo, clube e competição é um grupo de palavras equivalentes, com os antónimos do termo
export function indice() {
  const grupos = [];
  for (const x of TERMOS) grupos.push({ palavras: [x.t, ...(x.s || [])], ant: x.a || [], origem: MODS.find((m) => m.id === x.m)?.nome, def: x.d });
  for (const p of PAISES) for (const [nome, cidade, alc] of p.clubes) grupos.push({ palavras: [nome, ...lista(alc)], ant: [], origem: `Clube · ${cidade}` });
  for (const g of GRUPOS_COMP) for (const [nome, sin] of g.provas) grupos.push({ palavras: [nome, ...lista(sin)], ant: [], origem: `Competição · ${g.nome}` });
  return grupos;
}

export function procurarLocal(grupos, palavra, tipo) {
  const w = nucleo(palavra);
  if (!w) return [];
  const bate = (p) => nucleo(p) === w;
  const out = [];
  for (const g of grupos) {
    if (tipo === "sinonimos" && g.palavras.some(bate)) out.push({ origem: g.origem, def: g.def, palavras: unicos(g.palavras, palavra) });
    if (tipo === "antonimos") {
      if (g.palavras.some(bate) && g.ant.length) out.push({ origem: g.origem, palavras: unicos(g.ant, palavra) });
      // e ao contrário: a palavra é antónimo de um termo, por isso o termo (e os seus sinónimos) são antónimos dela
      if (g.ant.some(bate)) out.push({ origem: g.origem, palavras: unicos(g.palavras, palavra) });
    }
  }
  return out.filter((r) => r.palavras.length);
}
