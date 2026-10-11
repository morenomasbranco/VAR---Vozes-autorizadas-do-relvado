// Sites com feed RSS/Atom: verificação a cada 15 s, com pedidos condicionais (ETag) para não sobrecarregar os sites.
// Se o site bloquear o servidor, não indicar o feed ou tiver um feed parado, a fonte passa a ser lida pelo
// feed público do Google News para esse site (atraso de alguns minutos, mas funciona a partir de qualquer servidor).
import Parser from "rss-parser";
import { sleep, hash, BACKFILL_MS, lerTexto, entidades, conserta } from "../util.js";

const parser = new Parser({
  timeout: 10000,
  customFields: { item: [["dc:date", "dcDate"], ["dcterms:created", "dctCreated"], ["published", "published"], ["updated", "updated"], ["a10:updated", "a10Updated"], ["source", "source"]] },
});
// alguns feeds (Sky Sports em vídeos, por exemplo) não datam os itens
const dataDe = (it) => Date.parse(it.isoDate || it.pubDate || it.dcDate || it.dctCreated || it.published || it.updated || it.a10Updated || "") || null;
const UA = "Mozilla/5.0 (compatible; VAR-feed/1.0; agregador de notícias de desporto)";
// alguns sites (A Bola, Observador, Canal 11, AP…) recusam pedidos de programas e respondem 403 ao
// agregador. Nesses casos vale a pena repetir o pedido do feed como um browser normal; põe
// RSS_UA_ALTERNATIVO=0 no .env para não o fazer.
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TENTAR_BROWSER = process.env.RSS_UA_ALTERNATIVO !== "0";
const origem = (u) => { try { return new URL(u).origin; } catch { return undefined; } };
// pedido ao site: se responder 403 ou 401, repete uma vez como browser
async function pedir(url, headers) {
  const res = await fetch(url, { headers: { ...headers, "User-Agent": UA }, redirect: "follow" });
  if (![401, 403].includes(res.status) || !TENTAR_BROWSER) return res;
  return fetch(url, { headers: { ...headers, "User-Agent": UA_BROWSER, Referer: origem(url), "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8" }, redirect: "follow" });
}
const INTERVAL = Math.max(1, Number(process.env.RSS_SEGUNDOS) || 15) * 1000;
// fontes marcadas como "rapido": leitura ao segundo enquanto o feed dá sinal de vida, abrandando quando
// fica parado. Os pedidos são condicionais (ETag), por isso um feed sem novidades responde só "304".
const FAST = Math.max(1, Number(process.env.RSS_RAPIDO_SEGUNDOS) || 1) * 1000;
const FAST_STEPS = [[10 * 60e3, FAST], [60 * 60e3, 5000], [Infinity, 15000]]; // parado há X → ler a cada Y
const GOOGLE_INTERVAL = Math.max(10, Number(process.env.GOOGLE_NEWS_SEGUNDOS) || 30) * 1000; // o Google News indexa com alguns minutos de atraso; ler mais vezes encurta só a última espera
const GOOGLE_BASE = process.env.GOOGLE_NEWS_BASE || "https://news.google.com/rss/search";
const LOCALES = { pt: "hl=pt-PT&gl=PT&ceid=PT:pt-150", en: "hl=en-GB&gl=GB&ceid=GB:en", fr: "hl=fr&gl=FR&ceid=FR:fr", es: "hl=es&gl=ES&ceid=ES:es", it: "hl=it&gl=IT&ceid=IT:it", de: "hl=de&gl=DE&ceid=DE:de", tr: "hl=tr&gl=TR&ceid=TR:tr", nl: "hl=nl&gl=NL&ceid=NL:nl", pl: "hl=pl&gl=PL&ceid=PL:pl",
  // edições regionais do Google News, para as fontes do Resto do Mundo (campo "locale" no fontes.json)
  br: "hl=pt-BR&gl=BR&ceid=BR:pt-419", ar: "hl=es-419&gl=AR&ceid=AR:es-419", mx: "hl=es-419&gl=MX&ceid=MX:es-419", us: "hl=en-US&gl=US&ceid=US:en" };
