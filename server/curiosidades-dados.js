// Curiosidades de um jogo a partir de dados, sem modelo de linguagem (não gastam quota e não inventam):
// - jogos das ligas que a ESPN acompanha: o resumo do jogo na ESPN (site.api.espn.com/…/summary) traz a forma recente
//   (lastFiveGames), os jogos desta época entre as equipas (seasonseries), a classificação, o estádio e, perto do
//   jogo, o árbitro; os últimos confrontos (headToHeadGames) só em alguns jogos;
// - jogos de Portugal (das distritais à Liga 3, Liga BPI, futsal…): a classificação, a forma e os jogos desta época
//   entre as equipas, tal como o site os tem (server/pt).
// Os textos seguem as regras do zerozero: de zero a dez por extenso, ordinais por extenso até ao nono, datas com o mês
// por extenso.
const ESPN = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const EXTENSO = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const ORDINAL = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const numero = (n, fem = false) => (fem && n === 1 ? "uma" : fem && n === 2 ? "duas" : EXTENSO[n] ?? String(n));
export const ordinal = (n) => ORDINAL[n] || `${n}.º`;
export const data = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const v = (t) => Number(p.find((x) => x.type === t)?.value);
  return `${v("day")} de ${MESES[v("month") - 1]} de ${v("year")}`;
};
const forma = (lista) => lista.map((r) => ({ w: "V", d: "E", l: "D", v: "V", e: "E" }[String(r).toLowerCase()] || "")).filter(Boolean).join(" ");
const n = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));
const contagem = (k) => (k <= 10 ? numero(k) : String(k));
const pontos = (k) => `${contagem(k)} ${k === 1 ? "ponto" : "pontos"}`;
const empates = (k) => (k === 0 ? "não houve empates" : `houve ${numero(k)} ${k === 1 ? "empate" : "empates"}`);

