// Resultados de Portugal sem a FPF. O resultados.fpf.pt e o Sofascore bloqueiam os servidores de alojamento, e
// nenhuma API de futebol cobre as distritais, por isso os campeonatos chegam por dois caminhos que não dependem
// deles:
//   - ESPN (site.api.espn.com, a mesma dos resultados em direto): calendário completo, resultados e classificação
//     da Liga Portugal Betclic e da Taça de Portugal, em JSON e sem bloqueios (PT_ESPN_LIGAS troca a lista);
//   - pesquisa na web pelo Gemini (a mesma GEMINI_API_KEY gratuita das notícias, com a pesquisa Google): para cada
//     organizador (Liga 2, Liga 3, Campeonato de Portugal, Liga BPI, futsal e cada uma das 22 associações), os
//     resultados da última jornada, os jogos da próxima e a classificação, tal como aparecem no zerozero, nos sites
//     das associações e na imprensa. Quem vai buscar as páginas é o Google, por isso os bloqueios aos servidores
//     de alojamento não contam. Cada organizador é revisto de 3 em 3 horas nas tardes de jogos e de 12 em 12 horas
//     no resto da semana, dentro de um limite diário de pedidos (PT_PESQUISA_DIA, 200 por omissão).
// Este ficheiro só lê e normaliza; o server/pt/index.js guarda as competições e os jogos.
import { sleep, norm } from "../util.js";
import { ASSOCIACOES } from "./catalogo.js";

/* ───────── ESPN ───────── */
const ESPN = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_TABELAS = process.env.ESPN_TABELAS_BASE || "https://site.api.espn.com/apis/v2/sports";
export const LIGAS_ESPN = (() => {
  try { if (process.env.PT_ESPN_LIGAS) return JSON.parse(process.env.PT_ESPN_LIGAS); } catch { /* fica a lista de base */ }
  return [
    { slug: "por.1", nome: "Liga Portugal Betclic", org: "liga", tipo: "liga" },
    { slug: "por.taca.portugal", nome: "Taça de Portugal", org: "fpf", tipo: "taca" },
  ];
})();

async function json(url, timeout = 20000) {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 VAR" }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw Object.assign(new Error(`respondeu ${res.status}`), { status: res.status });
  return res.json();
}

// época em curso: de julho a junho
export function epoca(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return { ano: y, de: `${y}0701`, ate: `${y + 1}0630` };
}

