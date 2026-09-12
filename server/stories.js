// Possíveis histórias: sinais nos dados (resultados, classificações, séries e temas repetidos por várias fontes)
// transformados em pistas para notícias, com nível de interesse segundo critérios de noticiabilidade.
import fs from "node:fs";
import { norm, sleep } from "./util.js";
import { normalizeEvent } from "./sources/espn.js";

const FILE = new URL("../data/stories.json", import.meta.url);
const MAX = 300;
const SITE = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const STANDINGS = process.env.ESPN_STANDINGS_BASE || "https://site.api.espn.com/apis/v2/sports";

// critérios de noticiabilidade e o peso de cada um no nível de interesse
export const CRITERIOS = {
  notoriedade: { pt: "Notoriedade", en: "Prominence", peso: 2 },
  proximidade: { pt: "Proximidade", en: "Proximity", peso: 2 },
  surpresa: { pt: "Surpresa", en: "Surprise", peso: 2 },
  impacto: { pt: "Impacto", en: "Impact", peso: 2 },
  raridade: { pt: "Raridade", en: "Rarity", peso: 1 },
  emocao: { pt: "Emoção", en: "Drama", peso: 1 },
  continuidade: { pt: "Continuidade", en: "Follow-up", peso: 1 },
  magnitude: { pt: "Magnitude", en: "Magnitude", peso: 1 },
};
export const nivel = (crit) => {
  const pts = [...new Set(crit)].reduce((s, c) => s + (CRITERIOS[c]?.peso || 0), 0);
  return pts >= 6 ? "alto" : pts >= 3 ? "medio" : "baixo";
};

// positiva ou negativa para o protagonista da pista (a equipa ou pessoa de quem o título fala)
export const TOM = {
  surpresa: "negativa", reviravolta: "positiva", tardio: "positiva", goleada: "positiva", serie: "positiva",
  crise: "negativa", derrotas: "negativa", fimserie: "negativa", primeira: "positiva", lider: "positiva", descida: "negativa", tema: "neutra",
};

const BIG = [/\bbenfica\b/, /\bporto\b/, /^sporting( cp| lisbon| clube de portugal)?$/, /^portugal$/];
const isBig = (name) => BIG.some((re) => re.test(norm(name)));
const pct = (n) => `${n}.º`;

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw Object.assign(new Error(`ESPN respondeu ${res.status}`), { status: res.status });
  return res.json();
}

// classificação: posição e pontos de cada equipa
export async function fetchStandings(lg) {
  const body = await getJson(`${STANDINGS}/${lg.espn}/standings`);
  const groups = body.children?.length ? body.children : [body];
  const byTeam = new Map();
  let size = 0;
  for (const g of groups) {
    const entries = g.standings?.entries || [];
    size = Math.max(size, entries.length);
    entries.forEach((e, i) => {
      const stat = (n) => e.stats?.find((s) => s.name === n || s.type === n)?.value;
      byTeam.set(String(e.team?.id), { rank: Number(stat("rank")) || i + 1, points: stat("points"), name: e.team?.shortDisplayName || e.team?.displayName, logo: e.team?.logos?.[0]?.href });
    });
  }
  const leader = [...byTeam.entries()].find(([, v]) => v.rank === 1)?.[0] || null;
  return { byTeam, size, leader, at: Date.now() };
}

// últimos resultados de uma equipa na competição: "V", "E" ou "D", do mais antigo para o mais recente
export async function fetchForm(lg, teamId) {
  const body = await getJson(`${SITE}/${lg.espn}/teams/${teamId}/schedule`);
  const out = [];
  for (const ev of body.events || []) {
    const c = ev.competitions?.[0];
    if (!(c?.status?.type?.completed ?? ev.status?.type?.completed)) continue;
    const me = c.competitors?.find((x) => String(x.team?.id) === String(teamId));
    const op = c.competitors?.find((x) => String(x.team?.id) !== String(teamId));
    if (!me || !op) continue;
    out.push({ id: String(ev.id), date: Date.parse(ev.date) || 0, r: me.winner ? "V" : op.winner ? "D" : "E" });
  }
  return out.sort((a, b) => a.date - b.date);
}

