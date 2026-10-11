// Glossário › as palavras de cada um: o que se acrescenta no site (expressões, sinónimos e antónimos, alcunhas de clubes,
// sinónimos de competições e de países, citações e ideias) fica guardado no browser e junta-se ao glossário.
// Exporta-se e importa-se num ficheiro, para levar para outro aparelho.
import { TERMOS } from "./termos.js";
import { PAISES } from "./clubes.js";
import { GRUPOS_COMP } from "./competicoes.js";
import { PAISES_GLOS } from "./paises.js";
import { CITACOES, IDEIAS } from "./notas.js";
import { lista, nucleo } from "./pesquisa.js";

const CHAVE = "glos-meus";
export const VAZIO = () => ({ v: 1, termos: {}, clubes: {}, provas: {}, paises: {}, citacoes: [], ideias: [] });

// «a, b · c» → ["a", "b", "c"], sem repetidos nem vazios
export const partir = (t) => [...new Set(String(t || "").split(/\s*[,;·\n]\s*/).map((x) => x.trim().slice(0, 80)).filter(Boolean))];
const juntarSem = (base, extra) => {
  const vistos = new Set(base.map(nucleo));
  return [...base, ...extra.filter((x) => { const k = nucleo(x); if (!k || vistos.has(k)) return false; vistos.add(k); return true; })];
};
const texto = (t, n = 400) => String(t || "").trim().slice(0, n);
// uma lista guardada (ou um texto, em ficheiros antigos ou mexidos à mão) → texto para partir
const emTexto = (v) => (Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : "");

// lê o que está guardado (e aceita só o formato certo, também ao importar)
export function limpar(m) {
  const out = VAZIO();
  if (!m || typeof m !== "object") return out;
  const obj = (o) => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
  for (const [t, x] of Object.entries(obj(m.termos))) {
    const k = texto(t, 80);
    if (!k) continue;
    out.termos[k] = { s: partir(emTexto(x?.s)), a: partir(emTexto(x?.a)) };
    if (x?.novo) out.termos[k].novo = { m: texto(x.novo.m, 20) || "geral", d: texto(x.novo.d), e: texto(x.novo.e) };
  }
  for (const [n, x] of Object.entries(obj(m.clubes))) {
    const k = texto(n, 80);
    if (!k) continue;
    out.clubes[k] = { alc: partir(emTexto(x?.alc)) };
    if (x?.novo) out.clubes[k].novo = { pais: texto(x.novo.pais, 10) || "mundo", cidade: texto(x.novo.cidade, 80), estadio: texto(x.novo.estadio, 80) };
  }
  for (const [n, x] of Object.entries(obj(m.provas))) {
    const k = texto(n, 80);
    if (!k) continue;
    out.provas[k] = { sin: partir(emTexto(x?.sin)) };
    if (x?.novo) out.provas[k].novo = { grupo: texto(x.novo.grupo, 20) || "mundo" };
  }
  for (const [n, x] of Object.entries(obj(m.paises))) {
    const k = texto(n, 60);
    if (!k) continue;
    out.paises[k] = { p: partir(emTexto(x?.p)), s: partir(emTexto(x?.s)) };
    if (x?.novo) out.paises[k].novo = { g: texto(x.novo.g, 80), c: texto(x.novo.c, 60) };
  }
  out.citacoes = (Array.isArray(m.citacoes) ? m.citacoes : []).map((c) => ({ t: texto(c?.t, 600), a: texto(c?.a, 80), o: texto(c?.o, 120) })).filter((c) => c.t);
  out.ideias = (Array.isArray(m.ideias) ? m.ideias : []).map((c) => ({ tema: texto(c?.tema, 40) || "Ideia", t: texto(c?.t, 600) })).filter((c) => c.t);
  return out;
}
export function lerMeus() { try { return limpar(JSON.parse(localStorage.getItem(CHAVE))); } catch { return VAZIO(); } }
export function gravarMeus(m) { try { localStorage.setItem(CHAVE, JSON.stringify(m)); } catch { /* sem espaço ou sem acesso */ } }