const ESTADO_ESPN = (t = {}) => {
  const n = String(t.name || "");
  if (/POSTPONED|DELAYED/.test(n)) return "adiado";
  if (/CANCELED|CANCELLED|ABANDONED/.test(n)) return "cancelado";
  if (/SUSPENDED/.test(n)) return "suspenso";
  if (t.state === "post" || t.completed) return "final";
  if (t.state === "in") return /HALFTIME/.test(n) ? "intervalo" : "direto";
  return "agendado";
};
export function jogoEspn(ev) {
  const c = ev.competitions?.[0] || {};
  const lado = (h) => c.competitors?.find((x) => x.homeAway === h) || {};
  const casa = lado("home"), fora = lado("away");
  const nome = (x) => x.team?.shortDisplayName || x.team?.displayName || x.team?.name || "";
  const estado = ESTADO_ESPN(ev.status?.type || c.status?.type);
  const golos = (x) => (x.score == null || x.score === "" ? null : Number(typeof x.score === "object" ? x.score.value : x.score));
  return {
    espnId: String(ev.id), inicio: Date.parse(ev.date) || null, casa: nome(casa), fora: nome(fora),
    logoCasa: casa.team?.logo || null, logoFora: fora.team?.logo || null,
    hs: estado === "agendado" ? null : golos(casa), as: estado === "agendado" ? null : golos(fora), estado,
    fase: c.notes?.[0]?.headline || ev.season?.slug || null,
  };
}
// A ESPN deixou de aceitar a época inteira num só pedido (respondia 400 a «dates=20260701-20270630»): o calendário
// pede-se em blocos de 28 dias e, se um bloco for recusado, em semanas. Os blocos que já passaram (mais de dois
// dias atrás) guardam-se durante 12 horas, por isso cada volta só pede de novo as semanas com jogos por acabar.
const ymd = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
const doYmd = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
export function blocos(de, ate, dias = 28) {
  const out = [];
  for (let t = doYmd(de); t <= doYmd(ate); t += dias * 86400e3) out.push([ymd(t), ymd(Math.min(doYmd(ate), t + (dias - 1) * 86400e3))]);
  return out;
}
const cacheBlocos = new Map(); // `${slug}|${de}-${ate}` → { ts, eventos }
async function eventosDoBloco(lg, de, ate, agora) {
  const k = `${lg.slug}|${de}-${ate}`;
  const c = cacheBlocos.get(k);
  // o que já passou (há mais de dois dias) muda pouco: 12 h; o que está a mais de dez dias: 6 h; o resto, sempre
  const validade = doYmd(ate) + 86400e3 < agora - 2 * 86400e3 ? 12 * 3600e3 : doYmd(de) > agora + 10 * 86400e3 ? 6 * 3600e3 : 0;
  if (c && agora - c.ts < validade) return c.eventos;
  const datas = de === ate ? de : `${de}-${ate}`; // um dia só vai sem intervalo
  let j;
  try { j = await json(`${ESPN}/soccer/${lg.slug}/scoreboard?dates=${datas}&limit=300`); }
  catch (e) {
    if (e.status !== 400) throw e;
    j = await json(`${ESPN}/soccer/${lg.slug}/scoreboard?dates=${datas}`); // sem o «limit»
  }
  const eventos = j.events || [];
  cacheBlocos.set(k, { ts: agora, eventos });
  return eventos;
}
// os dias com jogos que o scoreboard da semana traz em «calendar» (texto ISO ou objetos com startDate/entries)
export function diasDoCalendario(j, de, ate) {
  const out = new Set();
  const junta = (v) => { const t = Date.parse(v); if (t) { const d = ymd(t); if (d >= de && d <= ate) out.add(d); } };
  for (const c of j?.leagues?.[0]?.calendar || []) {
    if (typeof c === "string") junta(c);
    else { if (c?.startDate && !c?.entries) junta(c.startDate); for (const x of c?.entries || []) junta(x.startDate); }
  }
  return [...out].sort();
}
const modoEspn = {}; // slug → "dias" quando a ESPN recusa intervalos de datas
export async function jogosEspn(lg, ts = Date.now()) {
  const e = epoca(ts);
  const vistos = new Map();
  if (modoEspn[lg.slug] === "dias") {
    // dia a dia, só os dias com jogos (os já passados ficam guardados)
    const semana = await json(`${ESPN}/soccer/${lg.slug}/scoreboard`);
    for (const ev of semana.events || []) vistos.set(String(ev.id), ev);
    for (const d of diasDoCalendario(semana, e.de, e.ate)) {
      try { for (const ev of await eventosDoBloco(lg, d, d, ts)) vistos.set(String(ev.id), ev); } catch { /* fica o resto */ }
    }
    return [...vistos.values()].map(jogoEspn).filter((x) => x.casa && x.fora);
  }
  let recusados = 0, ultimoErro = null;
  for (const [de, ate] of blocos(e.de, e.ate, 28)) {
    let eventos = null;
    try { eventos = await eventosDoBloco(lg, de, ate, ts); }
    catch (err) {
      ultimoErro = err;
      if (err.status !== 400) throw err;
      // bloco recusado: semana a semana
      eventos = [];
      let falhou = 0;
      const semanas = blocos(de, ate, 7);
      for (const [d2, a2] of semanas) {
        try { eventos.push(...await eventosDoBloco(lg, d2, a2, ts)); } catch (e2) { ultimoErro = e2; recusados++; falhou++; }
      }
      // nem as semanas passam: não vale a pena insistir nos outros blocos
      if (falhou === semanas.length && !vistos.size) break;
    }
    for (const ev of eventos) vistos.set(String(ev.id), ev);
  }
  // tudo recusado: a ESPN não aceita intervalos; passa a pedir dia a dia, pelos dias do calendário
  if (!vistos.size && recusados) {
    modoEspn[lg.slug] = "dias";
    try { return await jogosEspn(lg, ts); } catch { throw ultimoErro; }
  }
  return [...vistos.values()].map(jogoEspn).filter((x) => x.casa && x.fora);
}
export function tabelaDeEspn(j) {
  const grupos = j?.children?.length ? j.children : j?.standings ? [j] : [];
  return grupos.map((g) => {
    const linhas = (g.standings?.entries || []).map((e) => {
      const st = Object.fromEntries((e.stats || []).map((s) => [s.name || s.type, Number(s.value)]));
      return {
        pos: st.rank || null, equipa: e.team?.shortDisplayName || e.team?.displayName || e.team?.name,
        j: st.gamesPlayed ?? null, v: st.wins ?? null, e: st.ties ?? null, d: st.losses ?? null,
        gm: st.pointsFor ?? null, gs: st.pointsAgainst ?? null, dg: st.pointDifferential ?? (st.pointsFor ?? 0) - (st.pointsAgainst ?? 0), pts: st.points ?? null,
      };
    }).filter((l) => l.equipa);
    linhas.sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || (b.pts ?? 0) - (a.pts ?? 0));
    linhas.forEach((l, i) => { l.pos ??= i + 1; });
    return { nome: g.name || "", linhas };
  }).filter((g) => g.linhas.length);
}
export async function tabelaEspn(lg) {
  return tabelaDeEspn(await json(`${ESPN_TABELAS}/soccer/${lg.slug}/standings`));
}