const STALE_MS = 7 * 86400e3;
const decode = (t) => entidades(t); // tabela completa em util.js (inclui entidades duplamente escapadas)
// o zerozero põe marcas internas no texto: {TEAM_LINK|9|FC Porto} fica só «FC Porto»
const unmark = (t) => t.replace(/\{[A-Z_]+\|\d+\|([^}]*)\}/g, "$1").replace(/\{[A-Z_]+\|([^}|]*)\}/g, "$1");
const clean = (html = "") => conserta(unmark(decode(String(html).replace(/<[^>]+>/g, " ")))).replace(/\s+/g, " ").trim();
// Feeds gerais (ex. últimas do JN, destaques do SAPO): só entram as notícias de desporto.
// Decide-se por esta ordem: a secção do endereço manda, depois as categorias do feed,
// e só quando nenhuma das duas diz nada é que se olha para as palavras do título.

// o endereço diz que é desporto: .../desporto/..., /sport/, /futebol/, /deportes/
const SEC_DESPORTO = /[/._=-](despo[rt]\w*|sport\w*|esporte\w*|futebol|football|soccer|calcio|deporte\w*|fussball|olimp\w*|olympic\w*)([/._=?-]|$)/i;
// o endereço diz que é outra secção: aí não entra, mesmo que o título fale de um clube
const SEC_OUTRA = /[/._=-](politica|economia|dinheiro|negocios|mundo|internacional|sociedade|pais|nacional|local|locais|cultura|cultura-e-espetaculos|tecnologia|ciencia|saude|opiniao|opinion|editorial|lifestyle|vida|famosos|media|televisao|tv-e-media|autos|motores|casas|imobiliario|educacao|justica|crime|ambiente|clima|autarquicas|eleicoes|politics|business|world|health|science|culture|entertainment|lifestyle)([/._=?-]|$)/i;
// palavras que só aparecem em notícias de desporto (sem «liga», «mundial», «clube» ou «vitória»
// isolados, que davam entrada a política, economia e notícias da cidade de Braga)
const DESPORTO = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[
  "despo[rt]\\w*", "futebol\\w*", "f[uú]tsal", "andebol", "basquete\\w*", "v[oó]lei\\w*", "h[oó]quei",
  "atletismo", "ciclismo", "ciclista", "t[eé]nis\\b", "tenista", "nata[cç][aã]o", "nadador\\w*", "r[aá]guebi", "rugby", "automobilismo",
  "f[oó]rmula ?1", "motogp", "golfe", "golfista", "surf\\w*", "jud[oó]ca", "jogos ol[ií]mpicos", "paral[ií]mpic\\w*", "medalha de (ouro|prata|bronze)",
  // clubes e competições, sempre em forma que não se confunde com outra coisa
  "benfica", "sporting", "fc porto", "sl benfica", "scp\\b", "sad\\b",
  "vit[oó]ria de (guimar[aã]es|set[uú]bal)", "sporting de braga", "sc braga", "gil vicente", "casa pia",
  "liga (dos campe[oõ]es|europa|confer[eê]ncia|portugal|betclic|nacional|revela[cç][aã]o)",
  "(primeira|segunda|1\\.ª|2\\.ª) liga", "ta[cç]a (de portugal|da liga)", "superta[cç]a",
  "campeonato (do mundo|da europa|nacional) de \\w+", "mundial de (futebol|clubes|atletismo|\\w+ol)", "euro 20\\d\\d",
  "sele(c|ç|cç)[aã]o (nacional|portuguesa)", "sele(c|ç|cç)[aã]o das quinas", "premier league", "laliga", "la liga", "champions",
  // o que se passa dentro do jogo
  "golo\\b", "golos\\b", "golea\\w*", "marcou de", "pen[aá]lti", "grande penalidade",
  "[aá]rbitro (do jogo|da partida|assistente)", "videoárbitro", "\\bvar\\b", "d[eé]rbi", "derby", "cl[aá]ssico (entre|com|no|frente)", "balne[aá]rio", "relvado",
  "treinador", "guarda-redes", "ponta de lan[cç]a", "m[eé]dio ala", "defesa central", "extremo (direito|esquerdo)",
  "plantel", "convocat[oó]ria", "jornada\\b", "mercado de transfer[eê]ncias", "janela de transfer[eê]ncias", "renovou contrato",
].join("|")})`, "iu");
// feeds de um jornal desportivo inteiro (ex. Sky Sports, B/R): só entra futebol de onze
const OUTRAS = /cricket|horse racing|\bracing\b|doncaster|st leger|\bnfl\b|quarterback|touchdown|college football|super league|rugby|\bnba\b|\bwnba\b|golf|p[aá]del|tennis|t[eé]nis|us open|formula ?1|f[oó]rmula ?1|\bf1\b|grand prix|motogp|cycling|ciclismo|athletics|swimming|boxing|ufc|darts|snooker|netball|nhl\b|mlb\b/i;
const FUTEBOL = /football|soccer|futebol|premier league|laliga|la liga|serie a|bundesliga|ligue 1|champions league|europa league|transfer|\bfc\b|\bcf\b|goalkeeper|midfielder|striker|golo|golos/i;
const fail = (message, extra) => Object.assign(new Error(message), extra);

// feed do Google News com as notícias do último dia de um site (ou de uma pesquisa indicada em "google")
export function googleNewsFeed(s) {
  const q = s.google || `site:${new URL(s.site).hostname.replace(/^www\./, "")}`;
  return `${GOOGLE_BASE}?q=${encodeURIComponent(`${q} when:1d`)}&${LOCALES[s.locale] || LOCALES[s.lang] || LOCALES.pt}`;
}

// procura o feed na página indicada: primeiro nas marcas <link rel="alternate">,
// depois nas ligações da própria página (páginas de RSS como a do zerozero listam-nas assim)
export async function discover(site) {
  const res = await pedir(site, {});
  if (!res.ok) throw fail(`o site respondeu ${res.status}`, { status: res.status });
  const html = await lerTexto(res);
  const abs = (h) => new URL(h.replace(/&amp;/g, "&"), res.url).href;
  const tags = (html.match(/<link\b[^>]*>/gi) || []).filter((t) => /alternate/i.test(t) && /(rss|atom)\+xml/i.test(t));
  const link = tags.map((t) => t.match(/href\s*=\s*["']([^"']+)["']/i)?.[1]).find(Boolean);
  if (link) return abs(link);
  const hrefs = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const feedish = hrefs
    .filter((h) => /(rss|feed|atom|xml)/i.test(h) && !/^(mailto|javascript|#)/i.test(h))
    .filter((h) => { try { return abs(h) !== res.url; } catch { return false; } }); // ignorar a ligação para a própria página
  // preferir as ligações com «news» ou «noticias», que são o feed de notícias
  const best = feedish.find((h) => /(news|not[ií]cias)/i.test(h)) || feedish[0];
  return best ? abs(best) : null;
}

// Lista de notícias em JSON, no formato da API de publicações usada por alguns jornais (o Sen7ir: posts2-api…/posts):
// { data: [{ publicId, createdAt: "2026/10/10 19:11:15 +0100", l10n: [{ title, slug, description }] }] }.
// O endereço de cada notícia sai do modelo «artigo» da fonte ({publicId} e {slug}). Devolve o mesmo formato que o
// leitor de RSS (items com title, link, isoDate e contentSnippet), ou null se não for este formato.
export function dePosts2(j, artigo) {
  if (!j || !Array.isArray(j.data) || !artigo) return null;
  const items = j.data.map((p) => {
    const l = (p.l10n || [])[0] || {};
    if (!l.title || !l.slug || !p.publicId) return null;
    const d = String(p.createdAt || l.publishedAt || "").match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
    const iso = d ? new Date(`${d[1]}-${d[2]}-${d[3]}T${d[4]}${d[5]}:${d[6]}`).toISOString() : undefined;
    const link = artigo.replace("{publicId}", p.publicId).replace("{slug}", l.slug);
    return { title: l.title, link, guid: link, isoDate: iso, contentSnippet: l.description || "" };
  }).filter(Boolean);
  return { items };
}

// o filtro de uma fonte: «filtro» (o texto tem de ter) e «exclui» (não pode ter), no título e no resumo
export function passaFiltro(s, texto) {
  const t = String(texto || "");
  return (!s.filtro || new RegExp(s.filtro, "i").test(t)) && (!s.exclui || !new RegExp(s.exclui, "i").test(t));
}

export async function readFeed(url, cache = {}, opcoes = {}) {
  const headers = { Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8" };
  if (cache.etag) headers["If-None-Match"] = cache.etag;
  if (cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;
  const res = await pedir(url, headers);
  if (res.status === 304) return null;
  if (!res.ok) throw fail(`o feed respondeu ${res.status}`, { status: res.status });
  cache.etag = res.headers.get("etag");
  cache.lastModified = res.headers.get("last-modified");
  try {
    const texto = await lerTexto(res);
    if (opcoes.artigo && /^\s*\{/.test(texto)) return dePosts2(JSON.parse(texto), opcoes.artigo) || (() => { throw new Error("json"); })();
    return await parser.parseString(texto);
  } catch {
    throw fail("o endereço não é um feed RSS válido", { parse: true });
  }
}

// estado de cada fonte, para o /api/fontes e para o painel de definições do site
export function startRss(sources, onPost, log, estado = new Map()) {
  for (const s of sources) {
    estado.set(s.id, { via: null, feed: null, ok: null, itens: 0, erro: null, at: null, ms: null });
    run(s);
  }

  async function run(s) {
    const alts = [s.feed, ...(s.feeds || [])].flat().filter(Boolean); // vários endereços possíveis
    let alt = 0;
    let google = !!s.soGoogle;
    let feed = google ? googleNewsFeed(s) : alts[0] || null;
    let seen = new Set();
    let procurado = false; // já se procurou o feed no site
    let fails = 0;
    let wait = INTERVAL;
    let cache = {};
    let first = true; // primeira leitura deste feed
    let lastNew = Date.now(); // última vez que o feed trouxe algo
    let slow = 0; // travão temporário quando o site pede calma (429) ou falha
    const every = () => {
      if (google) return GOOGLE_INTERVAL;
      const base = s.intervalo ? Math.max(1, s.intervalo) * 1000
        : s.rapido ? FAST_STEPS.find(([idle]) => Date.now() - lastNew < idle)[1]
          : INTERVAL;
      return Math.max(base, slow);
    };
    const useGoogle = (why) => {
      feed = googleNewsFeed(s);
      google = true;
      cache = {};
      log(`[RSS] ${s.nome}: ${why}; passo a usar o Google News`);
    };

    for (;;) {
      try {
        if (!feed) {
          const proximo = alts[++alt];
          if (proximo) { feed = proximo; log(`[RSS] ${s.nome}: a experimentar ${feed}`); }
          else { procurado = true; feed = await discover(s.site); } // último recurso antes do Google News
          if (!feed) throw fail(`não encontrei o feed em ${s.site}`, { notFound: true });
          log(`[RSS] ${s.nome}: feed ${feed}`);
        }
        const t0 = Date.now();
        const parsed = await readFeed(feed, cache, { artigo: google ? null : s.artigo });
        const nota = estado.get(s.id);
        if (nota) Object.assign(nota, { via: google ? "Google News" : "RSS", feed, ok: true, erro: null, at: Date.now(), ms: Date.now() - t0, ...(parsed ? { itens: (parsed.items || []).length } : {}) });
        if (parsed) {
          const items = (parsed.items || []).slice(0, 40);
          const dated = items.map(dataDe).filter(Boolean);
          if (!google && dated.length && Date.now() - Math.max(...dated) > STALE_MS) throw fail("o feed não é atualizado há mais de uma semana", { stale: true });
          for (const it of [...items].reverse()) {
            const uniq = items.filter((x) => (x.guid || x.link) === (it.guid || it.link)).length === 1;
            const key = (uniq && (it.guid || it.link)) || `${it.title}|${dataDe(it) || ""}`;
            if (!key || seen.has(key)) continue;
            const dt = dataDe(it);
            // item sem data: na primeira leitura não se publica (não se sabe se é de hoje ou do mês passado);
            // depois disso, a hora em que apareceu no feed é a melhor aproximação que existe
            if (!dt && first) continue;
            lastNew = Date.now();
            // alguns feeds datam as notícias no futuro; nesse caso vale a hora em que chegaram
            const futuro = dt && dt - Date.now() > 2 * 60000;
            const ts = futuro || !dt ? Date.now() : dt;
            if (Date.now() - ts > BACKFILL_MS) continue;
            // no Google News o título vem com « - Nome do jornal» no fim e a descrição repete o título
            const title = google ? clean(it.title).replace(/\s+-\s+[^-]+$/, "") : clean(it.title);
            // no Google News, o jornal que publicou a notícia (serve para as confirmações não trocarem de fonte)
            const editor = google ? clean(it.title).match(/\s+-\s+([^-]+)$/)?.[1]?.trim() || undefined : undefined;
            // num feed geral, deixar passar só o que é desporto (categoria, endereço ou texto)
            if (s.soFutebol) {
              const alvo = `${(it.categories || []).join(" ")} ${it.link || ""} ${title} ${it.contentSnippet || ""}`;
              if (OUTRAS.test(alvo) && !FUTEBOL.test(alvo)) continue;
              if (/\/(cricket|rugby|racing|golf|tennis|nfl|nba|f1|boxing|darts|netball|athletics)\//i.test(it.link || "")) continue;
            }
            if (s.soDesporto) {
              const link = it.link || "";
              // categorias do feed como «/Desporto/Futebol/», sem acentos, para as expressões de secção as reconhecerem
              const cats = `/${(it.categories || []).map((c) => (typeof c === "string" ? c : c?._ || c?.term || "")).join("/")}/`
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
              const secDesporto = SEC_DESPORTO.test(link) || SEC_DESPORTO.test(cats);
              // o endereço ou a categoria dizem que é desporto: entra sem mais perguntas
              if (!secDesporto) {
                // o endereço aponta para outra secção do jornal: não entra
                if (SEC_OUTRA.test(link) || SEC_OUTRA.test(cats)) continue;
                // o feed tem categorias e nenhuma é de desporto (nem um clube, nem uma modalidade): num jornal
                // generalista com categorias fiáveis (Observador), é uma notícia de outra secção
                if (s.categoriasFiaveis && cats.length > 2 && !DESPORTO.test(cats.replace(/[/-]/g, " "))) continue;
                // sem secção reconhecida, exige-se vocabulário inequívoco de desporto no texto
                if (!DESPORTO.test(`${title} ${it.contentSnippet || ""}`)) continue;
              }
            }
            // filtro próprio da fonte (por exemplo, só as notícias de outras modalidades de um jornal regional)
            if ((s.filtro || s.exclui) && !passaFiltro(s, `${title} ${it.contentSnippet || ""}`)) continue;
            const body = google ? "" : clean(it.contentSnippet || it.content || it.summary || "").replace(/\s*submitted by\s+\/u\/\S+[\s\S]*$/i, "");
            onPost({
              postId: `${s.id}:${hash(key)}`,
              src: s.id,
              name: s.nome,
              via: google ? "Google News" : "RSS",
              editor,
              url: it.link || s.site,
              text: `${title}\n${body}`.trim().slice(0, 1500),
              lang: s.lang,
              ts,
              tsAprox: !dt || futuro || undefined, // hora aproximada: o feed não datou o item, ou datou-o no futuro
            });
          }
          seen = new Set(items.map((it) => {
            const uniq = items.filter((x) => (x.guid || x.link) === (it.guid || it.link)).length === 1;
            return (uniq && (it.guid || it.link)) || `${it.title}|${dataDe(it) || ""}`;
          }));
          first = false;
        }
        fails = 0;
        slow = Math.max(0, slow / 2 - 500); // correu bem: levantar o travão aos poucos
        wait = every();
      } catch (e) {
        const nota = estado.get(s.id);
        if (nota) Object.assign(nota, { ok: false, erro: e.message, at: Date.now(), feed, via: google ? "Google News" : nota.via });
        if (e.status === 429 || e.status === 503) {
          // o site pede calma: abrandar até 60 s em vez de desistir do feed
          slow = Math.min(60000, Math.max(5000, slow * 2));
          log(`[RSS] ${s.nome}: ${e.message}; abrando para ${Math.round(slow / 1000)} s`);
          await sleep(slow);
          continue;
        }
        const blocked = [401, 403, 404, 410, 451].includes(e.status) || e.notFound || e.parse || e.stale;
        const maisPorTentar = alt < alts.length - 1 || !procurado; // outro endereço indicado, ou a procura no site
        if (!google && blocked && maisPorTentar) {
          // ainda há outro endereço de feed para experimentar antes de passar ao Google News
          log(`[RSS] ${s.nome}: ${e.message}`);
          feed = null;
          wait = 1000;
        } else if (s.semGoogle && (blocked || ++fails >= 3)) {
          // fontes lidas só pelo próprio feed (Reddit, Transfermarkt): se recusarem, tenta de novo daqui a 15 minutos
          log(`[RSS] ${s.nome}: ${e.message}; nova tentativa daqui a 15 min`);
          fails = 0;
          wait = 15 * 60e3;
        } else if (!google && (blocked || ++fails >= 3)) {
          useGoogle(e.message);
          wait = 1000;
        } else {
          log(`[RSS] ${s.nome}: ${e.message}`);
          wait = Math.min(Math.max(wait * 2, 30000), 300000);
        }
      }
      await sleep(wait);
    }
  }
}
export const _test = { DESPORTO, SEC_DESPORTO, SEC_OUTRA };
export const eDesporto = (t) => DESPORTO.test(String(t || ""));