// estatísticas do jogo que entram na ficha, pela ordem em que aparecem
const STATS = [
  ["possessionPct", "Posse de bola (%)", "Possession (%)"],
  ["totalShots", "Remates", "Shots"],
  ["shotsOnTarget", "Remates à baliza", "Shots on target"],
  ["wonCorners", "Cantos", "Corners"],
  ["foulsCommitted", "Faltas", "Fouls"],
  ["offsides", "Foras de jogo", "Offsides"],
  ["yellowCards", "Amarelos", "Yellow cards"],
  ["redCards", "Vermelhos", "Red cards"],
  ["saves", "Defesas", "Saves"],
];

// ficha do jogo a partir do resumo da ESPN: estatísticas, golos e expulsões
export async function fetchSummary(lg, m) {
  const body = await getJson(`${SITE}/${lg.espn}/summary?event=${m.id}`);
  const teams = body.boxscore?.teams || [];
  const side = (id) => teams.find((t) => String(t.team?.id) === String(id));
  const h = side(m.homeTeamId), a = side(m.awayTeamId);
  const val = (t, name) => t?.statistics?.find((x) => x.name === name)?.displayValue;
  const stats = h && a ? STATS.map(([id, pt, en]) => ({ id, pt, en, casa: val(h, id), fora: val(a, id) })).filter((x) => x.casa != null && x.fora != null) : [];
  const ev = body.keyEvents || [];
  const who = (k) => k.participants?.[0]?.athlete?.displayName || "";
  const teamOf = (k) => (String(k.team?.id) === String(m.homeTeamId) ? m.home : String(k.team?.id) === String(m.awayTeamId) ? m.away : k.team?.displayName || "");
  const goals = ev.filter((k) => (k.scoringPlay || /^goal/i.test(k.type?.text || "")) && !/disallow|anulad/i.test(k.type?.text || ""))
    .map((k) => ({ min: k.clock?.displayValue || "", jogador: who(k), equipa: teamOf(k) }));
  const reds = ev.filter((k) => /red card/i.test(k.type?.text || "")).map((k) => ({ min: k.clock?.displayValue || "", jogador: who(k), equipa: teamOf(k) }));
  return { stats, goals, reds };
}

const trailing = (seq, test) => { let n = 0; for (let i = seq.length - 1; i >= 0 && test(seq[i]); i--) n++; return n; };