// A ESPN não diz a jornada de cada jogo. Num campeonato cada equipa joga uma vez por jornada, por isso os jogos
// vão, pela ordem do calendário, para a primeira jornada em que nenhuma das duas equipas joga ainda (um jogo
// adiado, jogado semanas depois, volta assim à jornada a que pertence). Nas taças, cada eliminatória é um bloco
// de jogos com menos de dez dias entre si.
export function rondas(jogos, tipo = "liga") {
  const lista = [...jogos].filter((j) => j.inicio).sort((a, b) => a.inicio - b.inicio);
  if (tipo === "taca") {
    const out = [];
    for (const j of lista) {
      const r = out.at(-1);
      if (r && j.inicio - r.ini < 10 * 86400e3) r.jogos.push(j);
      else out.push({ ini: j.inicio, jogos: [j], nome: j.fase && !/^\d{4}/.test(j.fase) ? j.fase : null });
    }
    return out.map((r, i) => ({ n: i + 1, nome: r.nome || `${i + 1}.ª eliminatória`, jogos: r.jogos }));
  }
  const equipas = new Set(lista.flatMap((j) => [norm(j.casa), norm(j.fora)]));
  const porRonda = Math.max(1, Math.floor(equipas.size / 2));
  const out = [];
  for (const j of lista) {
    const h = norm(j.casa), a = norm(j.fora);
    let r = out.find((x) => x.jogos.length < porRonda && !x.equipas.has(h) && !x.equipas.has(a));
    if (!r) { r = { equipas: new Set(), jogos: [] }; out.push(r); }
    r.equipas.add(h); r.equipas.add(a); r.jogos.push(j);
  }
  return out.map((r, i) => ({ n: i + 1, nome: `${i + 1}.ª jornada`, jogos: r.jogos }));
}

