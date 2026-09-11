// Resultados em direto (GOAL API, plano gratuito): golos, início, intervalo e final dos jogos das ligas escolhidas,
// publicados como notícias. O plano gratuito tem 1.000 pedidos por dia. O servidor lê o calendário do dia, só
// consulta a API enquanto há jogos das ligas escolhidas a decorrer e reparte os pedidos por esse tempo.
import { sleep, norm, slug } from "../util.js";

const BASE = process.env.GOAL_API_BASE || "https://api.goal-api.com/v1";
const LIVE_MIN = Number(process.env.RESULTADOS_SEGUNDOS) || 20;
const IDLE_MIN = 120;
const AVOID = ["women", "feminin", "female", "femenin", "u17", "u18", "u19", "u20", "u21", "u23", "youth", "reserve", "amateur"];
const BIG3 = [/\bbenfica\b/, /\bporto\b/, /\bsporting( cp| lisbon| clube de portugal)?$/];

const pick = (o, paths) => {
  for (const p of paths) {
    const v = p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
    if (v !== undefined && v !== null && v !== "") return v;
  }
};

// a GOAL API não documenta todos os nomes de campos; aceita as variantes mais comuns
export function normalizeMatch(m) {
  const status = String(pick(m, ["status.short", "status.code", "status", "matchStatus", "match_status", "state"]) ?? "");
  const minute = pick(m, ["minute", "elapsed", "status.elapsed", "liveMinute", "match_live_minute", "time"]);
  const goals = pick(m, ["goalscorer", "goals", "events.goals"]);
  return {
    id: String(pick(m, ["id", "matchId", "match_id", "fixtureId", "fixture.id"]) ?? ""),
    home: String(pick(m, ["homeTeam.name", "home.name", "teams.home.name", "homeTeamName", "match_hometeam_name", "homeTeam", "home_team"]) ?? ""),
    away: String(pick(m, ["awayTeam.name", "away.name", "teams.away.name", "awayTeamName", "match_awayteam_name", "awayTeam", "away_team"]) ?? ""),
    hs: Number(pick(m, ["score.home", "goals.home", "homeScore", "scores.home", "match_hometeam_score", "homeTeam.score", "home_score"]) ?? 0),
    as: Number(pick(m, ["score.away", "goals.away", "awayScore", "scores.away", "match_awayteam_score", "awayTeam.score", "away_score"]) ?? 0),
    status,
    minute: minute != null && /^\d/.test(String(minute)) ? `${String(minute).replace(/'$/, "")}'` : null,
    leagueId: String(pick(m, ["league.id", "leagueId", "league_id", "competition.id"]) ?? ""),
    leagueName: String(pick(m, ["league.name", "leagueName", "league_name", "competition.name"]) ?? ""),
    country: String(pick(m, ["league.country", "league.countryName", "country.name", "countryName", "country_name", "competition.area.name"]) ?? ""),
    lastScorer: Array.isArray(goals) && goals.length ? String(pick(goals[goals.length - 1], ["home_scorer", "away_scorer", "player.name", "player", "scorer", "name"]) ?? "") : "",
    ft: /^(ft|aet|pen|finished|ended|after|full)/i.test(status),
    ht: /^(ht|half)/i.test(status),
    ns: /^(ns|not|sched|tbd|postp|canc)/i.test(status),
    kickoff: Date.parse(pick(m, ["kickoffUtc", "kickoff", "utcDate", "fixture.date", "date"]) ?? "") || null,
  };
}

export function matchLeague(m, leagues) {
  const name = norm(m.leagueName);
  const country = norm(m.country);
  for (const lg of leagues) {
    if (lg.id != null) { if (String(lg.id) === m.leagueId) return lg; continue; }
    if (AVOID.some((w) => name.includes(w))) continue;
    if (!lg.procurar.some((t) => name.includes(norm(t)))) continue;
    if (lg.pais && !country.includes(norm(lg.pais))) continue;
    if (lg.evitar?.some((w) => name.includes(norm(w)))) continue;
    return lg;
  }
  return null;
}

