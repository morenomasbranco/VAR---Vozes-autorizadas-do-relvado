// Resultados em direto de futebol e basquetebol a partir dos endereços públicos da ESPN (site.api.espn.com).
// Não é uma API oficial: não precisa de chave nem tem limite diário publicado, mas a ESPN pode mudá-la ou
// bloquear servidores. Se bloquear, estas ligas passam para a GOAL API (se houver chave) e o VAR não insiste.
// Cada liga só é consultada a cada 15 s enquanto tem jogos a decorrer; fora disso, espera pelo próximo jogo.
import { sleep, norm, slug } from "../util.js";

const BASE = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const LIVE_MS = Math.max(3, Number(process.env.ESPN_SEGUNDOS) || 5) * 1000; // ritmo dos jogos a decorrer
const IDLE_MAX = 10 * 60e3;
const NOTHING_TODAY = 30 * 60e3;
// lances do jogo que dão notícia além dos golos: expulsões, penáltis e decisões do VAR
const LANCES = [
  ["segundo_amarelo", /second yellow|yellow ?red|duplo amarelo|segundo amarelo/i],
  ["vermelho", /red card|cart[aã]o vermelho|expuls/i],
  ["var", /\bvar\b|video (assistant )?referee|video review|revis[aã]o de v[ií]deo/i],
  ["anulado", /disallow|goal cancell|anulad|ruled out|chalked off/i],
  ["penalti_falhado", /penalty\b[^a-z]*(missed|saved|blocked)|penalty miss|pen[aá]lti (falhado|defendido)/i],
  ["penalti_marcado", /penalty\b[^a-z]*(scored|converted|goal)/i],
  ["penalti", /penalty\b[^a-z]*(awarded|won|conceded|given)|penalty kick|pen[aá]lti/i],
  ["autogolo", /own goal|autogolo/i],
];
const tipoLance = (texto) => LANCES.find(([, re]) => re.test(texto))?.[0] || null;

const BIG3 = [["benfica", /\bbenfica\b/], ["porto", /\bporto\b/], ["sporting", /^sporting( cp| lisbon| clube de portugal)?$/]];

