// Classificações calculadas a partir dos resultados, com os jogos a decorrer incluídos («tabela ao vivo»).
//
// Critérios de desempate dos regulamentos da FPF e das associações: pontos; entre as equipas empatadas, pontos
// nos jogos entre elas, diferença de golos nesses jogos e golos marcados nesses jogos; depois diferença de golos
// geral, golos marcados e, por fim, o nome (só para a ordem ficar estável).
//
// Os pontos retirados por castigo e os jogos que a nossa base não tem (o leitor da FPF falhou uma jornada, por
// exemplo) são acertados com a tabela oficial: para cada equipa guarda-se a diferença entre a tabela oficial e a
// calculada só com os jogos terminados, e essa diferença soma-se sempre à tabela ao vivo.
import { norm } from "../util.js";

const PONTOS = { v: 3, e: 1, d: 0 };
export const contaParaTabela = (j) => j.hs != null && j.as != null && ["final", "direto", "intervalo"].includes(j.estado) && !j.semTabela;

function linhaVazia(nome) {
  return { equipa: nome, j: 0, v: 0, e: 0, d: 0, gm: 0, gs: 0, dg: 0, pts: 0, forma: [], aoVivo: null };
}
function soma(l, gm, gs, aoVivo, jogo) {
  l.j++; l.gm += gm; l.gs += gs; l.dg = l.gm - l.gs;
  const r = gm > gs ? "v" : gm === gs ? "e" : "d";
  l[r]++; l.pts += PONTOS[r];
  if (aoVivo) l.aoVivo = { jogo: jogo.id, r, gm, gs };
  else l.forma.push({ r, ts: jogo.inicio || 0 });
}

// jogos → linhas por equipa (sem ordenar)
export function acumular(equipas, jogos, { soTerminados = false } = {}) {
  const t = new Map(equipas.map((e) => [e, linhaVazia(e)]));
  for (const j of jogos) {
    if (!contaParaTabela(j)) continue;
    const vivo = j.estado !== "final";
    if (soTerminados && vivo) continue;
    if (!t.has(j.casa)) t.set(j.casa, linhaVazia(j.casa));
    if (!t.has(j.fora)) t.set(j.fora, linhaVazia(j.fora));
    soma(t.get(j.casa), j.hs, j.as, vivo, j);
    soma(t.get(j.fora), j.as, j.hs, vivo, j);
  }
  return t;
}

// ordena com os critérios de desempate (confronto direto entre as equipas empatadas em pontos)
export function ordenar(linhas, jogos) {
  const porPontos = new Map();
  for (const l of linhas) {
    if (!porPontos.has(l.pts)) porPontos.set(l.pts, []);
    porPontos.get(l.pts).push(l);
  }
  const h2h = (grupo) => {
    if (grupo.length < 2) return new Map();
    const nomes = new Set(grupo.map((l) => l.equipa));
    const entre = jogos.filter((j) => nomes.has(j.casa) && nomes.has(j.fora) && contaParaTabela(j));
    const t = acumular([...nomes], entre);
    return t;
  };
  const resultado = [];
  for (const pts of [...porPontos.keys()].sort((a, b) => b - a)) {
    const grupo = porPontos.get(pts);
    const d = h2h(grupo);
    grupo.sort((a, b) => {
      const ha = d.get(a.equipa), hb = d.get(b.equipa);
      if (ha && hb) {
        if (hb.pts !== ha.pts) return hb.pts - ha.pts;
        if (hb.dg !== ha.dg) return hb.dg - ha.dg;
        if (hb.gm !== ha.gm) return hb.gm - ha.gm;
      }
      return (b.dg - a.dg) || (b.gm - a.gm) || a.equipa.localeCompare(b.equipa, "pt");
    });
    resultado.push(...grupo);
  }
  return resultado.map((l, i) => ({ ...l, pos: i + 1 }));
}

const chave = (n) => norm(n).replace(/[^a-z0-9]+/g, " ").trim();

// diferença entre a tabela oficial e a calculada com os jogos terminados (castigos, jogos em falta)
export function acertos(oficial, jogos, equipas) {
  if (!oficial?.length) return {};
  const calc = acumular(equipas, jogos, { soTerminados: true });
  const porChave = new Map([...calc.values()].map((l) => [chave(l.equipa), l]));
  const out = {};
  for (const o of oficial) {
    const c = porChave.get(chave(o.equipa)) || [...calc.values()].find((l) => semelhante(l.equipa, o.equipa));
    if (!c) continue;
    const dif = {};
    for (const k of ["j", "v", "e", "d", "gm", "gs", "pts"]) {
      if (o[k] != null && o[k] !== c[k]) dif[k] = o[k] - c[k];
    }
    // a oficial conta menos jogos do que os nossos: está atrasada (ou houve um jogo anulado); não se acerta
    if ((dif.j ?? 0) < 0) continue;
    if (Object.keys(dif).length) out[c.equipa] = dif;
  }
  return out;
}
function semelhante(a, b) {
  const A = chave(a).split(" ").filter((w) => w.length > 2), B = new Set(chave(b).split(" ").filter((w) => w.length > 2));
  if (!A.length || !B.size) return false;
  return A.filter((w) => B.has(w)).length / Math.max(A.length, B.size) >= 0.6;
}

// tabela ao vivo: jogos (terminados e a decorrer) + acertos da oficial; diz também quem subiu e desceu
// «antesDe»: instante em que a tabela oficial foi lida; o acerto só compara com os jogos terminados até aí,
// para os resultados que entraram depois não serem anulados por uma tabela oficial ainda por atualizar
export function tabelaAoVivo({ equipas, jogos, oficial = null, acerto = null, antesDe = null }) {
  const ac = acerto || acertos(oficial, antesDe ? jogos.filter((j) => j.estado === "final" && j.inicio && j.inicio < antesDe) : jogos, equipas);
  const linhas = [...acumular(equipas, jogos).values()].map((l) => {
    const d = ac[l.equipa];
    if (d) {
      for (const [k, v] of Object.entries(d)) l[k] += v;
      l.dg = l.gm - l.gs;
      l.acerto = d;
    }
    l.forma = l.forma.sort((a, b) => b.ts - a.ts).slice(0, 5).map((f) => f.r);
    return l;
  });
  const vivo = ordenar(linhas, jogos);
  // posição sem os jogos a decorrer, para as setas de subida e descida
  const temVivo = vivo.some((l) => l.aoVivo);
  if (temVivo) {
    const antes = ordenar([...acumular(equipas, jogos, { soTerminados: true }).values()].map((l) => {
      const d = ac[l.equipa];
      if (d) { for (const [k, v] of Object.entries(d)) l[k] += v; l.dg = l.gm - l.gs; }
      return l;
    }), jogos.filter((j) => j.estado === "final"));
    const posAntes = new Map(antes.map((l) => [l.equipa, l.pos]));
    for (const l of vivo) l.mov = (posAntes.get(l.equipa) || l.pos) - l.pos;
  }
  return vivo;
}