// acrescentar: cat é «termo», «clube», «prova», «pais», «citacao» ou «ideia»; f são os campos do formulário
export function acrescentar(meus, cat, f) {
  const m = limpar(meus);
  const nome = texto(f.nome, 80);
  if (cat === "termo") {
    if (!nome) return m;
    const existe = TERMOS.some((x) => nucleo(x.t) === nucleo(nome));
    const e = (m.termos[nome] ||= { s: [], a: [] });
    e.s = juntarSem(e.s, partir(f.s));
    e.a = juntarSem(e.a, partir(f.a));
    if (!existe && (f.d || !e.novo)) e.novo = { m: f.m || e.novo?.m || "geral", d: texto(f.d) || e.novo?.d || "", e: texto(f.e) || e.novo?.e || "" };
  } else if (cat === "clube") {
    if (!nome) return m;
    const existe = PAISES.some((p) => p.clubes.some((c) => c[0] === nome));
    const e = (m.clubes[nome] ||= { alc: [] });
    e.alc = juntarSem(e.alc, partir(f.alc));
    if (!existe) e.novo = { pais: f.pais || e.novo?.pais || "mundo", cidade: texto(f.cidade, 80) || e.novo?.cidade || "", estadio: texto(f.estadio, 80) || e.novo?.estadio || "" };
  } else if (cat === "prova") {
    if (!nome) return m;
    const existe = GRUPOS_COMP.some((g) => g.provas.some((c) => c[0] === nome));
    const e = (m.provas[nome] ||= { sin: [] });
    e.sin = juntarSem(e.sin, partir(f.sin));
    if (!existe) e.novo = { grupo: f.grupo || e.novo?.grupo || "mundo" };
  } else if (cat === "pais") {
    if (!nome) return m;
    const existe = PAISES_GLOS.some((p) => p.n === nome);
    const e = (m.paises[nome] ||= { p: [], s: [] });
    e.p = juntarSem(e.p, partir(f.p));
    e.s = juntarSem(e.s, partir(f.s));
    if (!existe) e.novo = { g: texto(f.g, 80) || e.novo?.g || "", c: texto(f.c, 60) || e.novo?.c || "" };
  } else if (cat === "citacao") {
    if (texto(f.t)) m.citacoes.push({ t: texto(f.t, 600), a: texto(f.a, 80), o: texto(f.o, 120) });
  } else if (cat === "ideia") {
    if (texto(f.t)) m.ideias.push({ tema: texto(f.tema, 40) || "Ideia", t: texto(f.t, 600) });
  }
  return m;
}

// apagar uma palavra (ou a entrada toda, sem palavra) de uma categoria
export function apagar(meus, cat, nome, campo = null, palavra = null) {
  const m = limpar(meus);
  const grupo = { termo: m.termos, clube: m.clubes, prova: m.provas, pais: m.paises }[cat];
  if (grupo && grupo[nome]) {
    if (campo && palavra != null) {
      grupo[nome][campo] = (grupo[nome][campo] || []).filter((x) => x !== palavra);
      const vazio = Object.entries(grupo[nome]).every(([k, v]) => k === "novo" || !v.length);
      if (vazio && !grupo[nome].novo) delete grupo[nome];
    } else delete grupo[nome];
  }
  if (cat === "citacao") m.citacoes.splice(Number(nome), 1);
  if (cat === "ideia") m.ideias.splice(Number(nome), 1);
  return m;
}

