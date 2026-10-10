// Transmissões em direto no YouTube das associações de futebol, do Canal 11 e da FPF (secção Distritais).
//
// Cada associação tem um canal de YouTube onde transmite jogos. O servidor:
//   1. sabe o canal de cada uma (o youtube.json, se lá estiver; senão procura no YouTube o nome da associação e fica
//      com o primeiro canal cujo nome bate certo; o que encontrou fica guardado em data/youtube-canais.json);
//   2. de poucos em poucos minutos, abre o separador «Diretos» (/streams) de cada canal, onde o YouTube põe as
//      transmissões a decorrer e todas as que estão agendadas (com a hora). Só essas contam: as que já acabaram ficam
//      de fora. Se o separador não se deixar ler, usa a página «/live» (que só mostra uma transmissão).
// Os canais das associações estão em CANAIS_CONHECIDOS; as que lá não estão são procuradas pelo nome.
// Não precisa de chave. Os pedidos ao YouTube são espaçados (um a cada YOUTUBE_SEGUNDOS, 5 s por omissão), por isso
// cada canal é revisto a cada 2 minutos.
import fs from "node:fs";
import { sleep, norm } from "../util.js";
import { ASSOCIACOES } from "./catalogo.js";

const FICHEIRO = new URL("../../data/youtube-canais.json", import.meta.url);
const CONFIG = new URL("../../youtube.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// sem isto, os pedidos vindos da Europa vão parar à página de consentimento de cookies do YouTube
const CABECALHOS = { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9", Accept: "text/html,*/*;q=0.8", Cookie: "CONSENT=YES+cb; SOCS=CAI" };

// o nome da terra de cada associação, para reconhecer o canal («AF Viseu», «Associação de Futebol de Viseu», «AFV TV»)
const terra = (a) => a.nome.replace(/^AF /, "");
// os canais de cada associação (os que não estão aqui são procurados no YouTube pelo nome). Uma associação pode ter
// mais do que um; as transmissões repetidas aparecem uma vez só.
export const CANAIS_CONHECIDOS = {
  "af-algarve": ["@afalgarve1922"],
  "af-angra": ["UC1YJ_VcfRrzS4hfIBpDP-9A"],
  "af-aveiro": ["@afaveiro_oficial"],
  "af-beja": ["@associacaofutebolbeja"],
  "af-braga": ["@afbragaTV"],
  "af-braganca": ["@af_braganca"],
  "af-castelo-branco": ["@associacaofutebolcastelobr4578"],
  "af-coimbra": ["@af.coimbra"],
  "af-evora": ["@AFevoraTV"],
  "af-guarda": ["@AFGuarda1940"],
  "af-horta": ["https://www.youtube.com/c/Associa%C3%A7%C3%A3odeFuteboldaHorta"],
  "af-leiria": ["@afleiriaoficial"],
  "af-lisboa": ["UCXSPgjw-KXn86J_upO98LWg"], // «AFL TV»
  "af-madeira": ["@AFMadeiraTV"],
  "af-ponta-delgada": ["@afpd_tv"],
  "af-portalegre": ["@apftv85"], // «APF TV»
  "af-porto": ["@associacaodefuteboldoporto"],
  "af-santarem": ["@AFSantarem"],
  "af-setubal": ["@afsetubal2570"],
  "af-viana": ["@AFVC1923", "UCItukc3FMSu7zL-8V2_11Kw"], // «AFVC TV»
  "af-vila-real": ["UC733i_NcTy8c9mZJIUN2ewA"],
  "af-viseu": ["@AFViseuTV"],
};
export function canaisBase() {
  return [
    { id: "fpf", nome: "FPF", canal: "@FPF.Oficial", procurar: "FPF Federação Portuguesa de Futebol", reconhece: "federacao portuguesa de futebol|\\bfpf\\b" },
    { id: "canal11", nome: "Canal 11", canal: "@Canal11Oficial", procurar: "Canal 11", reconhece: "^canal ?11" },
    // um registo por canal: o primeiro tem o id da associação, os outros «af-…:2», «af-…:3»
    ...ASSOCIACOES.flatMap((a) => (CANAIS_CONHECIDOS[a.key] || [null]).map((canal, i) => ({
      id: i ? `${a.key}:${i + 1}` : a.key, assoc: a.key, nome: a.nome, procurar: a.longo, canal,
      reconhece: `(associacao de futebol|\\baf\\b|futebol).*${norm(terra(a))}|${norm(terra(a))}.*(futebol|\\baf\\b)`,
    }))),
  ];
}

// endereço da página de um canal a partir do id (UC…), do @nome ou de um endereço completo
export function urlCanal(c) {
  const s = String(c || "").trim();
  if (/^https?:\/\//.test(s)) return s.replace(/\/+$/, "");
  if (/^UC[\w-]{22}$/.test(s)) return `https://www.youtube.com/channel/${s}`;
  if (/^@/.test(s)) return `https://www.youtube.com/${s}`;
  return null;
}

// a página «/live» de um canal: em direto, a transmissão marcada, ou nada
export function lerLive(html) {
  const t = String(html || "");
  const id = t.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1]
    || t.match(/"videoDetails":\{"videoId":"([\w-]{11})"/)?.[1] || null;
  if (!id) return null;
  const aoVivo = /"isLiveNow":true/.test(t) || /"videoDetails":\{[^}]*"isLive":true/.test(t);
  const marcada = !aoVivo && /"isUpcoming":true/.test(t);
  if (!aoVivo && !marcada) return null; // a página mostra um vídeo antigo, não uma transmissão
  const dec = (s) => { try { return JSON.parse(`"${s}"`); } catch { return s; } };
  const titulo = t.match(/<meta name="title" content="([^"]*)"/)?.[1] || dec(t.match(/"videoDetails":\{[^}]*?"title":"((?:[^"\\]|\\.)*)"/)?.[1] || "");
  const canal = dec(t.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1] || t.match(/"author":"((?:[^"\\]|\\.)*)"/)?.[1] || "");
  const inicio = +(t.match(/"scheduledStartTime":"(\d{9,11})"/)?.[1] || 0) * 1000 || Date.parse(t.match(/"startTimestamp":"([^"]+)"/)?.[1] || "") || null;
  const espetadores = +(t.match(/"concurrentViewers":"(\d+)"/)?.[1] || 0) || null;
  return {
    videoId: id, titulo: entidades(titulo), canal, aoVivo, marcada, inicio, espetadores,
    url: `https://www.youtube.com/watch?v=${id}`, imagem: `https://i.ytimg.com/vi/${id}/${aoVivo ? "hqdefault_live" : "hqdefault"}.jpg`,
  };
}
const entidades = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// o JSON que o YouTube põe na página (ytInitialData)
function dadosIniciais(html) {
  const t = String(html || "");
  const i = t.search(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*\{/);
  if (i < 0) return null;
  const ini = t.indexOf("{", i);
  const fim = t.indexOf(";</script>", ini);
  if (fim < 0) return null;
  try { return JSON.parse(t.slice(ini, fim)); } catch { return null; }
}
const textoDe = (x) => (x == null ? "" : typeof x === "string" ? x : x.simpleText || x.content || (x.runs || []).map((r) => r.text).join(""));

// o separador «Diretos» (/streams) de um canal: as transmissões a decorrer e as agendadas (as que já acabaram, não).
// Devolve null se a página não trouxer a lista (para se usar a «/live»).
export function lerStreams(html) {
  const dados = dadosIniciais(html);
  if (!dados) return null;
  const canal = textoDe(dados.metadata?.channelMetadataRenderer?.title) || textoDe(dados.header?.pageHeaderRenderer?.pageTitle) || "";
  const out = new Map();
  let vistos = 0;
  const juntar = (d) => { if (d.videoId && !out.has(d.videoId)) out.set(d.videoId, d); };
  const ver = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { for (const x of o) ver(x); return; }
    // formato clássico
    const r = o.videoRenderer || o.gridVideoRenderer;
    if (r?.videoId) {
      vistos++;
      const estilos = JSON.stringify([r.thumbnailOverlays || [], r.badges || []]);
      const aoVivo = /"style":"LIVE"|BADGE_STYLE_TYPE_LIVE_NOW/.test(estilos);
      const inicio = +(r.upcomingEventData?.startTime || 0) * 1000 || null;
      const marcada = !aoVivo && (!!r.upcomingEventData || /"style":"UPCOMING"/.test(estilos));
      if (aoVivo || marcada) {
        const vistas = textoDe(r.viewCountText);
        juntar({ videoId: r.videoId, titulo: textoDe(r.title), aoVivo, marcada, inicio, espetadores: aoVivo ? +(vistas.replace(/\D/g, "")) || null : null });
      }
      return;
    }
    // formato novo («lockup»)
    const l = o.lockupViewModel;
    if (l?.contentId && /VIDEO/i.test(l.contentType || "VIDEO")) {
      vistos++;
      const tudo = JSON.stringify(l);
      const aoVivo = /BADGE_STYLE_LIVE|"text":"(LIVE|AO VIVO|EM DIRETO|DIRETO)"/i.test(tudo);
      const inicio = +(tudo.match(/"startTime":"(\d{9,11})"/)?.[1] || 0) * 1000 || null;
      const marcada = !aoVivo && (!!inicio || /UPCOMING|SCHEDULED|"text":"(Brevemente|Em breve|Coming soon|Upcoming|Scheduled|Agendad[oa]|Estreia|Premieres?|Pr[oó]ximamente)|Notify me|Notificar-me|Receber notifica/i.test(tudo));
      if (aoVivo || marcada) {
        juntar({ videoId: l.contentId, titulo: textoDe(l.metadata?.lockupMetadataViewModel?.title), aoVivo, marcada, inicio, espetadores: aoVivo ? +(tudo.match(/"text":"([\d.,\s]+) (?:watching|a ver|espetadores)/i)?.[1] || "").replace(/\D/g, "") || null : null });
      }
      return;
    }
    for (const k in o) ver(o[k]);
  };
  ver(dados.contents || dados);
  const lista = [...out.values()].map((d) => ({
    ...d, titulo: entidades(d.titulo), canal, url: `https://www.youtube.com/watch?v=${d.videoId}`,
    imagem: `https://i.ytimg.com/vi/${d.videoId}/${d.aoVivo ? "hqdefault_live" : "hqdefault"}.jpg`,
  }));
  return { canal, lista, vistos };
}

// a hora de início de uma transmissão agendada, na página do vídeo
export function horaMarcada(html) {
  const t = String(html || "");
  return +(t.match(/"scheduledStartTime":"(\d{9,11})"/)?.[1] || 0) * 1000 || Date.parse(t.match(/"startTimestamp":"([^"]+)"/)?.[1] || "") || null;
}

// pesquisa de canais no YouTube: [{ id, titulo }] pela ordem dos resultados
export function lerPesquisaCanais(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/"channelRenderer":\{"channelId":"(UC[\w-]{22})","title":\{"simpleText":"((?:[^"\\]|\\.)*)"/g)) {
    let titulo = m[2];
    try { titulo = JSON.parse(`"${m[2]}"`); } catch { /* fica */ }
    if (!out.some((x) => x.id === m[1])) out.push({ id: m[1], titulo });
  }
  return out;
}

