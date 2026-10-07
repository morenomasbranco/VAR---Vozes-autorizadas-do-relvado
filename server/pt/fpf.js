// Leitor do resultados.fpf.pt: as competições de cada associação, as séries e jornadas de cada competição,
// os jogos (com resultado, data e hora) e as classificações oficiais.
//
// O site é HTML gerado no servidor e não tem API pública documentada. Em vez de depender de classes CSS que
// podem mudar, o leitor procura padrões que não mudam: endereços com competitionId/fixtureId/matchId, listas de
// opções «Jornada N», tabelas com as colunas J/V/E/D/GM/GS/P e blocos com duas equipas e um resultado.
// Se a FPF mudar a página e o leitor deixar de encontrar jogos, o `npm run fpf-sonda -- <endereço>` mostra o
// que foi lido e grava a página em data/fpf-sonda/ para se ajustar o leitor.
import { parse, nos, texto, pedacos, porTag, atributos, acima } from "./html.js";
import { sleep, lerTexto, norm } from "../util.js";

export const BASE = (process.env.FPF_BASE || "https://resultados.fpf.pt").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const GAP = Math.max(250, Number(process.env.FPF_INTERVALO_MS) || 1200); // intervalo mínimo entre pedidos à FPF

// endereços das peças que a página da competição carrega à parte (jornada a jornada); experimentam-se por esta
// ordem e fica a primeira que trouxer jogos. Podem ser trocados no .env (FPF_URL_JORNADA, com {id}).
const URL_JORNADA = [
  process.env.FPF_URL_JORNADA,
  "/Competition/GetClassificationAndMatchesByFixture?fixtureId={id}",
  "/Competition/GetMatchesByFixture?fixtureId={id}",
  "/Competition/GetFixtureMatches?fixtureId={id}",
].filter(Boolean);
const URL_SERIE = [
  process.env.FPF_URL_SERIE,
  "/Competition/GetSerieDetails?serieId={id}",
  "/Competition/GetFixturesBySerie?serieId={id}",
].filter(Boolean);

export const estado = { pedidos: 0, erros: 0, ultimoErro: null, ultimoOk: null, urlJornada: null, urlSerie: null, bloqueado: false };
// o início das últimas respostas de cada tipo, para se ver o que a FPF devolve ao servidor (/api/pt/amostra)
export const amostras = {};
const guardaAmostra = (tipo, url, txt) => { amostras[tipo] = { url, ts: Date.now(), tamanho: String(txt || "").length, inicio: String(txt || "").slice(0, 20000) }; };

