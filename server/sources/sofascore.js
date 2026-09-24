// Resultados em direto das competições portuguesas que a ESPN não tem (Liga 2, Liga 3, Liga Portugal Next Gen,
// Liga BPI e as supertaças), a partir dos endereços públicos do Sofascore. Não é uma API oficial: não precisa de
// chave nem custa nada, mas o Sofascore pode mudá-la ou recusar servidores. Se recusar, estas ligas passam para a
// GOAL API (se houver chave); sem ela, o VAR espera uns minutos e volta a tentar.
// Um só pedido traz todos os jogos de futebol a decorrer no mundo; os lances de cada jogo das ligas escolhidas
// (marcadores, expulsões, penáltis, VAR) vêm de um segundo pedido, feito quando o resultado muda ou de minuto a minuto.
import { sleep, slug } from "../util.js";
import { matchLeague } from "./results.js";

const BASE = process.env.SOFASCORE_BASE || "https://api.sofascore.com/api/v1";
const LIVE_MS = Math.max(10, Number(process.env.SOFASCORE_SEGUNDOS) || 15) * 1000;
const IDLE_MS = 30e3;
const LANCES_MS = 60e3; // de quanto em quanto tempo se releem os lances de um jogo sem golos novos
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.sofascore.com/",
  "Cache-Control": "no-cache",
};

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw Object.assign(new Error(`Sofascore respondeu ${res.status}`), { status: res.status });
  return res.json();
}

// minuto do jogo a partir da hora a que começou a parte em curso, no formato da ESPN («67'», «45'+2'»)
const INICIO_PARTE = { 6: [0, 45], 7: [45, 45], 41: [90, 15], 42: [105, 15] };
function relogio(ev) {
  const parte = INICIO_PARTE[ev.status?.code];
  const t0 = ev.time?.currentPeriodStartTimestamp;
  if (!parte || !t0) return "";
  const [base, dur] = parte;
  const min = Math.max(0, Math.floor((Date.now() / 1000 - t0) / 60)) + 1;
  return min > dur ? `${base + dur}'+${min - dur}'` : `${base + min}'`;
}

// lances de um jogo, no formato que a ESPN usa (tipo, minuto, jogador, equipa)
function tipoLance(i) {
  const c = String(i.incidentClass || "");
  if (i.incidentType === "goal") return c === "penalty" ? "penalti_marcado" : c === "ownGoal" ? "autogolo" : "golo";
  if (i.incidentType === "card") return c === "red" ? "vermelho" : c === "yellowRed" ? "segundo_amarelo" : null;
  if (i.incidentType === "varDecision") return /goal/i.test(c) && i.confirmed === false ? "anulado" : "var";
  if (i.incidentType === "inGamePenalty") return c === "missed" ? "penalti_falhado" : "penalti";
  return null;
}
function lerLances(incidents = []) {
  const todos = incidents.map((i) => {
    const tipo = tipoLance(i);
    if (!tipo) return null;
    const label = i.time != null ? `${i.time}'${i.addedTime ? `+${i.addedTime}'` : ""}` : "";
    const who = i.player?.shortName || i.player?.name || i.playerName || "";
    return { tipo, label, who, home: !!i.isHome, s: (i.time || 0) * 100 + (i.addedTime || 0), key: `${tipo}|${label}|${who}|${i.isHome ? "h" : "a"}` };
  }).filter(Boolean).sort((a, b) => a.s - b.s);
  const golos = todos.filter((x) => ["golo", "penalti_marcado", "autogolo"].includes(x.tipo));
  const ultGolo = golos[golos.length - 1];
  const ult = todos[todos.length - 1];
  return {
    plays: todos.filter((x) => x.tipo !== "golo").map(({ s, ...x }) => x), // eslint-disable-line no-unused-vars
    ultimo: ult ? { tipo: ult.tipo, label: ult.label, who: ult.who, home: ult.home } : null,
    lastScorer: ultGolo?.who || "",
    lastScorerMinute: ultGolo?.label || "",
    lastScorerHome: ultGolo ? ultGolo.home : null,
  };
}

