// Resultados de Portugal: todos os campeonatos seniores de futebol e futsal (nacionais e distritais) e o nacional
// de sub-23, com a jornada da semana, as classificações ao vivo e os resultados em tempo real.
//
// De onde vem cada coisa:
//   - calendário, jornadas, resultados finais e classificações oficiais: resultados.fpf.pt (todas as associações
//     e a FPF) e Sofascore (competições da Liga Portugal e minuto ao segundo dos nacionais que acompanha);
//   - tempo real dos jogos sem transmissão (distritais e não só): stories e posts dos clubes no Instagram,
//     lidos sem conta (visualizadores anónimos) ou com a sessão de uma conta qualquer, e enviados por quem está
//     no campo, tudo passado pelo motor de evidência; os jogos de clubes que não publicam ficam
//     com o resultado final quando a FPF o publica (ou quando um dos clubes o põe num post);
//   - Liga Portugal Betclic, Liga 2, Liga 3, Next Gen, Liga BPI e Taça de Portugal continuam também a chegar pela
//     ESPN/Sofascore do ligas.json (cartões e notícias de golo já existentes); aqui servem para as tabelas.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { norm, slug, sleep } from "../util.js";
import * as fpf from "./fpf.js";
import * as sofa from "./sofa.js";
import { ASSOCIACOES, FPF, ORG, ORGS, EPOCA_FPF, classificar, bonito, ordem as ordemComp } from "./catalogo.js";
import { tabelaAoVivo } from "./tabela.js";
import { createClubes, semEquipa } from "./clubes.js";
import { simil, mesmaEquipa } from "./nomes.js";
import { aplicar, aplicarOficial, novoJogoEstado } from "./stories/evidencia.js";
import { minutoEm, textoMinuto } from "./stories/relogio.js";
import { lerTexto } from "./stories/parser.js";
import { createInstagram, cookieDoEnv } from "./stories/instagram.js";
import { createAnonimo } from "./stories/anonimo.js";
import crypto from "node:crypto";
import * as ocr from "./stories/ocr.js";

const DADOS = fileURLToPath(new URL("../../data/pt.json", import.meta.url));
const EVENTOS = fileURLToPath(new URL("../../data/pt-eventos.json", import.meta.url));
const ler = (f, alt) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return alt; } };
const DIRETO_MS = Math.max(60, Number(process.env.FPF_DIRETO_SEGUNDOS) || 240) * 1000; // releitura da jornada durante os jogos
const ESTRUTURA_MS = (Number(process.env.FPF_ESTRUTURA_HORAS) || 20) * 3600e3; // releitura de cada competição
const SOFA_VIVO_MS = Math.max(10, Number(process.env.PT_SOFA_SEGUNDOS) || 20) * 1000;
const MAX_EVENTOS = Number(process.env.PT_EVENTOS_MAX) || 2500;
const DURACAO = { futebol: 115 * 60000, futsal: 95 * 60000 }; // do apito inicial ao fim provável, com intervalo
const POSTS_MS = Math.max(120, Number(process.env.IG_POSTS_SEGUNDOS) || 300) * 1000; // posts de cada clube durante o jogo
const POSTS_VIVO_MS = Math.max(60, Number(process.env.IG_POSTS_VIVO_SEGUNDOS) || 120) * 1000; // clubes que atualizam por post
const ATIVO = process.env.PT_RESULTADOS !== "0";

// semana de Lisboa (segunda 00:00 → segunda seguinte), para a «jornada da semana»
function semanaDe(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dia = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday] ?? 0;
  const ini = fpf.deLisboa(+p.year, +p.month, +p.day - dia, 0, 0);
  return [ini, ini + 7 * 86400e3];
}
const diaLisboa = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ts));

