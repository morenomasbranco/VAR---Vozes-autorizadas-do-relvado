// Diretório dos clubes (pt/clubes.json, feito a partir do Excel): Instagram e Facebook de cada clube, para saber
// de quem são os stories, e o que se vai aprendendo com eles (id do Instagram, convenção do resultado, se publica).
// O nome que a FPF dá a uma equipa («Sc Maria Fonte», «A.D. Lousada B») raramente é igual ao do Excel;
// a correspondência é feita sem siglas, sem acentos e sem o sufixo da equipa B/C, e sempre dentro da associação.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { norm } from "../util.js";
import { simil } from "./nomes.js";
import { orgPorNome } from "./catalogo.js";

const FICHEIRO = fileURLToPath(new URL("../../pt/clubes.json", import.meta.url));
const APRENDIDO = fileURLToPath(new URL("../../data/pt-clubes.json", import.meta.url));
const ler = (f, alt) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return alt; } };

// «Sp. Braga B», «1º Dezembro C», «Leixões SC Sub-23» → nome do clube e a equipa
export function semEquipa(nome) {
  const s = String(nome || "").trim();
  const m = s.match(/^(.*?)(?:\s+(?:equipa\s+)?([BCD])|\s+(sub[- ]?2[23]|u2[23]))$/i);
  return m && m[1].length > 2 ? { clube: m[1].trim(), equipa: (m[2] || m[3]).toUpperCase() } : { clube: s, equipa: null };
}
// variações de escrita frequentes nas listas da FPF
const ABREV = [[/\bsp\.?\s/g, "sporting "], [/\bdesp\.?\s/g, "desportivo "], [/\bat\.?\s/g, "atletico "], [/\bac\.?\s/g, "academico "], [/\bassoc\.?\s/g, "associacao "], [/\buniao\b/g, "uniao"], [/\bs\.\s/g, "sao "], [/\bsta\.?\s/g, "santa "], [/\bsto\.?\s/g, "santo "], [/\bn\.?\s?s\.?\s/g, "nossa senhora "]];
export function chaveClube(nome) {
  let s = ` ${norm(semEquipa(nome).clube)} `.replace(/[.'’`]/g, ". ").replace(/\s+/g, " ");
  for (const [re, r] of ABREV) s = s.replace(re, r);
  return s.replace(/[^a-z0-9 ]/g, " ").replace(/\b(fc|sc|cf|ac|cd|ad|gd|ud|cs|sad|clube|club|futebol|desportivo|desportiva|associacao|grupo|recreativo|recreativa|cultural|sport|sporting|uniao|de|da|do|dos|das|e)\b/g, " ").replace(/\s+/g, " ").trim();
}

export function createClubes({ log = () => {} } = {}) {
  const base = ler(FICHEIRO, { clubes: [], associacoes: [] });
  const aprendido = ler(APRENDIDO, {}); // handle → { igId, conv: { casa_fora, propria_primeiro }, stories, ultimo }
  let sujo = false;
  const clubes = base.clubes.map((c, i) => ({
    ...c,
    i,
    org: orgPorNome(String(c.assoc || "").split(",")[0])?.key || null,
    chaves: [...new Set([c.nome, ...(c.variantes || [])].map(chaveClube).filter(Boolean))],
  }));
  const porHandle = new Map(clubes.filter((c) => c.instagram).map((c) => [c.instagram, c]));
  const cache = new Map();

  function encontrar(nomeEquipa, org) {
    const k = `${org}|${nomeEquipa}`;
    if (cache.has(k)) return cache.get(k);
    const ch = chaveClube(nomeEquipa);
    let melhor = null, nota = 0;
    for (const c of clubes) {
      const mesmaOrg = !org || c.org === org || (org === "fpf" || org === "liga");
      if (!mesmaOrg) continue;
      for (const kc of c.chaves) {
        let s = kc === ch ? 1 : simil(kc, ch);
        if (c.org === org) s += 0.05; // na mesma associação ganha nos empates
        if (s > nota) { nota = s; melhor = c; }
      }
    }
    const r = nota >= 0.75 ? melhor : null;
    cache.set(k, r);
    return r;
  }

  // convenção do resultado aprendida para uma conta: só vale com pelo menos 2 provas e 75% de acordo
  function convencao(handle) {
    const c = aprendido[handle]?.conv;
    if (!c) return null;
    const a = c.casa_fora || 0, b = c.propria_primeiro || 0;
    if (a + b < 2) return null;
    if (a / (a + b) >= 0.75) return "casa_fora";
    if (b / (a + b) >= 0.75) return "propria_primeiro";
    return null;
  }
  function aprender(handle, conv) {
    if (!handle || !conv) return;
    const a = (aprendido[handle] ||= {});
    a.conv ||= {};
    a.conv[conv] = (a.conv[conv] || 0) + 1;
    sujo = true;
  }
  function nota(handle, campos) {
    Object.assign((aprendido[handle] ||= {}), campos);
    sujo = true;
  }
  const info = (handle) => aprendido[handle] || {};

  setInterval(() => {
    if (!sujo) return;
    sujo = false;
    fs.mkdirSync(fileURLToPath(new URL("../../data", import.meta.url)), { recursive: true });
    fs.writeFile(APRENDIDO, JSON.stringify(aprendido), () => {});
  }, 30e3).unref();

  log(`[PT] ${clubes.length} clubes no diretório, ${porHandle.size} com Instagram`);
  return { clubes, porHandle, encontrar, convencao, aprender, nota, info, associacoes: base.associacoes || [] };
}
