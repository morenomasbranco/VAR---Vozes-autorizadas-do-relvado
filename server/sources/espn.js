// Resultados em direto de futebol e basquetebol a partir dos endereços públicos da ESPN (site.api.espn.com).
// Não é uma API oficial: não precisa de chave nem tem limite diário publicado, mas a ESPN pode mudá-la ou
// bloquear servidores. Se bloquear, estas ligas passam para a GOAL API (se houver chave) e o VAR não insiste.
// Cada liga só é consultada a cada 15 s enquanto tem jogos a decorrer; fora disso, espera pelo próximo jogo.
import { sleep, norm, slug } from "../util.js";

const BASE = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const LIVE_MS = Math.max(10, Number(process.env.ESPN_SEGUNDOS) || 15) * 1000;
const IDLE_MAX = 10 * 60e3;
const NOTHING_TODAY = 30 * 60e3;
const BIG3 = [["benfica", /\bbenfica\b/], ["porto", /\bporto\b/], ["sporting", /^sporting( cp| lisbon| clube de portugal)?$/]];

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw Object.assign(new Error(`ESPN respondeu ${res.status}`), { status: res.status });
  return res.json();
}

export const scoreboardUrl = (lg) => `${BASE}/${lg.espn}/scoreboard`;

export function normalizeEvent(ev) {
  const comp = ev.competitions?.[0] || {};
  const side = (h) => comp.competitors?.find((c) => c.homeAway === h) || {};
  const home = side("home");
  const away = side("away");
  const type = ev.status?.type || {};
  const name = (c) => c.team?.shortDisplayName || c.team?.displayName || c.team?.name || "";
  const goals = (comp.details || []).filter((d) => d.scoringPlay);
  const last = goals[goals.length - 1];
  return {
    id: String(ev.id),
    start: Date.parse(ev.date) || null,
    home: name(home),
    away: name(away),
    homeTeamId: home.team?.id,
    awayTeamId: away.team?.id,
    goals: goals.map((d) => {
      const label = d.clock?.displayValue || "";
      const [a = 0, b = 0] = label.split("+").map((x) => parseInt(x, 10) || 0);
      return { min: a + b, label, home: String(d.team?.id) === String(home.team?.id), scorer: d.athletesInvolved?.[0]?.displayName || "" };
    }),
    hs: Number(home.score ?? 0),
    as: Number(away.score ?? 0),
    state: type.state, // "pre", "in" ou "post"
    completed: !!type.completed,
    ht: /HALFTIME/i.test(type.name || "") || /^half/i.test(type.shortDetail || ""),
    clock: type.shortDetail || ev.status?.displayClock || "",
    lastScorer: last?.athletesInvolved?.[0]?.displayName || "",
    lastScorerMinute: last?.clock?.displayValue || "",
    lastScorerHome: last ? String(last.team?.id) === String(home.team?.id) : null,
  };
}