async function call(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${process.env.GOAL_API_KEY}` } });
  const body = await res.json().catch(() => ({}));
  const quota = { remaining: Number(res.headers.get("x-ratelimit-remaining")), reset: Number(res.headers.get("x-ratelimit-reset")) };
  if (!res.ok || body.success === false) {
    const err = new Error(`GOAL API ${res.status}: ${JSON.stringify(body.error || body).slice(0, 200)}`);
    err.status = res.status;
    err.quota = quota;
    throw err;
  }
  return { body, quota };
}

// jogos de um dia (UTC), para saber a que horas há jogos das ligas escolhidas
export async function fetchDay(date) {
  const all = [];
  let quota = {};
  for (let offset = 0, page = 0; page < 10; page++, offset += 200) {
    const r = await call(`/fixtures/date/${date}?limit=200&offset=${offset}`);
    quota = r.quota;
    const data = r.body.data;
    all.push(...(Array.isArray(data) ? data : data?.fixtures || data?.matches || []));
    if (!r.body.pagination?.hasMore) break;
  }
  return { raw: all, quota };
}

export async function fetchLive() {
  const all = [];
  let quota = {};
  for (let offset = 0, page = 0; page < 3; page++, offset += 200) {
    const r = await call(`/fixtures/live?limit=200&offset=${offset}`);
    quota = r.quota;
    const data = r.body.data;
    all.push(...(Array.isArray(data) ? data : data?.fixtures || data?.matches || []));
    if (!r.body.pagination?.hasMore) break;
  }
  return { raw: all, quota };
}

export function startResults(leagues, publish, log) {
  if (!process.env.GOAL_API_KEY) { log("[Resultados] sem GOAL_API_KEY no .env; resultados em direto desligados"); return; }
  leagues = leagues.map((l) => ({ ...l, key: slug(l.nome) }));
  const state = new Map(); // estado de cada jogo acompanhado
  let quota = {};
  let first = true;
  let warned = false;

  const isBig3 = (m) => BIG3.some((re) => re.test(norm(m.home)) || re.test(norm(m.away)));
  const cats = (m, lg) => {
    const out = lg.seccao ? [lg.seccao] : [];
    if (!lg.seccao) for (const [c, re] of [["benfica", BIG3[0]], ["porto", BIG3[1]], ["sporting", BIG3[2]]]) {
      if (re.test(norm(m.home)) || re.test(norm(m.away))) out.push(c);
    }
    return out;
  };

  const emit = (kind, m, lg, extra = {}) => {
    const big = isBig3(m);
    const top = big || lg.seccao === "big5" || /campe|europa|confer/i.test(lg.nome);
    const sc = `${m.home} ${m.hs}–${m.as} ${m.away}`;
    const T = {
      inicio: [`Começou o ==${m.home}==–==${m.away}==`, `Kick-off: ==${m.home}== v ==${m.away}==`, big ? 3 : 2],
      golo: [`Golo do ==${extra.side === "h" ? m.home : m.away}==! ${sc}`, `Goal for ==${extra.side === "h" ? m.home : m.away}==! ${sc}`, big ? 4 : top ? 3 : 2],
      anulado: [`Golo anulado no ${m.home}–${m.away}: ${m.hs}–${m.as}`, `Goal ruled out in ${m.home} v ${m.away}: ${m.hs}–${m.as}`, big ? 3 : 2],
      intervalo: [`Intervalo: ${sc}`, `Half-time: ${sc}`, 2],
      final: [`Final: ==${m.home}== ${m.hs}–${m.as} ==${m.away}==`, `Full time: ==${m.home}== ${m.hs}–${m.as} ==${m.away}==`, big ? 5 : top ? 3 : 2],
      direto: [`Em direto: ${sc}`, `Live: ${sc}`, 1],
    }[kind];
    const bullets = { pt: [lg.nome], en: [lg.nome] };
    if (kind === "golo" && m.lastScorer) { bullets.pt.unshift(`Golo de ==${m.lastScorer}==${m.minute ? ` aos ${m.minute}` : ""}`); bullets.en.unshift(`Scored by ==${m.lastScorer}==${m.minute ? ` (${m.minute})` : ""}`); }
    else if (kind === "golo" && m.minute) { bullets.pt.unshift(`Aos ${m.minute}`); bullets.en.unshift(`On ${m.minute}`); }
    publish({
      id: `r:${m.id}:${kind}:${m.hs}-${m.as}`,
      src: "resultados",
      name: "Resultados em direto",
      ts: Date.now(),
      orig: "multi",
      cats: cats(m, lg),
      liga: lg.key,
      t: { pt: T[0], en: T[1] },
      b: bullets,
      imp: T[2],
      score: { comp: lg.nome, h: m.home, a: m.away, hs: m.hs, as: m.as, min: m.minute, ft: kind === "final" },
    });
  };

  // janelas de jogo do dia: do apito inicial até ~2 h depois, juntando as que se sobrepõem
  let windows = null;
  let scheduleDay = "";
  const loadSchedule = async () => {
    const day = new Date().toISOString().slice(0, 10);
    if (scheduleDay === day && windows) return;
    try {
      const next = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
      const kicks = [];
      for (const d of [day, next]) {
        const r = await fetchDay(d);
        quota = r.quota;
        for (const raw of r.raw) {
          const m = normalizeMatch(raw);
          if (m.kickoff && matchLeague(m, leagues)) kicks.push(m.kickoff);
        }
      }
      kicks.sort((a, b) => a - b);
      windows = [];
      for (const k of kicks) {
        const [a, b] = [k - 2 * 60e3, k + 125 * 60e3];
        const last = windows[windows.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else windows.push([a, b]);
      }
      scheduleDay = day;
      log(`[Resultados] calendário: ${kicks.length} jogo(s) das tuas ligas hoje e amanhã`);
    } catch (e) {
      windows = null; // sem calendário, verifica a cada 5 min fora dos jogos
      log(`[Resultados] não consegui ler o calendário: ${e.message}`);
    }
  };
  const inWindow = (t) => windows?.some(([a, b]) => t >= a && t <= b);
  const nextStart = (t) => windows?.find(([a]) => a > t)?.[0] ?? null;

  const delay = (live) => {
    const now = Date.now();
    const resetMs = Number.isFinite(quota.reset) && quota.reset > 0 ? (quota.reset > 1e12 ? quota.reset : quota.reset * 1000) : now + 86400e3;
    const remaining = Number.isFinite(quota.remaining) ? quota.remaining : 500;
    if (remaining <= 20) return Math.max(60, (resetMs - now) / 1000); // guarda uma reserva e espera pelo novo dia
    if (live || inWindow(now)) {
      // tempo de jogo que falta até ao fim do dia de faturação, repartido pelos pedidos disponíveis
      const liveLeft = windows ? windows.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, resetMs) - Math.max(a, now)), 0) / 1000 : 4 * 3600;
      return Math.max(LIVE_MIN, Math.max(liveLeft, 600) / (remaining - 20));
    }
    const nxt = nextStart(now);
    if (windows && nxt) return Math.min(1800, Math.max(IDLE_MIN, (nxt - now) / 1000)); // dorme até ao próximo jogo
    return windows ? 1800 : 300;
  };

  const tick = async () => {
    let live = false;
    await loadSchedule();
    const now0 = Date.now();
    if (windows && !inWindow(now0) && ![...state.values()].some((st) => !st.m.ft)) {
      // fora das janelas de jogo e sem jogos por acabar: não gasta pedidos
      await sleep(delay(false) * 1000);
      return tick();
    }
    try {
      const r = await fetchLive();
      quota = r.quota;
      const now = new Set();
      for (const raw of r.raw) {
        const m = normalizeMatch(raw);
        if (!m.id || !m.home || !m.away) {
          if (!warned) { warned = true; log(`[Resultados] formato inesperado; exemplo: ${JSON.stringify(raw).slice(0, 400)}`); }
          continue;
        }
        const lg = matchLeague(m, leagues);
        if (!lg || m.ns) continue;
        now.add(m.id);
        if (!m.ft) live = true;
        const prev = state.get(m.id);
        if (!prev) {
          state.set(m.id, { m, lg, missing: 0 });
          if (first) { if (!m.ft) emit("direto", m, lg); } // no arranque, mostra o estado atual sem inventar golos
          else if (m.ft) emit("final", m, lg);
          else if (m.hs + m.as === 0) emit("inicio", m, lg);
          else emit("direto", m, lg);
          continue;
        }
        const p = prev.m;
        if (m.hs > p.hs) emit("golo", m, lg, { side: "h" });
        if (m.as > p.as) emit("golo", m, lg, { side: "a" });
        if (m.hs < p.hs || m.as < p.as) emit("anulado", m, lg);
        if (m.ht && !p.ht) emit("intervalo", m, lg);
        if (m.ft && !p.ft) emit("final", m, lg);
        state.set(m.id, { m, lg, missing: 0 });
      }
      // um jogo que sai da lista de jogos em direto duas vezes seguidas terminou
      for (const [id, st] of state) {
        if (now.has(id)) continue;
        if (++st.missing >= 2) { if (!st.m.ft) emit("final", { ...st.m, ft: true }, st.lg); state.delete(id); }
      }
      first = false;
    } catch (e) {
      if (e.quota) quota = e.quota;
      log(`[Resultados] ${e.message}`);
    }
    await sleep(delay(live) * 1000);
    tick();
  };
  log(`[Resultados] a acompanhar ${leagues.length} liga(s)`);
  tick();
}