// o glossário com as palavras de cada um; «minhas» são as palavras acrescentadas (para as mostrar de outra maneira)
export function juntar(meus) {
  const m = limpar(meus);
  const minhas = new Set();
  const marca = (arr) => { for (const x of arr) minhas.add(x); return arr; };
  // junta à lista do glossário e marca só as palavras que lá não estavam
  const somar = (base, extra) => { const r = juntarSem(base, extra); marca(r.slice(base.length)); return r; };

  const termos = TERMOS.map((x) => {
    const e = Object.entries(m.termos).find(([k]) => nucleo(k) === nucleo(x.t))?.[1];
    return e ? { ...x, s: somar(x.s || [], e.s), a: somar(x.a || [], e.a) } : x;
  });
  for (const [t, e] of Object.entries(m.termos)) {
    if (!e.novo) continue;
    minhas.add(t);
    termos.push({ t, m: e.novo.m, d: e.novo.d || "(acrescentado por ti)", e: e.novo.e || undefined, s: marca(e.s), a: marca(e.a), meu: true });
  }

  const paises = PAISES.map((p) => ({
    ...p,
    clubes: [
      ...p.clubes.map((c) => (m.clubes[c[0]] ? [c[0], c[1], somar(lista(c[2]), m.clubes[c[0]].alc).join(" · "), c[3], c[4]] : c)),
      ...Object.entries(m.clubes).filter(([, e]) => e.novo?.pais === p.id).map(([nome, e]) => { minhas.add(nome); return [nome, e.novo.cidade || "—", marca(e.alc).join(" · "), e.novo.estadio || null, null]; }),
    ],
  }));

  const grupos = GRUPOS_COMP.map((g) => ({
    ...g,
    provas: [
      ...g.provas.map((c) => (m.provas[c[0]] ? [c[0], somar(lista(c[1]), m.provas[c[0]].sin).join(" · "), c[2]] : c)),
      ...Object.entries(m.provas).filter(([, e]) => e.novo?.grupo === g.id).map(([nome, e]) => { minhas.add(nome); return [nome, marca(e.sin).join(" · "), null]; }),
    ],
  }));

  const paisesGlos = [
    ...PAISES_GLOS.map((p) => (m.paises[p.n] ? { ...p, p: somar(lista(p.p), m.paises[p.n].p).join(" · "), s: somar(lista(p.s).filter((x) => x !== "—"), m.paises[p.n].s).join(" · ") || "—" } : p)),
    ...Object.entries(m.paises).filter(([, e]) => e.novo).map(([n, e]) => { minhas.add(n); return { n, b: "un", en: [], g: e.novo.g || "—", p: marca(e.p).join(" · "), s: marca(e.s).join(" · ") || "—", c: e.novo.c || "—", meu: true }; }),
  ];

  return {
    TERMOS: termos, PAISES: paises, GRUPOS_COMP: grupos, PAISES_GLOS: paisesGlos,
    CITACOES: [...CITACOES, ...m.citacoes.map((c, i) => ({ ...c, meu: true, i }))],
    IDEIAS: [...IDEIAS, ...m.ideias.map((c, i) => ({ ...c, meu: true, i }))],
    minhas,
  };
}

// quantas coisas a pessoa acrescentou
export const contar = (meus) => {
  const m = limpar(meus);
  const n = (o, campos) => Object.values(o).reduce((s, e) => s + (e.novo ? 1 : 0) + campos.reduce((a, c) => a + (e[c]?.length || 0), 0), 0);
  return n(m.termos, ["s", "a"]) + n(m.clubes, ["alc"]) + n(m.provas, ["sin"]) + n(m.paises, ["p", "s"]) + m.citacoes.length + m.ideias.length;
};

// juntar o que vem de um ficheiro importado ao que já está guardado (sem repetir)
export function fundir(meus, importado) {
  const a = limpar(meus), b = limpar(importado);
  for (const [cat, campos] of [["termos", ["s", "a"]], ["clubes", ["alc"]], ["provas", ["sin"]], ["paises", ["p", "s"]]]) {
    for (const [k, e] of Object.entries(b[cat])) {
      const d = (a[cat][k] ||= Object.fromEntries(campos.map((c) => [c, []])));
      for (const c of campos) d[c] = juntarSem(d[c] || [], e[c] || []);
      if (e.novo && !d.novo) d.novo = e.novo;
    }
  }
  const tem = (arr, x) => arr.some((y) => y.t === x.t);
  for (const c of b.citacoes) if (!tem(a.citacoes, c)) a.citacoes.push(c);
  for (const c of b.ideias) if (!tem(a.ideias, c)) a.ideias.push(c);
  return a;
}