let fila = Promise.resolve();
let ultimo = 0;
// pedidos em fila, um de cada vez e com intervalo: a FPF é um site pequeno e não deve ser martelado
export function pedir(caminho, { tentativas = 2 } = {}) {
  const url = /^https?:/.test(caminho) ? caminho : `${BASE}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
  const p = fila.then(async () => {
    const espera = ultimo + GAP - Date.now();
    if (espera > 0) await sleep(espera);
    for (let i = 0; ; i++) {
      ultimo = Date.now();
      estado.pedidos++;
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*", "Accept-Language": "pt-PT,pt;q=0.9", "X-Requested-With": "XMLHttpRequest" }, signal: AbortSignal.timeout(20000) });
        if (res.status === 429 || res.status === 503) { estado.bloqueado = true; throw Object.assign(new Error(`FPF respondeu ${res.status}`), { status: res.status }); }
        if (!res.ok) throw Object.assign(new Error(`FPF respondeu ${res.status}`), { status: res.status });
        estado.bloqueado = false;
        estado.ultimoOk = Date.now();
        return await lerTexto(res);
      } catch (e) {
        if (i + 1 >= tentativas || e.status === 404) {
          estado.erros++;
          estado.ultimoErro = { url, erro: e.message, ts: Date.now() };
          throw e;
        }
        await sleep(e.status === 429 ? 30e3 : 3000);
      }
    }
  });
  fila = p.catch(() => {});
  return p;
}

const num = (s) => (s == null || s === "" ? null : Number.isFinite(+s) ? +s : null);
const ids = (v, chave) => {
  const m = String(v || "").match(new RegExp(`${chave}\\W{0,3}(\\d{2,})`, "i"));
  return m ? m[1] : null;
};

// ───────── datas ─────────
const MESES = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
// hora de Lisboa → instante (com o fuso de verão ou de inverno do próprio dia)
export function deLisboa(y, mes, dia, h = 0, min = 0) {
  const palpite = Date.UTC(y, mes - 1, dia, h, min);
  const fuso = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", timeZoneName: "longOffset" }).format(new Date(palpite));
  const m = fuso.match(/GMT([+-])(\d{2}):(\d{2})/);
  const off = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
  return palpite - off;
}
// «12-10-2026», «12/10/2026», «2026-10-12», «12 Out 2026», «Domingo, 12 de outubro de 2026»
export function lerData(t) {
  const s = norm(t);
  let m = s.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return { y: +m[1], mes: +m[2], dia: +m[3] };
  m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/);
  if (m) return { y: m[3].length === 2 ? 2000 + +m[3] : +m[3], mes: +m[2], dia: +m[1] };
  m = s.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*\.?\s*(?:de\s+)?(\d{4})\b/);
  if (m && MESES[m[2]]) return { y: +m[3], mes: MESES[m[2]], dia: +m[1] };
  return null;
}
const lerHora = (t) => { const m = String(t || "").match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/); return m ? { h: +m[1], min: +m[2] } : null; };

// ───────── competições de uma associação ─────────
// cada ligação com competitionId é uma competição; o título da secção em que está (Futebol, Futsal, Futebol
// de Praia…) serve de contexto para a classificar
// o número da competição num atributo: «competitionId=123», «competitionId: 123» ou um caminho «/Competition/Details/123»
const idCompeticao = (v) => ids(v, "competitionId") || String(v || "").match(/\/competi(?:tion|cao|ção)s?\/(?:details\/|detalhe\/)?(\d{3,})\b/i)?.[1] || null;

// a lista também pode vir em JSON (objetos com o número e o nome da competição)
function listaDeJson(txt) {
  let j;
  try { j = JSON.parse(txt); } catch { return null; }
  const out = new Map();
  const anda = (o, contexto) => {
    if (Array.isArray(o)) return o.forEach((x) => anda(x, contexto));
    if (!o || typeof o !== "object") return;
    const chaves = Object.keys(o);
    const kId = chaves.find((k) => /^(competition_?id|competicao_?id|id)$/i.test(k));
    const kNome = chaves.find((k) => /^(name|nome|description|descricao|designacao|competitionname|title|titulo)$/i.test(k));
    const kEpoca = chaves.find((k) => /^season_?id$/i.test(k));
    const ctx = chaves.find((k) => /^(modality|modalidade|category|categoria|sport)(name)?$/i.test(k));
    const contextoAqui = ctx && typeof o[ctx] === "string" ? o[ctx] : contexto;
    if (kId && kNome && /^\d{2,}$/.test(String(o[kId])) && typeof o[kNome] === "string" && !out.has(String(o[kId]))) {
      out.set(String(o[kId]), { competitionId: String(o[kId]), seasonId: kEpoca ? String(o[kEpoca]) : null, nome: o[kNome].replace(/\s+/g, " ").trim(), contexto: contextoAqui || "" });
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") anda(v, contextoAqui);
  };
  anda(j, "");
  return [...out.values()];
}

export function lerListaCompeticoes(html) {
  const json = /^\s*[[{]/.test(String(html || "")) ? listaDeJson(html) : null;
  if (json) return json;
  const raiz = parse(html);
  const out = new Map();
  let contexto = "";
  for (const n of nos(raiz)) {
    if (/^h[1-6]$/.test(n.tag) || /title|header|titulo|modality|modalidade|category/i.test(n.attrs.class || "")) {
      const t = texto(n);
      if (t && t.length < 80 && !/competitionid/i.test(JSON.stringify(n.attrs))) contexto = t;
    }
    for (const [k, v] of Object.entries(n.attrs)) {
      if (!/href|onclick|data-|value/.test(k)) continue;
      const id = idCompeticao(v);
      if (!id || out.has(id)) continue;
      const nome = texto(n) || n.attrs.title || "";
      if (!nome || nome.length > 160) continue;
      out.set(id, { competitionId: id, seasonId: ids(v, "seasonId"), nome: nome.replace(/\s+/g, " ").trim(), contexto });
    }
  }
  return [...out.values()];
}

// ───────── jogos ─────────
const RUIDO_EQUIPA = /^(vs\.?|x|-|–|jornada.*|j\.?\s*\d+|\d+ª? jornada|data|hora|local|campo|est[aá]dio|árbitro|arbitro|resultado|ver (jogo|ficha|mais)|ficha( de jogo)?|detalhes?|classifica[cç][aã]o|calend[aá]rio|a decorrer|em direto|intervalo|final|terminado|adiado|suspenso|anulado|cancelado|falta de compar[eê]ncia|f\.?\s*c\.?|\(\s*\)|\[img:.*\])$/i;
const ESTADOS = [
  [/adiad/i, "adiado"], [/suspens|interromp/i, "suspenso"], [/anulad|cancelad/i, "cancelado"],
  [/falta de compar|\bf\.? ?c\.?\b|n[aã]o compar/i, "falta"], [/desist/i, "cancelado"],
];
// «1º Maio Figueiró» e «11 Esperanças» são equipas; «15:00», «2 - 1» e «12/10» não
const pareceEquipa = (t) => /[a-zà-ú]{2}/i.test(t) && t.length <= 60 && !RUIDO_EQUIPA.test(t.trim()) && !lerData(t) && !/^\d{1,2}\s*[:h]\s*\d{2}\b/i.test(t) && !/^\d+\s*(golos?|pts?|pontos|min)/i.test(t);

// lê um bloco de jogo a partir dos pedaços de texto, por ordem: casa, resultado (ou hora), fora
export function lerBlocoJogo(pedacosTexto, extra = {}) {
  const ps = pedacosTexto.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const alts = ps.filter((p) => p.startsWith("[img:")).map((p) => p.slice(5, -1).trim()).filter(pareceEquipa);
  const txt = ps.filter((p) => !p.startsWith("[img:"));
  let casa = null, fora = null, hs = null, as = null, hora = null, data = null, local = null, iCasa = -1;
  for (let i = 0; i < txt.length; i++) {
    const p = txt[i];
    if (!data) data = lerData(p);
    const sc = p.match(/^(\d{1,2})\s*[-–:x]\s*(\d{1,2})(\s*\(.*\))?$/);
    const eHora = sc && /:/.test(p) && sc[2].length === 2; // «16:00» é a hora, não um resultado
    if (sc && !eHora && casa && !fora && hs == null) { hs = +sc[1]; as = +sc[2]; continue; }
    // resultado em dois pedaços («2» e «1»)
    if (/^\d{1,2}$/.test(p) && /^\d{1,2}$/.test(txt[i + 1] || "") && casa && !fora && hs == null) { hs = +p; as = +txt[i + 1]; i++; continue; }
    if (!hora && lerHora(p) && !/^\d{1,2}\s*[-–]\s*\d{1,2}$/.test(p)) hora = lerHora(p);
    if (pareceEquipa(p)) {
      if (!casa) { casa = p; iCasa = i; } else if (!fora && p !== casa) fora = p;
      else if (fora && !local && /campo|est[aá]dio|parque|complexo|sint[eé]tico|municipal|relvado/i.test(p)) local = p;
    }
    if (/campo|est[aá]dio|complexo|parque desportivo/i.test(p) && !local && i > iCasa) local = p.replace(/^(local|campo)\s*:?\s*/i, "");
  }
  if ((!casa || !fora) && alts.length >= 2) { casa = casa || alts[0]; fora = fora || alts[1]; }
  if (!casa || !fora || norm(casa) === norm(fora)) return null;
  const tudo = ps.join(" ");
  const est = ESTADOS.find(([re]) => re.test(tudo))?.[1] || null;
  return { casa, fora, hs, as, hora, data: data || extra.data || null, local, estado: est };
}

const contaJogos = (n) => new Set(atributos(n).map(([k, v]) => (/href|onclick|data-/.test(k) ? ids(v, "matchId") : null)).filter(Boolean)).size;

// todos os jogos de uma página: blocos com matchId e blocos com classes de jogo
export function lerJogos(raiz) {
  const blocos = new Map();
  for (const [k, v, n] of atributos(raiz)) {
    if (!/href|onclick|data-|id/.test(k)) continue;
    const id = ids(v, "matchId") || (/\/match\//i.test(v) ? ids(v, "id") || (String(v).match(/\/match\/\w*\/?(\d{3,})/i) || [])[1] : null);
    if (!id || blocos.has(id)) continue;
    // o bloco é o menor antepassado que tem duas equipas (sem chegar a um que tenha outros jogos dentro)
    let b = n;
    for (let i = 0; i < 6 && b && b.tag !== "#root"; i++, b = b.parent) {
      if (i > 0 && contaJogos(b) > 1) break;
      const j = lerBlocoJogo(pedacos(b));
      if (j) { blocos.set(id, { no: b, jogo: j }); break; }
    }
  }
  // blocos com classe de jogo que não têm ligação à ficha (jogos adiados, por exemplo)
  const usados = new Set([...blocos.values()].map((b) => b.no));
  const cobre = (n) => { for (const u of usados) { for (let p = u; p; p = p.parent) if (p === n) return true; for (let p = n; p; p = p.parent) if (p === u) return true; } return false; };
  let x = 0;
  for (const n of nos(raiz)) {
    if (!/\b(game|match|jogo|partida)\b/i.test(n.attrs.class || "")) continue;
    if (acima(n, (p) => /\b(game|match|jogo|partida)\b/i.test(p.attrs.class || ""), 4)) continue; // só o bloco de fora
    if (cobre(n)) continue;
    const j = lerBlocoJogo(pedacos(n));
    if (j) { blocos.set(`x${x++}`, { no: n, jogo: j }); usados.add(n); }
  }
  // datas e jornadas que estão fora do bloco (títulos «Domingo, 12-10-2026», «Jornada 5»): a última vista antes do jogo
  const ordemNos = new Map();
  let k = 0;
  let dataCorrente = null, jornadaCorrente = null;
  const contexto = new Map();
  const dentro = new Set([...blocos.values()].map((b) => b.no));
  const visitar = (n, dentroDeJogo) => {
    if (n.tag === "#text") {
      if (!dentroDeJogo) {
        const d = lerData(n.text);
        if (d) dataCorrente = d;
        const jm = norm(n.text).match(/(\d+)\s*[aª]?\s*jornada|jornada\s*(\d+)/);
        if (jm) jornadaCorrente = +(jm[1] || jm[2]);
      }
      return;
    }
    ordemNos.set(n, k++);
    if (dentro.has(n)) contexto.set(n, { data: dataCorrente, jornada: jornadaCorrente });
    for (const c of n.children || []) visitar(c, dentroDeJogo || dentro.has(n));
  };
  visitar(raiz, false);
  return [...blocos.entries()].map(([id, { no, jogo }]) => {
    const ctx = contexto.get(no) || {};
    const data = jogo.data || ctx.data;
    const inicio = data ? deLisboa(data.y, data.mes, data.dia, jogo.hora?.h ?? 15, jogo.hora?.min ?? 0) : null;
    return { fpfId: /^x/.test(id) ? null : id, ...jogo, data, jornada: ctx.jornada ?? null, inicio, semHora: !jogo.hora };
  });
}

// ───────── classificação ─────────
const COLUNA = [
  [/^(pos|#|n\.?º|lugar|cl\.?|posi[cç][aã]o)$/, "pos"],
  [/^(equipa|clube|equipas|clubes|team|nome)$/, "equipa"],
  [/^(pts?|pontos|points?)$/, "pts"],
  [/^(j|jg|jogos|pj|played)$/, "j"],
  [/^(v|vit|vit[oó]rias|w|g)$/, "v"],
  [/^(e|emp|empates|d?raws?)$/, "e"],
  [/^(d|der|derrotas|l|p)$/, "d"],
  [/^(gm|gf|golos marcados|marcados|g\.?m\.?)$/, "gm"],
  [/^(gs|gc|ga|golos sofridos|sofridos|g\.?s\.?)$/, "gs"],
  [/^(dg|dif|\+\/-|saldo|gd|d\.?g\.?)$/, "dg"],
];
export function lerTabelas(raiz) {
  const out = [];
  for (const t of porTag(raiz, "table")) {
    const linhas = porTag(t, "tr");
    if (linhas.length < 3) continue;
    // cabeçalho: a linha com <th>, ou a primeira se não tiver números (há tabelas sem cabeçalho nenhum)
    let cab = linhas.find((tr) => porTag(tr, "th").length >= 4);
    if (!cab && !porTag(linhas[0], "td").some((c) => /^\s*-?\d+\s*$/.test(texto(c)))) cab = linhas[0];
    const nomes = cab ? [...porTag(cab, "th"), ...(porTag(cab, "th").length ? [] : porTag(cab, "td"))].map((c) => norm(texto(c)).replace(/\s+/g, " ")) : [];
    let mapa = nomes.map((n) => COLUNA.find(([re]) => re.test(n))?.[1] || null);
    // «P» é pontos quando não há «Pts» e está depois de J/V/E/D; se vier antes, é derrotas (inglês) ou posição
    const linhasDados = linhas.filter((tr) => tr !== cab && porTag(tr, "td").length >= 5);
    if (!linhasDados.length) continue;
    const rows = linhasDados.map((tr) => porTag(tr, "td").map((c) => texto(c)));
    if (!mapa.includes("equipa")) {
      // a coluna da equipa é a que tem mais texto não numérico
      const largura = Math.max(...rows.map((r) => r.length));
      let melhor = -1, m = 0;
      for (let c = 0; c < largura; c++) {
        const n = rows.filter((r) => r[c] && /[a-z]{3}/i.test(r[c])).length;
        if (n > m) { m = n; melhor = c; }
      }
      if (melhor >= 0) mapa[melhor] = "equipa";
    }
    if (!mapa.includes("pts") || !mapa.includes("j")) mapa = adivinharColunas(rows, mapa);
    if (!mapa || !mapa.includes("equipa") || !mapa.includes("pts")) continue;
    const linhasTabela = rows.map((r, i) => {
      const o = {};
      mapa.forEach((c, k) => { if (c) o[c] = c === "equipa" ? r[k]?.replace(/^\d+\s*[.ºª]?\s*/, "").trim() : num(String(r[k] || "").replace(/[^\d-]/g, "")); });
      if (o.pos == null) o.pos = i + 1;
      if (o.dg == null && o.gm != null && o.gs != null) o.dg = o.gm - o.gs;
      return o;
    }).filter((o) => o.equipa && o.pts != null);
    if (linhasTabela.length >= 3) out.push({ titulo: texto(acima(t, (p) => /h\d|caption/.test(p.tag)) || null), linhas: linhasTabela });
  }
  return out;
}
// tabela sem cabeçalho: nas linhas há a equipa e 7 a 9 números; os pontos são o número que é 3V+E
function adivinharColunas(rows, mapa) {
  const r0 = rows[0];
  const iEq = mapa.indexOf("equipa");
  const numeros = r0.map((c, k) => (k !== iEq && /^-?\d+$/.test(String(c).trim()) ? k : -1)).filter((k) => k >= 0);
  if (numeros.length < 7) return mapa;
  const vals = (r) => numeros.map((k) => num(String(r[k]).trim()));
  // padrões mais comuns: [pos] P J V E D GM GS [DG]  ou  [pos] J V E D GM GS [DG] P
  const tentativas = [
    ["pts", "j", "v", "e", "d", "gm", "gs", "dg"],
    ["j", "v", "e", "d", "gm", "gs", "dg", "pts"],
    ["j", "v", "e", "d", "gm", "gs", "pts"],
    ["pts", "j", "v", "e", "d", "gm", "gs"],
  ];
  for (const comPos of [true, false]) {
    for (const t of tentativas) {
      const offs = comPos ? 1 : 0;
      if (numeros.length < t.length + offs) continue;
      const ok = rows.every((r) => {
        const v = vals(r);
        const o = Object.fromEntries(t.map((c, k) => [c, v[k + offs]]));
        return o.j === o.v + o.e + o.d && o.pts >= o.v * 3 + o.e - 6 && o.pts <= o.v * 3 + o.e + 3;
      });
      if (ok) {
        const novo = [...mapa];
        if (comPos) novo[numeros[0]] = "pos";
        t.forEach((c, k) => { novo[numeros[k + offs]] = c; });
        return novo;
      }
    }
  }
  return mapa;
}

// ───────── estrutura da competição (fases, séries, jornadas) ─────────
const TIPOS = [["fixture", "jornada"], ["round", "jornada"], ["serie", "serie"], ["series", "serie"], ["group", "serie"], ["phase", "fase"], ["stage", "fase"]];
export function lerEstrutura(raiz) {
  const achados = { jornada: new Map(), serie: new Map(), fase: new Map() };
  const junta = (tipo, id, nome, no) => {
    if (!id || achados[tipo].has(id)) return;
    achados[tipo].set(id, { id, nome: (nome || "").replace(/\s+/g, " ").trim(), selecionado: !!(no?.attrs?.selected != null || /active|selected|current/i.test(no?.attrs?.class || "")) });
  };
  // listas de opções: <select id="fixtures"><option value="123">Jornada 1 - 14/09/2026</option>
  for (const sel of porTag(raiz, "select")) {
    const chave = norm(`${sel.attrs.id || ""} ${sel.attrs.name || ""} ${sel.attrs.class || ""}`);
    const opts = porTag(sel, "option");
    const rot = norm(opts.map((o) => texto(o)).join(" "));
    const tipo = /fixture|jornada|round/.test(chave) || /jornada/.test(rot) ? "jornada" : /serie|group|grupo/.test(chave) || /serie|grupo|zona/.test(rot) ? "serie" : /phase|fase|stage/.test(chave) || /fase/.test(rot) ? "fase" : null;
    if (!tipo) continue;
    for (const o of opts) if (/^\d+$/.test(o.attrs.value || "")) junta(tipo, o.attrs.value, texto(o), o);
  }
  // ligações e atributos com fixtureId=…, serieId=…, phaseId=…
  for (const [k, v, n] of atributos(raiz)) {
    if (!/href|onclick|data-|value/.test(k)) continue;
    for (const [chave, tipo] of TIPOS) {
      const id = ids(v, `${chave}Id`) || (k === `data-${chave}-id` || k === `data-${chave}id` || k === `data-${chave}` ? (String(v).match(/\d+/) || [])[0] : null);
      if (id) junta(tipo, id, texto(n) || n.attrs.title || "", n);
    }
  }
  const jornadas = [...achados.jornada.values()].map((j) => {
    const nn = norm(j.nome);
    const m = nn.match(/(\d+)\s*[aª]?\s*jornada|jornada\s*(\d+)|^j\.?\s*(\d+)|^(\d+)$/);
    return { ...j, n: m ? +(m[1] || m[2] || m[3] || m[4]) : null, data: lerData(j.nome) };
  });
  // jornadas sem número: ficam numeradas pela ordem em que aparecem
  jornadas.forEach((j, i) => { if (j.n == null) j.n = i + 1; });
  return { jornadas, series: [...achados.serie.values()], fases: [...achados.fase.values()] };
}

export const tituloDe = (raiz) => {
  const t = texto(porTag(raiz, "title")[0]).replace(/\s*[—–|-]\s*(Compet[ií]ç[õo]es|Resultados|FPF).*$/i, "").trim();
  if (t && !/^(resultados|fpf|competi)/i.test(t)) return t;
  const h = porTag(raiz, "h1")[0] || porTag(raiz, "h2")[0];
  return h ? texto(h) : t;
};

// ───────── leituras de alto nível ─────────
export async function competicoesDaAssociacao(assocId, epoca) {
  const url = `/Competition/GetCompetitionsByAssociation?associationId=${assocId}&seasonId=${epoca}`;
  const html = await pedir(url);
  const lista = lerListaCompeticoes(html);
  if (!amostras.lista || !lista.length) guardaAmostra("lista", url, html);
  return lista;
}
export async function competicoesNacionais() {
  const html = await pedir("/");
  const lista = lerListaCompeticoes(html);
  if (!lista.length) guardaAmostra("nacionais", "/", html);
  return lista;
}

export function lerPaginaCompeticao(html) {
  const raiz = parse(html);
  return { titulo: tituloDe(raiz), ...lerEstrutura(raiz), jogos: lerJogos(raiz), tabelas: lerTabelas(raiz) };
}
export async function competicao(competitionId, epoca) {
  const url = `/Competition/Details?competitionId=${competitionId}&seasonId=${epoca}`;
  const html = await pedir(url);
  const p = lerPaginaCompeticao(html);
  if (!amostras.competicao || (!p.jogos.length && !p.series.length)) guardaAmostra("competicao", url, html);
  return p;
}

// uma peça que se carrega à parte (jornada ou série): experimenta os endereços conhecidos e fica com o que dá jogos
async function peca(tipo, id) {
  const lista = tipo === "jornada" ? URL_JORNADA : URL_SERIE;
  const fixo = tipo === "jornada" ? estado.urlJornada : estado.urlSerie;
  const ordem = fixo ? [fixo, ...lista.filter((u) => u !== fixo)] : lista;
  let ultimoErro = null;
  for (const modelo of ordem) {
    try {
      const html = await pedir(modelo.replace("{id}", id), { tentativas: 1 });
      const r = lerPaginaCompeticao(html);
      if (r.jogos.length || r.tabelas.length || r.jornadas.length) {
        if (tipo === "jornada") estado.urlJornada = modelo; else estado.urlSerie = modelo;
        return r;
      }
    } catch (e) { ultimoErro = e; }
  }
  if (ultimoErro) throw ultimoErro;
  return { jogos: [], tabelas: [], jornadas: [], series: [], fases: [] };
}
export const jornada = (fixtureId) => peca("jornada", fixtureId);
export const serie = (serieId) => peca("serie", serieId);
