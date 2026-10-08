// Competições portuguesas no Sofascore (futebol e futsal): calendário por jornada, classificações e jogos em
// direto com minuto e marcadores. Serve as competições da Liga Portugal (que não estão no resultados.fpf.pt) e dá
// o minuto ao segundo dos jogos nacionais que o Sofascore acompanha. Os endereços são os que o próprio site usa:
// sem chave e sem custo, mas não oficiais (se o Sofascore os recusar, fica-se pela FPF e pelos stories).
import { sleep, norm } from "../util.js";
import { buscar } from "../ponte.js";

const BASE = process.env.SOFASCORE_BASE || "https://api.sofascore.com/api/v1";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.sofascore.com/",
  "Cache-Control": "no-cache",
};
export const estado = { pedidos: 0, erros: 0, ultimoErro: null, bloqueadoAte: 0, categorias: {} };

let ultimo = 0;
export async function getJson(path) {
  if (Date.now() < estado.bloqueadoAte) throw Object.assign(new Error("Sofascore em pausa (recusou pedidos)"), { status: 429 });
  const espera = ultimo + 400 - Date.now();
  if (espera > 0) await sleep(espera);
  ultimo = Date.now();
  estado.pedidos++;
  const res = await buscar(`${BASE}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(15000) }).catch((e) => { throw Object.assign(e, { status: 0 }); });
  if (!res.ok) {
    estado.erros++;
    estado.ultimoErro = { path, status: res.status, ts: Date.now() };
    if ([401, 403, 429].includes(res.status)) estado.bloqueadoAte = Date.now() + 10 * 60e3;
    throw Object.assign(new Error(`Sofascore respondeu ${res.status}`), { status: res.status });
  }
  return res.json();
}

// id da categoria «Portugal» em cada desporto
export async function categoriaPortugal(sport) {
  if (estado.categorias[sport]) return estado.categorias[sport];
  const r = await getJson(`/sport/${sport}/categories`);
  const c = (r.categories || []).find((x) => x.alpha2 === "PT" || norm(x.name) === "portugal");
  if (c) estado.categorias[sport] = c.id;
  return c?.id || null;
}

export async function torneios(sport) {
  const cat = await categoriaPortugal(sport);
  if (!cat) return [];
  const r = await getJson(`/category/${cat}/unique-tournaments`);
  const lista = [...(r.groups || []).flatMap((g) => g.uniqueTournaments || []), ...(r.uniqueTournaments || [])];
  const vistos = new Set();
  return lista.filter((t) => !vistos.has(t.id) && vistos.add(t.id)).map((t) => ({ id: t.id, nome: t.name, slug: t.slug, sport }));
}

export async function epocaAtual(ut) {
  const r = await getJson(`/unique-tournament/${ut}/seasons`);
  return r.seasons?.[0] || null;
}

export async function jornadas(ut, season) {
  try {
    const r = await getJson(`/unique-tournament/${ut}/season/${season}/rounds`);
    return { atual: r.currentRound?.round ?? null, lista: (r.rounds || []).map((x) => ({ n: x.round, nome: x.name || x.slug || null })) };
  } catch (e) {
    if (e.status === 404) return { atual: null, lista: [] };
    throw e;
  }
}

export async function jogosDaJornada(ut, season, n) {
  const r = await getJson(`/unique-tournament/${ut}/season/${season}/events/round/${n}`);
  return (r.events || []).map(normalizar);
}

export async function classificacoes(ut, season) {
  try {
    const r = await getJson(`/unique-tournament/${ut}/season/${season}/standings/total`);
    return (r.standings || []).map((s) => ({
      nome: s.name || s.tournament?.name || "",
      linhas: (s.rows || []).map((x) => ({ pos: x.position, equipa: x.team?.shortName || x.team?.name, j: x.matches, v: x.wins, e: x.draws, d: x.losses, gm: x.scoresFor, gs: x.scoresAgainst, dg: (x.scoresFor ?? 0) - (x.scoresAgainst ?? 0), pts: x.points })),
    }));
  } catch (e) {
    if (e.status === 404) return [];
    throw e;
  }
}

export async function aoVivo(sport) {
  const cat = await categoriaPortugal(sport);
  const r = await getJson(`/sport/${sport}/events/live`);
  return (r.events || []).filter((e) => !cat || e.tournament?.category?.id === cat).map(normalizar);
}

export async function lances(eventId) {
  try {
    const r = await getJson(`/event/${eventId}/incidents`);
    return (r.incidents || []).filter((i) => i.incidentType === "goal").map((i) => ({
      lado: i.isHome ? "h" : "a", min: i.time ?? null, extra: i.addedTime || 0, marcador: i.player?.shortName || i.player?.name || null,
      penalti: i.incidentClass === "penalty" || undefined, autogolo: i.incidentClass === "ownGoal" || undefined,
    })).sort((a, b) => (a.min ?? 0) * 100 + a.extra - ((b.min ?? 0) * 100 + b.extra));
  } catch { return null; }
}

// minuto atual a partir da hora a que começou a parte em curso
const PARTES = { 6: [0, 45], 7: [45, 45], 41: [90, 15], 42: [105, 15] };
function relogio(ev) {
  const p = PARTES[ev.status?.code];
  const t0 = ev.time?.currentPeriodStartTimestamp;
  if (!p || !t0) return null;
  const m = Math.max(0, Math.floor((Date.now() / 1000 - t0) / 60)) + 1;
  return m > p[1] ? { min: p[0] + p[1], extra: m - p[1] } : { min: p[0] + m, extra: 0 };
}

export function normalizar(ev) {
  const tipo = ev.status?.type;
  const code = ev.status?.code;
  const estadoJogo = tipo === "inprogress" ? (code === 31 ? "intervalo" : "direto")
    : tipo === "finished" ? "final"
      : tipo === "postponed" ? "adiado"
        : tipo === "canceled" ? "cancelado"
          : tipo === "interrupted" || tipo === "suspended" ? "suspenso"
            : "agendado";
  return {
    sofaId: ev.id,
    ut: ev.tournament?.uniqueTournament?.id,
    torneio: ev.tournament?.uniqueTournament?.name || ev.tournament?.name,
    grupo: ev.tournament?.name,
    jornada: ev.roundInfo?.round ?? null,
    casa: ev.homeTeam?.shortName || ev.homeTeam?.name,
    fora: ev.awayTeam?.shortName || ev.awayTeam?.name,
    casaId: ev.homeTeam?.id, foraId: ev.awayTeam?.id,
    logoCasa: ev.homeTeam?.id ? `https://api.sofascore.app/api/v1/team/${ev.homeTeam.id}/image` : null,
    logoFora: ev.awayTeam?.id ? `https://api.sofascore.app/api/v1/team/${ev.awayTeam.id}/image` : null,
    inicio: ev.startTimestamp ? ev.startTimestamp * 1000 : null,
    estado: estadoJogo,
    hs: ev.homeScore?.current ?? null,
    as: ev.awayScore?.current ?? null,
    relogio: estadoJogo === "direto" ? relogio(ev) : null,
  };
}