export function startEspn(leagues, { publish, upsert, remove, log, onBlocked, onFinal = () => {} }) {
  const tracked = new Map(); // estado de cada jogo acompanhado
  const list = leagues.map((l) => ({ ...l, key: slug(l.nome), sport: l.espn.split("/")[0] }));

  const big = (m, lg) => lg.importante || BIG3.some(([, re]) => re.test(norm(m.home)) || re.test(norm(m.away)));
  const cats = (m, lg) => {
    const out = lg.seccao ? [lg.seccao] : [];
    if (!lg.seccao || lg.seccao === "modalidades") {
      for (const [c, re] of BIG3) if (re.test(norm(m.home)) || re.test(norm(m.away))) out.push(c);
    }
    return [...new Set(out)];
  };
  const minute = (m, lg) => (lg.sport === "soccer" ? (m.clock.match(/^\d+(\+\d+)?'/)?.[0] || null) : m.clock || null);
  const score = (m, lg, ft = false) => ({ comp: lg.nome, h: m.home, a: m.away, hs: m.hs, as: m.as, min: ft ? null : minute(m, lg), ft });
  const base = (m, lg) => ({ src: "resultados", name: "Resultados em direto", orig: "multi", liga: lg.key, paisTema: lg.bandeira, cats: cats(m, lg) });
  const sc = (m) => `${m.home} ${m.hs}–${m.as} ${m.away}`;

  // um cartão por jogo que se vai atualizando enquanto o jogo decorre
  const liveCard = (m, lg) => upsert({
    ...base(m, lg),
    id: `r:espn:${m.id}:live`,
    ts: Date.now(),
    t: { pt: `Em direto: ${sc(m)}`, en: `Live: ${sc(m)}` },
    b: { pt: [lg.nome], en: [lg.nome_en || lg.nome] },
    imp: 1,
    score: score(m, lg),
  });

  const news = (kind, m, lg) => {
    const isBig = big(m, lg);
    const top = isBig || lg.seccao === "big5" || /campe|europa|confer/i.test(lg.nome);
    const b = { pt: [lg.nome], en: [lg.nome_en || lg.nome] };
    let t;
    let imp;
    if (kind === "inicio") { t = [`Começou o ==${m.home}==–==${m.away}==`, `Kick-off: ==${m.home}== v ==${m.away}==`]; imp = isBig ? 3 : 2; }
    if (kind === "intervalo") { t = [`Intervalo: ${sc(m)}`, `Half-time: ${sc(m)}`]; imp = 2; }
    if (kind === "anulado") { t = [`Golo anulado no ${m.home}–${m.away}: ${m.hs}–${m.as}`, `Goal ruled out in ${m.home} v ${m.away}: ${m.hs}–${m.as}`]; imp = isBig ? 3 : 2; }
    if (kind === "final") { t = [`Final: ==${m.home}== ${m.hs}–${m.as} ==${m.away}==`, `Full time: ==${m.home}== ${m.hs}–${m.as} ==${m.away}==`]; imp = isBig ? 5 : top ? 3 : 2; }
    if (kind === "golo") {
      const team = m.lastScorerHome === false ? m.away : m.home;
      t = [`Golo do ==${team}==! ${sc(m)}`, `Goal for ==${team}==! ${sc(m)}`];
      imp = isBig ? 4 : top ? 3 : 2;
      if (m.lastScorer) {
        b.pt.unshift(`Golo de ==${m.lastScorer}==${m.lastScorerMinute ? ` aos ${m.lastScorerMinute}` : ""}`);
        b.en.unshift(`Scored by ==${m.lastScorer}==${m.lastScorerMinute ? ` (${m.lastScorerMinute})` : ""}`);
      }
    }
    publish({ ...base(m, lg), id: `r:espn:${m.id}:${kind}:${m.hs}-${m.as}`, ts: Date.now(), t: { pt: t[0], en: t[1] }, b, imp, score: score(m, lg, kind === "final") });
  };

  const handle = (m, lg, first) => {
    const prev = tracked.get(m.id);
    if (m.state === "pre") return;
    const diff = m.hs - m.as;
    m.minDiff = Math.min(prev?.minDiff ?? 0, diff); // maior desvantagem da equipa da casa
    m.maxDiff = Math.max(prev?.maxDiff ?? 0, diff); // maior desvantagem da equipa de fora
    if (!prev) {
      if (m.state === "post") return; // jogos já terminados antes de o servidor arrancar
      tracked.set(m.id, m);
      if (!first && m.hs + m.as === 0) news("inicio", m, lg);
      liveCard(m, lg);
      return;
    }
    if (m.state === "post") {
      if (m.completed) {
        news("final", m, lg);
        Promise.resolve(onFinal(lg, m, m)).catch((e) => log(`[Histórias] ${e.message}`));
      }
      remove(`r:espn:${m.id}:live`);
      tracked.delete(m.id);
      return;
    }
    const scored = m.hs > prev.hs || m.as > prev.as;
    // no basquetebol não há notícia por cesto: o cartão em direto vai mostrando o resultado
    if (lg.sport === "soccer" && scored) news("golo", m, lg);
    if (lg.sport === "soccer" && (m.hs < prev.hs || m.as < prev.as)) news("anulado", m, lg);
    if (m.ht && !prev.ht) news("intervalo", m, lg);
    if (m.hs !== prev.hs || m.as !== prev.as || m.clock !== prev.clock) liveCard(m, lg);
    tracked.set(m.id, m);
  };

  const loop = async (lg) => {
    let first = true;
    let blocked = 0;
    for (;;) {
      let wait = NOTHING_TODAY;
      try {
        const data = await getJson(scoreboardUrl(lg));
        blocked = 0;
        let live = false;
        let next = null;
        for (const ev of data.events || []) {
          const m = normalizeEvent(ev);
          if (!m.home || !m.away) continue;
          if (lg.so && !lg.so.some((t) => norm(m.home) === norm(t) || norm(m.away) === norm(t))) continue;
          handle(m, lg, first);
          if (m.state === "in") live = true;
          if (m.state === "pre" && m.start && m.start > Date.now()) next = Math.min(next ?? Infinity, m.start);
        }
        first = false;
        if (live) wait = LIVE_MS;
        else if (next) wait = Math.min(IDLE_MAX, Math.max(LIVE_MS, next - Date.now() - 60e3));
      } catch (e) {
        if ([401, 403, 429].includes(e.status) && ++blocked >= 3) {
          log(`[ESPN] ${lg.nome}: a ESPN está a recusar os pedidos (${e.status}); esta liga passa para a GOAL API`);
          onBlocked(lg);
          return;
        }
        log(`[ESPN] ${lg.nome}: ${e.message}`);
        wait = 60e3;
      }
      await sleep(wait);
    }
  };

  list.forEach((lg, i) => setTimeout(() => loop(lg), i * 500)); // arranque espaçado, sem rajadas
  log(`[ESPN] a acompanhar ${list.length} liga(s) de futebol e basquetebol`);
  return list;
}