export function createStories({ broadcast, log }) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { list = []; }
  let dirty = false;
  const table = new Map(); // classificação em cache por liga

  setInterval(() => {
    if (!dirty) return;
    fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(list));
    dirty = false;
  }, 5000).unref();

  const add = (s) => {
    if (list.some((x) => x.id === s.id)) return;
    const crit = [...new Set(s.crit)];
    const story = { ...s, tom: s.tom || TOM[s.tipo] || "neutra", ts: s.ts || Date.now(), nivel: nivel(crit), crit: crit.map((id) => ({ id, pt: CRITERIOS[id].pt, en: CRITERIOS[id].en })) };
    list.unshift(story);
    if (list.length > MAX) list.length = MAX;
    dirty = true;
    broadcast("story", story);
  };

  const refreshTable = async (lg) => {
    try { table.set(lg.key, await fetchStandings(lg)); } catch { /* taças e competições sem classificação */ }
  };

  // chamado pela ESPN quando um jogo de futebol termina
  async function onFinal(lg, m, prev, opts = {}) {
    const push = (x) => add({ ...x, ts: opts.ts }); // nas pistas recuperadas, a hora é a do jogo
    if (lg.sport !== "soccer") return;
    const pt = /^soccer\/por\./.test(lg.espn);
    const before = table.get(lg.key);
    const rank = (id) => before?.byTeam.get(String(id))?.rank;
    const sides = [
      { id: m.homeTeamId, name: m.home, goals: m.hs, opp: m.as },
      { id: m.awayTeamId, name: m.away, goals: m.as, opp: m.hs },
    ];
    const sc = `${m.home} ${m.hs}–${m.as} ${m.away}`;
    const nomeEn = lg.nome_en || lg.nome;
    // ficha do jogo que acompanha todas as pistas deste jogo
    let sum = null;
    try { sum = await fetchSummary(lg, m); } catch { /* sem resumo: a ficha fica só com os golos */ }
    const posOf = (id, name) => {
      const e = table.get(lg.key)?.byTeam.get(String(id));
      return e ? { equipa: name, pos: e.rank, pts: e.points ?? null } : null;
    };
    const ficha = {
      casa: m.home, fora: m.away, hs: m.hs, as: m.as,
      golos: m.goals?.length ? m.goals.map((g) => ({ min: g.label, jogador: g.scorer, equipa: g.home ? m.home : m.away })) : sum?.goals || [],
      vermelhos: sum?.reds || [],
      stats: sum?.stats || [],
      tabela: [posOf(m.homeTeamId, m.home), posOf(m.awayTeamId, m.away)].filter(Boolean),
      tamanho: table.get(lg.key)?.size || null,
    };
    const crestOf = (name, logo) => ({ nome: name, papel: "envolvido", logo });
    const common = { liga: lg.key, ligaNome: lg.nome, pais: lg.bandeira, equipas: [m.home, m.away], crests: [crestOf(m.home, m.homeLogo), crestOf(m.away, m.awayLogo)], ficha };
    const prox = (name) => (pt || isBig(name) ? ["proximidade"] : []);
    const noto = (name, id) => (isBig(name) || (lg.seccao === "big5" && rank(id) && rank(id) <= 3) ? ["notoriedade"] : []);
    const matchData = { pt: [`Resultado: ${sc} (${lg.nome})`], en: [`Result: ${sc} (${nomeEn})`] };
    const verificarJogo = {
      pt: ["Declarações dos treinadores no fim do jogo", "Estatísticas do jogo: remates, posse, golos esperados"],
      en: ["Managers' post-match comments", "Match stats: shots, possession, expected goals"],
    };

    // 1. surpresa: favorito perde ou empata com uma equipa muito abaixo na tabela
    for (const [fav, und] of [[sides[0], sides[1]], [sides[1], sides[0]]]) {
      const rf = rank(fav.id), ru = rank(und.id);
      const favorito = isBig(fav.name) || (rf && rf <= 3);
      if (!favorito || !rf || !ru || ru - rf < 5 || fav.goals > fav.opp) continue;
      const perdeu = fav.goals < fav.opp;
      push({
        ...common,
        id: `s:surpresa:${m.id}`,
        tipo: "surpresa",
        crit: ["surpresa", ...(perdeu ? ["impacto"] : []), ...noto(fav.name, fav.id), ...prox(fav.name)],
        t: { pt: `${perdeu ? "Surpresa" : "Tropeção"}: ${fav.name} ${perdeu ? "perde" : "empata"} com o ${und.name}`, en: `${perdeu ? "Upset" : "Slip"}: ${fav.name} ${perdeu ? "lose" : "draw"} to ${und.name}` },
        angulo: {
          pt: `O ${und.name}, ${pct(ru)} classificado, travou o ${fav.name} (${pct(rf)}). O que falhou no favorito e o que fez o ${und.name} de diferente?`,
          en: `${und.name}, ${ru}th in the table, held ${fav.name} (${rf}). What went wrong for the favourites and what did ${und.name} do differently?`,
        },
        dados: { pt: [...matchData.pt, `Classificação antes do jogo: ${fav.name} ${pct(rf)}, ${und.name} ${pct(ru)}`], en: [...matchData.en, `Table before kick-off: ${fav.name} ${rf}, ${und.name} ${ru}`] },
        verificar: { pt: [...verificarJogo.pt, "Consequências na classificação"], en: [...verificarJogo.en, "Impact on the table"] },
      });
    }

    const winner = m.hs === m.as ? null : m.hs > m.as ? sides[0] : sides[1];
    const loser = winner && (winner === sides[0] ? sides[1] : sides[0]);
    const margin = Math.abs(m.hs - m.as);

    // 2. reviravolta: o vencedor chegou a estar a perder
    if (winner && prev) {
      const deficit = winner === sides[0] ? -(prev.minDiff ?? 0) : prev.maxDiff ?? 0;
      if (deficit >= 1) push({
        ...common, id: `s:reviravolta:${m.id}`, tipo: "reviravolta",
        crit: ["emocao", ...(deficit >= 2 ? ["raridade"] : []), ...noto(winner.name, winner.id), ...prox(winner.name)],
        t: { pt: `Reviravolta: ${winner.name} dá a volta ao ${loser.name}`, en: `Comeback: ${winner.name} turn it around against ${loser.name}` },
        angulo: { pt: `Esteve a perder por ${deficit} e venceu. O momento da viragem, as substituições e a reação do banco são o ângulo.`, en: `Trailed by ${deficit} and won. The turning point, the substitutions and the bench's reaction are the angle.` },
        dados: matchData,
        verificar: { pt: ["Minutos dos golos e das substituições", ...verificarJogo.pt], en: ["Goal and substitution minutes", ...verificarJogo.en] },
      });
    }

    // 3. golo decisivo nos últimos minutos
    const lastGoal = m.goals?.[m.goals.length - 1];
    if (winner && margin === 1 && lastGoal && lastGoal.min >= 80 && lastGoal.home === (winner === sides[0])) push({
      ...common, id: `s:tardio:${m.id}`, tipo: "tardio",
      crit: ["emocao", ...noto(winner.name, winner.id), ...prox(winner.name)],
      t: { pt: `${winner.name} decide aos ${lastGoal.label} frente ao ${loser.name}`, en: `${winner.name} snatch it at ${lastGoal.label} against ${loser.name}` },
      angulo: { pt: `Vitória decidida já no fim${lastGoal.scorer ? `, com golo de ${lastGoal.scorer}` : ""}. Quem é o herói e o que vale estes três pontos?`, en: `Won at the death${lastGoal.scorer ? `, ${lastGoal.scorer} scoring` : ""}. Who is the hero and what are these three points worth?` },
      dados: matchData, verificar: verificarJogo,
    });

    // 4. goleada (se um dos grandes a sofre, a pista fala dele e é negativa)
    const bigLoser = loser && isBig(loser.name) && !isBig(winner.name);
    const big = `${Math.max(m.hs, m.as)}–${Math.min(m.hs, m.as)}`;
    if (winner && (margin >= 3 || m.hs + m.as >= 6)) push({
      ...common, id: `s:goleada:${m.id}`, tipo: "goleada", tom: bigLoser ? "negativa" : "positiva",
      ...(bigLoser ? { t: { pt: `${loser.name} sofre goleada frente ao ${winner.name} (${big})`, en: `${loser.name} thrashed by ${winner.name} (${big})` } } : {}),
      crit: ["magnitude", ...(margin >= 4 ? ["raridade"] : []), ...(isBig(loser.name) ? ["surpresa", "impacto"] : []), ...noto(winner.name, winner.id), ...noto(loser.name, loser.id), ...prox(winner.name), ...prox(loser.name)],
      ...(bigLoser ? {} : { t: { pt: `${winner.name} goleia o ${loser.name} (${big})`, en: `${winner.name} thrash ${loser.name} (${big})` } }),
      angulo: { pt: `Resultado invulgarmente largo. É o maior da época na competição? Há precedentes entre estas equipas?`, en: `An unusually wide margin. Is it the biggest of the season in this competition? Any precedent between these sides?` },
      dados: matchData,
      verificar: { pt: ["Maiores goleadas da época na competição", "Histórico de confrontos"], en: ["Biggest wins of the season in the competition", "Head-to-head record"] },
    });

    // 5. séries das duas equipas
    for (const side of sides) {
      if (!side.id) continue;
      let seq;
      try { seq = await fetchForm(lg, side.id); } catch { continue; }
      const res = side.goals > side.opp ? "V" : side.goals < side.opp ? "D" : "E";
      if (!seq.length || seq[seq.length - 1].id !== m.id) seq.push({ id: m.id, r: res });
      const r = seq.map((x) => x.r);
      const wins = trailing(r, (x) => x === "V");
      const unbeaten = trailing(r, (x) => x !== "D");
      const winless = trailing(r, (x) => x !== "V");
      const losses = trailing(r, (x) => x === "D");
      const prevWins = res !== "V" ? trailing(r.slice(0, -1), (x) => x === "V") : 0;
      const base = { ...common, equipas: [side.name], crests: [crestOf(side.name, side === sides[0] ? m.homeLogo : m.awayLogo)] };
      const extra = [...noto(side.name, side.id), ...prox(side.name)];
      const forma = { pt: [`Últimos ${Math.min(r.length, 8)} jogos: ${r.slice(-8).join(" ")}`], en: [`Last ${Math.min(r.length, 8)}: ${r.slice(-8).map((x) => ({ V: "W", E: "D", D: "L" })[x]).join(" ")}`] };
      const verificarSerie = { pt: ["Recorde de vitórias seguidas do clube", "Declarações do treinador sobre o momento"], en: ["Club record for consecutive wins", "Manager's comments on the run"] };
      if (wins >= 3) push({
        ...base, id: `s:serie:${side.id}:${m.id}`, tipo: "serie", crit: ["continuidade", ...(wins >= 5 ? ["raridade"] : []), ...extra],
        t: { pt: `${side.name} soma ${wins} vitórias seguidas`, en: `${side.name} make it ${wins} wins in a row` },
        angulo: { pt: "O que explica a série, até onde pode ir e se está perto de algum recorde do clube.", en: "What explains the run, how far it can go and whether a club record is in sight." },
        dados: forma, verificar: verificarSerie,
      });
      else if (unbeaten >= 6) push({
        ...base, id: `s:invicto:${side.id}:${m.id}`, tipo: "serie", crit: ["continuidade", "raridade", ...extra],
        t: { pt: `${side.name} está há ${unbeaten} jogos sem perder`, en: `${side.name} unbeaten in ${unbeaten}` },
        angulo: { pt: "Série longa sem derrotas: solidez defensiva, rotação do plantel ou calendário favorável?", en: "A long unbeaten run: defensive solidity, squad rotation or a kind fixture list?" },
        dados: forma, verificar: verificarSerie,
      });
      if (losses >= 2) push({
        ...base, id: `s:derrotas:${side.id}:${m.id}`, tipo: "derrotas", crit: ["continuidade", ...(isBig(side.name) || losses >= 5 ? ["impacto"] : []), ...(isBig(side.name) ? ["surpresa"] : []), ...extra],
        t: { pt: `${side.name} soma ${losses} derrotas seguidas`, en: `${side.name} have lost ${losses} in a row` },
        angulo: { pt: `Pressão sobre o treinador${winless > losses ? ` numa série de ${winless} jogos sem vencer` : ""}. O que mudou na equipa e que respostas dá a direção?`, en: `Pressure on the manager${winless > losses ? ` during a ${winless}-game winless run` : ""}. What has changed and how is the board responding?` },
        dados: forma, verificar: { pt: ["Posição do treinador e da direção", "Lesões e castigos no plantel", "Calendário dos próximos jogos"], en: ["Manager's and board's position", "Injuries and suspensions", "Upcoming fixtures"] },
      });
      else if (winless >= 4) push({
        ...base, id: `s:crise:${side.id}:${m.id}`, tipo: "crise", crit: ["continuidade", ...(isBig(side.name) ? ["impacto", "surpresa"] : []), ...extra],
        t: { pt: `${side.name} está há ${winless} jogos sem vencer`, en: `${side.name} without a win in ${winless}` },
        angulo: { pt: `Pressão sobre o treinador e sobre a posição na tabela${losses >= 3 ? `, com ${losses} derrotas seguidas` : ""}.`, en: `Pressure on the manager and on the league position${losses >= 3 ? `, with ${losses} straight defeats` : ""}.` },
        dados: forma, verificar: { pt: ["Posição do treinador e da direção", "Lesões e castigos no plantel"], en: ["Manager's and board's position", "Injuries and suspensions"] },
      });
      if (prevWins >= 3) push({
        ...base, id: `s:fimserie:${side.id}:${m.id}`, tipo: "fimserie", crit: ["surpresa", "continuidade", ...extra],
        t: { pt: `Acabou a série de ${prevWins} vitórias do ${side.name}`, en: `${side.name}'s ${prevWins}-game winning run is over` },
        angulo: { pt: "A primeira escorregadela depois de uma boa fase: acidente ou sinal de quebra?", en: "The first slip after a strong run: a blip or a sign of decline?" },
        dados: forma, verificar: verificarJogo,
      });
      if (res === "V" && r.length >= 5 && r.slice(0, -1).every((x) => x !== "V")) push({
        ...base, id: `s:primeira:${side.id}:${m.id}`, tipo: "primeira", crit: ["raridade", "continuidade", ...extra],
        t: { pt: `${side.name} vence pela primeira vez na competição`, en: `${side.name} finally get their first win` },
        angulo: { pt: `Primeira vitória ao ${r.length}.º jogo. O que mudou?`, en: `First win at the ${r.length}th attempt. What changed?` },
        dados: forma, verificar: verificarJogo,
      });
    }

    // 6. classificação depois do jogo: novo líder ou entrada na zona de descida (só em jogos acompanhados em direto)
    if (opts.backfill) return;
    await sleep(Number(process.env.HISTORIAS_ESPERA_MS) || 180000); // dá tempo à ESPN para atualizar a tabela
    const old = table.get(lg.key);
    await refreshTable(lg);
    const now = table.get(lg.key);
    if (!old || !now || now === old) return;
    if (now.leader && old.leader && now.leader !== old.leader) {
      const name = now.byTeam.get(now.leader)?.name;
      if (name) push({
        ...common, id: `s:lider:${lg.key}:${m.id}`, tipo: "lider", equipas: [name], crests: [crestOf(name, now.byTeam.get(now.leader)?.logo)], crit: ["impacto", ...(isBig(name) ? ["notoriedade"] : []), ...(pt || isBig(name) ? ["proximidade"] : [])],
        t: { pt: `${name} é o novo líder da ${lg.nome}`, en: `${name} go top of the ${nomeEn}` },
        angulo: { pt: "Mudança na liderança: há quanto tempo não estava em primeiro e o que falta jogar entre os candidatos?", en: "A change at the top: how long since they led, and what's left between the contenders?" },
        dados: { pt: [`${name}: ${now.byTeam.get(now.leader)?.points ?? "?"} pontos`], en: [`${name}: ${now.byTeam.get(now.leader)?.points ?? "?"} points`] },
        verificar: { pt: ["Calendário das próximas jornadas", "Histórico de lideranças na época"], en: ["Upcoming fixtures", "Leaders so far this season"] },
      });
    }
    const zone = (t) => t.size >= 10 && ((r) => r > t.size - 3);
    for (const side of sides) {
      const a = old.byTeam.get(String(side.id))?.rank, b = now.byTeam.get(String(side.id))?.rank;
      if (a && b && zone(now)(b) && !zone(old)(a)) push({
        ...common, id: `s:descida:${side.id}:${m.id}`, tipo: "descida", equipas: [side.name], crests: [crestOf(side.name, side === sides[0] ? m.homeLogo : m.awayLogo)], crit: ["impacto", "continuidade", ...prox(side.name)],
        t: { pt: `${side.name} cai para a zona de descida`, en: `${side.name} drop into the relegation zone` },
        angulo: { pt: `Passou de ${pct(a)} para ${pct(b)}. O que falta jogar e quem são os adversários diretos?`, en: `Down from ${a} to ${b}. What's left, and who are the direct rivals?` },
        dados: { pt: [`Posição: ${pct(b)} de ${now.size}`], en: [`Position: ${b} of ${now.size}`] },
        verificar: { pt: ["Calendário até ao fim da época", "Situação do treinador"], en: ["Remaining fixtures", "Manager's situation"] },
      });
    }
  }

  // chamado quando a mesma notícia chega por mais de uma fonte, ou quando é muito importante
  function onTrending(item) {
    const nomes = [item.name, ...(item.also || []).map((a) => a.name)].filter(Boolean);
    const fontes = new Set([item.src, ...(item.also || []).map((a) => a.src)]).size;
    if (fontes < 2 && (item.imp || 0) < 5) return;
    const crit = [...(fontes > 1 ? ["continuidade"] : []), ...(item.imp >= 4 ? ["impacto"] : []), ...(item.imp >= 5 ? ["surpresa"] : []), ...(item.cats?.some((c) => ["porto", "sporting", "benfica"].includes(c)) ? ["notoriedade", "proximidade"] : item.cats?.includes("portugueses") ? ["proximidade"] : [])];
    add({
      crests: item.equipas || [],
      id: `s:tema:${item.id}`, tipo: "tema", equipas: [], liga: null, ligaNome: null, pais: item.paisTema || item.pais, crit,
      t: { pt: `Tema em destaque: ${item.t.pt.replace(/==/g, "")}`, en: `Big story: ${item.t.en.replace(/==/g, "")}` },
      angulo: fontes > 1
        ? { pt: `${fontes} fontes já deram esta notícia. Há margem para um ângulo próprio: contexto, reações ou consequências.`, en: `${fontes} sources already have this story. Room for an original angle: context, reactions or consequences.` }
        : { pt: "Notícia de grande importância dada por uma só fonte. Vale confirmar e procurar um ângulo próprio.", en: "A major story from a single source. Worth confirming and finding an original angle." },
      dados: { pt: [`Fontes: ${nomes.join(", ")}`], en: [`Sources: ${nomes.join(", ")}`] },
      verificar: { pt: ["Confirmação oficial do clube ou do jogador", "O que ainda não foi dito por nenhuma fonte"], en: ["Official confirmation from the club or player", "What no source has said yet"] },
      noticia: item.id,
    });
  }

  // classificações em cache para comparar antes e depois de cada jogo
  function watch(leagues) {
    const soccer = leagues.filter((l) => l.sport === "soccer");
    const load = () => soccer.forEach((lg, i) => setTimeout(() => refreshTable(lg), i * 700));
    load();
    setInterval(load, 6 * 3600e3).unref();
  }

  // no arranque, recupera as pistas dos jogos terminados nos últimos dias, para a secção não ficar vazia
  const estado = { at: null, dias: 0, jogos: 0, pistas: 0, ligas: [] };

  async function backfill(leagues) {
    const days = Number(process.env.HISTORIAS_DIAS) || 7;
    const d = (n) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10).replace(/-/g, "");
    let total = 0;
    estado.dias = days;
    estado.ligas = [];
    for (const lg of leagues.filter((l) => l.sport === "soccer")) {
      const nota = { liga: lg.nome, jogos: 0, terminados: 0, tabela: false, erro: null };
      estado.ligas.push(nota);
      try {
        await refreshTable(lg);
        nota.tabela = !!table.get(lg.key);
        const body = await getJson(`${SITE}/${lg.espn}/scoreboard?dates=${d(days)}-${d(0)}`);
        nota.jogos = (body.events || []).length;
        for (const ev of body.events || []) {
          const m = normalizeEvent(ev);
          if (m.state !== "post" || !m.completed || !m.home || !m.away) continue;
          if (lg.so && !lg.so.some((t) => norm(m.home) === norm(t) || norm(m.away) === norm(t))) continue;
          nota.terminados++;
          await onFinal(lg, m, null, { backfill: true, ts: m.start || Date.now() });
          total++;
          await sleep(400);
        }
      } catch (e) {
        nota.erro = e.message;
        log(`[Histórias] ${lg.nome}: ${e.message}`);
      }
    }
    estado.at = Date.now();
    estado.jogos = total;
    estado.pistas = list.length;
    log(`[Histórias] ${total} jogo(s) dos últimos ${days} dias analisados; ${list.length} pista(s) disponíveis`);
  }

  return { all: () => list, estado: () => estado, onFinal, onTrending, watch, backfill };
}