// um jogo do Sofascore com os mesmos campos que o normalizeEvent da ESPN
function normalizar(ev, lances) {
  const code = ev.status?.code;
  const tipo = ev.status?.type; // notstarted, inprogress, finished, postponed, canceled, interrupted…
  const logo = (t) => (t?.id ? `https://api.sofascore.app/api/v1/team/${t.id}/image` : undefined);
  const ph = ev.homeScore?.penalties, pa = ev.awayScore?.penalties;
  return {
    id: `sofa-${ev.id}`,
    start: ev.startTimestamp ? ev.startTimestamp * 1000 : null,
    home: ev.homeTeam?.shortName || ev.homeTeam?.name || "",
    away: ev.awayTeam?.shortName || ev.awayTeam?.name || "",
    homeTeamId: ev.homeTeam?.id,
    awayTeamId: ev.awayTeam?.id,
    homeLogo: logo(ev.homeTeam),
    awayLogo: logo(ev.awayTeam),
    goals: [],
    hs: Number(ev.homeScore?.current ?? 0),
    as: Number(ev.awayScore?.current ?? 0),
    state: tipo === "inprogress" || tipo === "interrupted" ? "in" : tipo === "finished" || tipo === "canceled" || tipo === "postponed" ? "post" : "pre",
    completed: tipo === "finished",
    ht: code === 31,
    et: [32, 33, 34, 41, 42, 50, 110, 120].includes(code),
    pausa: [32, 33, 34].includes(code),
    pen: [50, 120].includes(code),
    ps: ph != null || pa != null ? { h: Number(ph ?? 0), a: Number(pa ?? 0) } : null,
    clock: relogio(ev),
    plays: [],
    ultimo: null,
    lastScorer: "",
    lastScorerMinute: "",
    lastScorerHome: null,
    ...(lances || {}),
  };
}

// nome da competição e país, para as regras do ligas.json («procurar», «pais», «evitar»)
const paraRegras = (ev) => ({
  leagueId: "",
  leagueName: `${ev.tournament?.uniqueTournament?.name || ""} | ${ev.tournament?.name || ""}`,
  country: ev.tournament?.category?.name || "",
});

export function startSofascore(leagues, { alimentar, log, onBlocked = () => false }) {
  if (!leagues.length) return;
  const lista = leagues.map((l) => ({ ...l, key: slug(l.nome), sport: "soccer" }));
  const jogos = new Map(); // id do Sofascore → { lg, m, lances, lidoEm, falta }

  const lances = async (id, st, mudou) => {
    if (!mudou && st && Date.now() - st.lidoEm < LANCES_MS) return st.lances;
    try {
      const r = await getJson(`/event/${id}/incidents`);
      return lerLances(r.incidents);
    } catch {
      return st?.lances || null; // sem lances: o cartão fica com o resultado e o minuto
    }
  };

  const loop = async () => {
    let first = true;
    let blocked = 0;
    for (;;) {
      let wait = IDLE_MS;
      try {
        const data = await getJson("/sport/football/events/live");
        blocked = 0;
        const vistos = new Set();
        for (const ev of data.events || []) {
          const lg = matchLeague(paraRegras(ev), lista);
          if (!lg || !ev.homeTeam || !ev.awayTeam) continue;
          vistos.add(ev.id);
          const st = jogos.get(ev.id);
          const mudou = !st || st.m.hs !== Number(ev.homeScore?.current ?? 0) || st.m.as !== Number(ev.awayScore?.current ?? 0);
          const l = await lances(ev.id, st, mudou);
          const m = normalizar(ev, l);
          jogos.set(ev.id, { lg, m, lances: l, lidoEm: mudou || !st || Date.now() - st.lidoEm >= LANCES_MS ? Date.now() : st.lidoEm, falta: 0 });
          alimentar(m, lg, first);
          if (m.state === "in") wait = LIVE_MS;
          if (m.state === "post") jogos.delete(ev.id);
        }
        // jogos que saíram da lista dos que estão a decorrer: acabaram (ou foram adiados). A ficha do jogo confirma.
        for (const [id, st] of jogos) {
          if (vistos.has(id)) continue;
          try {
            const r = await getJson(`/event/${id}`);
            const m = normalizar(r.event, await lances(id, st, true));
            if (m.state === "post") { alimentar(m, st.lg); jogos.delete(id); }
          } catch {
            if (++st.falta >= 3) { alimentar({ ...st.m, state: "post", completed: true }, st.lg); jogos.delete(id); }
          }
        }
        if (jogos.size) wait = LIVE_MS;
        first = false;
      } catch (e) {
        if ([401, 403, 429].includes(e.status) && ++blocked >= 3) {
          if (onBlocked(leagues)) {
            log(`[Sofascore] o Sofascore está a recusar os pedidos (${e.status}); estas ligas passam para a GOAL API`);
            return;
          }
          log(`[Sofascore] o Sofascore está a recusar os pedidos (${e.status}); volto a tentar dentro de 5 min`);
          blocked = 0;
          wait = 5 * 60e3;
        } else {
          log(`[Sofascore] ${e.message}`);
          wait = 60e3;
        }
      }
      await sleep(wait);
    }
  };
  log(`[Sofascore] a acompanhar ${lista.length} competição(ões): ${lista.map((l) => l.nome).join(", ")}`);
  loop();
}