/* ───────── pesquisa na web (Gemini com a pesquisa Google) ───────── */
const GEMINI_API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
// A pesquisa Google do Gemini («grounding») não faz parte do plano gratuito nos modelos 3.x: com eles, a pesquisa
// responde sempre 429. Os 2.5 Flash e Flash-Lite têm uma quota gratuita de pesquisas por dia, por isso são os
// primeiros (o GEMINI_MODEL das notícias não conta aqui; PT_PESQUISA_MODEL escolhe outro à mão).
const MODELO = () => process.env.PT_PESQUISA_MODEL || "gemini-2.5-flash";
// Cada modelo do Gemini tem a sua quota gratuita (pedidos por minuto e por dia). As notícias do site gastam a do
// GEMINI_MODEL; quando a de um modelo acaba (429), a pesquisa passa ao seguinte desta lista em vez de parar.
// PT_PESQUISA_MODELOS troca a lista (separada por vírgulas). Os que não existirem (404) ficam de lado um dia.
export const MODELOS = () => [...new Set([MODELO(), ...(process.env.PT_PESQUISA_MODELOS || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-flash-latest,gemini-flash-lite-latest").split(/[\s,]+/)].filter(Boolean))];

// A quota gratuita do Gemini volta à meia-noite da Califórnia (8 ou 9 da manhã em Lisboa)
export function proximaMeiaNoitePacifico(agora = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(agora)).map((x) => [x.type, x.value]));
  const passou = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000;
  return agora - passou + 86400e3 + 60e3; // e um minuto de margem
}
// o que diz um 429 do Gemini: quanto esperar (RetryInfo) e se foi a quota do dia que acabou
export function lerRecusa(texto, agora = Date.now()) {
  let j = null;
  try { j = JSON.parse(texto); } catch { /* texto simples */ }
  const det = j?.error?.details || [];
  const espera = det.map((d) => String(d.retryDelay || "").match(/^([\d.]+)s$/)?.[1]).find(Boolean);
  const quotas = det.flatMap((d) => d.violations || []).map((v) => `${v.quotaId || ""} ${v.quotaMetric || ""}`).join(" ");
  const diaria = /PerDay|per_day|daily/i.test(quotas) || (/quota/i.test(texto) && !espera && !/PerMinute/i.test(quotas));
  // «limit: 0»: este modelo não tem quota gratuita nenhuma (por exemplo, a pesquisa Google nos 3.x)
  const semQuota = /limit:\s*0\b/i.test(texto) || det.flatMap((d) => d.violations || []).some((v) => String(v.quotaValue ?? "") === "0");
  return { diaria: diaria || semQuota, semQuota, ate: semQuota ? agora + 86400e3 : diaria ? proximaMeiaNoitePacifico(agora) : agora + Math.max(60e3, (Number(espera) || 60) * 1000) };
}

// o que se pesquisa: um pedido por organizador
export const ALVOS = [
  { id: "liga-2", org: "liga", nome: "Liga Portugal 2", pedido: "a Liga Portugal 2 (segundo escalão do futebol profissional português)" },
  { id: "liga-3", org: "fpf", nome: "Liga 3", pedido: "a Liga 3 (terceiro escalão nacional de futebol, com as séries ou fases que houver)" },
  { id: "cp", org: "fpf", nome: "Campeonato de Portugal", pedido: "o Campeonato de Portugal de futebol (quarto escalão nacional), todas as séries" },
  { id: "feminino", org: "fpf", nome: "Futebol feminino", pedido: "a Liga BPI (primeira divisão de futebol feminino) e o Campeonato Nacional Feminino (segunda divisão), com as séries" },
  { id: "futsal", org: "fpf", nome: "Futsal", pedido: "a Liga Placard de futsal masculino, a II Divisão nacional de futsal (séries) e a Liga Feminina de futsal" },
  ...ASSOCIACOES.map((a) => ({
    id: a.key, org: a.key, nome: a.nome,
    pedido: `todos os campeonatos distritais seniores da ${a.longo} (${a.nome}): futebol sénior masculino (todas as divisões e séries), e, se existirem, futebol sénior feminino e futsal sénior. Não incluas competições nacionais (Campeonato de Portugal, Liga 3) nem de formação`,
  })),
].filter((a) => !process.env.PT_PESQUISA_ALVOS || process.env.PT_PESQUISA_ALVOS.split(/[\s,]+/).includes(a.id));

export const SISTEMA = `Recolhes resultados de futebol português da época em curso a partir da web, para um site de resultados.
Regras:
- Pesquisa no Google. Boas fontes: zerozero.pt, o site da associação ou da liga, fpf.pt, foradejogo, imprensa regional e nacional (A Bola, Record, O Jogo, Maisfutebol) e as páginas dos clubes.
- Só escreves o que encontraste numa fonte. Nunca inventes equipas, resultados, datas, horas nem classificações. O que não encontrares, fica de fora (ou null).
- Só seniores: nada de formação (juniores, juvenis, iniciados, infantis…), veteranos, futebol de praia, futebol de 7 ou INATEL.
- Os nomes das equipas como aparecem nas fontes, sem «SAD» nem «Futebol SAD».
- Datas no formato AAAA-MM-DD e horas HH:MM, hora de Portugal continental (ou dos Açores/Madeira, se for o caso).
- estado de cada jogo: "final" (acabou, com o resultado), "agendado" (por jogar), "adiado", "direto" (a decorrer, com o resultado do momento).
- No fim, responde APENAS com um objeto JSON, sem mais texto, neste formato compacto:
{"competicoes":[{"nome":"nome da competição","serie":"nome da série ou \\"\\"","modalidade":"futebol" ou "futsal","feminino":false,"taca":false,"fonte":"https://endereço principal onde viste os dados",
 "jornadas":[{"n":5,"jogos":[["Equipa da casa","Equipa de fora",2,1,"2026-10-04","15:00","final"],["Equipa C","Equipa D",null,null,"2026-10-11","15:00","agendado"]]}],
 "classificacao":[[1,"Equipa",5,4,1,0,12,3,13]]}]}
 (cada linha da classificação: posição, equipa, jogos, vitórias, empates, derrotas, golos marcados, golos sofridos, pontos)
- Uma entrada por competição e série. Sem nada confirmado: {"competicoes":[]}.`;

const ESTADOS = new Set(["final", "agendado", "adiado", "direto", "intervalo", "suspenso", "cancelado"]);
const nInt = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : Math.round(+v));
// hora de Lisboa → instante
function lisboa(data, hora) {
  const m = String(data || "").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const h = String(hora || "").match(/^(\d{1,2})[:h](\d{2})/);
  const palpite = Date.UTC(+m[1], +m[2] - 1, +m[3], h ? +h[1] : 12, h ? +h[2] : 0);
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", timeZoneName: "longOffset" }).format(new Date(palpite));
  const o = f.match(/GMT([+-])(\d{2}):(\d{2})/);
  const off = o ? (o[1] === "-" ? -1 : 1) * (+o[2] * 60 + +o[3]) * 60000 : 0;
  return { ts: palpite - off, semHora: !h };
}

// lê a resposta do Gemini com tolerância (texto à volta, ```json, jogos como lista ou como objeto)
export function lerPesquisa(texto, agora = Date.now()) {
  const t = String(texto || "").replace(/```(?:json)?/gi, "");
  const i = t.indexOf("{"), f = t.lastIndexOf("}");
  if (i < 0 || f < i) throw new Error("a pesquisa não devolveu JSON");
  const j = JSON.parse(t.slice(i, f + 1));
  const out = [];
  for (const c of Array.isArray(j.competicoes) ? j.competicoes : []) {
    const nome = String(c?.nome || "").replace(/\s+/g, " ").trim();
    if (!nome) continue;
    const jornadas = [];
    for (const jr of Array.isArray(c.jornadas) ? c.jornadas : []) {
      const jogos = [];
      for (const g of Array.isArray(jr?.jogos) ? jr.jogos : []) {
        const [casa, fora, hs, as, data, hora, est] = Array.isArray(g) ? g : [g?.casa, g?.fora, g?.golosCasa ?? g?.hs, g?.golosFora ?? g?.as, g?.data, g?.hora, g?.estado];
        const h = String(casa || "").trim(), a = String(fora || "").trim();
        if (!h || !a || norm(h) === norm(a)) continue;
        const quando = lisboa(data, hora);
        let estado = ESTADOS.has(String(est || "").toLowerCase()) ? String(est).toLowerCase() : null;
        const gh = nInt(hs), ga = nInt(as);
        if (!estado) estado = gh != null && ga != null ? "final" : "agendado";
        // um jogo «final» sem resultado, ou no futuro, não se aceita como acabado
        if (estado === "final" && (gh == null || ga == null || (quando && quando.ts > agora + 3600e3))) estado = "agendado";
        if (gh != null && (gh < 0 || gh > 40 || ga < 0 || ga > 40)) continue;
        jogos.push({ casa: h, fora: a, hs: estado === "agendado" ? null : gh, as: estado === "agendado" ? null : ga, estado, inicio: quando?.ts || null, semHora: quando ? quando.semHora : true });
      }
      if (jogos.length) jornadas.push({ n: nInt(jr.n ?? jr.jornada), jogos });
    }
    const classificacao = (Array.isArray(c.classificacao) ? c.classificacao : []).map((l) => {
      const [pos, equipa, jj, v, e, d, gm, gs, pts] = Array.isArray(l) ? l : [l?.pos, l?.equipa, l?.j, l?.v, l?.e, l?.d, l?.gm, l?.gs, l?.pts];
      if (!String(equipa || "").trim()) return null;
      return { pos: nInt(pos), equipa: String(equipa).trim(), j: nInt(jj), v: nInt(v), e: nInt(e), d: nInt(d), gm: nInt(gm), gs: nInt(gs), dg: nInt(gm) != null && nInt(gs) != null ? nInt(gm) - nInt(gs) : null, pts: nInt(pts) };
    }).filter(Boolean);
    classificacao.sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
    if (!jornadas.length && classificacao.length < 2) continue;
    out.push({
      nome, serie: String(c.serie || "").replace(/\s+/g, " ").trim(), mod: /futsal/i.test(`${c.modalidade} ${nome}`) ? "futsal" : "futebol",
      fem: c.feminino === true || /femin/i.test(nome), taca: c.taca === true || /\bta[cç]a\b|supertaça/i.test(nome),
      fonte: /^https?:\/\//.test(c.fonte || "") ? String(c.fonte) : null, jornadas, classificacao,
    });
  }
  return out;
}

export async function pesquisar(alvo, { tabela = true, agora = Date.now(), modelo = MODELO() } = {}) {
  const hoje = new Date(agora).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const pedido = `Hoje é ${hoje}. Procura ${alvo.pedido}, na época ${epoca(agora).ano}/${String(epoca(agora).ano + 1).slice(2)}.
Para cada competição (e série): os jogos da jornada mais recente já disputada, com os resultados, e os jogos da próxima jornada, com data e hora (se houver jogos a decorrer hoje, também esses).${tabela ? " E a classificação atual completa." : " Não é preciso a classificação."}`;
  const res = await fetch(`${GEMINI_API}/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: "user", parts: [{ text: pedido }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(4 * 60e3),
  });
  if (!res.ok) {
    const txt = await res.text();
    const msg = (() => { try { return JSON.parse(txt).error?.message || txt; } catch { return txt; } })();
    throw Object.assign(new Error(`Gemini (${modelo}) respondeu ${res.status}: ${String(msg).replace(/\s+/g, " ").slice(0, 160)}`), { status: res.status, recusa: res.status === 429 ? lerRecusa(txt) : null });
  }
  const j = await res.json();
  const texto = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!texto && j.promptFeedback?.blockReason) throw new Error(`pedido recusado pelo Gemini (${j.promptFeedback.blockReason})`);
  // as páginas que o Google usou: ficam como fonte quando a resposta não diz nenhuma
  const paginas = (j.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c) => c.web?.uri).filter(Boolean);
  const comps = lerPesquisa(texto, agora);
  for (const c of comps) c.fonte ||= paginas[0] || null;
  return comps;
}