// a ESPN serve o scoreboard por uma CDN que guarda a resposta durante minutos: um golo aos 70' chegava aos 74'.
// Um parâmetro diferente em cada pedido e os cabeçalhos no-cache obrigam a CDN a ir buscar a versão atual.
async function getJson(url) {
  const fresco = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const res = await fetch(fresco, { headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache" } });
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
  // último acontecimento relevante do jogo (golo, expulsão, penálti, VAR, golo anulado), para mostrar ao lado do minuto
  const relevantes = (comp.details || []).map((d) => {
    const tipo = tipoLance(`${d.type?.text || ""} ${d.type?.abbreviation || ""}`) || (d.scoringPlay ? "golo" : null);
    if (!tipo) return null;
    return { tipo, label: d.clock?.displayValue || "", who: d.athletesInvolved?.[0]?.displayName || "", home: String(d.team?.id) === String(home.team?.id), s: d.clock?.value ?? 0 };
  }).filter(Boolean).sort((a, b) => a.s - b.s);
  const ultimo = relevantes[relevantes.length - 1];
  return {
    id: String(ev.id),
    start: Date.parse(ev.date) || null,
    home: name(home),
    away: name(away),
    homeTeamId: home.team?.id,
    homeLogo: home.team?.logo || home.team?.logos?.[0]?.href,
    awayLogo: away.team?.logo || away.team?.logos?.[0]?.href,
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
    ht: /^STATUS_HALFTIME$/i.test(type.name || "") || /^(half|ht$)/i.test(type.shortDetail || ""),
    // prolongamento (3.º e 4.º períodos), pausa antes do prolongamento ou ao intervalo dele, e penáltis
    et: (ev.status?.period || 0) >= 3 || /EXTRA|OVERTIME|_ET\b|AET/i.test(type.name || "") || /\bET\b|extra|a\.?e\.?t|prol/i.test(type.shortDetail || ""),
    pausa: /END_OF_REGULATION|HALFTIME_ET|END_OF_EXTRA|END_EXTRA|BREAK/i.test(type.name || "") || /^(end of (reg|90)|ht et|et ht)/i.test(type.shortDetail || ""),
    pen: (ev.status?.period || 0) >= 5 || /SHOOTOUT|PENALT/i.test(type.name || "") || /pens|pen\.|shootout|penalt/i.test(type.shortDetail || ""),
    ps: home.shootoutScore != null || away.shootoutScore != null ? { h: Number(home.shootoutScore ?? 0), a: Number(away.shootoutScore ?? 0) } : null,
    clock: type.shortDetail || ev.status?.displayClock || "",
    ultimo: ultimo ? { tipo: ultimo.tipo, label: ultimo.label, who: ultimo.who, home: ultimo.home } : null,
    lastScorer: last?.athletesInvolved?.[0]?.displayName || "",
    lastScorerMinute: last?.clock?.displayValue || "",
    lastScorerHome: last ? String(last.team?.id) === String(home.team?.id) : null,
    // todos os lances relevantes que a ESPN dá, para comparar de leitura em leitura
    plays: (comp.details || []).map((d) => {
      const texto = `${d.type?.text || ""} ${d.type?.abbreviation || ""}`;
      const tipo = tipoLance(texto);
      if (!tipo) return null;
      const label = d.clock?.displayValue || "";
      return {
        tipo,
        label,
        who: d.athletesInvolved?.[0]?.displayName || "",
        home: String(d.team?.id) === String(home.team?.id),
        key: `${tipo}|${label}|${d.athletesInvolved?.[0]?.id || d.athletesInvolved?.[0]?.displayName || ""}|${d.team?.id || ""}`,
      };
    }).filter(Boolean),
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
  // a ESPN escreve o minuto como «67'», «45'+2'» ou «90+4'»; ao intervalo não há minuto
  const minute = (m, lg) => {
    if (lg.sport !== "soccer") return m.clock || null;
    if (m.pen || m.pausa) return null;
    const x = String(m.clock || "").match(/(\d{1,3})'?\s*(\+\s*\d+)?'/) || String(m.clock || "").match(/^(\d{1,3})\s*(\+\s*\d+)?/);
    return x ? `${x[1]}${(x[2] || "").replace(/\s/g, "")}'` : null;
  };
  const score = (m, lg, ft = false) => ({ comp: lg.nome, h: m.home, a: m.away, hs: m.hs, as: m.as, min: ft ? null : minute(m, lg), ft, ht: !ft && !!m.ht,
    ...(lg.sport === "soccer" ? { et: !!m.et, pausa: !ft && !!m.pausa, pen: !!m.pen, ps: m.ps || null } : {}),
    ult: m.ultimo ? { ...m.ultimo, equipa: m.ultimo.home ? m.home : m.away } : null });
  const base = (m, lg) => ({ src: "resultados", name: "Resultados em direto", orig: "multi", liga: lg.key, paisTema: lg.bandeira, mod: lg.mod, cats: cats(m, lg),
    equipas: [{ nome: m.home, papel: "envolvido", logo: m.homeLogo }, { nome: m.away, papel: "envolvido", logo: m.awayLogo }] });
  const sc = (m) => `${m.home} ${m.hs}–${m.as} ${m.away}`;

  // um cartão por jogo que se vai atualizando enquanto o jogo decorre
  const liveCard = (m, lg) => upsert({
    ...base(m, lg),
    id: `r:espn:${m.id}:live`,
    board: true, // só aparece no quadro de resultados
    ts: Date.now(),
    t: { pt: `Em direto: ${sc(m)}`, en: `Live: ${sc(m)}` },
    b: { pt: [lg.nome], en: [lg.nome_en || lg.nome] },
    imp: 1,
    score: score(m, lg),
  });

  // notícia de um lance: expulsão, penálti, golo anulado, autogolo ou revisão do VAR
  const playNews = (p, m, lg) => {
    const equipa = p.home ? m.home : m.away;
    const isBig = big(m, lg);
    const quando = p.label ? ` aos ${p.label}` : "";
    const whenEn = p.label ? ` (${p.label})` : "";
    const quem = p.who ? `==${p.who}== (${equipa})` : `==${equipa}==`;
    const whoEn = p.who ? `==${p.who}== (${equipa})` : `==${equipa}==`;
    const T = {
      vermelho: [`Cartão vermelho para ${quem}${quando}`, `Red card for ${whoEn}${whenEn}`, isBig ? 4 : 3],
      segundo_amarelo: [`Segundo amarelo e expulsão de ${quem}${quando}`, `Second yellow and red for ${whoEn}${whenEn}`, isBig ? 4 : 3],
      var: [`Lance revisto pelo VAR no ==${m.home}==–==${m.away}==${quando}`, `VAR review in ==${m.home}== v ==${m.away}==${whenEn}`, isBig ? 4 : 3],
      anulado: [`Golo anulado ao ==${equipa}==${quando}`, `Goal ruled out for ==${equipa}==${whenEn}`, isBig ? 4 : 3],
      penalti: [`Penálti para o ==${equipa}==${quando}`, `Penalty for ==${equipa}==${whenEn}`, isBig ? 4 : 3],
      penalti_falhado: [`Penálti falhado por ${quem}${quando}`, `Penalty missed by ${whoEn}${whenEn}`, isBig ? 4 : 3],
      penalti_marcado: [`Golo de penálti de ${quem}${quando}: ${sc(m)}`, `Penalty scored by ${whoEn}${whenEn}: ${sc(m)}`, isBig ? 4 : 3],
      autogolo: [`Autogolo no ==${m.home}==–==${m.away}==${quando}: ${sc(m)}`, `Own goal in ==${m.home}== v ==${m.away}==${whenEn}: ${sc(m)}`, isBig ? 4 : 3],
    }[p.tipo];
    if (!T) return;
    publish({
      ...base(m, lg),
      id: `r:espn:${m.id}:${p.key}`,
      ts: Date.now(),
      t: { pt: T[0], en: T[1] },
      b: { pt: [sc(m), lg.nome], en: [sc(m), lg.nome_en || lg.nome] },
      imp: T[2],
      score: score(m, lg),
    });
  };

  const news = (kind, m, lg) => {
    const isBig = big(m, lg);
    const top = isBig || lg.seccao === "big5" || /campe|europa|confer/i.test(lg.nome);
    const b = { pt: [lg.nome], en: [lg.nome_en || lg.nome] };
    let t;
    let imp;
    if (kind === "inicio") { t = [`Começou o ==${m.home}==–==${m.away}==`, `Kick-off: ==${m.home}== v ==${m.away}==`]; imp = isBig ? 3 : 2; }
    if (kind === "intervalo") { t = [`Intervalo: ${sc(m)}`, `Half-time: ${sc(m)}`]; imp = 2; }
    if (kind === "prolongamento") { t = [`Vai a prolongamento: ${sc(m)}`, `Extra time: ${sc(m)}`]; imp = isBig ? 4 : 3; }
    if (kind === "penaltis") { t = [`Decisão por penáltis: ${sc(m)}`, `Penalty shoot-out: ${sc(m)}`]; imp = isBig ? 4 : 3; }
    if (kind === "anulado") { t = [`Golo anulado no ${m.home}–${m.away}: ${m.hs}–${m.as}`, `Goal ruled out in ${m.home} v ${m.away}: ${m.hs}–${m.as}`]; imp = isBig ? 3 : 2; }
    if (kind === "final") {
      const extra = lg.sport !== "soccer" ? ["", ""] : m.ps ? [` (${m.ps.h}–${m.ps.a} g.p.)`, ` (${m.ps.h}–${m.ps.a} pens)`] : m.et ? [" (a.p.)", " (a.e.t.)"] : ["", ""];
      t = [`Final: ==${m.home}== ${m.hs}–${m.as} ==${m.away}==${extra[0]}`, `Full time: ==${m.home}== ${m.hs}–${m.as} ==${m.away}==${extra[1]}`]; imp = isBig ? 5 : top ? 3 : 2;
    }
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
      // jogos já terminados antes de o servidor arrancar: sai o cartão em direto que tenha ficado gravado
      if (m.state === "post") { remove(`r:espn:${m.id}:live`); return; }
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
    // lances novos desde a última leitura (expulsões, penáltis, VAR, golos anulados)
    if (lg.sport === "soccer") {
      const antes = new Set((prev.plays || []).map((p) => p.key));
      for (const p of m.plays || []) if (!antes.has(p.key)) playNews(p, m, lg);
    }
    const scored = m.hs > prev.hs || m.as > prev.as;
    // no basquetebol não há notícia por cesto: o cartão em direto vai mostrando o resultado
    const novoLance = (t) => (m.plays || []).some((p) => p.tipo === t && !(prev.plays || []).some((q) => q.key === p.key));
    if (lg.sport === "soccer" && scored && !novoLance("penalti_marcado") && !novoLance("autogolo")) news("golo", m, lg);
    if (lg.sport === "soccer" && (m.hs < prev.hs || m.as < prev.as) && !novoLance("anulado")) news("anulado", m, lg);
    if (m.ht && !prev.ht) news("intervalo", m, lg);
    if (lg.sport === "soccer" && (m.et || m.pausa) && !prev.et && !prev.pausa) news("prolongamento", m, lg);
    if (lg.sport === "soccer" && m.pen && !prev.pen) news("penaltis", m, lg);
    if (m.hs !== prev.hs || m.as !== prev.as || m.clock !== prev.clock || m.ht !== prev.ht || m.et !== prev.et || m.pausa !== prev.pausa || m.pen !== prev.pen
      || JSON.stringify(m.ps) !== JSON.stringify(prev.ps) || JSON.stringify(m.ultimo) !== JSON.stringify(prev.ultimo)) liveCard(m, lg);
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
        let atrasado = false; // já passou a hora do apito, mas a ESPN ainda não deu o jogo como começado
        for (const ev of data.events || []) {
          const m = normalizeEvent(ev);
          if (!m.home || !m.away) continue;
          if (lg.so && !lg.so.some((t) => norm(m.home) === norm(t) || norm(m.away) === norm(t))) continue;
          handle(m, lg, first);
          if (m.state === "in") live = true;
          if (m.state === "pre" && m.start && m.start > Date.now()) next = Math.min(next ?? Infinity, m.start);
          else if (m.state === "pre" && m.start && Date.now() - m.start < 3 * 3600e3) atrasado = true;
        }
        first = false;
        // sem isto, um jogo que a ESPN ainda mostrava por começar à hora do apito punha a liga a dormir 30 min
        if (live || atrasado) wait = LIVE_MS;
        else if (next) wait = Math.min(IDLE_MAX, Math.max(LIVE_MS, next - Date.now() - 60e3));
      } catch (e) {
        if ([401, 403, 429].includes(e.status) && ++blocked >= 3) {
          log(`[ESPN] ${lg.nome}: a ESPN está a recusar os pedidos (${e.status}); esta liga passa para a GOAL API`);
          onBlocked(lg);
          return;
        }
        if (e.status === 404) { log(`[ESPN] ${lg.nome}: a ESPN não tem esta competição; deixo de a consultar`); return; }
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