export function createPortugal({ log = console.log, broadcast = () => {}, ligas = [] } = {}) {
  const st = ler(DADOS, null) || { comps: {}, jogos: {} };
  st.comps ||= {}; st.jogos ||= {};
  let eventos = ler(EVENTOS, []);
  const clubes = createClubes({ log });
  const estado = { arranque: Date.now(), descoberta: null, filas: { alta: 0, normal: 0, baixa: 0 }, ultimoCiclo: null, evidencias: { recebidas: 0, novo: 0, confirmacao: 0, historico: 0, conflito: 0, ignorado: 0, relogio: 0, semJogo: 0, repetido: 0 } };
  let sujo = false, sujoEv = false;
  const marca = () => { sujo = true; };
  const tabelasCache = new Map();
  const invalida = (j) => tabelasCache.delete(`${j.comp}|${j.serie}`);

  // ───────── gravação ─────────
  setInterval(() => {
    if (sujo) {
      sujo = false;
      fs.mkdirSync(fileURLToPath(new URL("../../data", import.meta.url)), { recursive: true });
      fs.writeFile(`${DADOS}.tmp`, JSON.stringify(st), (e) => { if (!e) fs.rename(`${DADOS}.tmp`, DADOS, () => {}); });
    }
    if (sujoEv) { sujoEv = false; fs.writeFile(EVENTOS, JSON.stringify(eventos), () => {}); }
  }, 30e3).unref();

  // competições já seguidas pelo ligas.json (ESPN/Sofascore): não geram notícias repetidas
  const externas = ligas.filter((l) => l.pais === "portugal" || l.bandeira === "pt").map((l) => [...(l.procurar || []), l.nome].map(norm));
  const eExterna = (nome) => {
    const n = norm(nome);
    return externas.some((ps) => ps.some((p) => p.length > 3 && (n.includes(p) || p.includes(n)))) || /liga portugal( betclic)?$|liga portugal 2|^liga 3$|liga bpi|ta[cç]a de portugal|next gen|revela/.test(n);
  };

  // ───────── jogos ─────────
  // índices: jogos de cada série e jogo de cada id do Sofascore (procurar em 30 mil jogos a cada leitura era lento)
  const idxSerie = new Map();
  const idxSofa = new Map();
  const indexar = (j) => {
    const k = `${j.comp}|${j.serie}`;
    if (!idxSerie.has(k)) idxSerie.set(k, new Set());
    idxSerie.get(k).add(j.id);
    if (j.sofaId) idxSofa.set(j.sofaId, j.id);
  };
  for (const j of Object.values(st.jogos)) indexar(j);
  const jogosDaSerie = (comp, serie) => [...(idxSerie.get(`${comp}|${serie}`) || [])].map((id) => st.jogos[id]).filter(Boolean);
  const porDia = () => {
    const m = new Map();
    for (const j of Object.values(st.jogos)) {
      if (!j.inicio) continue;
      const d = diaLisboa(j.inicio);
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(j);
    }
    return m;
  };
  let indiceDia = null, indiceDiaEm = 0;
  const jogosPerto = (ts, horas = 6) => {
    if (!indiceDia || Date.now() - indiceDiaEm > 60e3) { indiceDia = porDia(); indiceDiaEm = Date.now(); }
    const out = [];
    const dias = new Set();
    for (let t = ts - horas * 3600e3; t < ts + horas * 3600e3; t += 12 * 3600e3) dias.add(diaLisboa(t));
    dias.add(diaLisboa(ts + horas * 3600e3));
    for (const d of dias) {
      for (const j of indiceDia.get(d) || []) if (Math.abs(j.inicio - ts) <= horas * 3600e3) out.push(j);
    }
    return out;
  };
  const acharJogo = (casa, fora, ts, mod) => {
    let melhor = null, nota = 0;
    for (const j of jogosPerto(ts || Date.now())) {
      if (mod && st.comps[j.comp]?.mod !== mod) continue;
      const s = Math.min(simil(j.casa, casa), simil(j.fora, fora));
      if (s > nota && mesmaEquipa(j.casa, casa, 0.6) && mesmaEquipa(j.fora, fora, 0.6)) { nota = s; melhor = j; }
    }
    return melhor;
  };

  // nomes por que cada equipa pode aparecer escrita num story (FPF, Excel, sem siglas)
  function nomesDe(nome, org) {
    const c = clubes.encontrar(nome, org);
    const base = semEquipa(nome).clube;
    const out = new Set([nome, base]);
    if (c) for (const v of [c.nome, ...(c.variantes || [])]) out.add(semEquipa(v).clube);
    return [...out].filter((x) => x && x.length > 2);
  }
  function ligarClubes(j) {
    const comp = st.comps[j.comp];
    const org = comp?.org;
    const ch = clubes.encontrar(j.casa, org), cf = clubes.encontrar(j.fora, org);
    j.igCasa = ch?.instagram || null; j.igFora = cf?.instagram || null;
    j.fbCasa = ch?.facebook || null; j.fbFora = cf?.facebook || null;
    j.nomes = { h: nomesDe(j.casa, org), a: nomesDe(j.fora, org) };
  }

  function compacto(j, agora = Date.now()) {
    const comp = st.comps[j.comp];
    const serie = comp?.series?.[j.serie];
    const vivo = j.estado === "direto" || (j.estado === "agendado" && j.inicio && agora > j.inicio && agora < j.inicio + DURACAO[comp?.mod || "futebol"] && !j.oficial);
    const m = j.estado === "direto" ? (j.relogioExterno && agora - j.relogioExterno.ts < 5 * 60e3 ? { ...j.relogioExterno.m, fonte: "explicito" } : minutoEm(j, agora, comp?.mod)) : null;
    return {
      id: j.id, comp: j.comp, compNome: comp?.nome, org: comp?.org, mod: comp?.mod, nivel: comp?.nivel, serie: j.serie, serieNome: serie?.nome || null, jornada: j.jornada,
      casa: j.casa, fora: j.fora, logoCasa: j.logoCasa || null, logoFora: j.logoFora || null, inicio: j.inicio, semHora: !!j.semHora, local: j.local || null,
      estado: j.estado, hs: j.hs, as: j.as, oficial: !!j.oficial, origem: j.origem,
      min: m ? { texto: textoMinuto(m), fonte: m.fonte, confianca: m.confianca } : null,
      semInfo: !!(vivo && j.estado === "agendado"), // devia estar a decorrer e ninguém disse nada
      porConfirmar: !!(j.estado === "agendado" && j.inicio && agora >= j.inicio + DURACAO[comp?.mod || "futebol"]), // já acabou, falta o resultado
      golos: (j.golos || []).map((g) => ({ lado: g.lado, marcador: g.marcador, min: g.min, extra: g.extra, minFonte: g.minFonte, fontes: g.fontes?.length || 0, penalti: g.penalti, autogolo: g.autogolo })),
      confirmado: j.confirmado, conflito: j.conflito ? j.conflito.placar : null, golosIncompletos: !!j.golosIncompletos,
      ig: { h: j.igCasa || null, a: j.igFora || null },
      fontes: (j.fontes || []).filter((f) => f.decisao && f.decisao !== "ignorado").slice(-4).map((f) => ({ tipo: f.tipo, conta: f.conta, ts: f.ts, url: f.url, decisao: f.decisao })),
      upd: j.upd || null,
    };
  }

  // ───────── eventos para o feed («Acontecimentos») ─────────
  const NOMES_EV = {
    inicio: (j) => [`Começou o ==${j.casa}==–==${j.fora}==`, `Kick-off: ==${j.casa}== v ==${j.fora}==`],
    intervalo: (j) => [`Intervalo: ${j.casa} ${j.hs ?? 0}–${j.as ?? 0} ${j.fora}`, `Half-time: ${j.casa} ${j.hs ?? 0}–${j.as ?? 0} ${j.fora}`],
    final: (j) => [`Final: ==${j.casa}== ${j.hs}–${j.as} ==${j.fora}==`, `Full time: ==${j.casa}== ${j.hs}–${j.as} ==${j.fora}==`],
    adiado: (j) => [`Adiado: ${j.casa}–${j.fora}`, `Postponed: ${j.casa} v ${j.fora}`],
    suspenso: (j) => [`Suspenso: ${j.casa} ${j.hs ?? 0}–${j.as ?? 0} ${j.fora}`, `Suspended: ${j.casa} ${j.hs ?? 0}–${j.as ?? 0} ${j.fora}`],
    anulado: (j) => [`Golo anulado no ${j.casa}–${j.fora}: ${j.hs}–${j.as}`, `Goal ruled out in ${j.casa} v ${j.fora}: ${j.hs}–${j.as}`],
  };
  const FONTE_TXT = { story: "story", post: "publicação", fpf: "FPF", sofa: "Sofascore", manual: "redação", externo: "transmissão", leitor: "leitores no campo" };
  function emitir(j, f, prova = {}) {
    const comp = st.comps[j.comp];
    if (!comp || comp.externo) return; // as da Liga/ESPN já dão as notícias pelo ligas.json
    const serie = comp.series?.[j.serie];
    const contexto = [comp.nome, serie?.nome, j.jornada ? `${j.jornada}.ª jornada` : null].filter(Boolean).join(" · ");
    const via = prova.conta ? `${FONTE_TXT[prova.tipo] || prova.tipo} de @${prova.conta}` : FONTE_TXT[prova.tipo] || null;
    let t, id, b = [contexto];
    const confirmado = j.confirmado?.h && j.confirmado?.a;
    if (f.tipo === "golo") {
      const g = f.golo;
      const equipa = g.lado === "h" ? j.casa : j.fora;
      const mt = g.min != null ? textoMinuto({ min: g.min, extra: g.extra, fonte: g.minFonte === "explicito" ? "explicito" : "estimado" }) : "";
      t = [`Golo do ==${equipa}==! ${j.casa} ${j.hs}–${j.as} ${j.fora}`, `Goal for ==${equipa}==! ${j.casa} ${j.hs}–${j.as} ${j.fora}`];
      if (g.marcador || mt) b.unshift(`${g.marcador ? `Golo de ==${g.marcador}==` : "Golo"}${mt ? ` aos ${mt}` : ""}${g.minFonte === "estimado" ? " (minuto estimado)" : ""}`);
      id = `pt:${g.id}`;
    } else {
      const fn = NOMES_EV[f.tipo];
      if (!fn) return;
      t = fn(j);
      id = `pt:${j.id}:${f.tipo}:${j.hs ?? "x"}-${j.as ?? "x"}`;
    }
    if (via) b.push(`Fonte: ${via}${j.oficial ? " · oficial" : confirmado ? " · confirmado pelos dois clubes" : ""}`);
    if (eventos.some((e) => e.id === id)) return;
    const m = j.estado === "direto" ? minutoEm(j, Date.now(), comp.mod) : null;
    const ev = {
      id, ts: Date.now(), src: "resultados", name: "Resultados em direto", orig: "multi", liga: `pt-${comp.org}`, paisTema: "pt",
      mod: comp.mod === "futsal" ? "futsal" : undefined, cats: [], imp: comp.nivel === "nacional" ? 2 : 1,
      t: { pt: t[0], en: t[1] }, b: { pt: b, en: b },
      url: prova.url || null,
      score: { comp: comp.nome, h: j.casa, a: j.fora, hs: j.hs ?? 0, as: j.as ?? 0, min: f.tipo === "final" ? null : m ? textoMinuto(m) : null, ft: f.tipo === "final", ht: j.estado === "intervalo" },
      equipas: [{ nome: j.casa, papel: "envolvido", logo: j.logoCasa || undefined }, { nome: j.fora, papel: "envolvido", logo: j.logoFora || undefined }],
      pt: { jogo: j.id, comp: comp.id, org: comp.org, fonte: prova.tipo || null, conta: prova.conta || null, oficial: !!j.oficial, confirmado: !!confirmado, estimado: f.golo?.minFonte === "estimado" },
    };
    eventos.unshift(ev);
    if (eventos.length > MAX_EVENTOS) eventos.length = MAX_EVENTOS;
    sujoEv = true;
    broadcast("pt-evento", ev);
  }
  // o segundo clube confirmou: o evento do golo passa a dizê-lo
  function confirmarEvento(j) {
    const g = j.golos?.at(-1);
    if (!g) return;
    const ev = eventos.find((e) => e.id === `pt:${g.id}`);
    if (!ev || ev.pt.confirmado) return;
    ev.pt.confirmado = true;
    ev.b.pt = ev.b.pt.map((x) => (x.startsWith("Fonte:") ? `${x} · confirmado pelos dois clubes` : x));
    sujoEv = true;
    broadcast("pt-evento", ev);
  }

  function mudou(j) {
    j.upd = Date.now();
    invalida(j);
    marca();
    broadcast("pt-jogo", compacto(j));
  }

  // ───────── competições ─────────
  function upsertComp(id, dados) {
    const c = (st.comps[id] ||= { id, series: {} });
    Object.assign(c, dados);
    c.externo = eExterna(c.nome);
    c.ordem = ordemComp(c);
    marca();
    return c;
  }
  const serieDe = (comp, id, nome) => {
    const k = String(id || "unica");
    const s = (comp.series[k] ||= { id: k, nome: nome || "", jornadas: {}, equipas: [] });
    if (nome && !s.nome) s.nome = nome;
    return s;
  };

  function registarJogo(comp, serie, n, dados, origem) {
    const chaveFpf = dados.fpfId ? `fpf:${dados.fpfId}` : null;
    const chaveSofa = dados.sofaId ? `sofa:${dados.sofaId}` : null;
    let j = (chaveFpf && st.jogos[chaveFpf]) || (chaveSofa && st.jogos[chaveSofa]);
    if (!j) {
      j = jogosDaSerie(comp.id, serie.id).find((x) => mesmaEquipa(x.casa, dados.casa, 0.8) && mesmaEquipa(x.fora, dados.fora, 0.8) && (x.jornada === n || n == null || x.jornada == null));
    }
    const id = chaveFpf || chaveSofa || `${comp.id}:${serie.id}:${n ?? "x"}:${slug(dados.casa)}~${slug(dados.fora)}`;
    let novo = false;
    if (!j) {
      j = st.jogos[id] = novoJogoEstado({ id, comp: comp.id, serie: serie.id, jornada: n ?? null, casa: dados.casa, fora: dados.fora, inicio: dados.inicio || null, mod: comp.mod, origem });
      novo = true;
      indiceDia = null;
    }
    if (dados.fpfId) j.fpfId = dados.fpfId;
    if (dados.sofaId) j.sofaId = dados.sofaId;
    indexar(j);
    if (n != null) j.jornada = n;
    if (dados.local) j.local = dados.local;
    if (dados.logoCasa) j.logoCasa = dados.logoCasa;
    if (dados.logoFora) j.logoFora = dados.logoFora;
    // jogo remarcado: a hora muda enquanto não começou
    if (dados.inicio && dados.inicio !== j.inicio && (j.estado === "agendado" || j.estado === "adiado")) {
      j.inicio = dados.inicio; j.semHora = !!dados.semHora; indiceDia = null;
      if (j.estado === "adiado" && dados.inicio > Date.now() && dados.estado !== "adiado") j.estado = "agendado";
      novo = true;
    }
    if (novo || !j.nomes) ligarClubes(j);
    const jr = n != null ? (serie.jornadas[n] ||= { n, nome: `${n}.ª jornada`, jogos: [] }) : null;
    if (jr && !jr.jogos.includes(j.id)) jr.jogos.push(j.id);
    for (const e of [j.casa, j.fora]) if (!serie.equipas.includes(e)) serie.equipas.push(e);
    // resultado oficial
    const fimProvavel = j.inicio ? j.inicio + DURACAO[comp.mod] : 0;
    let alterou = novo;
    if (["adiado", "suspenso", "cancelado", "falta"].includes(dados.estado)) {
      if (aplicarOficial(j, { hs: dados.hs, as: dados.as, estado: dados.estado, fonte: origem })) { alterou = true; emitir(j, { tipo: dados.estado === "suspenso" ? "suspenso" : "adiado" }, { tipo: origem }); }
    } else if (dados.hs != null && dados.as != null && (dados.estado === "final" || (origem === "fpf" && (!j.inicio || Date.now() > fimProvavel)))) {
      const ja = j.oficial && j.estado === "final";
      if (aplicarOficial(j, { hs: dados.hs, as: dados.as, estado: "final", fonte: origem })) {
        alterou = true;
        if (!ja && Date.now() - (j.inicio || 0) < 3 * 86400e3) emitir(j, { tipo: "final" }, { tipo: origem });
      }
    }
    if (alterou) mudou(j);
    return j;
  }

  // ───────── FPF ─────────
  const filas = { alta: [], normal: [], baixa: [] };
  const naFila = new Set();
  const agenda = (prio, chave, fn) => {
    if (naFila.has(chave)) return;
    naFila.add(chave);
    filas[prio].push({ chave, fn });
  };
  async function trabalhador() {
    for (;;) {
      const t = filas.alta.shift() || filas.normal.shift() || filas.baixa.shift();
      estado.filas = { alta: filas.alta.length, normal: filas.normal.length, baixa: filas.baixa.length };
      if (!t) { await sleep(2000); continue; }
      try { await t.fn(); } catch (e) { if (e.status !== 404) log(`[PT] ${t.chave}: ${e.message}`); }
      naFila.delete(t.chave);
    }
  }

  function guardarPagina(comp, serie, pagina, nPadrao) {
    for (const jr of pagina.jornadas || []) {
      const x = (serie.jornadas[jr.n] ||= { n: jr.n, nome: jr.nome || `${jr.n}.ª jornada`, jogos: [] });
      x.fpfId = jr.id;
      if (jr.nome) x.nome = jr.nome.replace(/\s+/g, " ").trim();
      if (jr.selecionado) serie.selecionada = jr.n;
    }
    const sel = nPadrao ?? (pagina.jornadas || []).find((x) => x.selecionado)?.n ?? null;
    for (const jg of pagina.jogos || []) registarJogo(comp, serie, jg.jornada ?? sel, jg, "fpf");
    const tab = (pagina.tabelas || [])[0];
    if (tab?.linhas?.length) {
      // a tabela oficial mais recente: a da página principal ou a da jornada mais avançada já lida
      const n = nPadrao ?? Infinity;
      if (!serie.oficial || n === Infinity || n >= (serie.oficial.n ?? 0)) {
        serie.oficial = { linhas: tab.linhas, ts: Date.now(), n: Number.isFinite(n) ? n : serie.oficial?.n ?? null };
        tabelasCache.delete(`${comp.id}|${serie.id}`);
      }
    }
  }

  async function estruturaFpf(comp) {
    const p = await fpf.competicao(comp.fpf.competitionId, comp.fpf.seasonId || EPOCA_FPF);
    if (p.titulo && !comp.nomeFpf) comp.nomeFpf = p.titulo;
    const series = p.series.length ? p.series : [{ id: "unica", nome: "", selecionado: true }];
    for (const s of series) {
      const serie = serieDe(comp, s.id, s.nome);
      const pagina = series.length === 1 || s.selecionado ? p : await fpf.serie(s.id).catch(() => null);
      if (pagina) guardarPagina(comp, serie, pagina, null);
    }
    comp.lidoEm = Date.now();
    marca();
    // jornadas por ler: a da semana e as vizinhas primeiro, o resto aos poucos
    for (const serie of Object.values(comp.series)) {
      const atual = jornadaAtual(comp, serie);
      for (const jr of Object.values(serie.jornadas)) {
        if (!jr.fpfId) continue;
        const perto = atual != null && Math.abs(jr.n - atual) <= 1;
        if (perto || !jr.lidaEm) agenda(perto ? "normal" : "baixa", `j:${comp.id}:${serie.id}:${jr.n}`, () => lerJornadaFpf(comp, serie, jr));
      }
    }
  }
  async function lerJornadaFpf(comp, serie, jr) {
    const p = await fpf.jornada(jr.fpfId);
    guardarPagina(comp, serie, p, jr.n);
    jr.lidaEm = Date.now();
    marca();
  }

  async function descobrirFpf() {
    const inicio = Date.now();
    let n = 0;
    const listas = [{ org: FPF.key, ler: () => fpf.competicoesNacionais() }, ...ASSOCIACOES.map((a) => ({ org: a.key, ler: () => fpf.competicoesDaAssociacao(a.id, EPOCA_FPF) }))];
    for (const { org, ler: lerLista } of listas) {
      try {
        const lista = await lerLista();
        for (const c of lista) {
          if (c.seasonId && +c.seasonId !== EPOCA_FPF) continue;
          const cl = classificar({ nome: c.nome, org, contexto: c.contexto });
          if (!cl) continue;
          const id = `fpf-${c.competitionId}`;
          const nova = !st.comps[id];
          const comp = upsertComp(id, { org, nome: bonito(c.nome), nomeFpf: c.nome, ...cl, fonte: "fpf", fpf: { competitionId: c.competitionId, seasonId: c.seasonId || EPOCA_FPF } });
          n++;
          if (nova || !comp.lidoEm || Date.now() - comp.lidoEm > ESTRUTURA_MS) agenda(nova ? "normal" : "baixa", `c:${id}`, () => estruturaFpf(comp));
        }
      } catch (e) {
        log(`[PT] lista de competições de ${ORG[org]?.nome || org}: ${e.message}`);
      }
    }
    estado.descoberta = { ts: Date.now(), ms: Date.now() - inicio, competicoes: n };
    log(`[PT] ${n} competições seniores encontradas na FPF (${Object.keys(st.comps).length} no total)`);
  }

  // ───────── Sofascore ─────────
  const ORG_LIGA = /liga portugal|betclic|liga 2\b|segunda liga|ta[cç]a da liga|allianz/;
  async function descobrirSofa() {
    for (const sport of ["football", "futsal"]) {
      let lista = [];
      try { lista = await sofa.torneios(sport); } catch (e) { log(`[PT] Sofascore (${sport}): ${e.message}`); continue; }
      for (const t of lista) {
        const org = ORG_LIGA.test(norm(t.nome)) ? "liga" : "fpf";
        const cl = classificar({ nome: t.nome, org, contexto: sport === "futsal" ? "futsal" : "" });
        if (!cl) continue;
        if (sport === "futsal") cl.mod = "futsal";
        // já existe pela FPF: o Sofascore fica só para o tempo real
        const igual = Object.values(st.comps).find((c) => c.fonte === "fpf" && c.mod === cl.mod && c.fem === cl.fem && simil(c.nome, t.nome) >= 0.75);
        if (igual) { igual.sofa = { ut: t.id }; continue; }
        const id = `sofa-${t.id}`;
        const comp = upsertComp(id, { org, nome: t.nome, ...cl, fonte: "sofa", sofa: { ut: t.id } });
        if (!comp.lidoEm || Date.now() - comp.lidoEm > ESTRUTURA_MS) agenda("normal", `s:${id}`, () => estruturaSofa(comp));
      }
    }
  }
  async function estruturaSofa(comp) {
    const ep = await sofa.epocaAtual(comp.sofa.ut);
    if (!ep) return;
    comp.sofa.season = ep.id;
    const r = await sofa.jornadas(comp.sofa.ut, ep.id);
    const atual = r.atual;
    const lista = r.lista.length ? r.lista : atual ? [{ n: atual }] : [];
    const ordemLeitura = [...lista].sort((a, b) => Math.abs(a.n - (atual ?? 0)) - Math.abs(b.n - (atual ?? 0)));
    for (const [i, jr] of ordemLeitura.entries()) {
      agenda(i < 3 ? "normal" : "baixa", `sj:${comp.id}:${jr.n}`, async () => {
        for (const ev of await sofa.jogosDaJornada(comp.sofa.ut, ep.id, jr.n)) {
          const serie = serieDe(comp, slug(ev.grupo && ev.grupo !== ev.torneio ? ev.grupo : "unica") || "unica", ev.grupo && ev.grupo !== ev.torneio ? ev.grupo.replace(/^.*?,\s*/, "") : "");
          registarJogo(comp, serie, jr.n, { ...ev }, "sofa");
        }
      });
    }
    try {
      const tabs = await sofa.classificacoes(comp.sofa.ut, ep.id);
      for (const t of tabs) {
        const nomeSerie = t.nome && t.nome !== comp.nome ? t.nome : "";
        const serie = serieDe(comp, slug(nomeSerie) || "unica", nomeSerie.replace(/^.*?,\s*/, ""));
        serie.oficial = { linhas: t.linhas, ts: Date.now() };
      }
    } catch { /* sem classificação (taças) */ }
    comp.lidoEm = Date.now();
    marca();
  }

  // jogos portugueses em direto no Sofascore: minuto, resultado e marcadores
  const lancesLidos = new Map();
  async function vivoSofa() {
    for (const sport of ["football", "futsal"]) {
      let lista;
      try { lista = await sofa.aoVivo(sport); } catch { continue; }
      for (const ev of lista) {
        let j = st.jogos[`sofa:${ev.sofaId}`] || st.jogos[idxSofa.get(ev.sofaId)] || acharJogo(ev.casa, ev.fora, ev.inicio, sport === "futsal" ? "futsal" : "futebol");
        if (!j) continue;
        j.sofaId = ev.sofaId;
        idxSofa.set(ev.sofaId, j.id);
        const antes = `${j.hs}-${j.as}|${j.estado}`;
        const golosAntes = (j.hs ?? 0) + (j.as ?? 0);
        if (ev.relogio) j.relogioExterno = { m: ev.relogio, ts: Date.now() };
        if (!j.oficial) {
          if (j.estado === "agendado" && ev.estado !== "agendado") emitir(j, { tipo: "inicio" }, { tipo: "sofa" });
          j.hs = ev.hs; j.as = ev.as;
          if (ev.estado === "intervalo" && j.estado !== "intervalo") emitir(j, { tipo: "intervalo" }, { tipo: "sofa" });
          j.estado = ev.estado === "final" ? j.estado : ev.estado;
          j.origem = "sofa";
        }
        if ((ev.hs ?? 0) + (ev.as ?? 0) !== golosAntes || !lancesLidos.has(ev.sofaId)) {
          lancesLidos.set(ev.sofaId, Date.now());
          const ls = await sofa.lances(ev.sofaId);
          if (ls) {
            const conhecidos = j.golos.length;
            j.golos = ls.map((g, i) => ({ id: `${j.id}:g${i + 1}`, ...g, minFonte: "explicito", minConfianca: "alta", ts: j.golos[i]?.ts || Date.now(), fontes: ["sofascore"] }));
            for (const g of j.golos.slice(conhecidos)) emitir(j, { tipo: "golo", golo: g }, { tipo: "sofa" });
          }
        }
        if (`${j.hs}-${j.as}|${j.estado}` !== antes || ev.relogio) mudou(j);
      }
    }
  }

  // jogos que chegam pela ESPN/Sofascore do ligas.json (Liga Betclic, Liga 2…): atualizam as tabelas ao vivo
  function externo(m, lg) {
    if (!lg || lg.extra || (lg.bandeira !== "pt" && lg.pais !== "portugal")) return;
    const j = acharJogo(m.home, m.away, m.start || Date.now());
    if (!j || j.oficial) return;
    const est = m.state === "in" ? (m.ht ? "intervalo" : "direto") : m.state === "post" ? "final" : "agendado";
    const antes = `${j.hs}-${j.as}|${j.estado}`;
    if (est !== "agendado") { j.hs = m.hs; j.as = m.as; j.estado = est; j.origem = "externo"; }
    const mm = String(m.clock || "").match(/(\d{1,3})'?\s*(?:\+\s*(\d+))?/);
    if (est === "direto" && mm) j.relogioExterno = { m: { min: +mm[1], extra: +(mm[2] || 0) }, ts: Date.now() };
    if (est === "final" && m.completed) aplicarOficial(j, { hs: m.hs, as: m.as, estado: "final", fonte: "externo" });
    if (`${j.hs}-${j.as}|${j.estado}` !== antes) mudou(j);
  }

  // ───────── stories e posts ─────────
  const provasVistas = new Set();
  // jogos a acompanhar nas redes: a começar, a decorrer ou acabados há pouco, de competições sem transmissão
  function alvos(agora = Date.now()) {
    const out = new Map();
    for (const j of jogosPerto(agora, 4)) {
      const comp = st.comps[j.comp];
      if (!comp || comp.externo || (j.oficial && j.estado === "final")) continue;
      if (j.origem === "sofa" && j.relogioExterno && agora - j.relogioExterno.ts < 3 * 60e3) continue; // já há minuto ao segundo
      const dur = DURACAO[comp.mod];
      if (!j.inicio || agora < j.inicio - 45 * 60e3 || agora > j.inicio + dur + 60 * 60e3) continue;
      // prioridade: jogo a decorrer primeiro; depois os clubes que já se viu publicarem stories ou posts
      const aDecorrer = ["direto", "intervalo"].includes(j.estado) || (agora >= j.inicio && agora <= j.inicio + dur);
      for (const [handle, lado] of [[j.igCasa, "h"], [j.igFora, "a"]]) {
        if (!handle || out.has(handle)) continue;
        const info = clubes.info(handle);
        const publica = (info.provas || 0) > 0;
        // os posts também contam durante o jogo (há clubes que atualizam o resultado e os golos só por post):
        // leem-se desde o início, a cada 2 min nos clubes que já se viu fazerem isso, a cada 5 nos outros
        const postsAoVivo = (info.postsAoVivo || 0) > 0;
        out.set(handle, {
          handle, jogoId: j.id, lado, desde: j.inicio - 60 * 60e3, postsDesde: j.inicio,
          postsMs: postsAoVivo ? POSTS_VIVO_MS : POSTS_MS, prioridade: (aDecorrer ? 2 : 0) + (publica ? 1 : 0) + (postsAoVivo ? 1 : 0),
        });
      }
    }
    return [...out.values()].sort((a, b) => b.prioridade - a.prioridade);
  }

  function jogoDaProva(p) {
    if (p.jogoId && st.jogos[p.jogoId]) return { j: st.jogos[p.jogoId], lado: p.lado || null };
    const conta = String(p.conta || "").toLowerCase().replace(/^@/, "");
    const clube = clubes.porHandle.get(conta) || (p.clube ? clubes.encontrar(p.clube, p.org) : null);
    const handle = clube?.instagram || conta;
    const ts = p.ts || Date.now();
    const cands = jogosPerto(ts, 5).filter((j) => (j.igCasa === handle || j.igFora === handle) && ts >= j.inicio - 60 * 60e3 && ts <= j.inicio + DURACAO[st.comps[j.comp]?.mod || "futebol"] + 3 * 3600e3);
    if (!cands.length) return null;
    // o mesmo clube com a equipa principal e a B (ou sub-23) a jogar: o texto diz qual
    let j = cands[0];
    if (cands.length > 1) {
      const t = norm(p.texto);
      const sub = /\bsub[- ]?2[23]\b|\bu2[23]\b/.test(t) ? "SUB" : /\bequipa b\b|\b(?:^|\s)b\b/.test(t) ? "B" : null;
      j = cands.find((x) => {
        const n = (x.igCasa === handle ? x.casa : x.fora);
        const e = semEquipa(n).equipa;
        return sub ? e && e.startsWith(sub) : !e;
      }) || cands.sort((a, b) => Math.abs(a.inicio - ts) - Math.abs(b.inicio - ts))[0];
    }
    return { j, lado: j.igCasa === handle ? "h" : "a", handle };
  }

  function evidencia(p) {
    estado.evidencias.recebidas++;
    if (!p?.id || provasVistas.has(p.id)) { estado.evidencias.repetido++; return { decisao: "repetido" }; }
    provasVistas.add(p.id);
    if (provasVistas.size > 100000) provasVistas.clear();
    const alvo = jogoDaProva(p);
    if (!alvo) { estado.evidencias.semJogo++; return { decisao: "sem_jogo" }; }
    const { j, lado, handle } = alvo;
    const conta = handle || p.conta || null;
    const r = aplicar(j, { ...p, conta, lado, convencao: lado === "a" ? clubes.convencao(conta) : null, lido: lerTexto(p.texto) });
    estado.evidencias[r.decisao] = (estado.evidencias[r.decisao] || 0) + 1;
    if (r.orientacao && conta) clubes.aprender(conta, r.orientacao);
    if (conta) clubes.nota(conta, { ultimaProva: p.ts || Date.now(), provas: (clubes.info(conta).provas || 0) + 1 });
    // clube que atualiza o jogo por posts enquanto se joga: os posts dele passam a ser lidos mais vezes
    const durJ = DURACAO[st.comps[j.comp]?.mod || "futebol"];
    if (conta && p.tipo === "post" && ["novo", "confirmacao", "relogio"].includes(r.decisao) && j.inicio && p.ts >= j.inicio && p.ts <= j.inicio + durJ) {
      clubes.nota(conta, { postsAoVivo: (clubes.info(conta).postsAoVivo || 0) + 1 });
    }
    for (const f of r.feed) emitir(j, f, { tipo: p.tipo, conta, url: p.url });
    if (r.decisao === "confirmacao" && j.confirmado?.h && j.confirmado?.a) confirmarEvento(j);
    if (r.decisao !== "ignorado" && r.decisao !== "repetido") mudou(j); else marca();
    return { decisao: r.decisao, jogo: j.id };
  }

  // ───────── jornada da semana ─────────
  function jornadaAtual(comp, serie, agora = Date.now()) {
    const js = Object.values(serie.jornadas).map((jr) => {
      const ts = jr.jogos.map((id) => st.jogos[id]?.inicio).filter(Boolean).sort((a, b) => a - b);
      const vivo = jr.jogos.some((id) => ["direto", "intervalo"].includes(st.jogos[id]?.estado));
      return { n: jr.n, ts, vivo };
    });
    if (!js.length) return serie.selecionada ?? null;
    const aoVivo = js.find((x) => x.vivo);
    if (aoVivo) return aoVivo.n;
    const [ini, fim] = semanaDe(agora);
    const semana = js.filter((x) => x.ts.some((t) => t >= ini && t < fim));
    if (semana.length) {
      const med = (x) => x.ts[Math.floor(x.ts.length / 2)];
      return semana.sort((a, b) => Math.abs(med(a) - agora) - Math.abs(med(b) - agora))[0].n;
    }
    const proximas = js.filter((x) => x.ts.length && x.ts[0] > agora).sort((a, b) => a.ts[0] - b.ts[0]);
    if (proximas.length && proximas[0].ts[0] - agora < 21 * 86400e3) return proximas[0].n;
    const passadas = js.filter((x) => x.ts.length && x.ts.at(-1) <= agora).sort((a, b) => b.ts.at(-1) - a.ts.at(-1));
    if (passadas.length) return passadas[0].n;
    return serie.selecionada ?? proximas[0]?.n ?? Math.min(...js.map((x) => x.n));
  }

  function tabela(comp, serie) {
    const k = `${comp.id}|${serie.id}`;
    const c = tabelasCache.get(k);
    if (c && Date.now() - c.ts < 60e3) return c.linhas;
    if (comp.tipo === "taca") return [];
    const jogos = jogosDaSerie(comp.id, serie.id);
    const equipas = [...new Set([...serie.equipas, ...(serie.oficial?.linhas || []).map((l) => l.equipa)])];
    // sem jogos nossos, a oficial tal como está
    let linhas = jogos.some((j) => j.hs != null)
      ? tabelaAoVivo({ equipas: serie.equipas.length ? serie.equipas : equipas, jogos, oficial: serie.oficial?.linhas, antesDe: serie.oficial ? serie.oficial.ts - DURACAO[comp.mod] : null })
      : (serie.oficial?.linhas || []).map((l) => ({ ...l, forma: [], aoVivo: null }));
    // nem resultados nem tabela oficial (início da época, ou uma distrital cuja tabela a FPF não deu): as equipas
    // do calendário a zero, para a classificação aparecer na mesma e começar a mexer com o primeiro resultado
    if (!linhas.length) {
      const doCalendario = [...new Set([...equipas, ...jogos.flatMap((j) => [j.casa, j.fora])].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
      if (doCalendario.length >= 2) linhas = tabelaAoVivo({ equipas: doCalendario, jogos: [] }).map((l) => ({ ...l, semJogos: true }));
    }
    tabelasCache.set(k, { ts: Date.now(), linhas });
    return linhas;
  }

  // ───────── ciclos ─────────
  async function ciclo() {
    estado.ultimoCiclo = Date.now();
    const agora = Date.now();
    // jornadas com jogos a decorrer ou acabados há pouco: relidas para apanhar o resultado oficial
    const vistas = new Set();
    for (const j of jogosPerto(agora, 8)) {
      const comp = st.comps[j.comp];
      if (!comp || (j.oficial && j.estado === "final") || !j.inicio) continue;
      if (agora < j.inicio || agora > j.inicio + 8 * 3600e3) continue;
      const serie = comp.series?.[j.serie];
      const jr = serie?.jornadas?.[j.jornada];
      const k = `${comp.id}|${j.serie}|${j.jornada}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      if (comp.fonte === "fpf" && jr?.fpfId && agora - (jr.lidaEm || 0) > DIRETO_MS) agenda("alta", `j:${comp.id}:${serie.id}:${jr.n}`, () => lerJornadaFpf(comp, serie, jr));
      else if (comp.fonte === "fpf" && !jr?.fpfId && agora - (comp.lidoEm || 0) > DIRETO_MS) agenda("alta", `c:${comp.id}`, () => estruturaFpf(comp));
      if (comp.fonte === "sofa" && comp.sofa?.season && agora - (jr?.lidaEm || 0) > DIRETO_MS) {
        agenda("alta", `sj:${comp.id}:${j.jornada}`, async () => {
          for (const ev of await sofa.jogosDaJornada(comp.sofa.ut, comp.sofa.season, j.jornada)) {
            const s = serieDe(comp, slug(ev.grupo && ev.grupo !== ev.torneio ? ev.grupo : "unica") || "unica");
            registarJogo(comp, s, j.jornada, ev, "sofa");
          }
          if (jr) jr.lidaEm = Date.now();
        });
      }
    }
    // jogos dos últimos 3 dias ainda sem resultado oficial: a jornada é relida de 2 em 2 horas
    for (const j of jogosPerto(agora - 40 * 3600e3, 32)) {
      const comp = st.comps[j.comp];
      if (!comp || comp.fonte !== "fpf" || j.oficial || !j.inicio || agora < j.inicio + 8 * 3600e3 || agora > j.inicio + 72 * 3600e3) continue;
      const serie = comp.series?.[j.serie];
      const jr = serie?.jornadas?.[j.jornada];
      if (jr?.fpfId && agora - (jr.lidaEm || 0) > 2 * 3600e3) agenda("normal", `j:${comp.id}:${serie.id}:${jr.n}`, () => lerJornadaFpf(comp, serie, jr));
    }
    // jogos que deviam ter acabado há muito e ninguém confirmou: ficam «por confirmar»
    for (const j of jogosPerto(agora, 12)) {
      const dur = DURACAO[st.comps[j.comp]?.mod || "futebol"];
      if ((j.estado === "direto" || j.estado === "intervalo") && j.inicio && agora > j.inicio + dur + 90 * 60e3 && !j.oficial) {
        j.estado = j.hs != null ? "final" : "agendado";
        j.provisorio = true;
        if (j.hs != null) emitir(j, { tipo: "final" }, { tipo: j.origem === "sofa" ? "sofa" : "story" });
        mudou(j);
      }
    }
    // estrutura de cada competição, uma vez por dia (datas remarcadas, jornadas novas)
    for (const comp of Object.values(st.comps)) {
      if (Date.now() - (comp.lidoEm || 0) < ESTRUTURA_MS) continue;
      if (comp.fonte === "fpf") agenda("baixa", `c:${comp.id}`, () => estruturaFpf(comp));
      else if (comp.fonte === "sofa") agenda("baixa", `s:${comp.id}`, () => estruturaSofa(comp));
    }
  }

  let ig = { estado: { ativo: false } };
  function start() {
    if (!ATIVO) { log("[PT] resultados de Portugal desligados (PT_RESULTADOS=0)"); return; }
    for (const j of Object.values(st.jogos)) if (!j.nomes) ligarClubes(j);
    trabalhador();
    const descobrir = async () => {
      await descobrirFpf().catch((e) => log(`[PT] descoberta FPF: ${e.message}`));
      await descobrirSofa().catch((e) => log(`[PT] descoberta Sofascore: ${e.message}`));
    };
    const ultima = Math.max(0, ...Object.values(st.comps).map((c) => c.lidoEm || 0));
    setTimeout(descobrir, Date.now() - ultima > ESTRUTURA_MS ? 5000 : 10 * 60e3);
    setInterval(descobrir, 24 * 3600e3).unref();
    setInterval(() => ciclo().catch((e) => log(`[PT] ciclo: ${e.message}`)), 60e3).unref();
    // Sofascore em direto: só quando há jogos portugueses a decorrer ou a começar
    (async () => {
      for (;;) {
        const agora = Date.now();
        const ha = jogosPerto(agora, 3).some((j) => j.inicio <= agora + 10 * 60e3 && j.inicio > agora - 3 * 3600e3 && !(j.oficial && j.estado === "final"));
        if (ha) await vivoSofa().catch(() => {});
        await sleep(ha ? SOFA_VIVO_MS : 60e3);
      }
    })();
    ocr.verificar().then((o) => log(`[PT] OCR dos stories: ${o.tesseract ? `tesseract (${o.tesseract.linguas.join(", ") || "?"})` : "sem tesseract"}${o.ffmpeg ? " + ffmpeg" : ""}${process.env.GEMINI_API_KEY ? " + Gemini como reserva" : ""}`));
    // com sessão de uma conta qualquer (não precisa de seguir os clubes): leitura direta pelo Instagram;
    // sem conta nenhuma: visualizadores anónimos públicos (STORIES_ANONIMO=0 desliga)
    const cookie = cookieDoEnv();
    if (cookie) {
      ig = createInstagram({ cookie, alvos, entregar: async (p) => evidencia(p), guardar: (h, c) => clubes.nota(h, c), info: (h) => clubes.info(h), log });
      ig.estado.modo = "com sessão (sem precisar de seguir os clubes)";
    } else if (process.env.STORIES_ANONIMO !== "0") {
      ig = createAnonimo({ alvos, entregar: async (p) => evidencia(p), log });
    } else log("[PT] recolha de stories desligada: os stories só entram pelo retransmissor (npm run instagram-relay), pelo formulário do site ou pela API");
  }

  // ───────── API ─────────
  const resumoComp = (c) => ({
    id: c.id, nome: c.nome, org: c.org, orgNome: ORG[c.org]?.nome || c.org, nivel: c.nivel, mod: c.mod, fem: !!c.fem, sub23: !!c.sub23, tipo: c.tipo, externo: !!c.externo, ordem: c.ordem,
    series: Object.values(c.series || {}).map((s) => ({ id: s.id, nome: s.nome, jornadas: Object.keys(s.jornadas).length, equipas: s.equipas.length })),
  });
  const token = () => process.env.PT_TOKEN || process.env.VIDEOS_RELAY_TOKEN;
  const autorizado = (req) => token() && req.get("authorization") === `Bearer ${token()}`;

  function rotas(app, express) {
    app.get("/api/pt/competicoes", (req, res) => {
      const vivos = new Map();
      for (const j of jogosPerto(Date.now(), 4)) if (["direto", "intervalo"].includes(j.estado)) vivos.set(j.comp, (vivos.get(j.comp) || 0) + 1);
      res.json({ orgs: ORGS.map((o) => ({ key: o.key, nome: o.nome, longo: o.longo })), competicoes: Object.values(st.comps).filter((c) => Object.keys(c.series || {}).length || c.lidoEm).map((c) => ({ ...resumoComp(c), aoVivo: vivos.get(c.id) || 0 })).sort((a, b) => a.ordem - b.ordem) });
    });
    app.get("/api/pt/competicao/:id", (req, res) => {
      const comp = st.comps[req.params.id];
      if (!comp) return res.status(404).json({ erro: "competição desconhecida" });
      const series = Object.values(comp.series || {});
      const serie = comp.series[req.query.serie] || series[0];
      if (!serie) return res.json({ comp: resumoComp(comp), serie: null, jornadas: [], jogos: [], tabela: [] });
      const atual = jornadaAtual(comp, serie);
      const n = req.query.jornada != null && serie.jornadas[req.query.jornada] ? +req.query.jornada : atual;
      const jornadas = Object.values(serie.jornadas).sort((a, b) => a.n - b.n).map((jr) => {
        const ts = jr.jogos.map((id) => st.jogos[id]?.inicio).filter(Boolean);
        return { n: jr.n, nome: jr.nome, de: ts.length ? Math.min(...ts) : null, ate: ts.length ? Math.max(...ts) : null, jogos: jr.jogos.length, terminados: jr.jogos.filter((id) => st.jogos[id]?.estado === "final").length };
      });
      const jogos = (serie.jornadas[n]?.jogos || []).map((id) => st.jogos[id]).filter(Boolean).sort((a, b) => (a.inicio || 0) - (b.inicio || 0)).map((j) => compacto(j));
      res.json({ comp: resumoComp(comp), serie: { id: serie.id, nome: serie.nome }, atual, jornada: n, jornadas, jogos, tabela: tabela(comp, serie), oficialTs: serie.oficial?.ts || null });
    });
    app.get("/api/pt/tabelas", (req, res) => {
      const out = [];
      for (const c of Object.values(st.comps).sort((a, b) => a.ordem - b.ordem)) {
        if (c.tipo === "taca") continue;
        if (req.query.org && c.org !== req.query.org) continue;
        if (req.query.mod && c.mod !== req.query.mod) continue;
        for (const s of Object.values(c.series || {})) {
          const linhas = tabela(c, s);
          if (linhas.length) out.push({ comp: c.id, compNome: c.nome, org: c.org, mod: c.mod, nivel: c.nivel, serie: s.id, serieNome: s.nome, jornada: jornadaAtual(c, s), linhas });
        }
      }
      res.json(out);
    });
    // a jornada atual (ou a próxima) de todas as competições, com os jogos, haja ou não jogos a decorrer
    app.get("/api/pt/jornadas", (req, res) => {
      const out = [];
      const agora = Date.now();
      for (const c of Object.values(st.comps).sort((a, b) => a.ordem - b.ordem)) {
        if (req.query.org && c.org !== req.query.org) continue;
        if (req.query.mod && c.mod !== req.query.mod) continue;
        if (req.query.nivel && req.query.nivel !== "todos" && c.nivel !== req.query.nivel) continue;
        for (const s of Object.values(c.series || {})) {
          const n = jornadaAtual(c, s, agora);
          const jr = n != null ? s.jornadas[n] : null;
          if (!jr) continue;
          const jogos = jr.jogos.map((id) => st.jogos[id]).filter(Boolean).sort((a, b) => (a.inicio || 0) - (b.inicio || 0)).map((j) => compacto(j, agora));
          if (!jogos.length) continue;
          const ts = jogos.map((j) => j.inicio).filter(Boolean);
          out.push({ comp: c.id, compNome: c.nome, org: c.org, mod: c.mod, nivel: c.nivel, tipo: c.tipo, serie: s.id, serieNome: s.nome, jornada: n, nome: jr.nome, de: ts.length ? Math.min(...ts) : null, ate: ts.length ? Math.max(...ts) : null, jogos });
        }
      }
      res.json(out);
    });
    app.get("/api/pt/aovivo", (req, res) => {
      const agora = Date.now();
      const hoje = diaLisboa(agora);
      const lista = jogosPerto(agora, 14).filter((j) => ["direto", "intervalo"].includes(j.estado) || diaLisboa(j.inicio) === hoje)
        .filter((j) => !req.query.org || st.comps[j.comp]?.org === req.query.org)
        .sort((a, b) => (a.inicio || 0) - (b.inicio || 0)).map((j) => compacto(j, agora));
      res.json(lista);
    });
    app.get("/api/pt/eventos", (req, res) => res.json(eventos.slice(0, Math.min(Number(req.query.limit) || 400, MAX_EVENTOS))));
    app.get("/api/pt/jogo/:id", (req, res) => {
      const j = st.jogos[req.params.id];
      if (!j) return res.status(404).json({ erro: "jogo desconhecido" });
      res.json({ ...compacto(j), fontes: j.fontes, relogio: j.relogio, nomes: j.nomes, fb: { h: j.fbCasa, a: j.fbFora } });
    });
    app.get("/api/pt/estado", (req, res) => res.json({
      ...estado, fpf: fpf.estado, sofascore: sofa.estado, ocr: ocr.estado, instagram: ig.estado,
      competicoes: Object.keys(st.comps).length, jogos: Object.keys(st.jogos).length, eventos: eventos.length, alvos: alvos().length,
      semJogos: Object.values(st.comps).filter((c) => !Object.values(c.series || {}).some((s) => s.equipas.length)).map((c) => ({ id: c.id, nome: c.nome, org: c.org })).slice(0, 80),
    }));
    app.get("/api/pt/clubes", (req, res) => res.json(clubes.clubes.filter((c) => !req.query.org || c.org === req.query.org).map((c) => ({ nome: c.nome, org: c.org, assoc: c.assoc, instagram: c.instagram, facebook: c.facebook, estadoInstagram: c.estadoInstagram, conv: clubes.convencao(c.instagram), provas: clubes.info(c.instagram).provas || 0 }))));
    // retransmissor e redação: lista de contas a vigiar e entrega de stories/posts lidos noutro computador
    app.get("/api/pt/alvos", (req, res) => (autorizado(req) ? res.json(alvos()) : res.status(401).json({ erro: "chave em falta" })));
    app.post("/api/pt/evidencia", express.json({ limit: "512kb" }), (req, res) => {
      if (!autorizado(req)) return res.status(401).json({ erro: "chave PT_TOKEN em falta ou errada" });
      const itens = Array.isArray(req.body?.itens) ? req.body.itens : [req.body];
      const out = itens.slice(0, 200).map((p) => {
        if (!p || typeof p !== "object" || !p.texto) return { decisao: "invalido" };
        const limpo = { id: String(p.id || `manual:${Date.now()}:${Math.random().toString(36).slice(2)}`).slice(0, 200), tipo: ["story", "post", "manual", "facebook"].includes(p.tipo) ? p.tipo : "manual", rede: p.rede || null, conta: p.conta ? String(p.conta).slice(0, 80) : null, clube: p.clube || null, org: p.org || null, jogoId: p.jogoId || null, lado: ["h", "a"].includes(p.lado) ? p.lado : null, ts: Number(p.ts) || Date.now(), texto: String(p.texto).slice(0, 2000), url: p.url ? String(p.url).slice(0, 500) : null };
        return evidencia(limpo);
      });
      res.json({ ok: true, resultados: out });
    });
    // formulário público do site: resultado, minuto, marcador e/ou captura do story
    app.post("/api/pt/leitor", express.json({ limit: "3mb" }), async (req, res) => {
      const b = req.body || {};
      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
      const r = await leitor({ jogoId: String(b.jogoId || ""), hs: b.hs === "" || b.hs == null ? null : Number(b.hs), as: b.as === "" || b.as == null ? null : Number(b.as), min: b.min, marcador: b.marcador, imagem: b.imagem, ip });
      res.status(r.ok ? 200 : 400).json(r);
    });
    // correção manual de um jogo (redação)
    app.post("/api/pt/jogo/:id", express.json({ limit: "32kb" }), (req, res) => {
      if (!autorizado(req)) return res.status(401).json({ erro: "chave PT_TOKEN em falta ou errada" });
      const j = st.jogos[req.params.id];
      if (!j) return res.status(404).json({ erro: "jogo desconhecido" });
      const { hs, as, estado: est } = req.body || {};
      if (est === "final" || ["adiado", "suspenso", "cancelado"].includes(est)) aplicarOficial(j, { hs: hs ?? j.hs, as: as ?? j.as, estado: est, fonte: "manual" });
      else if (hs != null && as != null) { j.hs = +hs; j.as = +as; if (est) j.estado = est; }
      mudou(j);
      res.json(compacto(j));
    });
  }

  // ───────── resultados enviados pelos leitores (formulário do site, sem conta) ─────────
  // Qualquer pessoa no campo pode mandar o resultado, o minuto, o marcador ou uma captura do story. Para evitar
  // brincadeiras, um envio só conta quando outra pessoa (outro endereço) manda o mesmo resultado nos 20 minutos
  // seguintes, ou quando bate com o que os stories ou a FPF já disseram (fica como confirmação). Com
  // PT_LEITOR_DIRETO=1, um só envio chega (útil se forem só pessoas de confiança a usar o formulário).
  const LEITOR_JANELA = 20 * 60e3;
  const LEITOR_DIRETO = process.env.PT_LEITOR_DIRETO === "1";
  const pendentes = new Map(); // jogo → [{ quem, hs, as, ts, texto }]
  const limiteIp = new Map(); // quem → [instantes]
  async function leitor({ jogoId, hs, as, min, marcador, imagem, ip }) {
    const j = st.jogos[jogoId];
    if (!j) return { ok: false, erro: "jogo desconhecido" };
    if (j.oficial && j.estado === "final") return { ok: false, erro: "este jogo já tem resultado oficial" };
    const quem = crypto.createHash("sha256").update(`${ip}|${process.env.PT_TOKEN || "var"}`).digest("hex").slice(0, 16);
    const agora = Date.now();
    const vezes = (limiteIp.get(quem) || []).filter((t) => agora - t < 10 * 60e3);
    if (vezes.length >= 12) return { ok: false, erro: "demasiados envios; tenta daqui a uns minutos" };
    vezes.push(agora);
    limiteIp.set(quem, vezes);
    let texto = "";
    if (imagem) {
      const m = String(imagem).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
      if (m) texto = await ocr.lerStory({ buf: Buffer.from(m[2], "base64") }).catch(() => "");
    }
    const temPlacar = Number.isInteger(hs) && Number.isInteger(as) && hs >= 0 && as >= 0 && hs < 40 && as < 40;
    if (!temPlacar && !texto) return { ok: false, erro: "falta o resultado (ou uma imagem com ele)" };
    // o resultado escrito com os nomes das duas equipas, para o motor saber de que lado é cada número
    const linha = temPlacar ? `${j.casa} ${hs}-${as} ${j.fora}` : "";
    const extra = [min ? `${String(min).replace(/[^\d+]/g, "")}'` : "", marcador ? `golo de ${String(marcador).slice(0, 60)}` : ""].filter(Boolean).join(" ");
    const t = [linha, extra, texto].filter(Boolean).join("\n");
    const placar = temPlacar ? `${hs}-${as}` : null;
    const confirma = placar && j.hs === hs && j.as === as && j.hs != null;
    const lista = (pendentes.get(jogoId) || []).filter((x) => agora - x.ts < LEITOR_JANELA);
    const outro = placar && lista.find((x) => x.placar === placar && x.quem !== quem);
    lista.push({ quem, placar, ts: agora });
    pendentes.set(jogoId, lista);
    if (LEITOR_DIRETO || confirma || outro || (!placar && texto)) {
      const r = evidencia({ id: `leitor:${jogoId}:${quem}:${agora}`, tipo: "leitor", jogoId, ts: agora, texto: t });
      return { ok: true, aceite: true, decisao: r.decisao };
    }
    return { ok: true, aceite: false, mensagem: "Obrigado! O resultado entra quando outra pessoa confirmar (ou um dos clubes o publicar)." };
  }

  // grupos para o filtro de ligas do site (uma entrada por organizador)
  const ligasSite = () => ORGS.map((o) => ({ key: `pt-${o.key}`, nome: `Portugal · ${o.nome}`, nome_en: `Portugal · ${o.nome}`, pais: "pt", grupo: "pt" }));

  return { start, rotas, externo, evidencia, alvos, leitor, ligasSite, estado, _st: st, _jornadaAtual: jornadaAtual, _registarJogo: registarJogo, _upsertComp: upsertComp, _serieDe: serieDe, _tabela: tabela };
}