// dia da semana e hora em Lisboa
function lisboaAgora(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { dia: p.weekday, hora: +p.hour };
}
// quando voltar a pesquisar um organizador: nas tardes e noites de jogos (sexta à noite, sábado, domingo e dias
// a meio da semana com jogos) de 3 em 3 horas; na segunda de manhã uma vez (resultados que só saíram tarde);
// no resto da semana, de 12 em 12 horas. Com jogos a decorrer agora, de hora e meia em hora e meia.
export function proximaPesquisa(agora = Date.now(), { aDecorrer = false, jogosHoje = false } = {}) {
  const { dia, hora } = lisboaAgora(agora);
  if (aDecorrer) return 90 * 60e3;
  const fds = dia === "Sat" || dia === "Sun" || (dia === "Fri" && hora >= 18);
  if ((fds || jogosHoje) && hora >= 12 && hora <= 23) return 3 * 3600e3;
  if (dia === "Mon" && hora < 12) return 4 * 3600e3;
  return 12 * 3600e3;
}

export function createPesquisa({ log = () => {}, guardar = () => {}, dados = {} } = {}) {
  const ativo = !!process.env.GEMINI_API_KEY && process.env.PT_PESQUISA !== "0";
  const LIMITE = Math.max(10, Number(process.env.PT_PESQUISA_DIA) || 200);
  const INTERVALO = Math.max(5, Number(process.env.PT_PESQUISA_SEGUNDOS) || 30) * 1000;
  // dados: alvo → { proxima, tabelaEm, ok, erro, competicoes, jogos } (guardado com o resto, em data/pt.json)
  const estado = { ativo, modelo: ativo ? MODELO() : null, limiteDia: LIMITE, pedidos: [], pausaAte: 0, ultimoErro: null, aPesquisar: null, modelos: {} };
  // modelo → { pausaAte, motivo }: o primeiro da lista que não esteja em pausa é o que se usa
  const modeloLivre = (agora) => MODELOS().find((m) => (estado.modelos[m]?.pausaAte || 0) <= agora) || null;
  const al = (id) => (dados[id] ||= { proxima: 0, tabelaEm: 0 });

  async function correr() {
    if (!ativo) { log("[PT] sem GEMINI_API_KEY: a pesquisa na web dos campeonatos (Liga 2, Liga 3, Campeonato de Portugal e distritais) está desligada"); return; }
    log(`[PT] pesquisa na web dos campeonatos pelo Gemini (${MODELO()}): ${ALVOS.length} organizadores, até ${LIMITE} pedidos por dia`);
    for (;;) {
      const agora = Date.now();
      estado.pedidos = estado.pedidos.filter((t) => agora - t < 86400e3);
      if (agora < estado.pausaAte) { await sleep(Math.min(60e3, estado.pausaAte - agora)); continue; }
      const modelo = modeloLivre(agora);
      if (!modelo) { estado.pausaAte = Math.min(...MODELOS().map((m) => estado.modelos[m]?.pausaAte || agora + 60e3)); continue; }
      estado.modelo = modelo;
      if (estado.pedidos.length >= LIMITE) { await sleep(Math.min(30 * 60e3, estado.pedidos[0] + 86400e3 - agora + 1000)); continue; }
      // o organizador mais atrasado (os nunca lidos primeiro, pela ordem da lista)
      const alvo = ALVOS.map((a) => [a, al(a.id)]).filter(([, d]) => d.proxima <= agora).sort((x, y) => x[1].proxima - y[1].proxima)[0]?.[0];
      if (!alvo) { await sleep(60e3); continue; }
      const d = al(alvo.id);
      const tabela = !d.tabelaEm || agora - d.tabelaEm > 20 * 3600e3;
      estado.pedidos.push(agora);
      estado.aPesquisar = { alvo: alvo.id, desde: agora };
      try {
        const comps = await pesquisar(alvo, { tabela, agora, modelo });
        const r = guardar(alvo, comps, { tabela }) || {};
        Object.assign(d, { ok: Date.now(), erro: null, falhas: 0, competicoes: comps.length, jogos: comps.reduce((t, c) => t + c.jornadas.reduce((u, jr) => u + jr.jogos.length, 0), 0) });
        if (tabela && comps.some((c) => c.classificacao.length)) d.tabelaEm = Date.now();
        d.proxima = Date.now() + proximaPesquisa(Date.now(), { aDecorrer: !!r.aDecorrer, jogosHoje: !!r.jogosHoje }) * (0.9 + Math.random() * 0.2);
        log(`[PT] pesquisa ${alvo.nome}: ${comps.length} competições, ${d.jogos} jogos${tabela ? " (com classificações)" : ""}`);
      } catch (e) {
        estado.ultimoErro = { alvo: alvo.id, erro: e.message, ts: Date.now(), modelo };
        log(`[PT] pesquisa ${alvo.nome}: ${e.message}`);
        if (e.status === 429 || e.status === 404 || (e.status === 400 && /model|not found|not supported/i.test(e.message))) {
          // a quota deste modelo acabou (ou o modelo não existe): o organizador volta já, com o modelo seguinte
          const ate = e.status === 429 ? e.recusa?.ate || Date.now() + 15 * 60e3 : Date.now() + 86400e3;
          estado.modelos[modelo] = { pausaAte: ate, motivo: e.status === 429 ? (e.recusa?.semQuota ? "sem quota gratuita de pesquisa" : e.recusa?.diaria ? "quota do dia esgotada" : "pedidos por minuto") : "modelo indisponível" };
          if (e.status === 429 && modeloLivre(Date.now())) log(`[PT] pesquisa: ${modelo} sem quota até às ${new Date(ate).toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" })}; passo ao ${modeloLivre(Date.now())}`);
          if (!modeloLivre(Date.now())) estado.pausaAte = Math.min(...MODELOS().map((m) => estado.modelos[m]?.pausaAte || Date.now() + 60e3));
          estado.pedidos.pop(); // um pedido recusado não conta para o limite diário
          estado.aPesquisar = null;
          await sleep(3000);
          continue;
        }
        d.falhas = (d.falhas || 0) + 1;
        d.erro = e.message;
        if (e.status === 401 || e.status === 403) { estado.pausaAte = Date.now() + 6 * 3600e3; } // chave errada ou sem acesso
        d.proxima = Date.now() + Math.min(6 * 3600e3, 20 * 60e3 * 2 ** Math.min(4, d.falhas - 1));
      }
      estado.aPesquisar = null;
      await sleep(INTERVALO);
    }
  }

  return {
    start: () => { correr().catch((e) => log(`[PT] pesquisa: ${e.message}`)); },
    estado: () => ({
      ...estado, pedidos: estado.pedidos.length, alvos: ALVOS.length,
      modelos: MODELOS().map((m) => ({ modelo: m, pausaAte: estado.modelos[m]?.pausaAte > Date.now() ? estado.modelos[m].pausaAte : null, motivo: estado.modelos[m]?.pausaAte > Date.now() ? estado.modelos[m].motivo : null })),
      lidos: ALVOS.filter((a) => dados[a.id]?.ok).length,
      porAlvo: ALVOS.map((a) => ({ id: a.id, nome: a.nome, ok: dados[a.id]?.ok || null, erro: dados[a.id]?.erro || null, competicoes: dados[a.id]?.competicoes ?? null, jogos: dados[a.id]?.jogos ?? null, proxima: dados[a.id]?.proxima || null })),
    }),
  };
}