export function createYoutube({ log = () => {} } = {}) {
  const ativo = process.env.YOUTUBE_DIRETOS !== "0";
  const GAP = Math.max(3, Number(process.env.YOUTUBE_SEGUNDOS) || 5) * 1000;
  // canais: os de base, com o que estiver no youtube.json por cima ({ "canais": [{ "id": "af-viseu", "canal": "@…" }] })
  let extra = [];
  try { extra = JSON.parse(fs.readFileSync(CONFIG, "utf8")).canais || []; } catch { /* sem youtube.json */ }
  const canais = canaisBase().map((c) => ({ ...c, ...(extra.find((e) => e.id === c.id) || {}) }));
  for (const e of extra) if (!canais.some((c) => c.id === e.id) && e.canal) canais.push({ nome: e.id, ...e });
  let guardado = {};
  try { guardado = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { /* primeira vez */ }
  const gravar = () => { try { fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(guardado)); } catch { /* */ } };
  const estado = Object.fromEntries(canais.map((c) => [c.id, { ultimo: null, erro: null, diretos: [], via: null }]));
  const geral = { pedidos: 0, erros: 0, pausaAte: 0, ultimoErro: null, emCurso: null, voltas: 0, ultimaVolta: null };
  const horas = new Map(); // videoId → hora de início de um agendado

  // cada pedido tem um limite rígido (a ligação, a resposta e o corpo): um pedido pendurado não pode parar o ciclo
  async function pedir(url, limite = 25000) {
    geral.pedidos++;
    const ctl = new AbortController();
    const prazo = new Promise((_, rej) => { ctl.signal.addEventListener("abort", () => rej(new Error(`o YouTube não respondeu em ${limite / 1000} s`))); });
    const t = setTimeout(() => ctl.abort(), limite);
    geral.emCurso = { url, desde: new Date().toISOString() };
    try {
      return await Promise.race([prazo, (async () => {
        const r = await fetch(url, { headers: CABECALHOS, redirect: "follow", signal: ctl.signal });
        if (r.status === 429) { geral.pausaAte = Date.now() + 30 * 60e3; throw Object.assign(new Error("o YouTube pediu uma pausa (429)"), { status: 429 }); }
        if (!r.ok) throw Object.assign(new Error(`o YouTube respondeu ${r.status}`), { status: r.status });
        const html = await r.text();
        if (/consent\.youtube\.com|before you continue to youtube|antes de continuar para o youtube/i.test(r.url + html.slice(0, 3000))) throw new Error("o YouTube mostrou a página de consentimento de cookies");
        return html;
      })()]);
    } finally {
      clearTimeout(t);
      geral.emCurso = null;
    }
  }

  // o canal de um organizador: o do youtube.json, o já encontrado, ou procura-se no YouTube pelo nome
  async function canalDe(c) {
    if (c.canal) return urlCanal(c.canal);
    const g = guardado[c.id];
    if (g?.canalId) return urlCanal(g.canalId);
    if (g?.procuradoEm && Date.now() - g.procuradoEm < 7 * 86400e3) return null; // não encontrado: volta a procurar daqui a uma semana
    const html = await pedir(`https://www.youtube.com/results?search_query=${encodeURIComponent(c.procurar)}&sp=EgIQAg%253D%253D`);
    const re = new RegExp(c.reconhece, "i");
    const achado = lerPesquisaCanais(html).find((x) => re.test(norm(x.titulo)));
    guardado[c.id] = { canalId: achado?.id || null, titulo: achado?.titulo || null, procuradoEm: Date.now() };
    gravar();
    if (achado) log(`[YouTube] ${c.nome}: canal «${achado.titulo}» (${achado.id})`);
    else log(`[YouTube] ${c.nome}: não encontrei o canal (põe-no no youtube.json)`);
    return achado ? urlCanal(achado.id) : null;
  }

  async function correr() {
    log(`[YouTube] diretos de ${canais.length} canais (associações, Canal 11 e FPF), um a cada ${GAP / 1000} s`);
    for (let i = 0; ; i = (i + 1) % canais.length) {
      if (Date.now() < geral.pausaAte) { await sleep(Math.min(60e3, geral.pausaAte - Date.now())); continue; }
      const c = canais[i];
      const e = estado[c.id];
      try {
        const base = await canalDe(c);
        if (base) {
          // o separador «Diretos»: todas as transmissões agendadas e as que estão a decorrer
          let lista = null;
          const st = lerStreams(await pedir(`${base}/streams`));
          if (st && st.vistos > 0) { lista = st.lista; e.via = "streams"; } else if (st && !st.vistos) { lista = []; e.via = "streams (vazio)"; }
          // o separador não se deixou ler (o YouTube mudou o formato?): a página «/live», que só mostra uma
          if (!st) {
            const d = lerLive(await pedir(`${base}/live`));
            lista = d ? [d] : [];
            e.via = "live";
          }
          // a lista nova do YouTube não traz a hora dos agendados: lê-se na página do vídeo (uma vez por vídeo)
          for (const d of lista) {
            if (!d.marcada || d.inicio) continue;
            if (!horas.has(d.videoId)) {
              try { horas.set(d.videoId, horaMarcada(await pedir(`https://www.youtube.com/watch?v=${d.videoId}`))); } catch { horas.set(d.videoId, null); }
              if (horas.size > 500) horas.delete(horas.keys().next().value);
            }
            d.inicio = horas.get(d.videoId) || null;
          }
          const nomeCanal = st?.canal || guardado[c.id]?.titulo || c.nome;
          for (const d of lista) {
            if (!d.canal) d.canal = nomeCanal;
            if (d.aoVivo && !e.diretos.some((x) => x.videoId === d.videoId && x.aoVivo)) log(`[YouTube] em direto em ${c.nome}: ${d.titulo}`);
          }
          e.diretos = lista.map((d) => ({ ...d, org: c.assoc || c.id, nomeOrg: c.nome }));
          if (st?.canal && !guardado[c.id]?.titulo) { guardado[c.id] = { ...guardado[c.id], titulo: st.canal }; gravar(); }
          e.canalUrl = base;
        }
        e.ultimo = Date.now();
        e.erro = base ? null : "canal por encontrar";
      } catch (err) {
        geral.erros++;
        e.erro = err.message;
        geral.ultimoErro = { canal: c.id, erro: err.message, ts: Date.now() };
      }
      if (i === canais.length - 1) { geral.voltas++; geral.ultimaVolta = new Date().toISOString(); }
      geral.batida = Date.now();
      await sleep(GAP);
    }
  }

  return {
    start() {
      if (!ativo) return;
      // se o ciclo parar (um erro inesperado), recomeça; o vigia confirma de minuto a minuto que ele anda
      const arrancar = () => correr().catch((e) => { log(`[YouTube] o ciclo parou (${e.message}); recomeça daqui a 1 min`); setTimeout(arrancar, 60e3); });
      arrancar();
      setInterval(() => {
        if (geral.batida && Date.now() - geral.batida > 5 * 60e3 && Date.now() > geral.pausaAte) log(`[YouTube] o ciclo está parado há ${Math.round((Date.now() - geral.batida) / 60e3)} min${geral.emCurso ? ` (à espera de ${geral.emCurso.url})` : ""}`);
      }, 60e3).unref?.();
    },
    diretos() {
      const lista = [...new Map(Object.values(estado).flatMap((e) => e.diretos || []).map((d) => [d.videoId, d])).values()];
      // uma transmissão marcada há mais de 3 horas já não é «a seguir»
      const agora = Date.now();
      return {
        aoVivo: lista.filter((d) => d.aoVivo).sort((a, b) => (b.espetadores || 0) - (a.espetadores || 0)),
        aSeguir: lista.filter((d) => d.marcada && (!d.inicio || d.inicio > agora - 3 * 3600e3)).sort((a, b) => (a.inicio || 9e15) - (b.inicio || 9e15)),
      };
    },
    estado: () => ({
      ativo, ...geral, batida: geral.batida ? new Date(geral.batida).toISOString() : null,
      canais: canais.map((c) => ({ id: c.id, nome: c.nome, canal: c.canal || guardado[c.id]?.canalId || null, nomeDoCanal: guardado[c.id]?.titulo || null, url: estado[c.id]?.canalUrl || null, ultimaLeitura: estado[c.id]?.ultimo ? new Date(estado[c.id].ultimo).toISOString() : null, erro: estado[c.id]?.erro || null, via: estado[c.id]?.via || null, emDireto: (estado[c.id]?.diretos || []).filter((d) => d.aoVivo).length, agendados: (estado[c.id]?.diretos || []).filter((d) => d.marcada).length })),
    }),
  };
}