/* ───────── ESPN ───────── */
export async function resumoEspn(slugLiga, eventId) {
  const r = await fetch(`${ESPN}/${slugLiga}/summary?event=${encodeURIComponent(eventId)}`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 VAR" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`ESPN respondeu ${r.status}`);
  return r.json();
}

// as curiosidades do resumo da ESPN; «casa» e «fora» são os nomes que o site usa (os da ESPN podem ser outros)
export function curiosidadesEspn(r, { casa, fora }) {
  const out = [];
  const comps = r?.header?.competitions?.[0]?.competitors || [];
  const idCasa = String(comps.find((c) => c.homeAway === "home")?.team?.id ?? comps.find((c) => c.homeAway === "home")?.id ?? "");
  const idFora = String(comps.find((c) => c.homeAway === "away")?.team?.id ?? comps.find((c) => c.homeAway === "away")?.id ?? "");
  const nomeDe = (id) => (String(id) === idCasa ? casa : String(id) === idFora ? fora : null);

  // os últimos confrontos (do mais recente para o mais antigo): os de headToHeadGames e os desta época (seasonseries)
  const jogos = [];
  const vistos = new Set();
  const juntar = (id, h, a, hs, as, ts, liga) => {
    if (id && vistos.has(id)) return;
    if (id) vistos.add(id);
    if (hs == null || as == null || !h || !a || h === a) return;
    jogos.push({ h, a, hs, as, ts, liga });
  };
  for (const e of (r?.headToHeadGames || []).flatMap((g) => g.events || [])) {
    juntar(String(e.id ?? `${e.gameDate}|${e.homeTeamId}`), nomeDe(e.homeTeamId), nomeDe(e.awayTeamId), n(e.homeTeamScore), n(e.awayTeamScore), Date.parse(e.gameDate || e.date || "") || null, e.leagueName || e.competition || null);
  }
  const idEvento = String(r?.header?.id ?? "");
  for (const e of (r?.seasonseries || []).flatMap((x) => x.events || [])) {
    if (idEvento && String(e.id) === idEvento) continue; // o próprio jogo
    const cs = e.competitors || [];
    const ch = cs.find((c) => c.homeAway === "home"), ca = cs.find((c) => c.homeAway === "away");
    const acabou = e.statusType?.completed ?? e.status?.type?.completed ?? (ch?.score != null && ca?.score != null);
    if (!ch || !ca || !acabou) continue;
    juntar(String(e.id ?? ""), nomeDe(ch.team?.id ?? ch.id), nomeDe(ca.team?.id ?? ca.id), n(ch.score?.value ?? ch.score), n(ca.score?.value ?? ca.score), Date.parse(e.date || e.gameDate || "") || null, null);
  }
  jogos.sort((x, y) => (y.ts || 0) - (x.ts || 0));
  if (jogos.length >= 2) {
    let vc = 0, vf = 0, emp = 0;
    for (const j of jogos) {
      const gc = j.h === casa ? j.hs : j.as, gf = j.h === casa ? j.as : j.hs;
      if (gc > gf) vc++; else if (gf > gc) vf++; else emp++;
    }
    out.push({ texto: `Nos últimos ${contagem(jogos.length)} jogos entre ${casa} e ${fora}, ${casa} venceu ${contagem(vc)}, ${fora} venceu ${contagem(vf)} e ${empates(emp)}.`, fonte: "ESPN" });
  }
  if (jogos[0]) {
    const u = jogos[0];
    out.push({ texto: `Último encontro: ${u.h} ${u.hs}–${u.as} ${u.a}${u.ts ? `, a ${data(u.ts)}` : ""}${u.liga ? ` (${u.liga})` : ""}.`, fonte: "ESPN" });
  }
  const goleada = jogos.filter((j) => Math.abs(j.hs - j.as) >= 3).sort((x, y) => Math.abs(y.hs - y.as) - Math.abs(x.hs - x.as))[0];
  if (goleada && goleada !== jogos[0]) out.push({ texto: `A maior diferença nos jogos recentes: ${goleada.h} ${goleada.hs}–${goleada.as} ${goleada.a}${goleada.ts ? `, a ${data(goleada.ts)}` : ""}.`, fonte: "ESPN" });

  // a forma recente (V, E, D) de cada equipa, do jogo mais recente para o mais antigo, e as séries que dão notícia
  const formas = r?.lastFiveGames || r?.boxscore?.form || [];
  const resultados = (id) => {
    const f = formas.find((x) => String(x.team?.id) === id);
    const ev = [...(f?.events || [])];
    if (ev.every((e) => Date.parse(e.gameDate || e.date || ""))) ev.sort((x, y) => Date.parse(y.gameDate || y.date) - Date.parse(x.gameDate || x.date));
    return ev.map((e) => String(e.gameResult || "").toUpperCase()).filter((x) => ["W", "D", "L"].includes(x));
  };
  const rc = resultados(idCasa), rf = resultados(idFora);
  const fCasa = forma(rc), fFora = forma(rf);
  if (fCasa || fFora) out.push({ texto: `Forma nos últimos jogos (do mais recente para o mais antigo): ${[fCasa && `${casa} ${fCasa}`, fFora && `${fora} ${fFora}`].filter(Boolean).join("; ")}.`, fonte: "ESPN" });
  for (const [nome, rs] of [[casa, rc], [fora, rf]]) {
    const seguidos = (ok) => { let k = 0; for (const x of rs) { if (!ok(x)) break; k++; } return k; };
    const v = seguidos((x) => x === "W"), semPerder = seguidos((x) => x !== "L"), d = seguidos((x) => x === "L"), semGanhar = seguidos((x) => x !== "W");
    const todos = rs.length;
    const nos = (k) => (k === todos ? `nos últimos ${contagem(k)} jogos` : `há ${contagem(k)} jogos`);
    if (v >= 3) out.push({ texto: v === todos ? `${nome} venceu os últimos ${contagem(v)} jogos.` : `${nome} vem de ${contagem(v)} vitórias seguidas.`, fonte: "ESPN" });
    else if (semPerder >= 4) out.push({ texto: `${nome} não perde ${nos(semPerder)}.`, fonte: "ESPN" });
    else if (d >= 3) out.push({ texto: d === todos ? `${nome} perdeu os últimos ${contagem(d)} jogos.` : `${nome} vem de ${contagem(d)} derrotas seguidas.`, fonte: "ESPN" });
    else if (semGanhar >= 4) out.push({ texto: `${nome} não vence ${nos(semGanhar)}.`, fonte: "ESPN" });
  }

  // a classificação (a posição e os pontos das duas equipas)
  const entradas = (r?.standings?.groups || []).flatMap((g) => g.standings?.entries || []);
  const pos = (id) => {
    const e = entradas.find((x) => String(x.team?.id ?? x.id) === id);
    if (!e) return null;
    const st = Object.fromEntries((e.stats || []).map((s) => [s.name || s.type, n(s.value)]));
    const rank = st.rank ?? n(e.team?.rank) ?? (entradas.indexOf(e) + 1);
    return { rank, pts: st.points ?? null };
  };
  const pc = pos(idCasa), pf = pos(idFora);
  if (pc?.rank && pf?.rank) out.push({ texto: `Na classificação: ${casa} é ${ordinal(pc.rank)}${pc.pts != null ? `, com ${pontos(pc.pts)}` : ""}; ${fora} é ${ordinal(pf.rank)}${pf.pts != null ? `, com ${pontos(pf.pts)}` : ""}.`, fonte: "ESPN" });

  // o estádio e o árbitro
  const gi = r?.gameInfo || {};
  const estadio = gi.venue?.fullName || gi.venue?.name;
  const cidade = gi.venue?.address?.city;
  if (estadio) out.push({ texto: `Palco do jogo: ${estadio}${cidade && !estadio.includes(cidade) ? ` (${cidade})` : ""}.`, fonte: "ESPN" });
  const arb = (gi.officials || []).find((o) => /refer|árbit|arbit/i.test(o.position?.displayName || o.position?.name || o.position || "")) || (gi.officials || [])[0];
  const nomeArb = arb?.displayName || arb?.fullName;
  if (nomeArb) out.push({ texto: `Árbitro: ${nomeArb}.`, fonte: "ESPN" });
  return out;
}

/* ───────── Portugal (server/pt) ───────── */
export function curiosidadesPt(info) {
  if (!info) return [];
  const out = [];
  const onde = [info.serie && info.serie !== info.comp ? `${info.comp}, ${info.serie}` : info.comp, info.jornada ? `${info.jornada}.ª jornada` : null].filter(Boolean).join(", ");
  const { casa: lc, fora: lf } = info.linhas || {};
  const descreve = (nome, l) => {
    if (!l || !l.j) return null;
    const extra = l.pos === 1 ? " (lidera)" : info.equipas && l.pos === info.equipas ? " (último)" : "";
    return `${nome} é ${ordinal(l.pos)}, com ${pontos(l.pts)}${extra}`;
  };
  const dc = descreve(info.casa, lc), df = descreve(info.fora, lf);
  if (dc || df) out.push({ texto: `Na classificação (${onde}): ${[dc, df].filter(Boolean).join("; ")}.`, fonte: "VAR" });
  const fc = lc?.forma?.length ? forma(lc.forma) : "", ff = lf?.forma?.length ? forma(lf.forma) : "";
  if (fc || ff) out.push({ texto: `Forma nos últimos jogos (do mais recente para o mais antigo): ${[fc && `${info.casa} ${fc}`, ff && `${info.fora} ${ff}`].filter(Boolean).join("; ")}.`, fonte: "VAR" });
  const golos = (nome, l) => (l?.j ? `${nome} ${l.gm ? `marcou ${contagem(l.gm)}` : "não marcou"} e ${l.gs ? `sofreu ${contagem(l.gs)}` : "não sofreu golos"} ${l.j === 1 ? "num jogo" : `em ${contagem(l.j)} jogos`}` : null);
  const gc = golos(info.casa, lc), gf = golos(info.fora, lf);
  if (gc || gf) out.push({ texto: `Golos nesta época: ${[gc, gf].filter(Boolean).join("; ")}.`, fonte: "VAR" });
  if (info.entre?.length) {
    const lista = info.entre.slice(0, 3).map((x) => `${x.casa} ${x.hs}–${x.as} ${x.fora}${x.inicio ? ` (${data(x.inicio)})` : ""}`).join("; ");
    out.push({ texto: `Já se defrontaram esta época: ${lista}.`, fonte: "VAR" });
  }
  if (info.local) out.push({ texto: `Palco do jogo: ${info.local}.`, fonte: "VAR" });
  return out;
}
