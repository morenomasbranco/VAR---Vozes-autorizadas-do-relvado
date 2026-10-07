import { useState, useEffect, useMemo, useRef } from "react";
import { Sun, Moon, Pause, Play, Copy, Share2, ExternalLink, Search, Check, CheckCheck, SlidersHorizontal, ListFilter, Star, ArrowRight, ChevronLeft, ChevronRight, Maximize2, Minimize2, X as Fechar } from "lucide-react";

/* ───────── Fontes (contas do X) ───────── */
const SOURCES = []; // a lista de fontes vem do servidor (/api/sources)
const SRC = Object.fromEntries(SOURCES.map(([h, n]) => [h, { handle: h, name: n }]));
// endereço do servidor; vazio quando o site e o servidor estão no mesmo domínio
const API = import.meta.env.VITE_API_URL || "";
const srcOf = (it) => SRC[it.src] || { handle: it.src, name: it.name || it.src };

/* ───────── Secções ───────── */
const CATS = [
  { id: "destaque", pt: "Feed", en: "Feed", es: "Feed", fr: "Feed", it: "Feed", de: "Feed", hl: "dest" },
  { id: "resultados", pt: "Resultados", en: "Results", es: "Resultados", fr: "Résultats", it: "Risultati", de: "Ergebnisse" },
  { id: "porto", pt: "Porto", en: "Porto", es: "Porto", fr: "Porto", it: "Porto", de: "Porto", club: true },
  { id: "sporting", pt: "Sporting", en: "Sporting", es: "Sporting", fr: "Sporting", it: "Sporting", de: "Sporting", club: true },
  { id: "benfica", pt: "Benfica", en: "Benfica", es: "Benfica", fr: "Benfica", it: "Benfica", de: "Benfica", club: true },
  { id: "mercado", pt: "Mercado", en: "Transfers", es: "Mercado", fr: "Transferts", it: "Mercato", de: "Transfers" },
  { id: "modalidades", pt: "Modalidades", en: "Other sports", es: "Otros deportes", fr: "Autres sports", it: "Altri sport", de: "Andere Sportarten" },
  { id: "estatisticas", pt: "Estatísticas", en: "Stats", es: "Estadísticas", fr: "Statistiques", it: "Statistiche", de: "Statistiken" },
  { id: "premios", pt: "Prémios", en: "Awards", es: "Premios", fr: "Trophées", it: "Premi", de: "Auszeichnungen" },
  { id: "portugueses", pt: "Portugueses pelo mundo", en: "Portuguese abroad", es: "Portugueses por el mundo", fr: "Portugais à l'étranger", it: "Portoghesi nel mondo", de: "Portugiesen im Ausland" },
  { id: "efemerides", pt: "Nesta semana", en: "This week in history", es: "Esta semana en la historia", fr: "Cette semaine-là", it: "Questa settimana nella storia", de: "Diese Woche in der Geschichte", hl: "efem" },
  { id: "historias", pt: "Possíveis histórias", en: "Story leads", es: "Posibles historias", fr: "Pistes d'articles", it: "Possibili storie", de: "Mögliche Geschichten", hl: "hist" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

/* ───────── Colunas dos Destaques (proveniência da notícia) ───────── */
const COLS = [
  { id: "pt", pt: "Portugal", en: "Portugal", es: "Portugal", fr: "Portugal", it: "Portogallo", de: "Portugal", pais: "pt" },
  { id: "en", pt: "Inglaterra", en: "England", es: "Inglaterra", fr: "Angleterre", it: "Inghilterra", de: "England", pais: "gb-eng" },
  { id: "es", pt: "Espanha", en: "Spain", es: "España", fr: "Espagne", it: "Spagna", de: "Spanien", pais: "es" },
  { id: "it", pt: "Itália", en: "Italy", es: "Italia", fr: "Italie", it: "Italia", de: "Italien", pais: "it" },
  { id: "de", pt: "Alemanha", en: "Germany", es: "Alemania", fr: "Allemagne", it: "Germania", de: "Deutschland", pais: "de" },
  { id: "fr", pt: "França", en: "France", es: "Francia", fr: "France", it: "Francia", de: "Frankreich", pais: "fr" },
  { id: "mundo", pt: "Resto do Mundo", en: "Rest of the world", es: "Resto del mundo", fr: "Reste du monde", it: "Resto del mondo", de: "Rest der Welt", pais: "un" },
  { id: "portugueses", pt: "Portugueses pelo mundo", en: "Portuguese abroad", es: "Portugueses por el mundo", fr: "Portugais à l'étranger", it: "Portoghesi nel mondo", de: "Portugiesen im Ausland", pais: "pt" },
];
// país de que a notícia trata → coluna; os países que não estão aqui caem no Resto do Mundo
const PAIS_COL = { pt: "pt", gb: "en", "gb-eng": "en", es: "es", it: "it", de: "de", fr: "fr" };
// ligas e clubes que identificam um dos seis países quando a notícia não diz de que país trata
const PAIS_TEXTO = [
  ["pt", /liga portugal|primeira liga|liga betclic|ta[cç]a de portugal|ta[cç]a da liga|\bfc porto\b|\bsporting cp\b|\bsporting (clube de )?portugal\b|\bbenfica\b|\bsc braga\b|vit[oó]ria (sc|de guimar[aã]es)|\bsele[cç][aã]o nacional\b/i],
  ["en", /premier league|\befl\b|fa cup|carabao|\barsenal\b|\bchelsea\b|\bliverpool\b|manchester (city|united)|\bman (city|utd|united)\b|tottenham|newcastle united|aston villa|west ham|\beverton\b|brighton|nottingham forest|crystal palace|\bfulham\b|brentford|bournemouth|wolverhampton/i],
  ["es", /\blaliga\b|\bla liga\b|copa del rey|real madrid|\bbarcelona\b|\bbar[cç]a\b|atl[eé]tico (de )?madrid|\bsevilla\b|\bvalencia cf\b|villarreal|real betis|real sociedad|athletic (club|bilbao)/i],
  ["it", /\bserie a\b|coppa italia|juventus|\bac milan\b|\bmilan\b|\binter(nazionale| de mil[aã]o| milan)\b|\bnapoli\b|\bas roma\b|\blazio\b|atalanta|fiorentina|\bbologna\b|\btorino\b/i],
  ["de", /bundesliga|dfb[- ]pokal|bayern|borussia dortmund|\bdortmund\b|leverkusen|rb leipzig|\bstuttgart\b|eintracht frankfurt|wolfsburg|m[oö]nchengladbach|union berlin|werder bremen/i],
  ["fr", /ligue 1|coupe de france|\bpsg\b|paris saint[- ]germain|olympique (de )?marseille|\bmarseille\b|olympique lyonnais|\blyon\b|\bas monaco\b|\bmonaco\b|\blosc\b|\blille\b|stade rennais|ogc nice/i],
];
const paisPeloTexto = (t) => PAIS_TEXTO.find(([, re]) => re.test(t))?.[0] || null;
// ligas, competições e clubes de fora de Portugal e das Big 5: a notícia vai para o Resto do Mundo
const MUNDO_TEXTO = /brasileir[aã]o|libertadores|sudamericana|sul-americana|conmebol|concacaf|\bafc\b|\bcaf\b|flamengo|palmeiras|corinthians|s[aã]o paulo fc|fluminense|botafogo|gr[eê]mio|atl[eé]tico mineiro|\bcruzeiro\b|vasco da gama|santos fc|boca juniors|river plate|liga profesional|liga mx|club am[eé]rica|\bchivas\b|cruz azul|\bmls\b|inter miami|la galaxy|\blafc\b|saudi pro league|liga saudita|liga [aá]rabe|al[- ]nassr|al[- ]hilal|al[- ]ittihad|al[- ]ahli|al[- ]qadsiah|s[uü]per lig|galatasaray|fenerbah[cç]e|be[sş]ikta[sş]|trabzonspor|eredivisie|\bajax\b|\bpsv\b|feyenoord|az alkmaar|scottish premiership|\bceltic\b|rangers fc|glasgow rangers|old firm|club brugge|anderlecht|olympiacos|olympiakos|panathinaikos|\bpaok\b|shakhtar|d[yi]namo (kyiv|kiev|zagreb)|red bull salzburg|sturm graz|young boys|estrela vermelha|red star belgrade|slavia (praha|prague|praga)|sparta (praha|prague|praga)|copenhaga|fc copenhagen|j[.-]?league|k league|a-league|qatar stars|chinese super league|superliga chinesa/i;
const COL_N = 14; // notícias por coluna
const MIN_IMP_COL = 2; // importância mínima para entrar nos Destaques

// prémios (Bola de Ouro, jogador do mês…) e rankings de valores de mercado não são Mercado, a menos que falem de uma transferência
const PREMIO = /bola de ouro|ballon d'?or|bal[oó]n de oro|pallone d'oro|goldener? ball|golden boy|trof[eé]u (kopa|yashin|gerd m[uü]ller)|kopa trophy|yashin trophy|pr[eé]mio puskas|puskas award|(fifa )?the best awards?|pr[eé]mios? the best|jogador do m[eê]s|treinador do m[eê]s|player of the month|manager of the month|equipa do ano|team of the year|fifpro|\bnominees?\b|valor(es)? de mercado|market values?\b|marktwert|valori? di mercato|mais valiosos|most valuable/i;
const MERCADO_FORTE = /here we go|\btransfer[eê]ncia|\btransfers?\b|contrata[cç][aã]o|\bcontratad[oa]|\brefor[cç]o\b|empr[eé]stimo|\bloan\b|fichaj|\bsigns?\b|\bsigned\b|\bsigning\b|assinou|renov(ou|a[cç][aã]o)|rescis|exames m[eé]dicos|\bmedical\b|acordo (total|verbal|para a (sa[ií]da|transfer))|deal (agreed|done)|mercado de (transfer|inverno|ver[aã]o)|janela de transfer|novo treinador|new (head )?coach|despedid|\bsacked\b/i;
const foraDoMercado = (t) => PREMIO.test(t) && !MERCADO_FORTE.test(t);

// texto sem acentos e em minúsculas, para a pesquisa
const semAcentos = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// secções onde não aparece, à direita de cada notícia, a etiqueta com o nome da secção
const SEM_ETIQUETA = new Set(["porto", "sporting", "benfica", "mercado", "modalidades", "estatisticas", "premios"]);

const inSection = (it, s) => {
  if (s === "historias" || s === "favoritos" || s === "capas" || s === "efemerides") return false;
  if (s === "resultados") return !!it.score;
  if (it.board) return false; // o cartão que se atualiza durante o jogo vive no quadro de resultados
  if (s === "live") return true;
  if (it.src === "resultados") return false; // notícias dos resultados em direto só no Feed e nos Resultados
  if (s === "destaque") return (it.imp || 0) >= MIN_IMP_COL;
  if (s === "mercado") return it.cats.includes(s) && !foraDoMercado(`${it.t?.pt || ""} ${(it.b?.pt || []).join(" ")} ${it.text || ""}`);
  return it.cats.includes(s);
};

/* ───────── Textos da interface ───────── */
const UI = {
  pt: {
    autoOn: "Reprodução automática", autoOff: "Reprodução automática desligada", noGameVideos: "Ainda sem vídeos deste jogo.",
    otherVideos: "Outros vídeos", moreGames: "Ver mais jogos", allGames: "Todos os jogos", pickGame: "Carrega num jogo para ver os vídeos dele.", videoHighlights: "Destaques",
    videoHighlightsNote: "Os vídeos de maior interesse das últimas 24 horas",
    oficiais: "Notícias e comunicados oficiais", ofTodos: "Todos", ofNoticias: "Notícias", ofComunicados: "Comunicados", ofNoticia: "Notícia", ofComunicado: "Comunicado",
    live: "Ao vivo", paused: "Em pausa", nSources: (n) => `${n} fontes`, markRead: "Marcar tudo como lido",
    pause: "Pausar", resume: "Retomar", search: "Pesquisar notícias", copy: "Copiar", copied: "Copiado",
    share: "Partilhar", viewX: "Ver no X", trFrom: { pt: "Traduzido do português", en: "Traduzido do inglês", fr: "Traduzido do francês", es: "Traduzido do espanhol", it: "Traduzido do italiano", de: "Traduzido do alemão", tr: "Traduzido do turco", nl: "Traduzido do neerlandês", pl: "Traduzido do polaco" },
    eventsTitle: "Acontecimentos", noEvents: "Os golos, intervalos e finais dos jogos aparecem aqui assim que acontecem.",
    goals: "Golos", reds: "Expulsões", matchStats: "Estatísticas do jogo", tableLbl: "Classificação", pts: "pts", ord: (n) => `${n}.º`,
    approx: "Hora aproximada: a fonte não datou a notícia",
    settings: "Definições", settingsHint: "Escolhe as fontes e as ligas que queres ver.",
    allSports: "Todas as modalidades", sourcesLbl: "Fontes", confirmed: (n) => `Confirmada por ${n} fontes`,
    about: "Sobre", aboutTitle: (c) => `Notícia sobre: ${c}`, fromTitle: (c) => `Origem: ${c}`,
    pending: (n) => `Mostrar ${n} ${n === 1 ? "nova notícia" : "novas notícias"}`,
    empty: "Sem notícias nesta secção para as fontes ativas. Ativa mais fontes ou escolhe outra secção.",
    connecting: "A ligar ao X", offline: "Sem ligação", offlineNote: "O servidor não responde. A tentar ligar de novo…",
    waiting: "À espera das primeiras notícias. Aparecem aqui assim que uma das fontes publicar.",
    trOther: "Traduzido", moreSources: (n) => `+${n} ${n === 1 ? "fonte" : "fontes"}`,
    all: "Todas", none: "Nenhuma", sources: "Fontes", hot: "Destaque", fresh: "Novo", ft: "Final",
    toLight: "Mudar para modo claro", toDark: "Mudar para modo escuro", locale: "pt-PT",
    tagline: "Verified Action Reports",
    docTitle: "VAR — Verified Action Reports", langLabel: "Idioma", sectionsLabel: "Secções", resultsSource: "Resultados em direto",
    save: "Guardar", saved: "Guardado", noFavs: "Ainda não guardaste notícias. Carrega em «Guardar» numa notícia para a encontrares aqui.",
    now: "agora", noResults: "Ainda não há resultados das fontes ativas.",
    noPost: "Esta notícia não tem link para a fonte.", viewSrc: "Ver na fonte",
    pickLeagues: "Escolher ligas", leaguesTitle: "Ligas com resultados em direto", processing: "A traduzir…",
    levels: { alto: "Interesse alto", medio: "Interesse médio", baixo: "Interesse baixo" }, allLevels: "Todos",
    tones: { positiva: "Positiva", negativa: "Negativa", neutra: "Neutra" }, allTones: "Todas", toneLabel: "Tom", levelLabel: "Nível",
    angle: "Ângulo", data: "Dados", check: "A verificar", seeNews: "Ver a notícia",
    noStories: "Ainda não há pistas. Aparecem quando os resultados, as classificações ou as notícias mostram algo fora do normal.",
    storiesNote: "Pistas para notícias, encontradas nos resultados e nas notícias que vão entrando. O nível de interesse vem dos critérios de noticiabilidade que cada pista cumpre. As possibilidades são hipóteses escritas a partir do que as fontes disseram — nunca factos novos.",
    updated: (t, src) => `Atualizado ${t} por ${src}`, agoWord: (t) => `há ${t}`,
    colsNote: "As notícias mais relevantes de cada origem, em tempo real. A coluna vem do país de que a notícia trata; quando não é possível saber, vem da proveniência da fonte.",
    colEmpty: "Sem notícias nesta coluna para já.", colAll: "Ver tudo desta origem",
    liveNow: "Jogos a decorrer", allResults: "Ver todos os resultados", onTv: "Transmissão", nextTv: "A seguir na televisão",
    noLive: "Não há jogos a decorrer nas ligas escolhidas.", countryLabel: "País da fonte",
    srcState: (d, g, e) => `${d} com feed próprio · ${g} pelo Google News${e ? ` · ${e} sem responder` : ""}`,
    onlyProblems: "Só as que têm problemas", lastNews: "última notícia", noNews: "ainda não trouxe notícias", srcFail: "não responde",
    gaveFirst: "Deu primeiro", onlyHere: "Só nesta fonte", confirms: "Confirmações",
    justConfirmed: "acabou de confirmar", confirmedAt: (t) => `confirmou ${t}`, nConfirms: (n) => `${n} ${n === 1 ? "confirmação" : "confirmações"}`,
    thread: "O fio da história", whatNext: "O que pode acontecer", consequences: "Consequências", ifWord: "se",
    possNote: "Hipóteses, não factos: cada uma diz de que depende.",
    origins: { todas: "Todas", noticia: "Das notícias", dados: "Dos jogos" }, originLabel: "Origem",
    consTypes: { desportiva: "Desportiva", contratual: "Contratual", financeira: "Financeira", competitiva: "Competitiva", institucional: "Institucional", disciplinar: "Disciplinar" },
  },
  en: {
    live: "Live", paused: "Paused", nSources: (n) => `${n} sources`, markRead: "Mark all as read",
    pause: "Pause", resume: "Resume", search: "Search news", copy: "Copy", copied: "Copied",
    share: "Share", viewX: "View on X", trFrom: { pt: "Translated from Portuguese", en: "Translated from English", fr: "Translated from French", es: "Translated from Spanish", it: "Translated from Italian", de: "Translated from German", tr: "Translated from Turkish", nl: "Translated from Dutch", pl: "Translated from Polish" },
    eventsTitle: "Match events", noEvents: "Goals, half-times and full-times appear here as they happen.",
    goals: "Goals", reds: "Red cards", matchStats: "Match stats", tableLbl: "Table", pts: "pts", ord: (n) => `#${n}`,
    approx: "Approximate time: the source did not date this story",
    settings: "Settings", settingsHint: "Choose the sources and leagues you want to see.",
    allSports: "All sports", sourcesLbl: "Sources", confirmed: (n) => `Confirmed by ${n} sources`,
    about: "About", aboutTitle: (c) => `Story about: ${c}`, fromTitle: (c) => `Source: ${c}`,
    pending: (n) => `Show ${n} new ${n === 1 ? "story" : "stories"}`,
    empty: "No stories in this section from the active sources. Turn on more sources or pick another section.",
    connecting: "Connecting to X", offline: "Offline", offlineNote: "The server is not responding. Trying to reconnect…",
    waiting: "Waiting for the first stories. They appear here as soon as a source posts.",
    trOther: "Translated", moreSources: (n) => `+${n} ${n === 1 ? "source" : "sources"}`,
    all: "All", none: "None", sources: "Sources", hot: "Top story", fresh: "New", ft: "FT",
    toLight: "Switch to light mode", toDark: "Switch to dark mode", locale: "en-GB",
    tagline: "Verified Action Reports",
    docTitle: "VAR — Verified Action Reports", langLabel: "Language", sectionsLabel: "Sections", resultsSource: "Live results",
    save: "Save", saved: "Saved", noFavs: "No saved stories yet. Tap «Save» on a story to find it here.",
    now: "now", noResults: "No results from the active sources yet.",
    noPost: "This story has no link to its source.", viewSrc: "View source",
    pickLeagues: "Choose leagues", leaguesTitle: "Leagues with live results", processing: "Translating…",
    levels: { alto: "High interest", medio: "Medium interest", baixo: "Low interest" }, allLevels: "All",
    tones: { positiva: "Positive", negativa: "Negative", neutra: "Neutral" }, allTones: "All", toneLabel: "Tone", levelLabel: "Level",
    angle: "Angle", data: "Data", check: "To check", seeNews: "See the story",
    noStories: "No leads yet. They appear when results, tables or news show something out of the ordinary.",
    storiesNote: "Story leads found in the results and in the news as it comes in. The interest level comes from the news values each lead meets. The possibilities are hypotheses built from what the sources said — never new facts.",
    updated: (t, src) => `Updated ${t} by ${src}`, agoWord: (t) => `${t} ago`,
    colsNote: "The most relevant stories from each origin, in real time. The column follows the country the story is about; when that is unknown, it follows the source's own country.",
    colEmpty: "No stories in this column yet.", colAll: "See everything from this origin",
    liveNow: "Live matches", allResults: "See all results", onTv: "On TV", nextTv: "Next on TV",
    noLive: "No matches in progress in the chosen leagues.", countryLabel: "Source country",
    srcState: (d, g, e) => `${d} with their own feed · ${g} via Google News${e ? ` · ${e} not responding` : ""}`,
    onlyProblems: "Only the ones with problems", lastNews: "last story", noNews: "no stories yet", srcFail: "not responding",
    gaveFirst: "Broke it", onlyHere: "Single source", confirms: "Confirmations",
    justConfirmed: "just confirmed", confirmedAt: (t) => `confirmed ${t}`, nConfirms: (n) => `${n} ${n === 1 ? "confirmation" : "confirmations"}`,
    thread: "The story so far", whatNext: "What could happen next", consequences: "Consequences", ifWord: "if",
    possNote: "Hypotheses, not facts: each one states what it depends on.",
    origins: { todas: "All", noticia: "From the news", dados: "From matches" }, originLabel: "Origin",
    consTypes: { desportiva: "Sporting", contratual: "Contractual", financeira: "Financial", competitiva: "Competitive", institucional: "Institutional", disciplinar: "Disciplinary" },
  },
  es: {
    live: "En directo", paused: "En pausa", nSources: (n) => `${n} fuentes`, markRead: "Marcar todo como leído",
    pause: "Pausar", resume: "Reanudar", search: "Buscar noticias", copy: "Copiar", copied: "Copiado",
    share: "Compartir", viewX: "Ver en X", trFrom: { pt: "Traducido del portugués", en: "Traducido del inglés", fr: "Traducido del francés", es: "Traducido del español", it: "Traducido del italiano", de: "Traducido del alemán", tr: "Traducido del turco", nl: "Traducido del neerlandés", pl: "Traducido del polaco" },
    eventsTitle: "Acontecimientos", noEvents: "Los goles, descansos y finales de los partidos aparecen aquí en cuanto ocurren.",
    goals: "Goles", reds: "Expulsiones", matchStats: "Estadísticas del partido", tableLbl: "Clasificación", pts: "pts", ord: (n) => `${n}.º`,
    approx: "Hora aproximada: la fuente no fechó la noticia",
    settings: "Ajustes", settingsHint: "Elige las fuentes y las ligas que quieres ver.",
    allSports: "Todos los deportes", sourcesLbl: "Fuentes", confirmed: (n) => `Confirmada por ${n} fuentes`,
    about: "Sobre", aboutTitle: (c) => `Noticia sobre: ${c}`, fromTitle: (c) => `Origen: ${c}`,
    pending: (n) => `Mostrar ${n} ${n === 1 ? "noticia nueva" : "noticias nuevas"}`,
    empty: "No hay noticias en esta sección para las fuentes activas. Activa más fuentes o elige otra sección.",
    connecting: "Conectando con X", offline: "Sin conexión", offlineNote: "El servidor no responde. Intentando conectar de nuevo…",
    waiting: "Esperando las primeras noticias. Aparecen aquí en cuanto una fuente publique.",
    trOther: "Traducido", moreSources: (n) => `+${n} ${n === 1 ? "fuente" : "fuentes"}`,
    all: "Todas", none: "Ninguna", sources: "Fuentes", hot: "Destacada", fresh: "Nueva", ft: "Final",
    toLight: "Cambiar a modo claro", toDark: "Cambiar a modo oscuro", locale: "es-ES",
    tagline: "Verified Action Reports",
    docTitle: "VAR — Verified Action Reports", langLabel: "Idioma", sectionsLabel: "Secciones", resultsSource: "Resultados en directo",
    save: "Guardar", saved: "Guardado", noFavs: "Todavía no has guardado noticias. Pulsa «Guardar» en una noticia para encontrarla aquí.",
    now: "ahora", noResults: "Todavía no hay resultados de las fuentes activas.",
    noPost: "Esta noticia no tiene enlace a la fuente.", viewSrc: "Ver en la fuente",
    pickLeagues: "Elegir ligas", leaguesTitle: "Ligas con resultados en directo", processing: "Traduciendo…",
    levels: { alto: "Interés alto", medio: "Interés medio", baixo: "Interés bajo" }, allLevels: "Todos",
    tones: { positiva: "Positiva", negativa: "Negativa", neutra: "Neutra" }, allTones: "Todas", toneLabel: "Tono", levelLabel: "Nivel",
    angle: "Enfoque", data: "Datos", check: "Por verificar", seeNews: "Ver la noticia",
    noStories: "Todavía no hay pistas. Aparecen cuando los resultados, las clasificaciones o las noticias muestran algo fuera de lo normal.",
    storiesNote: "Pistas para noticias, encontradas en los resultados y en las noticias que van entrando. El nivel de interés viene de los criterios de noticiabilidad que cumple cada pista. Las posibilidades son hipótesis escritas a partir de lo que dijeron las fuentes, nunca hechos nuevos.",
    updated: (t, src) => `Actualizado ${t} por ${src}`, agoWord: (t) => `hace ${t}`,
    colsNote: "Las noticias más relevantes de cada origen, en tiempo real. La columna viene del país del que trata la noticia; cuando no se sabe, viene del país de la fuente.",
    colEmpty: "Todavía no hay noticias en esta columna.", colAll: "Ver todo de este origen",
    liveNow: "Partidos en curso", allResults: "Ver todos los resultados", onTv: "Emisión", nextTv: "A continuación en televisión",
    noLive: "No hay partidos en curso en las ligas elegidas.", countryLabel: "País de la fuente",
    srcState: (d, g, e) => `${d} con feed propio · ${g} por Google News${e ? ` · ${e} sin responder` : ""}`,
    onlyProblems: "Solo las que tienen problemas", lastNews: "última noticia", noNews: "todavía no ha traído noticias", srcFail: "no responde",
    gaveFirst: "Lo dio primero", onlyHere: "Solo en esta fuente", confirms: "Confirmaciones",
    justConfirmed: "acaba de confirmar", confirmedAt: (t) => `confirmó ${t}`, nConfirms: (n) => `${n} ${n === 1 ? "confirmación" : "confirmaciones"}`,
    thread: "El hilo de la historia", whatNext: "Lo que puede pasar", consequences: "Consecuencias", ifWord: "si",
    possNote: "Hipótesis, no hechos: cada una dice de qué depende.",
    origins: { todas: "Todas", noticia: "De las noticias", dados: "De los partidos" }, originLabel: "Origen",
    consTypes: { desportiva: "Deportiva", contratual: "Contractual", financeira: "Financiera", competitiva: "Competitiva", institucional: "Institucional", disciplinar: "Disciplinaria" },
  },
  fr: {
    live: "En direct", paused: "En pause", nSources: (n) => `${n} sources`, markRead: "Tout marquer comme lu",
    pause: "Mettre en pause", resume: "Reprendre", search: "Rechercher une actualité", copy: "Copier", copied: "Copié",
    share: "Partager", viewX: "Voir sur X", trFrom: { pt: "Traduit du portugais", en: "Traduit de l'anglais", fr: "Traduit du français", es: "Traduit de l'espagnol", it: "Traduit de l'italien", de: "Traduit de l'allemand", tr: "Traduit du turc", nl: "Traduit du néerlandais", pl: "Traduit du polonais" },
    eventsTitle: "Faits de match", noEvents: "Les buts, mi-temps et fins de match apparaissent ici dès qu'ils arrivent.",
    goals: "Buts", reds: "Cartons rouges", matchStats: "Statistiques du match", tableLbl: "Classement", pts: "pts", ord: (n) => `${n}e`,
    approx: "Heure approximative : la source n'a pas daté l'information",
    settings: "Réglages", settingsHint: "Choisis les sources et les compétitions que tu veux voir.",
    allSports: "Tous les sports", sourcesLbl: "Sources", confirmed: (n) => `Confirmé par ${n} sources`,
    about: "Sujet", aboutTitle: (c) => `Actualité sur : ${c}`, fromTitle: (c) => `Origine : ${c}`,
    pending: (n) => `Afficher ${n} ${n === 1 ? "nouvelle actualité" : "nouvelles actualités"}`,
    empty: "Aucune actualité dans cette rubrique pour les sources actives. Active d'autres sources ou change de rubrique.",
    connecting: "Connexion à X", offline: "Hors ligne", offlineNote: "Le serveur ne répond pas. Nouvelle tentative de connexion…",
    waiting: "En attente des premières actualités. Elles apparaissent dès qu'une source publie.",
    trOther: "Traduit", moreSources: (n) => `+${n} ${n === 1 ? "source" : "sources"}`,
    all: "Toutes", none: "Aucune", sources: "Sources", hot: "À la une", fresh: "Nouveau", ft: "Terminé",
    toLight: "Passer en mode clair", toDark: "Passer en mode sombre", locale: "fr-FR",
    tagline: "Verified Action Reports",
    docTitle: "VAR — Verified Action Reports", langLabel: "Langue", sectionsLabel: "Rubriques", resultsSource: "Résultats en direct",
    save: "Enregistrer", saved: "Enregistré", noFavs: "Aucune actualité enregistrée. Appuie sur « Enregistrer » sur une actualité pour la retrouver ici.",
    now: "maintenant", noResults: "Pas encore de résultats des sources actives.",
    noPost: "Cette actualité n'a pas de lien vers sa source.", viewSrc: "Voir la source",
    pickLeagues: "Choisir les compétitions", leaguesTitle: "Compétitions avec résultats en direct", processing: "Traduction…",
    levels: { alto: "Intérêt élevé", medio: "Intérêt moyen", baixo: "Intérêt faible" }, allLevels: "Tous",
    tones: { positiva: "Positif", negativa: "Négatif", neutra: "Neutre" }, allTones: "Tous", toneLabel: "Ton", levelLabel: "Niveau",
    angle: "Angle", data: "Données", check: "À vérifier", seeNews: "Voir l'actualité",
    noStories: "Pas encore de pistes. Elles apparaissent quand les résultats, les classements ou les actualités sortent de l'ordinaire.",
    storiesNote: "Des pistes d'articles, trouvées dans les résultats et dans les actualités qui arrivent. Le niveau d'intérêt vient des critères de sélection de l'information que chaque piste remplit. Les possibilités sont des hypothèses écrites à partir de ce que les sources ont dit, jamais des faits nouveaux.",
    updated: (t, src) => `Mis à jour ${t} par ${src}`, agoWord: (t) => `il y a ${t}`,
    colsNote: "Les actualités les plus importantes de chaque origine, en temps réel. La colonne suit le pays dont parle l'actualité ; quand il est inconnu, elle suit le pays de la source.",
    colEmpty: "Pas encore d'actualité dans cette colonne.", colAll: "Tout voir de cette origine",
    liveNow: "Matchs en cours", allResults: "Voir tous les résultats", onTv: "Diffusion", nextTv: "Prochainement à la télévision",
    noLive: "Aucun match en cours dans les compétitions choisies.", countryLabel: "Pays de la source",
    srcState: (d, g, e) => `${d} avec flux propre · ${g} via Google News${e ? ` · ${e} sans réponse` : ""}`,
    onlyProblems: "Seulement celles qui posent problème", lastNews: "dernière actualité", noNews: "aucune actualité pour l'instant", srcFail: "ne répond pas",
    gaveFirst: "A sorti l'info", onlyHere: "Source unique", confirms: "Confirmations",
    justConfirmed: "vient de confirmer", confirmedAt: (t) => `a confirmé ${t}`, nConfirms: (n) => `${n} ${n === 1 ? "confirmation" : "confirmations"}`,
    thread: "Le fil de l'histoire", whatNext: "Ce qui peut arriver", consequences: "Conséquences", ifWord: "si",
    possNote: "Des hypothèses, pas des faits : chacune dit de quoi elle dépend.",
    origins: { todas: "Toutes", noticia: "Des actualités", dados: "Des matchs" }, originLabel: "Origine",
    consTypes: { desportiva: "Sportive", contratual: "Contractuelle", financeira: "Financière", competitiva: "Compétitive", institucional: "Institutionnelle", disciplinar: "Disciplinaire" },
  },
  it: {
    live: "In diretta", paused: "In pausa", nSources: (n) => `${n} fonti`, markRead: "Segna tutto come letto",
    pause: "Metti in pausa", resume: "Riprendi", search: "Cerca notizie", copy: "Copia", copied: "Copiato",
    share: "Condividi", viewX: "Vedi su X", trFrom: { pt: "Tradotto dal portoghese", en: "Tradotto dall'inglese", fr: "Tradotto dal francese", es: "Tradotto dallo spagnolo", it: "Tradotto dall'italiano", de: "Tradotto dal tedesco", tr: "Tradotto dal turco", nl: "Tradotto dall'olandese", pl: "Tradotto dal polacco" },
    eventsTitle: "Eventi della partita", noEvents: "Gol, primi tempi e finali compaiono qui appena accadono.",
    goals: "Gol", reds: "Espulsioni", matchStats: "Statistiche della partita", tableLbl: "Classifica", pts: "pt", ord: (n) => `${n}º`,
    approx: "Ora approssimativa: la fonte non ha datato la notizia",
    settings: "Impostazioni", settingsHint: "Scegli le fonti e i campionati che vuoi vedere.",
    allSports: "Tutti gli sport", sourcesLbl: "Fonti", confirmed: (n) => `Confermata da ${n} fonti`,
    about: "Argomento", aboutTitle: (c) => `Notizia su: ${c}`, fromTitle: (c) => `Origine: ${c}`,
    pending: (n) => `Mostra ${n} ${n === 1 ? "nuova notizia" : "nuove notizie"}`,
    empty: "Nessuna notizia in questa sezione dalle fonti attive. Attiva più fonti o scegli un'altra sezione.",
    connecting: "Connessione a X", offline: "Senza connessione", offlineNote: "Il server non risponde. Nuovo tentativo di connessione…",
    waiting: "In attesa delle prime notizie. Compaiono qui appena una fonte pubblica.",
    trOther: "Tradotto", moreSources: (n) => `+${n} ${n === 1 ? "fonte" : "fonti"}`,
    all: "Tutte", none: "Nessuna", sources: "Fonti", hot: "In evidenza", fresh: "Nuova", ft: "Finale",
    toLight: "Passa alla modalità chiara", toDark: "Passa alla modalità scura", locale: "it-IT",
    tagline: "Verified Action Reports",
    docTitle: "VAR — Verified Action Reports", langLabel: "Lingua", sectionsLabel: "Sezioni", resultsSource: "Risultati in diretta",
    save: "Salva", saved: "Salvata", noFavs: "Non hai ancora salvato notizie. Premi «Salva» su una notizia per ritrovarla qui.",
    now: "ora", noResults: "Ancora nessun risultato dalle fonti attive.",
    noPost: "Questa notizia non ha un link alla fonte.", viewSrc: "Vedi sulla fonte",
    pickLeagues: "Scegli i campionati", leaguesTitle: "Campionati con risultati in diretta", processing: "Traduzione…",
    levels: { alto: "Interesse alto", medio: "Interesse medio", baixo: "Interesse basso" }, allLevels: "Tutti",
    tones: { positiva: "Positiva", negativa: "Negativa", neutra: "Neutra" }, allTones: "Tutti", toneLabel: "Tono", levelLabel: "Livello",
    angle: "Angolo", data: "Dati", check: "Da verificare", seeNews: "Vedi la notizia",
    noStories: "Ancora nessuna traccia. Compaiono quando risultati, classifiche o notizie mostrano qualcosa fuori dal normale.",
    storiesNote: "Tracce per notizie, trovate nei risultati e nelle notizie che arrivano. Il livello di interesse viene dai criteri di notiziabilità che ogni traccia soddisfa. Le possibilità sono ipotesi scritte a partire da ciò che le fonti hanno detto, mai fatti nuovi.",
    updated: (t, src) => `Aggiornato ${t} da ${src}`, agoWord: (t) => `${t} fa`,
    colsNote: "Le notizie più rilevanti di ogni origine, in tempo reale. La colonna segue il paese di cui parla la notizia; quando non si sa, segue il paese della fonte.",
    colEmpty: "Ancora nessuna notizia in questa colonna.", colAll: "Vedi tutto di questa origine",
    liveNow: "Partite in corso", allResults: "Vedi tutti i risultati", onTv: "Trasmissione", nextTv: "Prossima in televisione",
    noLive: "Nessuna partita in corso nei campionati scelti.", countryLabel: "Paese della fonte",
    srcState: (d, g, e) => `${d} con feed proprio · ${g} tramite Google News${e ? ` · ${e} senza risposta` : ""}`,
    onlyProblems: "Solo quelle con problemi", lastNews: "ultima notizia", noNews: "non ha ancora portato notizie", srcFail: "non risponde",
    gaveFirst: "L'ha data prima", onlyHere: "Solo in questa fonte", confirms: "Conferme",
    justConfirmed: "ha appena confermato", confirmedAt: (t) => `ha confermato ${t}`, nConfirms: (n) => `${n} ${n === 1 ? "conferma" : "conferme"}`,
    thread: "Il filo della storia", whatNext: "Cosa può succedere", consequences: "Conseguenze", ifWord: "se",
    possNote: "Ipotesi, non fatti: ognuna dice da cosa dipende.",
    origins: { todas: "Tutte", noticia: "Dalle notizie", dados: "Dalle partite" }, originLabel: "Origine",
    consTypes: { desportiva: "Sportiva", contratual: "Contrattuale", financeira: "Finanziaria", competitiva: "Competitiva", institucional: "Istituzionale", disciplinar: "Disciplinare" },
  },
  de: {
    live: "Live", paused: "Pausiert", nSources: (n) => `${n} Quellen`, markRead: "Alles als gelesen markieren",
    pause: "Pausieren", resume: "Fortsetzen", search: "Nachrichten suchen", copy: "Kopieren", copied: "Kopiert",
    share: "Teilen", viewX: "Auf X ansehen", trFrom: { pt: "Aus dem Portugiesischen übersetzt", en: "Aus dem Englischen übersetzt", fr: "Aus dem Französischen übersetzt", es: "Aus dem Spanischen übersetzt", it: "Aus dem Italienischen übersetzt", de: "Aus dem Deutschen übersetzt", tr: "Aus dem Türkischen übersetzt", nl: "Aus dem Niederländischen übersetzt", pl: "Aus dem Polnischen übersetzt" },
    eventsTitle: "Spielereignisse", noEvents: "Tore, Halbzeit- und Endstände erscheinen hier, sobald sie passieren.",
    goals: "Tore", reds: "Rote Karten", matchStats: "Spielstatistik", tableLbl: "Tabelle", pts: "Pkt.", ord: (n) => `${n}.`,
    approx: "Ungefähre Zeit: die Quelle hat die Nachricht nicht datiert",
    settings: "Einstellungen", settingsHint: "Wähle die Quellen und Ligen, die du sehen willst.",
    allSports: "Alle Sportarten", sourcesLbl: "Quellen", confirmed: (n) => `Von ${n} Quellen bestätigt`,
    about: "Thema", aboutTitle: (c) => `Nachricht über: ${c}`, fromTitle: (c) => `Herkunft: ${c}`,
    pending: (n) => `${n} ${n === 1 ? "neue Nachricht" : "neue Nachrichten"} anzeigen`,
    empty: "Keine Nachrichten in dieser Rubrik von den aktiven Quellen. Aktiviere mehr Quellen oder wähle eine andere Rubrik.",
    connecting: "Verbindung zu X", offline: "Keine Verbindung", offlineNote: "Der Server antwortet nicht. Neuer Verbindungsversuch…",
    waiting: "Warten auf die ersten Nachrichten. Sie erscheinen, sobald eine Quelle etwas veröffentlicht.",
    trOther: "Übersetzt", moreSources: (n) => `+${n} ${n === 1 ? "Quelle" : "Quellen"}`,
    all: "Alle", none: "Keine", sources: "Quellen", hot: "Top-Nachricht", fresh: "Neu", ft: "Endstand",
    toLight: "Zum hellen Modus wechseln", toDark: "Zum dunklen Modus wechseln", locale: "de-DE",
    tagline: "Verified Action Reports",
    docTitle: "VAR — Verified Action Reports", langLabel: "Sprache", sectionsLabel: "Rubriken", resultsSource: "Live-Ergebnisse",
    save: "Speichern", saved: "Gespeichert", noFavs: "Noch keine Nachrichten gespeichert. Tippe bei einer Nachricht auf «Speichern», um sie hier zu finden.",
    now: "jetzt", noResults: "Noch keine Ergebnisse von den aktiven Quellen.",
    noPost: "Diese Nachricht hat keinen Link zur Quelle.", viewSrc: "Bei der Quelle ansehen",
    pickLeagues: "Ligen auswählen", leaguesTitle: "Ligen mit Live-Ergebnissen", processing: "Übersetzen…",
    levels: { alto: "Hohes Interesse", medio: "Mittleres Interesse", baixo: "Geringes Interesse" }, allLevels: "Alle",
    tones: { positiva: "Positiv", negativa: "Negativ", neutra: "Neutral" }, allTones: "Alle", toneLabel: "Ton", levelLabel: "Stufe",
    angle: "Ansatz", data: "Daten", check: "Zu prüfen", seeNews: "Nachricht ansehen",
    noStories: "Noch keine Ansätze. Sie erscheinen, wenn Ergebnisse, Tabellen oder Nachrichten etwas Außergewöhnliches zeigen.",
    storiesNote: "Ansätze für Geschichten, gefunden in den Ergebnissen und in den eingehenden Nachrichten. Die Interessenstufe ergibt sich aus den Nachrichtenwerten, die jeder Ansatz erfüllt. Die Möglichkeiten sind Hypothesen aus dem, was die Quellen gesagt haben, niemals neue Fakten.",
    updated: (t, src) => `Aktualisiert ${t} von ${src}`, agoWord: (t) => `vor ${t}`,
    colsNote: "Die wichtigsten Nachrichten jeder Herkunft, in Echtzeit. Die Spalte folgt dem Land, um das es in der Nachricht geht; ist das unbekannt, folgt sie dem Land der Quelle.",
    colEmpty: "Noch keine Nachrichten in dieser Spalte.", colAll: "Alles aus dieser Herkunft ansehen",
    liveNow: "Laufende Spiele", allResults: "Alle Ergebnisse ansehen", onTv: "Übertragung", nextTv: "Als Nächstes im Fernsehen",
    noLive: "Keine laufenden Spiele in den gewählten Ligen.", countryLabel: "Land der Quelle",
    srcState: (d, g, e) => `${d} mit eigenem Feed · ${g} über Google News${e ? ` · ${e} ohne Antwort` : ""}`,
    onlyProblems: "Nur die mit Problemen", lastNews: "letzte Nachricht", noNews: "noch keine Nachrichten geliefert", srcFail: "antwortet nicht",
    gaveFirst: "Zuerst gemeldet", onlyHere: "Nur in dieser Quelle", confirms: "Bestätigungen",
    justConfirmed: "hat gerade bestätigt", confirmedAt: (t) => `bestätigt ${t}`, nConfirms: (n) => `${n} ${n === 1 ? "Bestätigung" : "Bestätigungen"}`,
    thread: "Der Verlauf", whatNext: "Was passieren kann", consequences: "Folgen", ifWord: "wenn",
    possNote: "Hypothesen, keine Fakten: jede nennt, wovon sie abhängt.",
    origins: { todas: "Alle", noticia: "Aus den Nachrichten", dados: "Aus den Spielen" }, originLabel: "Herkunft",
    consTypes: { desportiva: "Sportlich", contratual: "Vertraglich", financeira: "Finanziell", competitiva: "Wettbewerblich", institucional: "Institutionell", disciplinar: "Disziplinarisch" },
  },
};

const isHot = (it) => (it.imp || 0) >= 4;
// relevância = importância a perder peso com o tempo (metade ao fim de 3 horas)
const relevance = (it, now) => (it.imp || 1) / (1 + (now - it.ts) / 3600000 / 3);
const byTime = (a, b) => b.ts - a.ts; // mais recente primeiro
const MAX_ITEMS = 4000; // arquivo que o site mantém aberto

/* ───────── Utilitários ───────── */
const strip = (s) => s.replace(/==/g, "");
// link do post original; na versão real, postId é o id que a API do X devolve com cada post
const postUrl = (it) => it.url || null;
const isXUrl = (u) => /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(u || "");
function ago(ts, now) {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return null;
  if (s < 60) return [s, "s"];
  const m = Math.floor(s / 60);
  if (m < 60) return [m, "min"];
  const h = Math.floor(m / 60);
  if (h < 24) return [h, "h"];
  return [Math.floor(h / 24), "d"];
}
const agoText = (ts, now, ui) => { const a = ago(ts, now); return a ? ui.agoWord(`${a[0]} ${a[1]}`) : ui.now; };
// um jogo sem atualizações há mais de 150 minutos deixa de contar como em curso
const isLive = (sc, ts, now) => !sc.ft && now - ts < 150 * 60000;
const COUNTRIES = {
  pt: ["Portugal", "Portugal"], gb: ["Reino Unido", "United Kingdom"], "gb-eng": ["Inglaterra", "England"], es: ["Espanha", "Spain"],
  fr: ["França", "France"], it: ["Itália", "Italy"], de: ["Alemanha", "Germany"], nl: ["Países Baixos", "Netherlands"],
  tr: ["Turquia", "Turkey"], sa: ["Arábia Saudita", "Saudi Arabia"], br: ["Brasil", "Brazil"], us: ["Estados Unidos", "United States"],
  eu: ["Europa", "Europe"], un: ["Internacional", "International"],
};
// línguas do site: o português e o inglês vêm do enriquecimento de cada notícia;
// as quatro restantes são traduzidas automaticamente pelo servidor à medida que são pedidas
const LANGS = [
  { id: "pt", sigla: "PT", nome: "Português" },
  { id: "en", sigla: "EN", nome: "English" },
  { id: "es", sigla: "ES", nome: "Español" },
  { id: "fr", sigla: "FR", nome: "Français" },
  { id: "it", sigla: "IT", nome: "Italiano" },
  { id: "de", sigla: "DE", nome: "Deutsch" },
];
// o site fica só em português; quem quiser outra língua usa a tradução do próprio browser (Google Tradutor).
// O pedido de português mantém-se para os títulos que chegam noutra língua e ainda não foram traduzidos.
const TRADUZIDAS = { pt: true };
// o título precisa de tradução: não existe nesta língua, ou a notícia não passou pelo Gemini e o título
// em português/inglês ainda é o original da fonte («tr» diz as línguas em que já foi traduzido)
const precisaTrad = (it, lang) => !it.t?.[lang] || (it.raw && (lang === "pt" || lang === "en") && !it.tr?.[lang]);
// campo de texto na língua escolhida; enquanto a tradução não chega, mostra-se o que já existe
const emLingua = (o, lang) => o?.[lang] ?? o?.pt ?? o?.en;
const ARROW = { pt: "para", en: "to", es: "a", fr: "vers", it: "a", de: "zu" };
const MOD = {
  futsal: { pt: "Futsal", en: "Futsal", es: "Fútbol sala", fr: "Futsal", it: "Calcio a 5", de: "Futsal" },
  praia: { pt: "Futebol de praia", en: "Beach soccer", es: "Fútbol playa", fr: "Beach soccer", it: "Beach soccer", de: "Beachsoccer" },
  andebol: { pt: "Andebol", en: "Handball", es: "Balonmano", fr: "Handball", it: "Pallamano", de: "Handball" },
  basquetebol: { pt: "Basquetebol", en: "Basketball", es: "Baloncesto", fr: "Basket-ball", it: "Basket", de: "Basketball" },
  voleibol: { pt: "Voleibol", en: "Volleyball", es: "Voleibol", fr: "Volley-ball", it: "Pallavolo", de: "Volleyball" },
  hoquei_patins: { pt: "Hóquei em patins", en: "Roller hockey", es: "Hockey patines", fr: "Rink hockey", it: "Hockey su pista", de: "Rollhockey" },
  hoquei_gelo: { pt: "Hóquei no gelo", en: "Ice hockey", es: "Hockey hielo", fr: "Hockey sur glace", it: "Hockey su ghiaccio", de: "Eishockey" },
  futebol_americano: { pt: "Futebol americano", en: "American football", es: "Fútbol americano", fr: "Football américain", it: "Football americano", de: "American Football" },
  tenis: { pt: "Ténis", en: "Tennis", es: "Tenis", fr: "Tennis", it: "Tennis", de: "Tennis" },
  padel: { pt: "Padel", en: "Padel", es: "Pádel", fr: "Padel", it: "Padel", de: "Padel" },
  ciclismo: { pt: "Ciclismo", en: "Cycling", es: "Ciclismo", fr: "Cyclisme", it: "Ciclismo", de: "Radsport" },
  atletismo: { pt: "Atletismo", en: "Athletics", es: "Atletismo", fr: "Athlétisme", it: "Atletica", de: "Leichtathletik" },
  natacao: { pt: "Natação", en: "Swimming", es: "Natación", fr: "Natation", it: "Nuoto", de: "Schwimmen" },
  automobilismo: { pt: "Automobilismo", en: "Motorsport", es: "Automovilismo", fr: "Sport automobile", it: "Automobilismo", de: "Motorsport" },
  golfe: { pt: "Golfe", en: "Golf", es: "Golf", fr: "Golf", it: "Golf", de: "Golf" },
  ragby: { pt: "Râguebi", en: "Rugby", es: "Rugby", fr: "Rugby", it: "Rugby", de: "Rugby" },
  criquete: { pt: "Críquete", en: "Cricket", es: "Críquet", fr: "Cricket", it: "Cricket", de: "Cricket" },
  beisebol: { pt: "Beisebol", en: "Baseball", es: "Béisbol", fr: "Baseball", it: "Baseball", de: "Baseball" },
  combate: { pt: "Desportos de combate", en: "Combat sports", es: "Deportes de combate", fr: "Sports de combat", it: "Sport da combattimento", de: "Kampfsport" },
  equestre: { pt: "Equestre", en: "Equestrian", es: "Ecuestre", fr: "Équitation", it: "Equitazione", de: "Reitsport" },
  outra: { pt: "Outra modalidade", en: "Other sport", es: "Otro deporte", fr: "Autre sport", it: "Altro sport", de: "Andere Sportart" },
};
const modName = (id, lang) => (MOD[id] ? MOD[id][lang] || MOD[id].en : null);

const GB_PARTS = {
  "gb-sct": { pt: "Escócia", en: "Scotland", es: "Escocia", fr: "Écosse", it: "Scozia", de: "Schottland" },
  "gb-wls": { pt: "País de Gales", en: "Wales", es: "Gales", fr: "Pays de Galles", it: "Galles", de: "Wales" },
  "gb-nir": { pt: "Irlanda do Norte", en: "Northern Ireland", es: "Irlanda del Norte", fr: "Irlande du Nord", it: "Irlanda del Nord", de: "Nordirland" },
};
function countryName(code, lang) {
  const own = COUNTRIES[code] || GB_PARTS[code];
  if (own) return own[lang] || own.en;
  try { return new Intl.DisplayNames([UI[lang]?.locale || "pt-PT"], { type: "region" }).of(code.toUpperCase()); } catch { return code.toUpperCase(); }
}
function Flag({ code, lang, title }) {
  if (!code) return null;
  const name = countryName(code, lang);
  return <img className="flag" src={`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3/${code}.svg`} alt={name} title={title ? title(name) : name} width="18" height="13" loading="lazy" />;
}

// canal português que transmite o jogo (Zapping do zerozero); sem logótipo, fica o nome com a cor do canal
function Tv({ tv, size = 20 }) {
  const [bad, setBad] = useState(false);
  if (!tv) return null;
  return (
    <span className="tv" title={`${tv.nome}${tv.canal !== tv.nome ? ` — ${tv.canal}` : ""}`} style={tv.cor ? { "--tvc": tv.cor } : undefined}>
      {tv.logo && !bad
        ? <img className="tvlogo" src={tv.logo} alt={tv.nome} width={size} height={size} loading="lazy" onError={() => setBad(true)} />
        : <i className="tvdot" aria-hidden="true" />}
      <span className="tvname">{tv.canal}</span>
    </span>
  );
}

// último acontecimento relevante de um jogo em direto, mostrado ao lado do minuto
const EVT = {
  golo: { i: "⚽", pt: "Golo", en: "Goal", es: "Gol", fr: "But", it: "Gol", de: "Tor" },
  autogolo: { i: "⚽", pt: "Autogolo", en: "Own goal", es: "Autogol", fr: "CSC", it: "Autogol", de: "Eigentor" },
  penalti_marcado: { i: "⚽", pt: "Golo de penálti", en: "Penalty goal", es: "Gol de penalti", fr: "Penalty marqué", it: "Rigore segnato", de: "Elfmetertor" },
  penalti: { i: "🎯", pt: "Penálti", en: "Penalty", es: "Penalti", fr: "Penalty", it: "Rigore", de: "Elfmeter" },
  penalti_falhado: { i: "✗", pt: "Penálti falhado", en: "Penalty missed", es: "Penalti fallado", fr: "Penalty manqué", it: "Rigore sbagliato", de: "Elfmeter verschossen" },
  vermelho: { i: "🟥", pt: "Vermelho", en: "Red card", es: "Roja", fr: "Carton rouge", it: "Rosso", de: "Rote Karte" },
  segundo_amarelo: { i: "🟨🟥", pt: "Segundo amarelo", en: "Second yellow", es: "Doble amarilla", fr: "Second jaune", it: "Doppio giallo", de: "Gelb-Rot" },
  var: { i: "🖥", pt: "VAR", en: "VAR", es: "VAR", fr: "VAR", it: "VAR", de: "VAR" },
  anulado: { i: "🚫", pt: "Golo anulado", en: "Goal disallowed", es: "Gol anulado", fr: "But refusé", it: "Gol annullato", de: "Tor aberkannt" },
};
const HT = { pt: "Intervalo", en: "Half-time", es: "Descanso", fr: "Mi-temps", it: "Intervallo", de: "Halbzeit" };
const evText = (u, lang) => {
  if (!u || !EVT[u.tipo]) return null;
  const e = EVT[u.tipo];
  const nome = e[lang] || e.en;
  const quem = u.who ? `${u.who}${u.equipa ? ` (${u.equipa})` : ""}` : `${nome}${u.equipa ? ` · ${u.equipa}` : ""}`;
  return `${e.i} ${u.label ? `${u.label} ` : ""}${quem}`;
};
const ET = { pt: "Prolongamento", en: "Extra time", es: "Prórroga", fr: "Prolongation", it: "Supplementari", de: "Verlängerung" };
const PAUSA = { pt: "Vai a prolongamento", en: "Going to extra time", es: "Va a la prórroga", fr: "Vers la prolongation", it: "Si va ai supplementari", de: "Verlängerung folgt" };
const PEN = { pt: "Penáltis", en: "Penalties", es: "Penaltis", fr: "Tirs au but", it: "Rigori", de: "Elfmeterschießen" };
// o servidor manda o minuto quando ele muda; entre duas leituras o browser vai contando, para o minuto não parar
// (nunca passa o fim da parte: 45', 90', 105' ou 120')
const minVivo = (sc, upd, now) => {
  const m = String(sc.min || "").match(/^(\d{1,3})'?$/);
  if (!m || !upd || !now) return sc.min;
  const base = +m[1];
  const lim = base < 45 ? 45 : base < 90 ? 90 : base < 105 ? 105 : 120;
  return `${Math.min(lim, base + Math.floor(Math.max(0, now - upd) / 60000))}'`;
};
const minText = (sc, lang, ui, now, upd) => {
  if (sc.ft) return sc.ps ? `${ui.ft} · ${PEN[lang] || PEN.en} ${sc.ps.h}–${sc.ps.a}` : sc.et ? `${ui.ft} · a.p.` : ui.ft;
  if (sc.pen) return `${PEN[lang] || PEN.en}${sc.ps ? ` ${sc.ps.h}–${sc.ps.a}` : ""}`;
  if (sc.pausa) return PAUSA[lang] || PAUSA.en;
  if (sc.ht) return HT[lang] || HT.en;
  const mm = minVivo(sc, upd, now);
  if (sc.et) return `${ET[lang] || ET.en}${mm ? ` · ${mm}` : ""}`;
  return mm || ui.live;
};

// canal do jogo a partir da grelha do Zapping, para quando o servidor ainda não o juntou ao cartão.
// Os nomes das equipas comparam-se com as mesmas regras do servidor (zapping.js): sem siglas de clube e com as
// abreviaturas que a ESPN, o zerozero e os títulos dos vídeos escrevem de maneiras diferentes («Man Utd», «Spurs», «PSG»)
const EQ_RUIDO = /\b(fc|sc|cf|ac|sl|cd|ad|ca|rc|afc|sad|ud|cs|gd|ss|us|ssc|vfl|vfb|bsc|tsg|fsv|nk|fk|sk|if|bk|cp|aa|gc|se|ec|club|clube|de|da|do|of|the|and|le|la|el)\b/g;
const EQ_NOMES = {
  vitoria: "vitoria guimaraes", guimaraes: "vitoria guimaraes", "sporting braga": "braga", inter: "inter milan", internazionale: "inter milan",
  atleti: "atletico madrid", atletico: "atletico madrid", psg: "paris saint germain", "paris sg": "paris saint germain", betis: "real betis", spurs: "tottenham", wolves: "wolverhampton",
  leipzig: "rb leipzig", brighton: "brighton hove albion", leverkusen: "bayer leverkusen", dortmund: "borussia dortmund",
  athletic: "athletic bilbao", "olympique marseille": "marseille", "olympique lyonnais": "lyon", "olympique lyon": "lyon", estoril: "estoril praia",
};
const EQ_PALAVRAS = { munique: "munich", munchen: "munich", muenchen: "munich", koln: "cologne", colonia: "cologne", utd: "united", gladbach: "monchengladbach", mgladbach: "monchengladbach", nottm: "nottingham", afs: "avs", hotspur: "tottenham" };
const eqKey = (n) => {
  const base = String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[.'’`-]/g, " ").replace(EQ_RUIDO, " ").replace(/\s+/g, " ").trim();
  return (EQ_NOMES[base] || base).split(" ").map((w) => EQ_PALAVRAS[w] || w).join(" ");
};
const eqTokCache = new Map();
const eqTok = (n) => {
  let t = eqTokCache.get(n);
  if (!t) { t = eqKey(n).split(" ").filter(Boolean); if (eqTokCache.size > 5000) eqTokCache.clear(); eqTokCache.set(n, t); }
  return t;
};
// semelhança entre dois nomes (0 a 1); uma palavra que começa pela outra conta como igual («Man» e «Manchester»).
// Se sobram palavras diferentes dos dois lados, são clubes distintos com uma palavra em comum (Real Madrid e Real Sociedad)
const eqSimil = (a, b) => {
  const A = eqTok(a), B = eqTok(b);
  if (!A.length || !B.length) return 0;
  const par = (x, y) => x === y || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x)));
  const iguais = A.filter((x) => B.some((y) => par(x, y))).length;
  if (iguais < A.length && B.some((y) => !A.some((x) => par(x, y)))) return 0;
  return iguais / Math.max(A.length, B.length);
};
const eqIgualT = (a, b) => eqSimil(a, b) >= 0.5;
// o mesmo jogo: as duas equipas parecidas e o par convincente no conjunto (o Real Madrid não passa por Real Sociedad);
// aceita as equipas trocadas, porque há títulos de vídeos que as escrevem ao contrário
const parNota = (h1, a1, h2, a2) => {
  const d = [eqSimil(h1, h2), eqSimil(a1, a2)], t = [eqSimil(h1, a2), eqSimil(a1, h2)];
  const ok = (p) => p[0] >= 0.5 && p[1] >= 0.5 && p[0] + p[1] >= 1.3;
  return Math.max(ok(d) ? d[0] + d[1] : 0, ok(t) ? t[0] + t[1] : 0);
};
const tvDaGrelha = (sc, zapping, ts) => {
  let melhor = null, nota = 0;
  for (const z of zapping) {
    if (z.qualificador || Math.abs(z.inicio - ts) > 5 * 3600e3) continue;
    const n = parNota(z.casa, z.fora, sc.h, sc.a);
    if (n > nota) { nota = n; melhor = z; }
  }
  return melhor;
};

// resultado tirado dos títulos dos vídeos de um jogo («Benfica [2] - 1 Porto»): o de mais golos, e entre iguais o mais recente
const placarDosVideos = (vids) => {
  let melhor = null;
  for (const v of vids || []) {
    const m = String(v.score || "").match(/^(\d{1,2})-(\d{1,2})$/);
    if (!m) continue;
    const p = { hs: +m[1], as: +m[2], t: v.created_time || 0 };
    if (!melhor || p.hs + p.as > melhor.hs + melhor.as || (p.hs + p.as === melhor.hs + melhor.as && p.t > melhor.t)) melhor = p;
  }
  return melhor;
};

/* ───────── Vídeos ───────── */
const VCAT = {
  goal: { i: "⚽", pt: "Golo", en: "Goal", es: "Gol", fr: "But", it: "Gol", de: "Tor" },
  highlight: { i: "🎥", pt: "Highlight", en: "Highlight", es: "Jugada", fr: "Action", it: "Azione", de: "Highlight" },
  save: { i: "🧤", pt: "Defesa", en: "Save", es: "Parada", fr: "Arrêt", it: "Parata", de: "Parade" },
  red: { i: "🟥", pt: "Expulsão", en: "Red card", es: "Expulsión", fr: "Carton rouge", it: "Espulsione", de: "Rote Karte" },
  var: { i: "🖥", pt: "VAR", en: "VAR", es: "VAR", fr: "VAR", it: "VAR", de: "VAR" },
  skill: { i: "🔥", pt: "Finta", en: "Skill", es: "Regate", fr: "Geste technique", it: "Giocata", de: "Trick" },
  other: { i: "🎬", pt: "Outros", en: "Other", es: "Otros", fr: "Autres", it: "Altro", de: "Andere" },
};
const VFILTROS = [
  ["all", { pt: "Todos", en: "All", es: "Todos", fr: "Tous", it: "Tutti", de: "Alle" }],
  ["goal", { pt: "Golos", en: "Goals", es: "Goles", fr: "Buts", it: "Gol", de: "Tore" }],
  ["highlight", { pt: "Highlights", en: "Highlights", es: "Jugadas", fr: "Actions", it: "Azioni", de: "Highlights" }],
  ["save", { pt: "Defesas", en: "Saves", es: "Paradas", fr: "Arrêts", it: "Parate", de: "Paraden" }],
  ["var", { pt: "VAR", en: "VAR", es: "VAR", fr: "VAR", it: "VAR", de: "VAR" }],
  ["cards", { pt: "Cartões", en: "Cards", es: "Tarjetas", fr: "Cartons", it: "Cartellini", de: "Karten" }],
];
const VTXT = {
  pt: { title: "Vídeos", watch: "Ver vídeo", close: "Fechar", empty: "Os golos e os melhores momentos aparecem aqui assim que são publicados.", more: "Ver mais", also: (n) => `também em ${n}`, src: "Fonte" },
  en: { title: "Videos", watch: "Watch video", close: "Close", empty: "Goals and highlights appear here as soon as they are posted.", more: "Show more", also: (n) => `also on ${n}`, src: "Source" },
  es: { title: "Vídeos", watch: "Ver vídeo", close: "Cerrar", empty: "Los goles y las mejores jugadas aparecen aquí en cuanto se publican.", more: "Ver más", also: (n) => `también en ${n}`, src: "Fuente" },
  fr: { title: "Vidéos", watch: "Voir la vidéo", close: "Fermer", empty: "Les buts et les temps forts apparaissent ici dès leur publication.", more: "Voir plus", also: (n) => `aussi sur ${n}`, src: "Source" },
  it: { title: "Video", watch: "Guarda il video", close: "Chiudi", empty: "Gol e momenti migliori compaiono qui appena vengono pubblicati.", more: "Mostra altri", also: (n) => `anche su ${n}`, src: "Fonte" },
  de: { title: "Videos", watch: "Video ansehen", close: "Schließen", empty: "Tore und Highlights erscheinen hier, sobald sie veröffentlicht werden.", more: "Mehr anzeigen", also: (n) => `auch auf ${n}`, src: "Quelle" },
};
const vFonte = (s) => (s.subreddit ? `r/${s.subreddit}` : s.canal === "vsports" ? "VSPORTS" : s.canal === "sporttv" ? "Sport TV" : s.canal === "streamain" ? "Streamain" : /^ig:/.test(s.canal || "") ? `@${s.canal.slice(3)}` : s.canal ? `t.me/${s.canal}` : s.fonte);

// os vídeos do Reddit vêm em HLS (com som); o Safari toca-os diretamente, os outros browsers com o hls.js,
// que só é descarregado quando alguém carrega em «Ver vídeo»
let hlsJs = null;
const carregaHls = () => (hlsJs ||= new Promise((ok, falha) => {
  if (window.Hls) return ok(window.Hls);
  const sc = document.createElement("script");
  sc.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
  sc.onload = () => ok(window.Hls);
  sc.onerror = falha;
  document.head.appendChild(sc);
}));
function VideoHls({ src, mp4, auto = false, ...ev }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    let hls = null;
    if (!el) return undefined;
    el.muted = true; // começa sempre sem som; o som liga-se nos controlos do vídeo
    const tocar = () => el.play().catch(() => {});
    if (el.canPlayType("application/vnd.apple.mpegurl")) { el.src = src; tocar(); }
    else {
      carregaHls().then((Hls) => {
        if (Hls?.isSupported()) {
          hls = new Hls(); hls.loadSource(src); hls.attachMedia(el); tocar();
          // se o HLS falhar (Chrome/Edge usam o hls.js), passa para o MP4 do mesmo vídeo
          hls.on(Hls.Events.ERROR, (_, d) => { if (d?.fatal && mp4) { hls.destroy(); hls = null; el.src = mp4; tocar(); } });
        }
        else if (mp4) { el.src = mp4; tocar(); }
      }).catch(() => { if (mp4) { el.src = mp4; tocar(); } });
    }
    return () => hls?.destroy();
  }, [src, mp4]);
  return auto ? <video ref={ref} className="vplayer" muted loop playsInline autoPlay {...ev} /> : <video ref={ref} className="vplayer" muted controls playsInline />;
}

// Reprodução automática em miniatura: o vídeo só é carregado e posto a tocar (sem som) quando o cartão está à vista,
// e pára quando sai do ecrã — assim a página aguenta muitos vídeos ao mesmo tempo
const comAutoplay = (src) => {
  try {
    const u = new URL(src);
    if (/youtube/.test(u.hostname)) { u.searchParams.set("autoplay", "1"); u.searchParams.set("mute", "1"); u.searchParams.set("controls", "0"); u.searchParams.set("loop", "1"); u.searchParams.set("playsinline", "1"); }
    if (/streamable/.test(u.hostname)) { u.searchParams.set("autoplay", "1"); u.searchParams.set("muted", "1"); u.searchParams.set("loop", "1"); u.searchParams.set("nocontrols", "1"); }
    if (/streamain/.test(u.hostname)) { u.searchParams.set("autoplay", "1"); u.searchParams.set("muted", "1"); u.searchParams.set("loop", "1"); }
    return u.href;
  } catch { return src; }
};
// ao abrir um vídeo, começa sem som (YouTube, Streamable e Instagram); o som liga-se no próprio leitor
const semSom = (src) => {
  try {
    const u = new URL(src);
    if (/youtube/.test(u.hostname)) u.searchParams.set("mute", "1");
    if (/streamable/.test(u.hostname)) u.searchParams.set("muted", "1");
    return u.href;
  } catch { return src; }
};
function AutoVideo({ embed, title }) {
  const ref = useRef(null);
  const [visto, setVisto] = useState(false);
  const [aTocar, setATocar] = useState(false);
  useEffect(() => { if (!visto) setATocar(false); }, [visto]);
  const ev = {
    onTimeUpdate: (e) => { if (e.currentTarget.currentTime > 0.2) setATocar(true); },
    onError: () => setATocar(false),
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") { setVisto(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setVisto(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`vauto ${aTocar ? "on" : ""}`} aria-hidden="true">
      {visto && (embed.tipo === "iframe"
        ? <iframe src={comAutoplay(embed.src)} title={title} allow="autoplay; encrypted-media; picture-in-picture" tabIndex={-1} />
        : embed.tipo === "hls" ? <VideoHls src={embed.src} mp4={embed.mp4} auto {...ev} />
          : <video className="vplayer" src={embed.src} muted loop playsInline autoPlay {...ev} />)}
    </div>
  );
}

// Imagem de um vídeo, sempre com alguma coisa para mostrar: 1) a miniatura guardada pelo servidor;
// 2) se falhar, uma imagem tirada do próprio vídeo (1.º segundo); 3) no fim, o cartão desenhado pelo servidor
const thumbUrl = (v, svg = false) => `${API}/api/videos/thumb/${encodeURIComponent(v.video_id)}${svg ? "?svg=1" : `?t=${encodeURIComponent(v.thumbnail || "")}`}`;
const mp4De = (v) => (v.embed?.tipo === "mp4" ? v.embed.src : v.embed?.mp4) || null;
function VideoImg({ v }) {
  // sem miniatura mas com o ficheiro do vídeo: mostra logo o 1.º segundo, sem esperar pelo servidor
  const inicio = !v.thumbnail && mp4De(v) ? 1 : 0;
  const [fase, setFase] = useState(inicio);
  const [frame, setFrame] = useState(false);
  useEffect(() => { setFase(inicio); setFrame(false); }, [v.thumbnail, v.embed?.src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fase !== 1 || frame || !mp4De(v)) return undefined;
    const t = setTimeout(() => setFase(2), 4000);
    return () => clearTimeout(t);
  }, [fase, frame]); // eslint-disable-line react-hooks/exhaustive-deps
  if (fase === 1 && mp4De(v)) {
    return <video className="vframe" src={`${mp4De(v)}#t=1`} preload="auto" muted playsInline onLoadedData={() => setFrame(true)} onError={() => setFase(2)} aria-hidden="true" />;
  }
  if (fase >= 1) return <img src={thumbUrl(v, true)} alt="" loading="lazy" />;
  return <img src={thumbUrl(v)} alt="" loading="lazy" onError={() => setFase(1)} />;
}

function VideoCard({ v, lang, now, ui, theme, playing, onPlay, auto = false, mini = false }) {
  const tx = VTXT[lang] || VTXT.pt;
  const c = VCAT[v.category] || VCAT.other;
  const link = v.embed ? null : (v.reddit_url && /t\.me\//.test(v.reddit_url) ? v.reddit_url : v.video_url || v.reddit_url);
  const titulo = v.teams
    ? (
      <>
        {v.equipas?.[0]?.logo && <Crest e={v.equipas[0]} theme={theme} size={18} />}
        <span className={v.scorer_side === "home" ? "vsc" : ""}>{v.teams.home}</span>
        {v.score ? ` ${v.score.replace("-", "–")} ` : " – "}
        <span className={v.scorer_side === "away" ? "vsc" : ""}>{v.teams.away}</span>
        {v.equipas?.[1]?.logo && <Crest e={v.equipas[1]} theme={theme} size={18} />}
      </>
    )
    : v.title;
  return (
    <li className={`vcard cat-${v.category} ${mini ? "mini" : ""}`}>
      <div className="vthumb">
        {!playing && auto && v.embed && (
          <button className="vplay vautobtn" onClick={() => onPlay(v.video_id)} aria-label={tx.watch}>
            <VideoImg v={v} />
            <AutoVideo embed={v.embed} title={v.title} />
            <span className="vcat">{c[lang] || c.en}</span>
            <span className="vsom" aria-hidden="true">🔇</span>
          </button>
        )}
        {!playing && auto && v.embed ? null : playing && v.embed ? (
          v.embed.tipo === "iframe" ? <iframe src={semSom(v.embed.src)} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            : v.embed.tipo === "hls" ? <VideoHls src={v.embed.src} mp4={v.embed.mp4} />
              : <video className="vplayer" src={v.embed.src} muted controls autoPlay playsInline />
        ) : (
          <button className="vplay" onClick={() => (v.embed ? onPlay(v.video_id) : window.open(link, "_blank", "noopener"))} aria-label={tx.watch}>
            <VideoImg v={v} />
            <span className="vbtn"><Play size={20} fill="currentColor" /></span>
            <span className="vcat">{c[lang] || c.en}</span>
          </button>
        )}
      </div>
      <h3 className="vtitle">{titulo}</h3>
      {(v.player || v.minute) && <p className="vsub">{v.player}{v.player && v.minute ? " " : ""}{v.minute ? `${v.minute}'` : ""}{v.opponent ? <span className="muted"> · vs {v.opponent}</span> : null}</p>}
      {v.teams && v.title && <p className="vorig" title={v.title}>{v.title}</p>}
      <div className="vmeta">
        {v.competition && !mini && <span className="muted">{v.competition}</span>}
        <span className="muted vtime" translate="no">{agoText(v.created_time, now, ui)}</span>
      </div>
      <div className="vacts">
        {playing
          ? <button className="textbtn" onClick={() => onPlay(null)}><Fechar size={14} />{tx.close}</button>
          : <button className="textbtn vwatch" onClick={() => (v.embed ? onPlay(v.video_id) : window.open(link, "_blank", "noopener"))}><Play size={14} />{tx.watch}</button>}
        {v.reddit_url && <a className="textbtn" href={v.reddit_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><ExternalLink size={13} /></a>}
      </div>
    </li>
  );
}

/* ───────── Capas ───────── */
const CAPTXT = {
  pt: { expand: "Expandir", collapse: "Reduzir", today: "Capas de hoje", all: "Ver a semana", empty: "As capas aparecem aqui assim que forem publicadas.", from: "Capas dos últimos sete dias, via VerCapas e SAPO", hoje: "Hoje", others: "Outros", noDay: "Ainda não há capas deste dia.", nToday: "As capas de hoje aparecem aqui assim que os jornais as publicarem." },
  en: { expand: "Expand", collapse: "Collapse", today: "Today's front pages", all: "See the week", empty: "Front pages appear here as soon as they are published.", from: "Front pages from the last seven days, via VerCapas and SAPO", hoje: "Today", others: "Others", noDay: "No front pages for this day yet.", nToday: "Today's front pages appear here as soon as the papers publish them." },
  es: { expand: "Ampliar", collapse: "Reducir", today: "Portadas de hoy", all: "Ver la semana", empty: "Las portadas aparecen aquí en cuanto se publiquen.", from: "Portadas de los últimos siete días, vía VerCapas y SAPO", hoje: "Hoy", others: "Otros", noDay: "Todavía no hay portadas de este día.", nToday: "Las portadas de hoy aparecen aquí en cuanto los periódicos las publican." },
  fr: { expand: "Agrandir", collapse: "Réduire", today: "Unes du jour", all: "Voir la semaine", empty: "Les unes apparaissent ici dès leur publication.", from: "Unes des sept derniers jours, via VerCapas et SAPO", hoje: "Aujourd'hui", others: "Autres", noDay: "Pas encore de unes pour ce jour.", nToday: "Les unes du jour apparaissent ici dès que les journaux les publient." },
  it: { expand: "Espandi", collapse: "Riduci", today: "Prime pagine di oggi", all: "Vedi la settimana", empty: "Le prime pagine compaiono qui appena vengono pubblicate.", from: "Prime pagine degli ultimi sette giorni, via VerCapas e SAPO", hoje: "Oggi", others: "Altri", noDay: "Ancora nessuna prima pagina per questo giorno.", nToday: "Le prime pagine di oggi compaiono qui appena i giornali le pubblicano." },
  de: { expand: "Vergrößern", collapse: "Verkleinern", today: "Titelseiten von heute", all: "Die Woche ansehen", empty: "Die Titelseiten erscheinen hier, sobald sie erscheinen.", from: "Titelseiten der letzten sieben Tage, über VerCapas und SAPO", hoje: "Heute", others: "Andere", noDay: "Für diesen Tag gibt es noch keine Titelseiten.", nToday: "Die heutigen Titelseiten erscheinen hier, sobald die Zeitungen sie veröffentlichen." },
};
const ORDEM_CAPAS = ["pt", "es", "fr", "it", "de", "gb-eng", "br", "ar"];
const diaLisboa = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
// «Hoje», «Ontem», «qua., 16 set.» — nome curto de um dia (AAAA-MM-DD) na língua do site
const ONTEM = { pt: "Ontem", en: "Yesterday", es: "Ayer", fr: "Hier", it: "Ieri", de: "Gestern" };
function nomeDia(d, lang, relativo = true) {
  const hoje = diaLisboa(Date.now());
  if (relativo && d === hoje) return (CAPTXT[lang] || CAPTXT.pt).hoje;
  if (relativo && d === diaLisboa(Date.now() - 86400e3)) return ONTEM[lang] || ONTEM.pt;
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(UI[lang]?.locale || "pt-PT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function Capa({ c, lang, onOpen, pequena, semDia }) {
  const [direta, setDireta] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const tx = CAPTXT[lang] || CAPTXT.pt;
  const hoje = diaLisboa(Date.now());
  // capas de outros dias vêm do arquivo da semana, pedido com o dia
  const src = direta ? c.img : `${API}/api/capas/img/${encodeURIComponent(c.id)}?v=${c.desde || 0}${c.dia && c.dia !== hoje ? `&dia=${c.dia}` : ""}`;
  const d = c.dia || (c.desde ? diaLisboa(c.desde) : null);
  const dia = semDia || !d ? null : d === hoje ? tx.hoje : nomeDia(d, lang, false);
  return (
    <figure className={`capa ${pequena ? "mini" : ""}`}>
      <button onClick={() => onOpen(c)} aria-label={c.nome}>
        {falhou ? <span className="capaph">{c.nome}</span>
          : <img src={src} alt={c.nome} loading="lazy" onError={() => (direta ? setFalhou(true) : setDireta(true))} />}
      </button>
      <figcaption><b>{c.nome}</b>{dia && <span className="muted"> · {dia}</span>}</figcaption>
    </figure>
  );
}

// pistas antigas, guardadas antes de existir o tom, recebem-no pelo tipo
const TIPO_TOM = { surpresa: "negativa", reviravolta: "positiva", tardio: "positiva", goleada: "positiva", serie: "positiva", crise: "negativa", derrotas: "negativa", fimserie: "negativa", primeira: "positiva", lider: "positiva", descida: "negativa" };
const toneOf = (s) => s.tom || TIPO_TOM[s.tipo] || "neutra";

// emblema de um clube ou seleção (a imagem vem da ESPN; se não carregar, fica o nome)
function Crest({ e, theme, size = 34 }) {
  const [bad, setBad] = useState(false);
  const src = theme === "dark" && e.logoDark ? e.logoDark : e.logo;
  if (!src || bad) return <span className="crest-txt">{e.nome}</span>;
  return <img className="crest" src={src} alt={e.nome} title={e.nome} width={size} height={size} loading="lazy" onError={() => setBad(true)} />;
}
function Crests({ eq, theme, lang }) {
  if (!eq?.length) return null;
  const o = eq.find((e) => e.papel === "origem"), d = eq.find((e) => e.papel === "destino");
  if (o || d) {
    return (
      <div className="crests transfer" title={`${o?.nome || "?"} → ${d?.nome || "?"}`}>
        {o ? <Crest e={o} theme={theme} /> : <span className="crest-txt">?</span>}
        <ArrowRight size={15} aria-label={ARROW[lang] || "to"} />
        {d ? <Crest e={d} theme={theme} /> : <span className="crest-txt">?</span>}
      </div>
    );
  }
  const withLogo = eq.filter((e) => e.logo).slice(0, 3); // fora das transferências, só os que têm emblema
  if (!withLogo.length) return null;
  return <div className="crests">{withLogo.map((e) => <Crest key={e.nome} e={e} theme={theme} />)}</div>;
}

// ficha do jogo: resultado, golos e marcadores, expulsões, estatísticas e classificação
function Ficha({ f, lang, ui }) {
  return (
    <div className="ficha">
      <div className="fres"><span>{f.casa}</span><b>{f.hs}–{f.as}</b><span>{f.fora}</span></div>
      {f.golos?.length > 0 && <p><b>{ui.goals}:</b> {f.golos.map((g) => `${g.min} ${g.jogador || "?"} (${g.equipa})`).join(" · ")}</p>}
      {f.vermelhos?.length > 0 && <p><b>{ui.reds}:</b> {f.vermelhos.map((g) => `${g.min} ${g.jogador || "?"} (${g.equipa})`).join(" · ")}</p>}
      {f.stats?.length > 0 && (
        <table className="fstats">
          <caption>{ui.matchStats}</caption>
          <thead><tr><th>{f.casa}</th><th /><th>{f.fora}</th></tr></thead>
          <tbody>{f.stats.map((st) => <tr key={st.id}><td>{st.casa}</td><td>{st[lang] || st.en || st.pt}</td><td>{st.fora}</td></tr>)}</tbody>
        </table>
      )}
      {f.tabela?.length > 0 && <p><b>{ui.tableLbl}:</b> {f.tabela.map((t) => `${t.equipa} ${ui.ord(t.pos)}${t.pts != null ? ` (${t.pts} ${ui.pts})` : ""}`).join(" · ")}</p>}
    </div>
  );
}

// possíveis histórias, da mais recente para a mais antiga, com filtros de nível e de tom
// cartão de uma pista, usado nas Possíveis histórias e nos Favoritos
function StoryCard({ s, items, lang, ui, now, onOpen, leagueName, leaguePais, theme, isFav, onFav }) {
  return (
    <li className={`story lv-${s.nivel}`}>
      <div className="mrow">
        <span className="lvl">{ui.levels[s.nivel]}</span>
        <span className={`tone t-${toneOf(s)}`}>{toneOf(s) === "positiva" ? "▲" : toneOf(s) === "negativa" ? "▼" : "●"} {ui.tones[toneOf(s)]}</span>
        <Flag code={s.pais || leaguePais(s.liga)} lang={lang} />
        {s.ligaNome && <span className="muted">{leagueName(s.liga) || s.ligaNome}</span>}
        <span className="muted">{agoText(s.ts, now, ui)}</span>
      </div>
      <Crests eq={s.crests} theme={theme} lang={lang} />
      <h3 className="title">{emLingua(s.t, lang)}</h3>
      {s.ficha && <Ficha f={s.ficha} lang={lang} ui={ui} />}
      {emLingua(s.narrativa, lang) && <p className="narr"><b>{ui.thread}:</b> {emLingua(s.narrativa, lang)}</p>}
      {s.possibilidades?.length > 0 && (
        <div className="block poss">
          <b>{ui.whatNext}</b> <span className="muted small">{ui.possNote}</span>
          <ul className="bul">
            {s.possibilidades.map((p, i) => (
              <li key={i}>{emLingua(p, lang)}{emLingua(p.se, lang) && <span className="muted"> — {ui.ifWord} {emLingua(p.se, lang).replace(/^(se|if)\s+/i, "")}</span>}</li>
            ))}
          </ul>
        </div>
      )}
      {s.consequencias?.length > 0 && (
        <div className="block cons">
          <b>{ui.consequences}</b>
          <ul className="bul">
            {s.consequencias.map((c, i) => (
              <li key={i}>{c.tipo && <span className="chip tipo">{ui.consTypes[c.tipo] || c.tipo}</span>} {emLingua(c, lang)}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="angle"><b>{ui.angle}:</b> {emLingua(s.angulo, lang)}</p>
      {emLingua(s.dados, lang)?.length > 0 && <p className="sdata"><b>{ui.data}:</b> {emLingua(s.dados, lang).join(" · ")}</p>}
      {emLingua(s.verificar, lang)?.length > 0 && (
        <div className="check"><b>{ui.check}:</b><ul className="bul">{emLingua(s.verificar, lang).map((v, i) => <li key={i}>{v}</li>)}</ul></div>
      )}
      <div className="chips crit">
        {s.crit.map((c) => <span key={c.id} className="chip">{emLingua(c, lang)}</span>)}
        {s.noticia && items.some((x) => x.id === s.noticia) && (
          <button className="textbtn" onClick={() => onOpen(s.noticia)}><ExternalLink size={14} />{ui.seeNews}</button>
        )}
      </div>
    </li>
  );
}

function StoriesView({ stories, items, lang, ui, now, onOpen, leagueName, leaguePais, theme, isFavStory, onFavStory }) {
  const [lvl, setLvl] = useState("todos");
  const [tone, setTone] = useState("todas");
  const [orig, setOrig] = useState("todas");
  const origemDe = (s) => s.origem || (s.noticia ? "noticia" : "dados");
  const list = stories
    .filter((s) => lvl === "todos" || s.nivel === lvl)
    .filter((s) => tone === "todas" || toneOf(s) === tone)
    .filter((s) => orig === "todas" || origemDe(s) === orig)
    .sort((a, b) => b.ts - a.ts);
  return (
    <div className="stories">
      <p className="xnote">{ui.storiesNote}</p>
      <div className="filters">
        <div className="seg lvls" role="group" aria-label={ui.levelLabel}>
          {["todos", "alto", "medio", "baixo"].map((k) => (
            <button key={k} aria-pressed={lvl === k} onClick={() => setLvl(k)}>{k === "todos" ? ui.allLevels : ui.levels[k]}</button>
          ))}
        </div>
        <div className="seg lvls" role="group" aria-label={ui.toneLabel}>
          {["todas", "positiva", "negativa", "neutra"].map((k) => (
            <button key={k} aria-pressed={tone === k} onClick={() => setTone(k)}>{k === "todas" ? ui.allTones : ui.tones[k]}</button>
          ))}
        </div>
        <div className="seg lvls" role="group" aria-label={ui.originLabel}>
          {["todas", "noticia", "dados"].map((k) => (
            <button key={k} aria-pressed={orig === k} onClick={() => setOrig(k)}>{ui.origins[k] || ui.origins.todas}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="empty">{ui.noStories}</p> : (
        <ul className="storylist">
          {list.map((s) => (
            <StoryCard key={s.id} s={s} items={items} lang={lang} ui={ui} now={now} onOpen={onOpen}
              leagueName={leagueName} leaguePais={leaguePais} theme={theme}
              isFav={isFavStory(s.id)} onFav={onFavStory} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Rich({ text }) {
  return text.split(/==(.+?)==/g).map((p, i) => (i % 2 ? <mark key={i} className="hl">{p}</mark> : <span key={i}>{p}</span>));
}

// fontes que confirmaram a notícia depois de quem a deu primeiro: bandeira, nome e quando confirmaram
function Confirms({ it, lang, ui, now, srcPais }) {
  if (!it.also?.length) return null;
  return (
    <div className="confs">
      <span className="conflbl">{ui.confirms}</span>
      {it.also.map((a) => {
        const quando = a.at || a.ts || it.ts;
        const recente = now - quando < 10 * 60000;
        const conteudo = (
          <>
            <Flag code={a.pais || srcPais[a.src]} lang={lang} />
            <b>{a.name || a.src}</b>
            <span className="muted">{recente ? ui.justConfirmed : ui.confirmedAt(new Date(quando).toLocaleTimeString(ui.locale, { hour: "2-digit", minute: "2-digit" }))}</span>
            {a.url && <ExternalLink size={11} />}
          </>
        );
        return a.url
          ? <a key={a.postId || a.src} className={`conf ${recente ? "now" : ""}`} href={a.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }} onClick={(e) => e.stopPropagation()}>{conteudo}</a>
          : <span key={a.postId || a.src} className={`conf ${recente ? "now" : ""}`}>{conteudo}</span>;
      })}
    </div>
  );
}

// todas as fontes onde a notícia saiu (quem deu primeiro e quem confirmou), cada uma a abrir a notícia nessa fonte
function FontesLinks({ it, lang, srcPais, nome, pais, ui }) {
  if (!it.also?.length) return null;
  const todas = [
    { key: `o:${it.id}`, name: nome, url: it.url, pais, first: true },
    ...it.also.map((a) => ({ key: a.postId || a.src, name: a.name || a.src, url: a.url, pais: a.pais || srcPais[a.src] })),
  ];
  return (
    <div className="fontes" onClick={(e) => e.stopPropagation()}>
      {todas.map((f) => (f.url
        ? <a key={f.key} className={`flink ${f.first ? "first" : ""}`} href={f.url} target="_blank" rel="noreferrer" title={f.url}><Flag code={f.pais} lang={lang} />{f.name}<ExternalLink size={11} /></a>
        : <span key={f.key} className={`flink off ${f.first ? "first" : ""}`} title={ui.noPost}><Flag code={f.pais} lang={lang} />{f.name}</span>))}
    </div>
  );
}

/* ───────── Estilos ───────── */
const CSS = `
.apito{--ui:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --display:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --bg:#EEF2ED;--raise:#F8FAF7;--ink:#16221C;--muted:#58685F;--line:#C8D3CB;--accent:#E3AA12;--live:#CF3128;
  --porto:#1D4E9E;--sporting:#0B7A47;--benfica:#C8102E;--hist:#6A41D8;
  font-family:var(--ui);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"case" 1;background:var(--bg);color:var(--ink);min-height:100vh;font-size:16px;line-height:1.5}
.apito[data-theme="dark"]{--bg:#0F1914;--raise:#16241D;--ink:#E4EDE7;--muted:#8E9F96;--line:#27382F;--accent:#F4C542;--live:#FF5B4D;
  --porto:#83A9EE;--sporting:#4CC68D;--benfica:#FF6E7E;--hist:#B29BFF}
.apito *{box-sizing:border-box}
.apito button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
.apito :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.apito .wrap{max-width:1560px;margin:0 auto;padding:0 20px}
.apito .hdr{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line)}
.apito .bar{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;padding:12px 0 8px}
.apito .barl{justify-self:start;min-width:0}
.apito .barl .status{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .brand{display:flex;align-items:center;justify-content:center;gap:10px;justify-self:center}
.apito .brandbtn{justify-content:center}
.apito .searchrow{display:flex;justify-content:center;padding:0 0 8px}
.apito .searchrow .search{width:min(480px,100%)}
.apito .brand b{font-family:var(--display);font-weight:700;font-size:32px;line-height:1;letter-spacing:-.02em}
.apito .tagline{font-size:15px;color:#fff;font-weight:700;margin-right:6px}
.apito[data-theme="light"] .tagline{color:var(--ink)}
.apito .status{display:flex;align-items:center;gap:10px;font-size:14px}
.apito .pulse{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--live)}
.apito .pulse i{width:8px;height:8px;border-radius:50%;background:var(--live);animation:apl 1.6s ease-out infinite}
@keyframes apl{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--live) 55%,transparent)}100%{box-shadow:0 0 0 8px transparent}}
.apito .pulse.off{color:var(--muted)} .apito .pulse.off i{background:var(--muted);animation:none}
.apito .muted{color:var(--muted)}
.apito .ctrls{display:flex;align-items:center;justify-content:flex-end;gap:8px;justify-self:end}
.apito .barl .status{display:block;max-width:100%}
@media(max-width:480px){.apito .brand b{font-size:26px} .apito .brandbtn{gap:6px} .apito .tagline{font-size:11.5px;margin-right:0;letter-spacing:-.01em} .apito .brand .logo{width:28px;height:28px}
  .apito .bar{gap:4px;grid-template-columns:14px minmax(0,1fr) auto} .apito .barl .status{font-size:0;gap:0} .apito .ctrls{gap:4px} .apito .ctrls .icon-btn{width:32px;height:32px}}
.apito .search{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:var(--raise);width:230px;color:var(--muted)}
.apito .search input{border:0;background:transparent;color:var(--ink);font:inherit;font-size:14px;outline:none;width:100%}
.apito .seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px;background:var(--raise)}
.apito .seg.langs button{padding:4px 7px;font-size:11px;letter-spacing:.02em}
.apito .seg button{padding:4px 11px;border-radius:999px;font-size:13px;font-weight:600;color:var(--muted)}
.apito .seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.apito .icon-btn{width:34px;height:34px;display:inline-grid;place-items:center;border:1px solid var(--line);border-radius:999px;background:var(--raise)}
.apito .tabs{display:flex;flex-wrap:nowrap;align-items:center;gap:0 2px;margin:0 -8px;padding:0 8px 2px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.apito .tabs>.tab:first-child{margin-left:auto}
.apito .tabs>.tab:last-child{margin-right:auto}
.apito .tabs::-webkit-scrollbar{height:4px}
.apito .tabs::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
@media(max-width:699px){
  .apito .tabs{padding-right:48px;-webkit-mask-image:linear-gradient(to right,#000 82%,transparent);mask-image:linear-gradient(to right,#000 82%,transparent)}
}
.apito .tab.hl{border-radius:8px 8px 0 0;font-weight:600}
.apito .tab.hl-live{color:var(--live);--tabc:var(--live)}
.apito .tab.hl-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--live);animation:apl 1.6s ease-out infinite}
.apito .tab.hl-dest{color:var(--ink);--tabc:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}
.apito .tab.hl-hist{color:var(--hist);--tabc:var(--hist);background:color-mix(in srgb,var(--hist) 14%,transparent)}
.apito .tab.hl[aria-pressed="true"]{color:var(--tabc)}
.apito .tab.hl-dest[aria-pressed="true"]{color:var(--ink)}
.apito .tab{white-space:nowrap;padding:9px clamp(5px,0.45vw,8px) 10px;font-size:clamp(13px,0.92vw,15px);font-weight:500;color:var(--muted);border-bottom:3px solid transparent;display:inline-flex;align-items:center;gap:6px}
.apito .tab:hover{color:var(--ink)}
.apito .tab[aria-pressed="true"]{color:var(--ink);border-bottom-color:var(--tabc,var(--ink));font-weight:600}
.apito .count{font-size:10px;font-weight:700;background:var(--accent);color:#1B1B1B;border-radius:999px;padding:0 5px;line-height:16px;min-width:16px;text-align:center}
.apito .textbtn.off{opacity:.45;cursor:not-allowed}
.apito .notice{font-size:13px;color:var(--muted);padding:14px 0 0}
.apito .layout{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;padding:10px 0 64px}
@media(min-width:1000px){.apito .layout.res{grid-template-columns:minmax(0,1fr) 360px}}
.apito .layout.one{grid-template-columns:minmax(0,1fr)}
.apito .settings{position:relative}
.apito .settings .backdrop{position:fixed;inset:0;z-index:40}
.apito .settings .menu{position:absolute;top:calc(100% + 8px);right:0;z-index:41;width:min(320px,calc(100vw - 32px));
  max-height:min(70vh,560px);overflow:auto;background:var(--raise);border:1px solid var(--line);border-radius:12px;
  padding:14px;box-shadow:0 14px 40px rgba(0,0,0,.28)}
.apito .settings .menu .panel{position:static}
.apito .menusep{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}
.apito .brand .logo{flex:none}
.apito .events .evlist{list-style:none;margin:10px 0 0;padding:0 4px 0 0;max-height:calc(100vh - 230px);overflow:auto}
.apito .ev{border-left:3px solid var(--live);padding:6px 0 8px 10px;margin-bottom:8px;animation:evin .45s ease-out}
.apito .evh{display:flex;align-items:center;gap:6px;font-size:12px}
.apito .evt{margin-left:auto;font-variant-numeric:tabular-nums}
.apito .evtitle{margin:2px 0 0;font-weight:600;font-size:15px;line-height:1.3}
.apito .evb{margin:2px 0 0;font-size:13px;color:var(--muted)}
.apito .evempty{font-size:14px}
.apito .mobevents{margin-top:24px}
@media(min-width:1000px){.apito .mobevents{display:none}}
@keyframes evin{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.apito .feedhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 10px}
.apito .feedhead h1{font-family:var(--display);font-weight:600;font-size:23px;letter-spacing:-.02em;margin:0 auto 0 0;line-height:1.1}
.apito .textbtn{font-size:14px;color:var(--muted);display:inline-flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px}
.apito .textbtn:hover{color:var(--ink)}
.apito .pending{display:block;width:100%;margin:0 0 12px;padding:9px;border:1px dashed var(--accent);border-radius:8px;font-weight:600;font-size:14px;background:color-mix(in srgb,var(--accent) 12%,transparent)}
.apito .feed{list-style:none;margin:0;padding:0}
.apito .item{display:grid;grid-template-columns:50px 24px minmax(0,1fr)}
.apito .gut{text-align:right;padding-top:13px;font-family:var(--display);font-weight:600;font-size:21px;line-height:1;font-variant-numeric:tabular-nums;color:var(--muted)}
.apito .item.unread .gut{color:var(--ink)}
.apito .gut .n{display:block}
.apito .gut .u{display:block;font-family:var(--ui);font-size:12px;font-weight:500;margin-top:3px;color:var(--muted)}
.apito .score .m.live{color:var(--live)}
.apito .board{list-style:none;margin:0;padding:0;border-top:1px solid var(--line);max-width:720px}
.apito .match{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 76px;align-items:center;gap:4px 14px;padding:12px 4px;border-bottom:1px solid var(--line)}
.apito .match .comp{grid-column:1/-1;font-size:12px;font-weight:600;color:var(--muted)}
.apito .match .team{font-family:var(--display);font-size:19px;letter-spacing:-.015em;font-weight:600;line-height:1.1}
.apito .match .team.h{text-align:right}
.apito .match .res{font-family:var(--display);font-size:25px;font-weight:700;font-variant-numeric:tabular-nums;min-width:70px;text-align:center;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--raise)}
.apito .match.on .res{border-color:var(--live)}
.apito .match .st{font-size:14px;font-weight:700;text-align:right}
.apito .match .upd{grid-column:1/-1;font-size:12px;color:var(--muted)}
.apito .rail{position:relative}
.apito .rail::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:2px;transform:translateX(-50%);background:var(--line)}
.apito .dot{position:absolute;left:50%;top:15px;width:12px;height:12px;border-radius:50%;transform:translateX(-50%);background:var(--bg);border:2px solid var(--line)}
.apito .item.unread .dot{background:var(--accent);border-color:var(--accent)}
.apito .body{padding:10px 12px 20px;border-radius:8px;min-width:0;cursor:default}
.apito .item.fresh .body{animation:afr 3s ease-out}
@keyframes afr{from{background:color-mix(in srgb,var(--accent) 24%,transparent)}to{background:transparent}}
@media (prefers-reduced-motion:reduce){.apito .item.fresh .body,.apito .pulse i{animation:none}}
.apito .mrow{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:14px}
.apito .src{font-weight:600}
.apito .chips{display:inline-flex;flex-wrap:wrap;gap:6px;margin-left:auto}
.apito .chip{font-size:12px;font-weight:600;padding:0 7px;line-height:20px;border-radius:4px;border:1px solid var(--line);color:var(--muted)}
.apito .chip.club{border-color:var(--c);color:var(--c)}
.apito .chip.hot{background:var(--accent);border-color:var(--accent);color:#1B1B1B}
.apito .chip.new{border-color:var(--accent);color:var(--ink)}
.apito .title{font-family:var(--display);font-weight:600;font-size:21px;line-height:1.2;letter-spacing:-.021em;margin:6px 0 2px;max-width:46ch}
.apito .item.hot .title{font-size:25px}
.apito .bul{margin:6px 0 0;padding:0;list-style:none;max-width:68ch}
.apito .bul li{position:relative;padding-left:16px;margin:3px 0}
.apito .bul li::before{content:"";position:absolute;left:2px;top:.62em;width:6px;height:6px;border-radius:1px;background:var(--muted)}
.apito mark.hl{background:color-mix(in srgb,var(--accent) 30%,transparent);color:inherit;padding:0 2px;border-radius:2px}
.apito .score{display:inline-flex;align-items:center;gap:12px;margin:8px 0 2px;padding:5px 12px;border:1px solid var(--line);border-radius:6px;background:var(--raise);font-family:var(--display);font-size:21px;font-weight:600}
.apito .score .n{font-variant-numeric:tabular-nums;font-size:27px;font-weight:700}
.apito .score .m{font-size:14px;font-weight:700}
.apito .acts{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin-top:10px}
.apito .acts .textbtn{font-size:13px;padding:2px 4px}
.apito .tr{font-size:13px;color:var(--muted);font-style:italic;margin-left:auto}
.apito .panel{position:sticky;top:200px}
.apito .panel-head{display:flex;align-items:baseline;justify-content:space-between}
.apito .panel h2{font-family:var(--display);font-size:19px;letter-spacing:-.015em;font-weight:600;margin:0}
.apito .srclist{list-style:none;margin:8px 0 0;padding:0;max-height:62vh;overflow:auto}
.apito .srcrow{display:flex;align-items:center;gap:10px;width:100%;padding:5px 6px;border-radius:6px;font-size:14px;text-align:left}
.apito .srcrow:hover{background:var(--raise)}
.apito .box{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--muted);display:grid;place-items:center;flex:none}
.apito .srcrow[aria-pressed="true"] .box{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.apito .srcrow .ct{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
.apito .srcrow[aria-pressed="false"] .nm{color:var(--muted)}
.apito .mob{display:inline-flex} .apito .desk{display:none}
@media(min-width:1000px){.apito .mob{display:none} .apito .desk{display:block}}
.apito .mobpanel{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:14px;background:var(--raise)}
.apito .mobpanel .panel{position:static}
@media(min-width:1000px){.apito .mobpanel{display:none}}
.apito .flag{width:18px;height:13px;border-radius:2px;box-shadow:0 0 0 1px var(--line);vertical-align:-1px;flex:none}
.apito .textbtn.on{color:var(--accent)}
.apito .chip.mod{border-color:var(--accent);color:var(--ink)}
.apito .mods{flex-wrap:wrap;margin:0 0 14px}
.apito .modtag{margin-left:6px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.apito .srcs{max-width:46ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .crests{display:flex;align-items:center;gap:10px;margin:4px 0 8px;color:var(--muted)}
.apito .crests.transfer{gap:12px}
.apito .crest{object-fit:contain;flex:none;vertical-align:middle}
.apito .crest-txt{font-size:13px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:0 5px;white-space:nowrap}
.apito .match .team{display:inline-flex;align-items:center;gap:8px;min-width:0}
.apito .match .team.h{justify-content:flex-end}
.apito .evcrests{display:inline-flex;gap:5px;margin-right:7px;vertical-align:-7px}
.apito .about{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);margin-right:2px}
.apito .stories{max-width:820px}
.apito .feedhead h1.hist{color:var(--hist)}
.apito .stories .seg button[aria-pressed="true"]{background:var(--hist);color:#fff}
.apito .story{background:color-mix(in srgb,var(--hist) 5%,var(--raise))}
.apito .ficha{border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:14px;background:var(--bg)}
.apito .ficha p{margin:4px 0}
.apito .fres{display:flex;align-items:center;justify-content:center;gap:12px;font-family:var(--display);font-size:20px;font-weight:600}
.apito .fres b{font-size:24px;font-variant-numeric:tabular-nums}
.apito .fstats{width:100%;border-collapse:collapse;margin:6px 0;font-variant-numeric:tabular-nums}
.apito .fstats caption{text-align:left;font-weight:700;padding-bottom:2px}
.apito .fstats th{font-size:12px;color:var(--muted);font-weight:600;padding:2px 4px}
.apito .fstats td{padding:2px 4px;border-top:1px solid var(--line);text-align:center}
.apito .fstats td:nth-child(2){color:var(--muted);font-size:13px}
.apito .filters{display:flex;flex-wrap:wrap;gap:8px 12px;margin:0 0 16px}
.apito .lvls{margin:0}
.apito .tone{font-size:13px;font-weight:600}
.apito .tone.t-positiva{color:var(--sporting)}
.apito .tone.t-negativa{color:var(--benfica)}
.apito .tone.t-neutra{color:var(--muted)}
.apito .storylist{list-style:none;margin:0;padding:0}
.apito .story{border:1px solid var(--line);border-left:4px solid var(--muted);border-radius:8px;padding:12px 16px;margin-bottom:12px;background:var(--raise)}
.apito .story.lv-alto{border-left-color:var(--live)}
.apito .story.lv-medio{border-left-color:var(--accent)}
.apito .story .lvl{font-weight:700;font-size:13px}
.apito .story.lv-alto .lvl{color:var(--live)}
.apito .story .angle,.apito .story .sdata{margin:6px 0;max-width:68ch}
.apito .story .check{margin:6px 0}
.apito .story .check .bul{margin-top:2px}
.apito .chips.crit{margin:10px 0 0;align-items:center}
.apito .xnote{font-size:14px;color:var(--muted);margin:0 0 12px;max-width:60ch}
.apito .leagues .srclist.cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));max-height:none}
@media(min-width:1000px){.apito .mobpanel.leagues{display:block}}
.apito .tv{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:1px 7px 1px 4px;border:1px solid var(--line);
  border-left:3px solid var(--tvc,var(--accent));border-radius:4px;background:var(--raise);white-space:nowrap}
.apito .tvlogo{border-radius:3px;object-fit:contain;flex:none;background:#fff}
.apito .tvdot{width:8px;height:8px;border-radius:2px;background:var(--tvc,var(--accent));flex:none}
.apito .comptv{margin-left:6px}
.apito .livebar{margin:0 0 18px}
.apito .livehead{display:flex;align-items:center;gap:12px;margin:0 0 8px}
.apito .livehead .pulse{font-size:14px}
.apito .livelist{list-style:none;margin:0;padding:0 0 8px;display:flex;gap:10px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.apito .livelist::-webkit-scrollbar{height:6px}
.apito .livelist::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.apito .lcard{flex:0 0 auto;width:236px;border:1px solid var(--line);border-top:3px solid var(--live);border-radius:8px;padding:8px 10px 9px;background:var(--raise)}
.apito .lcard.next{border-top-color:var(--accent)}
.apito .lcomp{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .lrow{display:flex;align-items:center;gap:8px;margin-top:4px;font-family:var(--display);font-size:15px;letter-spacing:-.01em;font-weight:600;line-height:1.1}
.apito .lrow b{margin-left:auto;font-size:20px;font-variant-numeric:tabular-nums}
.apito .lteam{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .lfoot{display:flex;align-items:center;gap:8px;margin-top:8px}
.apito .lmin{font-size:13px;font-weight:700;color:var(--live);flex:none}
.apito .lfoot .tv{margin-left:auto}
.apito .lult{font-size:12px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .lcard .lult{animation:evin .45s ease-out}
.apito .ltv{margin-top:6px}
.apito .lultb{color:var(--ink);font-weight:600}
.apito .narr{margin:8px 0;max-width:68ch}
.apito .block{margin:8px 0;max-width:68ch}
.apito .block .bul{margin-top:3px}
.apito .block.poss{border-left:3px solid var(--accent);padding-left:10px}
.apito .block.cons{border-left:3px solid var(--hist);padding-left:10px}
.apito .small{font-size:12px}
.apito .chip.tipo{margin-right:5px;font-size:10px;text-transform:uppercase;letter-spacing:.03em;border-color:var(--hist);color:var(--hist)}
.apito .confs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0 0}
.apito .conflbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.apito .conf{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:2px 8px;border:1px solid var(--line);border-radius:4px;background:var(--raise)}
.apito .conf b{font-weight:600}
.apito .conf.now{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--raise));animation:cfin .6s ease-out}
.apito .conf.now .muted{color:var(--ink);font-weight:600}
@keyframes cfin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.apito .chip.first{border-color:var(--accent);color:var(--ink);font-weight:700}
.apito .chip.only{border-style:dashed}
.apito .chip.conf.mini{display:inline-flex;align-items:center;gap:4px;padding:0 6px}
.apito .chip.conf.mini .flag{width:14px;height:10px}
.apito .chip.conf.mini.now{border-color:var(--accent);color:var(--ink)}
@media (prefers-reduced-motion:reduce){.apito .conf.now{animation:none}}
.apito .srcstate{font-size:12px;color:var(--muted);margin:6px 0 4px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.apito .srcstate .textbtn{font-size:12px;padding:1px 5px;border:1px solid var(--line);border-radius:999px}
.apito .fst{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:0 5px;line-height:16px;border-radius:3px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
.apito .fst.ok{border-color:color-mix(in srgb,var(--sporting) 60%,transparent);color:var(--sporting)}
.apito .fst.slow{border-color:color-mix(in srgb,var(--accent) 70%,transparent);color:var(--accent)}
.apito .fst.bad{border-color:var(--live);color:var(--live)}
.apito .srcgroup{margin-bottom:4px}
.apito .srcgroup summary{display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:6px;cursor:pointer;font-size:14px;list-style:none}
.apito .srcgroup summary::-webkit-details-marker{display:none}
.apito .srcgroup summary::after{content:"+";margin-left:auto;color:var(--muted);font-weight:700}
.apito .srcgroup details[open] summary::after{content:"–"}
.apito .srcgroup summary:hover{background:var(--raise)}
.apito .srcgroup summary .ct{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
.apito .srcgroup summary::after{margin-left:8px}
.apito .grpacts{display:flex;gap:6px;padding:0 4px 2px 26px}
.apito .srclist.plain{max-height:none;overflow:visible;margin:0 0 6px;padding-left:18px}
.apito .colsbar{overflow-x:auto;overflow-y:hidden;height:10px;margin:0 0 4px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.apito .colsbar>div{height:1px}
.apito .colsbar::-webkit-scrollbar{height:7px}
.apito .colsbar::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.apito .colsbar::-webkit-scrollbar-thumb:hover{background:var(--muted)}
.apito .cols{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(248px,1fr);gap:0;overflow-x:auto;padding:0;scrollbar-width:none}
.apito .cols::-webkit-scrollbar{display:none}
.apito .col{min-width:0;padding:0 12px;border-left:1px solid var(--line)}
.apito .col:first-child{padding-left:0;border-left:0}
.apito .colh{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:7px;margin:0 0 8px;padding:6px 0 8px;background:var(--bg);
  font-family:var(--display);font-size:17px;letter-spacing:-.015em;font-weight:600;line-height:1.1;border-bottom:2px solid var(--accent)}
.apito .clist{list-style:none;margin:0;padding:0}
.apito .citem{padding:9px 0 11px;border-bottom:1px solid var(--line)}
.apito .citem.fresh{animation:afr 3s ease-out}
.apito .citem.hot{border-left:3px solid var(--accent);padding-left:8px}
.apito .cmeta{display:flex;align-items:center;gap:6px;font-size:12px;min-width:0}
.apito .cmeta .src{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .cmeta .ctime{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
.apito .ctitle{font-family:var(--display);font-weight:600;font-size:16px;line-height:1.25;letter-spacing:-.015em;margin:4px 0 0}
.apito .citem.unread .ctitle{color:var(--ink)}
.apito .citem:not(.unread) .ctitle{color:color-mix(in srgb,var(--ink) 86%,var(--bg))}
.apito .cbul{margin:4px 0 0;font-size:13px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.apito .cacts{display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap}
.apito .cacts .textbtn{padding:2px 3px}
.apito .cacts .textbtn:last-child,.apito .cacts a.textbtn{margin-left:auto}
.apito .cempty{font-size:13px;color:var(--muted);padding:6px 0}
@media(max-width:640px){.apito .cols{grid-auto-columns:minmax(84vw,1fr);scroll-snap-type:x mandatory}.apito .col{scroll-snap-align:start}}
/* faixa horizontal de vídeos, por cima das notícias */
.apito .vbar{margin:22px 0 18px}
.apito .vbar .livehead{flex-wrap:wrap;gap:8px 12px}
.apito .vbar .capash{display:inline-flex;align-items:center;gap:6px}
.apito .vfil{display:flex;flex-wrap:wrap;gap:4px;border:0;padding:0;background:none;margin:0}
.apito .vfil button{padding:2px 9px;font-size:12px;border:1px solid var(--line);background:var(--raise)}
.apito .vfil button[aria-pressed="true"]{border-color:var(--ink)}
.apito .seg .ct{margin-left:5px;font-size:11px;font-weight:700;opacity:.65;font-variant-numeric:tabular-nums}
.apito .varrows{display:flex;gap:6px;margin-left:auto}
.apito .varrows .icon-btn{width:30px;height:30px}
.apito .vlist{list-style:none;margin:0;padding:0}
.apito .vrow{display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;padding:0 0 10px;scroll-snap-type:x proximity;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior-x:contain}
.apito .vrow::-webkit-scrollbar{height:7px}
.apito .vrow::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.apito .vcard{flex:0 0 300px;min-width:0;scroll-snap-align:start;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--raise);animation:evin .45s ease-out}
.apito .vcard.cat-goal{border-top:3px solid var(--accent)}
.apito .vcard.cat-red{border-top:3px solid #D7263D}
.apito .vcard.cat-var{border-top:3px solid var(--hist)}
.apito .vcard.cat-save{border-top:3px solid var(--sporting)}
.apito .vmaisli{flex:0 0 auto;display:flex;align-items:center}
.apito .vrow .vmais{height:100%;min-height:120px;padding:0 18px;margin:0;white-space:nowrap}
@media(max-width:640px){.apito .vcard{flex-basis:82vw} .apito .varrows{display:none}}
/* jogos a decorrer e vídeos: faixa de jogos (serve de filtro) e uma grelha única de vídeos */
.apito .jv .livehead{flex-wrap:wrap;gap:8px 12px}
.apito .vautotg{margin-left:auto;font-size:12px}
.apito .vautotg.on{color:var(--ink)}
.apito .jvstrip{list-style:none;margin:0 0 12px}
.apito .jvstrip>li{flex:0 0 auto;display:flex}
.apito .jvstrip .lcard{width:210px;text-align:left;display:block;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.apito .jvstrip .lcard .lrow,.apito .jvstrip .lcard .lfoot,.apito .jvstrip .lcard .ltv,.apito .jvstrip .lcard .lcomp{display:flex}
.apito .jvstrip .lcard .lrow{font-size:14px}
.apito .jvstrip .lcard .lrow b{font-size:17px}
.apito .jvstrip .lcard .lfoot{margin-top:6px}
.apito .jvstrip .lcard[aria-pressed="true"]{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink)}
.apito .jvstrip .lcard:disabled{cursor:default;color:inherit}
.apito .jvstrip .lcard.next{cursor:default}
.apito .jvall{width:130px!important;display:flex!important;flex-direction:column;justify-content:space-between}
.apito .jvhint{padding:2px 0 6px}
.apito .jvall .lcomp{white-space:normal}
.apito .jvgrid .vcard.mini .vorig{display:none}
.apito .jvall b{font-family:var(--display);font-size:26px;line-height:1.1}
.apito .jvall .muted{font-size:12px}
.apito .jvn{margin-left:auto;display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--accent);color:#1B1B1B;flex:none}
.apito .jvn.zero{background:var(--line);color:var(--muted)}
.apito .lcard.done{border-top-color:var(--line)}
.apito .jvgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.apito .jvgrid .vcard.mini{flex:none;width:auto;min-width:0}
.apito .jvmais{display:flex;justify-content:center;margin-top:10px}
.apito .vdest{margin:6px 0 18px}
/* título dos Destaques igual ao «Feed» */
.apito .vdesth{font-family:var(--display);font-weight:600;font-size:23px;letter-spacing:-.02em;margin:0;line-height:1.1}
.apito .vdest .vcard.mini .vorig{display:none}
.apito .vdest .vrow .vcard.mini{flex:0 0 240px}
.apito .vdest .vrow{scroll-snap-type:none}
/* notícias e comunicados oficiais das ligas e federações */
.apito .ofic{margin:26px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
.apito .ofic .livehead{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-bottom:10px}
.apito .ofic .seg{margin:0}
.apito .ocols{scrollbar-width:thin;scrollbar-color:var(--line) transparent;padding-bottom:6px}
.apito .ocols::-webkit-scrollbar{display:block;height:7px}
.apito .ocols::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.apito .oitem .ctitle a{color:inherit;text-decoration:none}
.apito .oitem .ctitle a:hover{text-decoration:underline}
.apito .otipo{font-size:10px;padding:1px 6px}
.apito .otipo.comunicado{background:var(--accent);color:#1B1B1B;border-color:transparent}
.apito .opdf{font-size:10px;padding:1px 5px}
.apito .omais{margin:8px 0 0} /* a faixa desliza sozinha: sem encaixe, que a puxava de volta */
@media(max-width:560px){.apito .vdest .vrow .vcard.mini{flex-basis:62vw}}
.apito .lmin.pausa{color:var(--accent)}
.apito .lmin.et{color:var(--hist)}
.apito .vcard.mini{flex:0 0 220px;padding:7px}
.apito .vcard.mini .vtitle{font-size:13px;margin-top:5px}
.apito .vcard.mini .vsub,.apito .vcard.mini .vorig{font-size:12px;margin:2px 0 0}
.apito .vcard.mini .vorig{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .vcard.mini .vmeta{font-size:11px}
.apito .vcard.mini .vacts{margin-top:4px}
.apito .vauto{position:absolute;inset:0}
.apito .vautobtn img,.apito .vframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;background:#000}
.apito .vauto iframe,.apito .vauto video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;pointer-events:none;background:transparent}
.apito .vauto video{opacity:0;transition:opacity .25s}
.apito .vauto.on video{opacity:1}
.apito .vautobtn{background:#000}
.apito .vsom{position:absolute;right:6px;bottom:6px;font-size:12px;padding:1px 5px;border-radius:4px;background:rgba(0,0,0,.6)}
@media(max-width:560px){.apito .jvgrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px} .apito .jvstrip .lcard{width:180px}
  .apito .vcard.mini .vorig,.apito .vcard.mini .vmeta .vsrc b{display:none} .apito .vcard.mini .vacts .textbtn{font-size:12px}}
/* todas as fontes onde a notícia saiu, cada uma a abrir a notícia nessa fonte */
.apito .fontes{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 0}
.apito .flink{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:1px 6px;border:1px solid var(--line);border-radius:4px;background:var(--raise);color:var(--ink);text-decoration:none;white-space:nowrap}
.apito .flink:hover{border-color:var(--ink)}
.apito .flink.first{border-color:var(--accent)}
.apito .flink.off{opacity:.6}
.apito .flink .flag{width:14px;height:10px}
.apito .conf svg{opacity:.7}
/* nome do site: volta à página inicial */
.apito .brandbtn{display:inline-flex;align-items:center;gap:10px;text-align:left}
.apito .brandbtn:hover .tagline{text-decoration:underline;text-underline-offset:3px}
/* Capas: dias da semana */
.apito .capdias{flex-wrap:wrap;margin:0 0 16px;border-radius:14px}
/* Nesta semana */
.apito .tab.hl-efem{color:var(--accent);--tabc:var(--accent)}
.apito .efem{max-width:900px}
.apito .efdia{font-family:var(--display);font-size:18px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em}
.apito .eftipos{flex-wrap:wrap;margin:0 0 18px;border-radius:14px}
.apito .eftipos .flag{vertical-align:-2px}
.apito .efdias{margin-top:-8px}
.apito .efdata{display:inline-block;margin:0 8px 2px 0;padding:1px 7px;border-radius:999px;background:var(--line);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.apito .efgrupo{margin:0 0 22px}
.apito .efh{position:sticky;top:0;z-index:2;display:flex;align-items:baseline;gap:10px;margin:0 0 6px;padding:6px 0 8px;background:var(--bg);border-bottom:2px solid var(--accent);font-family:var(--display);font-size:19px;letter-spacing:-.015em}
.apito .efh .muted{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.apito .eflist{list-style:none;margin:0;padding:0}
.apito .efitem{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}
.apito .efitem p{margin:0;line-height:1.4}
.apito .efimg{width:44px;height:44px;border-radius:8px;object-fit:cover;flex:none;background:var(--raise)}
.apito .efico{width:44px;height:44px;border-radius:8px;display:grid;place-items:center;flex:none;background:var(--raise);font-size:20px}
.apito .eftxt{flex:1;min-width:0}
.apito .eftag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-right:4px}
.apito .ef-jogo{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center}
.apito .efliga{grid-column:1;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.apito .efres{grid-column:1;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;font-family:var(--display);font-weight:600;font-size:16px}
.apito .efres b{font-size:19px;font-variant-numeric:tabular-nums;min-width:44px;text-align:center}
.apito .efteam{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .efteam.h{justify-content:flex-end}
.apito .efpen{grid-column:1;font-size:12px;text-align:center}
.apito .efgolos{grid-column:1;font-size:12px;text-align:center}
.apito .efespn{grid-column:2;grid-row:1 / span 3}
.apito .efmais{width:100%;justify-content:center;border:1px dashed var(--line);margin:8px 0}
.apito .vthumb{position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#000}
.apito .vthumb iframe,.apito .vthumb .vplayer{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}
.apito .vplay{position:absolute;inset:0;width:100%;height:100%;display:block}
.apito .vplay img{width:100%;height:100%;object-fit:cover;display:block}
.apito .vph{display:grid;place-items:center;width:100%;height:100%;font-size:42px;background:linear-gradient(135deg,#1c2a23,#0b120e)}
.apito .vbtn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.6);color:#fff;transition:transform .15s}
.apito .vplay:hover .vbtn{transform:translate(-50%,-50%) scale(1.1)}
.apito .vcat{position:absolute;left:8px;top:8px;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(0,0,0,.72);color:#fff}
.apito .cat-goal .vcat{background:var(--accent);color:#1B1B1B}
.apito .cat-red .vcat{background:#D7263D}
.apito .vtitle{font-family:var(--display);font-weight:600;font-size:16px;line-height:1.25;letter-spacing:-.015em;margin:7px 0 0}
.apito .vico{margin-right:5px}
.apito .vtitle .crest{margin:0 5px;vertical-align:-3px}
.apito .vsc{font-weight:800}
.apito .vsub{margin:2px 0 0;font-size:14px;font-weight:600}
.apito .vorig{margin:2px 0 0;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .vmeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;margin-top:5px}
.apito .vsrc{font-weight:600}
.apito .vtime{margin-left:auto}
.apito .vacts{display:flex;align-items:center;gap:6px;margin-top:4px}
.apito .vacts .textbtn{font-size:13px;padding:2px 4px}
.apito .vwatch{color:var(--ink);font-weight:600}
.apito .vmais{width:100%;justify-content:center;border:1px dashed var(--line);margin-bottom:10px}
.apito .capasbar{margin:0 0 18px}
.apito .capash{font-family:var(--display);font-size:15px}
.apito .capasbar .livehead .textbtn{margin-left:auto}
.apito .capasstrip{display:flex;gap:10px;overflow-x:auto;padding:0 0 8px;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.apito .capa{margin:0;flex:none}
.apito .capa button{display:block;width:100%;border-radius:4px;overflow:hidden;box-shadow:0 1px 0 var(--line),0 2px 10px rgba(0,0,0,.12);background:#fff}
.apito .capa img{display:block;width:100%;height:auto}
.apito .capa.mini{width:112px}
.apito .capa.mini img{height:150px;object-fit:cover;object-position:top}
.apito .capa figcaption{font-size:12px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .capaph{display:grid;place-items:center;aspect-ratio:3/4;padding:8px;font-weight:700;color:#333;text-align:center}
.apito .capasview{max-width:1400px}
.apito .capagrupo{margin:0 0 26px}
.apito .capasgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px}
.apito .capasgrid.grande{grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr));gap:24px}
.apito .capasgrid.grande .capa figcaption{font-size:14px}
.apito .capasbar .capasgrid.grande{padding:4px 0 8px}
.apito .capexp{display:inline-flex;align-items:center;gap:5px}
.apito .capasbar .livehead .capexp{margin-left:auto}
.apito .capasbar .livehead .capexp + .textbtn{margin-left:12px}
.apito .capastopo{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.apito .capastopo .capexp{margin-left:auto}
.apito .lightbox{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.82);display:grid;place-items:center;padding:24px;overflow:auto}
.apito .lightbox .capa{width:min(1000px,94vw)}
.apito .lightbox .capa figcaption{color:#fff;font-size:14px}
.apito .lightbox .capa figcaption .muted{color:#ccc}
.apito .lbclose{position:fixed;top:16px;right:16px;z-index:61}
.apito .empty{padding:40px 0 40px 74px;color:var(--muted);max-width:60ch}
@media(max-width:640px){
  .apito .search{width:100%;order:5}
  .apito .item{grid-template-columns:40px 20px minmax(0,1fr)}
  .apito .gut{font-size:18px}
  .apito .match{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 56px;gap:4px 8px}
  .apito .match .team{font-size:16px} .apito .match .res{font-size:21px;min-width:56px}
  .apito .title{font-size:19px} .apito .item.hot .title{font-size:22px}
  .apito .chips{margin-left:0;width:100%}
  .apito .empty{padding-left:0}
}
`;

/* ───────── Nesta semana ───────── */
const EFTXT = {
  pt: { note: "O que aconteceu no desporto nos dias desta semana, há 1, 2, 3, 4, 5, 10, 15, 20… 100 anos. A lista muda sozinha quando a semana muda e é revista ao longo do dia.", ago: (n) => (n === 1 ? "Há 1 ano" : `Há ${n} anos`), tipos: { todos: "Tudo", jogo: "Jogos", acontecimento: "Acontecimentos", nascimento: "Nascimentos", morte: "Mortes" }, born: "Nasceu", died: "Morreu", loading: "A preparar a lista desta semana…", none: "Nada de desporto registado para estes aniversários.", pt: "Só Portugal", src: "Fontes: Wikipédia, Wikidata e ESPN", pens: "g.p.", more: (n) => `Mais ${n} jogos`, less: "Mostrar menos", week: (d) => `Semana de ${d}`, allDays: "Semana toda" },
  en: { note: "What happened in sport on the days of this week, 1, 2, 3, 4, 5, 10, 15, 20… 100 years ago. The list changes by itself when the week changes and is refreshed during the day.", ago: (n) => (n === 1 ? "1 year ago" : `${n} years ago`), tipos: { todos: "All", jogo: "Matches", acontecimento: "Events", nascimento: "Births", morte: "Deaths" }, born: "Born", died: "Died", loading: "Preparing this week's list…", none: "Nothing sporting on record for these anniversaries.", pt: "Portugal only", src: "Sources: Wikipedia, Wikidata and ESPN", pens: "pens", more: (n) => `${n} more matches`, less: "Show less", week: (d) => `Week of ${d}`, allDays: "Whole week" },
  es: { note: "Lo que pasó en el deporte en los días de esta semana, hace 1, 2, 3, 4, 5, 10, 15, 20… 100 años. La lista cambia sola cuando cambia la semana y se revisa durante el día.", ago: (n) => (n === 1 ? "Hace 1 año" : `Hace ${n} años`), tipos: { todos: "Todo", jogo: "Partidos", acontecimento: "Acontecimientos", nascimento: "Nacimientos", morte: "Fallecimientos" }, born: "Nació", died: "Murió", loading: "Preparando la lista de esta semana…", none: "No hay nada de deporte registrado para estos aniversarios.", pt: "Solo Portugal", src: "Fuentes: Wikipedia, Wikidata y ESPN", pens: "pen.", more: (n) => `${n} partidos más`, less: "Mostrar menos", week: (d) => `Semana del ${d}`, allDays: "Toda la semana" },
  fr: { note: "Ce qui s'est passé dans le sport les jours de cette semaine, il y a 1, 2, 3, 4, 5, 10, 15, 20… 100 ans. La liste change toute seule quand la semaine change et est revue pendant la journée.", ago: (n) => (n === 1 ? "Il y a 1 an" : `Il y a ${n} ans`), tipos: { todos: "Tout", jogo: "Matchs", acontecimento: "Événements", nascimento: "Naissances", morte: "Décès" }, born: "Naissance", died: "Décès", loading: "Préparation de la liste de la semaine…", none: "Rien de sportif enregistré pour ces anniversaires.", pt: "Portugal seulement", src: "Sources : Wikipédia, Wikidata et ESPN", pens: "t.a.b.", more: (n) => `${n} matchs de plus`, less: "Afficher moins", week: (d) => `Semaine du ${d}`, allDays: "Toute la semaine" },
  it: { note: "Cosa è successo nello sport nei giorni di questa settimana, 1, 2, 3, 4, 5, 10, 15, 20… 100 anni fa. L'elenco cambia da solo quando cambia la settimana e viene rivisto durante il giorno.", ago: (n) => (n === 1 ? "1 anno fa" : `${n} anni fa`), tipos: { todos: "Tutto", jogo: "Partite", acontecimento: "Eventi", nascimento: "Nascite", morte: "Morti" }, born: "Nato", died: "Morto", loading: "Preparo l'elenco di questa settimana…", none: "Niente di sportivo registrato per questi anniversari.", pt: "Solo Portogallo", src: "Fonti: Wikipedia, Wikidata ed ESPN", pens: "rig.", more: (n) => `Altre ${n} partite`, less: "Mostra meno", week: (d) => `Settimana del ${d}`, allDays: "Tutta la settimana" },
  de: { note: "Was an den Tagen dieser Woche im Sport passiert ist, vor 1, 2, 3, 4, 5, 10, 15, 20… 100 Jahren. Die Liste wechselt von selbst, wenn die Woche wechselt, und wird im Laufe des Tages überprüft.", ago: (n) => (n === 1 ? "Vor 1 Jahr" : `Vor ${n} Jahren`), tipos: { todos: "Alles", jogo: "Spiele", acontecimento: "Ereignisse", nascimento: "Geburten", morte: "Todesfälle" }, born: "Geboren", died: "Gestorben", loading: "Die Liste dieser Woche wird vorbereitet…", none: "Für diese Jahrestage ist nichts Sportliches verzeichnet.", pt: "Nur Portugal", src: "Quellen: Wikipedia, Wikidata und ESPN", pens: "i.E.", more: (n) => `${n} weitere Spiele`, less: "Weniger anzeigen", week: (d) => `Woche vom ${d}`, allDays: "Ganze Woche" },
};
const JOGOS_POR_ANO = 6; // os restantes jogos de cada ano ficam atrás de «mais»

function EfemeridesView({ dados, lang, theme, query }) {
  const tx = EFTXT[lang] || EFTXT.pt;
  const [tipo, setTipo] = useState("todos");
  const [diaSel, setDiaSel] = useState(null); // null = a semana toda
  const [abertos, setAbertos] = useState({});
  const q = query.trim().toLowerCase();
  const locale = UI[lang]?.locale || "pt-PT";
  const dias = dados?.dias || [];
  const fmtDia = (d, opt) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { ...opt, timeZone: "UTC" });
  const nomeDoDia = (d) => (d === dados?.hoje ? (CAPTXT[lang] || CAPTXT.pt).hoje : fmtDia(d, { weekday: "short", day: "numeric" }));
  const itens = (dados?.itens || []).filter((it) => (tipo === "todos" || it.tipo === tipo) && (!diaSel || it.dia === diaSel)
    && (!q || `${it.nome || ""} ${it.desc || ""} ${it.texto || ""} ${it.casa || ""} ${it.fora || ""} ${it.liga || ""}`.toLowerCase().includes(q)));
  const grupos = [];
  for (const it of itens) {
    const g = grupos[grupos.length - 1];
    if (g && g.anos === it.anos) g.lista.push(it); else grupos.push({ anos: it.anos, ano: it.ano, lista: [it] });
  }
  const contagem = (t) => (dados?.itens || []).filter((it) => (t === "todos" || it.tipo === t) && (!diaSel || it.dia === diaSel)).length;
  const semanaTxt = dias.length ? `${fmtDia(dias[0], { day: "numeric", month: "short" })} – ${fmtDia(dias[dias.length - 1], { day: "numeric", month: "short" })}` : "";
  return (
    <div className="efem">
      <p className="efdia">{tx.week(semanaTxt)}</p>
      {dias.length > 0 && (
        <div className="seg lvls eftipos efdias" role="group">
          <button aria-pressed={!diaSel} onClick={() => setDiaSel(null)}>{tx.allDays}</button>
          {dias.map((d) => (
            <button key={d} aria-pressed={diaSel === d} onClick={() => setDiaSel(d)}>{nomeDoDia(d)}<span className="ct">{(dados?.itens || []).filter((it) => it.dia === d && (tipo === "todos" || it.tipo === tipo)).length}</span></button>
          ))}
        </div>
      )}
      <div className="seg lvls eftipos" role="group">
        {Object.entries(tx.tipos).map(([k, n]) => (
          <button key={k} aria-pressed={tipo === k} onClick={() => setTipo(k)}>{n}<span className="ct">{contagem(k)}</span></button>
        ))}
      </div>
      {!dados?.pronto ? <p className="empty">{tx.loading}</p> : grupos.length === 0 ? <p className="empty">{tx.none}</p> : grupos.map((g) => {
        const jogos = g.lista.filter((it) => it.tipo === "jogo");
        const outros = g.lista.filter((it) => it.tipo !== "jogo");
        const aberto = !!abertos[g.anos];
        const jogosVis = aberto ? jogos : jogos.slice(0, JOGOS_POR_ANO);
        return (
          <section key={g.anos} className="efgrupo">
            <h2 className="efh"><b>{tx.ago(g.anos)}</b><span className="muted">{g.ano}</span></h2>
            <ul className="eflist">
              {outros.map((it) => (
                <li key={it.id} className={`efitem ef-${it.tipo}`}>
                  {it.img ? <img className="efimg" src={it.img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <span className="efico" aria-hidden="true">{it.tipo === "nascimento" ? "🎂" : it.tipo === "morte" ? "🕊" : "🏆"}</span>}
                  <div className="eftxt">
                    {it.dia && !diaSel && <span className="efdata">{nomeDoDia(it.dia)}</span>}
                    {it.nome ? (
                      <p><span className="eftag">{it.tipo === "nascimento" ? tx.born : tx.died}</span> <b>{it.nome}</b>{it.portugues && <> <Flag code="pt" lang={lang} /></>}{it.desc && <span className="muted"> — {it.desc}</span>}</p>
                    ) : (
                      <p>{it.tipo !== "acontecimento" && <span className="eftag">{it.tipo === "nascimento" ? tx.born : tx.died}</span>} {it.texto}{it.portugues && <> <Flag code="pt" lang={lang} /></>}{it.mod && it.mod !== "futebol" && <> <span className="chip mod">{modName(it.mod, lang) || it.mod}</span></>}</p>
                    )}
                  </div>
                  {it.link && <a className="textbtn" href={it.link} target="_blank" rel="noreferrer" title={it.link} style={{ textDecoration: "none" }}><ExternalLink size={13} /></a>}
                </li>
              ))}
              {jogosVis.map((j) => (
                <li key={j.id} className="efitem ef-jogo">
                  <span className="efliga">{j.dia && !diaSel && <span className="efdata">{nomeDoDia(j.dia)}</span>}<Flag code={j.bandeira} lang={lang} /> {lang === "pt" ? j.liga : j.liga_en || j.liga}{j.fase && !/^\d{4}/.test(j.fase) ? ` · ${j.fase}` : ""}</span>
                  <div className="efres">
                    <span className="efteam h">{j.casa}{j.logoCasa && <Crest e={{ nome: j.casa, logo: j.logoCasa }} theme={theme} size={22} />}</span>
                    <b>{j.hs}–{j.as}</b>
                    <span className="efteam">{j.logoFora && <Crest e={{ nome: j.fora, logo: j.logoFora }} theme={theme} size={22} />}{j.fora}</span>
                  </div>
                  {j.penaltis && <span className="muted efpen">({j.penaltis} {tx.pens})</span>}
                  {j.golos?.length > 0 && <p className="efgolos muted">{j.golos.map((x) => `${x.quem || "?"} ${x.min}`).join(" · ")}</p>}
                  <a className="textbtn efespn" href={j.link} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><ExternalLink size={13} /></a>
                </li>
              ))}
              {jogos.length > JOGOS_POR_ANO && (
                <li><button className="textbtn efmais" onClick={() => setAbertos((a) => ({ ...a, [g.anos]: !aberto }))}>{aberto ? tx.less : tx.more(jogos.length - JOGOS_POR_ANO)}</button></li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ───────── App ───────── */
export default function App() {
  const [theme, setTheme] = useState(() =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [lang] = useState("pt");
  const [section, setSection] = useState("destaque");
  const [items, setItems] = useState([]);
  const [conn, setConn] = useState("a ligar"); // ligação do browser ao servidor
  const [xStatus, setXStatus] = useState("a ligar"); // ligação do servidor ao X
  const [pending, setPending] = useState([]);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [sourceList, setSourceList] = useState(SOURCES); // contas fixas + membros das listas, vindas do servidor
  const [enabled, setEnabled] = useState(null); // null = todas as fontes
  const [leagues, setLeagues] = useState([]);
  const [ligasOn, setLigasOn] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("var-ligas")); return Array.isArray(v) ? new Set(v) : null; } catch { return null; }
  });
  const [showLeagues, setShowLeagues] = useState(false);
  const [stories, setStories] = useState([]);
  const [zapping, setZapping] = useState([]); // grelha de transmissões (que canal dá cada jogo)
  const [diag, setDiag] = useState({}); // estado de cada fonte: por onde é lida, se responde, última notícia
  const [soProblemas, setSoProblemas] = useState(false);
  const [videos, setVideos] = useState([]); // feed de vídeos (golos, resumos, defesas…), já sem repetidos
  const [vFiltro, setVFiltro] = useState("all");
  const [vN, setVN] = useState(20);
  const [aTocar, setATocar] = useState(null); // vídeo que está a tocar dentro do cartão
  const autoVid = true; // os vídeos tocam sempre sozinhos em miniatura (sem botão para desligar)
  const [jogoSel, setJogoSel] = useState(null); // jogo escolhido na faixa de jogos (null = todos os vídeos)
  const [nGrelha, setNGrelha] = useState(12); // vídeos mostrados na grelha antes de «Ver mais»
  const [capas, setCapas] = useState([]); // capas dos jornais desportivos de hoje (só as que são mesmo de hoje)
  const [capasSemana, setCapasSemana] = useState([]); // capas dos últimos sete dias, com o dia de cada uma
  const [capasDia, setCapasDia] = useState(null); // dia escolhido na secção Capas (null = o mais recente)
  const [capaAberta, setCapaAberta] = useState(null);
  // capas em tamanho grande, na página inicial e na secção Capas (fica guardado neste browser)
  const [capasExp, setCapasExp] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("var-capas-exp")); return v && typeof v === "object" ? v : {}; } catch { return {}; }
  });
  const alternaCapas = (onde) => setCapasExp((v) => {
    const n = { ...v, [onde]: !v[onde] };
    try { localStorage.setItem("var-capas-exp", JSON.stringify(n)); } catch { /* sem armazenamento */ }
    return n;
  });
  const BotaoExpandir = ({ onde }) => {
    const tx = CAPTXT[lang] || CAPTXT.pt;
    return (
      <button className="textbtn capexp" aria-pressed={!!capasExp[onde]} onClick={() => alternaCapas(onde)}>
        {capasExp[onde] ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{capasExp[onde] ? tx.collapse : tx.expand}
      </button>
    );
  };
  // notícias e comunicados oficiais das ligas e federações (por baixo das notícias do Feed)
  const [ofic, setOfic] = useState({ grupos: [], itens: [] });
  const [ofTipo, setOfTipo] = useState("todos");
  const [ofN, setOfN] = useState({}); // entradas mostradas por coluna, antes de «Ver mais»
  const lerOfic = () => fetch(`${API}/api/oficiais`).then((r) => r.json()).then((d) => d && Array.isArray(d.itens) && setOfic(d)).catch(() => {});
  const ofEntra = (x) => setOfic((o) => ({ ...o, itens: [x, ...o.itens.filter((y) => y.id !== x.id)].sort((a, b) => b.ts - a.ts).slice(0, 2500) }));
  const [efem, setEfem] = useState(null); // «Nesta semana»: o que aconteceu no desporto neste dia, há 1, 2… 100 anos
  const vRef = useRef(null); // faixa horizontal dos vídeos
  // Destaques: a faixa desliza sozinha da esquerda para a direita e pára enquanto o cursor (ou o dedo) está por cima
  const vPausa = useRef(false);
  const vEspera = useRef(0); // depois das setas, de um toque ou de chegar ao fim, espera um pouco antes de continuar
  const [modFilter, setModFilter] = useState("todas");
  const [favs, setFavs] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("var-favoritos")); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("var-favoritos", JSON.stringify(favs)); } catch { /* sem armazenamento */ } }, [favs]);
  // estado das fontes: lido no arranque e refrescado de minuto a minuto
  useEffect(() => {
    const load = () => fetch(`${API}/api/fontes`).then((r) => r.json())
      .then((l) => Array.isArray(l) && setDiag(Object.fromEntries(l.map((d) => [d.handle, d]))))
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  // as capas dos jornais saíram do site: já não se pedem ao servidor
  const lerCapas = () => {};
  // «Nesta semana»: lido no arranque, quando muda a língua e quando o servidor avisa que a lista mudou
  const lerEfem = (l = lang) => fetch(`${API}/api/efemerides?lang=${l}`).then((r) => r.json()).then((d) => d && setEfem(d)).catch(() => {});
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; lerEfem(lang); }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // enquanto a lista de hoje se compõe, volta a pedir de poucos em poucos segundos (além dos avisos do servidor);
  // depois de completa, confirma de dez em dez minutos
  useEffect(() => {
    const t = setTimeout(() => lerEfem(langRef.current), efem?.completo ? 10 * 60000 : 5000);
    return () => clearTimeout(t);
  }, [efem]); // eslint-disable-line react-hooks/exhaustive-deps
  // à meia-noite de Lisboa, as capas de hoje e o «Nesta semana» mudam de dia sem ser preciso recarregar a página
  const diaHoje = diaLisboa(now);
  useEffect(() => { lerCapas(); lerEfem(langRef.current); setCapasDia(null); }, [diaHoje]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!capaAberta) return undefined;
    const esc = (e) => e.key === "Escape" && setCapaAberta(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [capaAberta]);
  // grelha de transmissões: lida no arranque e refrescada de minuto a minuto
  useEffect(() => {
    const load = () => fetch(`${API}/api/zapping`).then((r) => r.json()).then((l) => Array.isArray(l) && setZapping(l)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  // ao voltar ao separador, busca o que entrou enquanto o site esteve em segundo plano
  // e atualiza o que mudou entretanto (resultados e minutos dos jogos em direto)
  const resyncRef = useRef(() => {});
  useEffect(() => {
    const leItems = () => fetch(`${API}/api/items?limit=400`).then((r) => r.json()).then((list) => {
      setItems((l) => {
        const doServidor = new Map(list.map((x) => [x.id, x]));
        let mudou = false;
        const atual = l.map((x) => {
          const s = doServidor.get(x.id);
          if (!s || (s.upd || s.ts) <= (x.upd || x.ts)) return x;
          mudou = true;
          return { ...x, ...s, hot: isHot(s) };
        });
        const known = new Set(l.map((x) => x.id));
        const novos = list.filter((x) => !known.has(x.id));
        return novos.length || mudou ? [...novos, ...atual].sort(byTime).slice(0, MAX_ITEMS) : l;
      });
    }).catch(() => {});
    resyncRef.current = leItems;
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      leItems();
      lerOfic();
      // e os vídeos que saíram entretanto (o telemóvel corta a ligação em segundo plano)
      fetch(`${API}/api/videos/latest?limit=150`).then((r) => r.json()).then((l) => Array.isArray(l) && setVideos((cur) => {
        const porId = new Map(cur.map((x) => [x.video_id, x]));
        for (const v of l) porId.set(v.video_id, { ...porId.get(v.video_id), ...v });
        return [...porId.values()].sort((a, b) => b.created_time - a.created_time).slice(0, 400);
      })).catch(() => {});
    };
    document.addEventListener("visibilitychange", onBack);
    return () => document.removeEventListener("visibilitychange", onBack);
  }, []);
  const isFav = (id) => favs.some((f) => f.id === id);
  const favStories = useMemo(() => favs.filter((f) => f.kind === "story").sort((a, b) => b.favAt - a.favAt), [favs]);
  const toggleFavStory = (st) => setFavs((f) => (f.some((x) => x.id === st.id)
    ? f.filter((x) => x.id !== st.id)
    : [{ ...st, kind: "story", favAt: Date.now() }, ...f]));
  const toggleFav = (it) => setFavs((f) => (f.some((x) => x.id === it.id)
    ? f.filter((x) => x.id !== it.id)
    : [{ ...it, unread: false, fresh: false, favAt: Date.now() }, ...f]));
  // título da página e língua do documento acompanham o botão PT/EN
  useEffect(() => {
    document.documentElement.lang = UI[lang]?.locale || "pt-PT";
    document.title = UI[lang].docTitle;
  }, [lang]);
  const [showSources, setShowSources] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // barra de deslizar das colunas, colocada acima dos cabeçalhos dos países
  const colsRef = useRef(null);
  const barraRef = useRef(null);
  const [colsW, setColsW] = useState(0);
  const sincroniza = (de, para) => {
    if (!de.current || !para.current) return;
    if (para.current.scrollLeft !== de.current.scrollLeft) para.current.scrollLeft = de.current.scrollLeft;
  };
  // a medição das colunas está mais abaixo, depois de «colunas» estar declarado

  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const unfresh = (ids) =>
    setTimeout(() => setItems((l) => l.map((x) => (ids.includes(x.id) ? { ...x, fresh: false } : x))), 3200);

  // relógio: os tempos relativos atualizam de segundo em segundo
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // notícias guardadas + stream em tempo real do servidor (Server-Sent Events)
  useEffect(() => {
    let stop = false;
    const prep = (it, live) => ({ ...it, hot: isHot(it), unread: live, fresh: live });

    fetch(`${API}/api/sources`)
      .then((r) => r.json())
      .then((list) => {
        if (stop || !list.length) return;
        setSourceList(list.map((x) => [x.handle, x.name, x.pais, x.col]));
      })
      .catch(() => {});
    fetch(`${API}/api/leagues`).then((r) => r.json()).then((l) => {
      if (stop) return;
      setLeagues(l);
      // ligas que o servidor passou a acompanhar entram ligadas, mesmo para quem já tinha escolhido as suas
      try {
        const vistas = JSON.parse(localStorage.getItem("var-ligas-vistas") || "null");
        const novas = l.filter((x) => (vistas ? !vistas.includes(x.key) : x.nova)).map((x) => x.key);
        localStorage.setItem("var-ligas-vistas", JSON.stringify(l.map((x) => x.key)));
        if (novas.length) setLigasOn((cur) => {
          if (!cur) return cur;
          const n = new Set([...cur, ...novas]);
          localStorage.setItem("var-ligas", JSON.stringify([...n]));
          return n;
        });
      } catch { /* sem armazenamento */ }
    }).catch(() => {});
    fetch(`${API}/api/stories`).then((r) => r.json()).then((l) => !stop && setStories(l)).catch(() => {});
    fetch(`${API}/api/videos/latest?limit=150`).then((r) => r.json())
      .then((l) => !stop && Array.isArray(l) && setVideos((cur) => {
        const ids = new Set(cur.map((x) => x.video_id));
        return [...cur, ...l.filter((x) => !ids.has(x.video_id))].sort((a, b) => b.created_time - a.created_time);
      }))
      .catch(() => {});

    fetch(`${API}/api/items?limit=1500`)
      .then((r) => r.json())
      .then((list) => {
        if (stop) return;
        setItems((cur) => {
          const ids = new Set(cur.map((x) => x.id));
          return [...cur, ...list.filter((x) => !ids.has(x.id)).map((x) => prep(x, false))];
        });
      })
      .catch(() => setConn("offline"));

    const es = new EventSource(`${API}/api/stream`);
    // ao (re)ligar, relê o que pode ter mudado enquanto a ligação esteve em baixo
    let abriu = false;
    es.onopen = () => {
      setConn("ok"); lerCapas(); lerEfem(langRef.current); lerOfic();
      if (abriu) resyncRef.current(); // religou: os resultados que mudaram com a ligação em baixo
      abriu = true;
    };
    es.onerror = () => setConn("offline");
    es.addEventListener("status", (e) => setXStatus(JSON.parse(e.data).x));
    es.addEventListener("item", (e) => {
      const item = prep(JSON.parse(e.data), true);
      if (pausedRef.current) {
        setPending((p) => (p.some((x) => x.id === item.id) ? p : [item, ...p]));
      } else {
        setItems((l) => (l.some((x) => x.id === item.id) ? l : [item, ...l].sort(byTime).slice(0, MAX_ITEMS)));
        unfresh([item.id]);
      }
    });
    // o post afinal não era notícia, ou juntou-se a outra: sai do feed
    es.addEventListener("story", (e) => {
      const st = JSON.parse(e.data);
      setStories((l) => (l.some((x) => x.id === st.id) ? l : [st, ...l]));
    });
    // vídeo novo, ou o mesmo vídeo encontrado noutra fonte (atualiza o cartão em vez de o repetir)
    const vidEntra = (e) => {
      const v = JSON.parse(e.data);
      if (v.subreddit || v.canal) v.source = vFonte(v);
      setVideos((l) => [v, ...l.filter((x) => x.video_id !== v.video_id)].sort((a, b) => b.created_time - a.created_time).slice(0, 400));
    };
    es.addEventListener("video", vidEntra);
    es.addEventListener("video-update", vidEntra);
    // capas novas (o jornal publicou a de amanhã, ou chegou uma capa de outro dia da semana)
    es.addEventListener("capas", () => lerCapas());
    // a lista do «Nesta semana» foi refeita (mudou o dia ou foi revista)
    es.addEventListener("efemerides", () => lerEfem(langRef.current));
    // notícia ou comunicado oficial novo (ou o mesmo, já com o título traduzido)
    es.addEventListener("oficial", (e) => ofEntra({ ...JSON.parse(e.data), vistoEm: Date.now() }));
    es.addEventListener("remove", (e) => {
      const { id } = JSON.parse(e.data);
      setItems((l) => l.filter((x) => x.id !== id));
      setPending((p) => p.filter((x) => x.id !== id));
    });
    // a notícia foi tratada, ou a mesma notícia chegou por outra fonte: atualiza o cartão existente
    es.addEventListener("update", (e) => {
      const it = JSON.parse(e.data);
      const up = (x) => (x.id === it.id ? { ...x, ...it, hot: isHot(it) } : x);
      // um cartão que o site ainda não tinha (jogo que começou com a ligação em baixo) entra em vez de ser ignorado
      setItems((l) => (l.some((x) => x.id === it.id) ? l.map(up) : [prep(it, false), ...l].sort(byTime).slice(0, MAX_ITEMS)));
      setFavs((f) => (f.some((x) => x.id === it.id) ? f.map((x) => (x.id === it.id ? { ...x, ...it, hot: isHot(it) } : x)) : f));
      setPending((p) => p.map(up));
    });
    return () => { stop = true; es.close(); };
  }, []);

  // Tradução automática para espanhol, francês, italiano e alemão, em duas fases.
  // Fase 1, aqui: os títulos de tudo o que o feed tem, que é o que o leitor percorre com os olhos.
  // Fase 2, mais abaixo: os pontos, só das notícias da secção que está aberta. Enquanto a tradução
  // não chega, o cartão mostra o texto que já tem — nunca fica vazio.
  const pedidosTrad = useRef(new Set());
  const [aTraduzir, setATraduzir] = useState(0);
  const traduz = async (campos, alvo, sinal) => {
    const faltam = alvo.filter((it) => !pedidosTrad.current.has(`${campos}:${lang}:${it.id}`)).slice(0, 60);
    if (!faltam.length) return;
    if (pedidosTrad.current.size > 5000) pedidosTrad.current.clear();
    for (const it of faltam) pedidosTrad.current.add(`${campos}:${lang}:${it.id}`);
    for (let i = 0; i < faltam.length && !sinal.parado; i += 20) {
      const lote = faltam.slice(i, i + 20).map((x) => x.id);
      setATraduzir((n) => n + lote.length);
      try {
        const r = await fetch(`${API}/api/traduzir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, ids: lote, campos }),
        }).then((x) => x.json());
        const feitas = r?.itens || {};
        if (!sinal.parado && Object.keys(feitas).length) {
          setItems((l) => l.map((x) => (feitas[x.id]
            ? {
              ...x,
              t: feitas[x.id].t ? { ...x.t, [lang]: feitas[x.id].t } : x.t,
              tr: feitas[x.id].t && x.raw ? { ...x.tr, [lang]: true } : x.tr,
              b: feitas[x.id].b?.length ? { ...x.b, [lang]: feitas[x.id].b } : x.b,
            }
            : x)));
        }
        // as que ficaram por traduzir (limite do Gemini) voltam à fila daqui a um minuto
        const sobraram = lote.filter((id) => !feitas[id]);
        if (sobraram.length) setTimeout(() => sobraram.forEach((id) => pedidosTrad.current.delete(`${campos}:${lang}:${id}`)), 60000);
      } catch { /* sem tradução: fica o texto que já existe */ }
      setATraduzir((n) => Math.max(0, n - lote.length));
    }
  };

  useEffect(() => {
    if (!TRADUZIDAS[lang]) return;
    const sinal = { parado: false };
    const t = setTimeout(() => traduz("titulo", items.filter((it) => !it.score && !it.pending && precisaTrad(it, lang)), sinal), 400);
    return () => { sinal.parado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, items]);

  // ao clicar num cartão, os pontos dessa notícia são traduzidos logo, sem esperar pela fase 2
  const traduzAoAbrir = (it) => {
    if (!TRADUZIDAS[lang] || it.score || it.pending || it.b?.[lang]) return;
    pedidosTrad.current.delete(`tudo:${lang}:${it.id}`);
    traduz("tudo", [it], { parado: false });
  };

  const ui = UI[lang];
  const T = (it) => emLingua(it.t, lang) || ""; // título na língua escolhida
  const B = (it) => emLingua(it.b, lang) || []; // pontos na língua escolhida
  const live = !paused && conn === "ok" && xStatus === "ligado";

  const flush = () => {
    if (!pending.length) return;
    const fresh = pending.map((p) => ({ ...p, ts: p.ts, fresh: true }));
    setItems((l) => [...fresh, ...l].sort(byTime).slice(0, MAX_ITEMS));
    unfresh(fresh.map((f) => f.id));
    setPending([]);
  };
  const togglePause = () => {
    if (paused) { setPaused(false); flush(); } else setPaused(true);
  };

  const isOn = (h) => enabled === null || enabled.has(h);
  const srcName = (s) => (s.handle === "resultados" ? ui.resultsSource : s.name);
  const leagueByKey = useMemo(() => Object.fromEntries(leagues.map((l) => [l.key, l])), [leagues]);
  const leagueName = (k) => { const l = leagueByKey[k]; return l ? (lang === "pt" ? l.nome : l.nome_en || l.nome) : null; };
  const srcPais = useMemo(() => Object.fromEntries(sourceList.map(([h, , p]) => [h, p])), [sourceList]);
  const srcCol = useMemo(() => Object.fromEntries(sourceList.map(([h, , , c]) => [h, c])), [sourceList]);
  // coluna dos Destaques: o país de que a notícia trata manda; sem essa indicação, vale a proveniência da fonte
  // O «Resto do Mundo» é só para notícias de outros países, venha a notícia da fonte que vier.
  // Ordem: o país de que a notícia trata; se for «eu»/«un» ou não houver, o país dos clubes envolvidos;
  // depois as secções dos três grandes e os nomes de ligas e clubes no texto; por fim, a coluna da fonte,
  // desde que não seja a do Resto do Mundo. Sem nada disto, a notícia fica fora das colunas.
  const colOf = (it) => {
    if (it.cats?.includes("portugueses")) return "portugueses";
    const tema = it.paisTema;
    if (tema && PAIS_COL[tema]) return PAIS_COL[tema];
    if (tema && tema !== "eu" && tema !== "un") return "mundo"; // outro país identificado
    const doClube = (it.equipas || []).map((e) => e.pais).filter(Boolean);
    const grande = doClube.find((p) => PAIS_COL[p]);
    if (grande) return PAIS_COL[grande];
    if (it.cats?.some((c) => c === "porto" || c === "sporting" || c === "benfica")) return "pt";
    const texto = `${T(it)} ${B(it).join(" ")} ${it.text || ""}`;
    const peloTexto = paisPeloTexto(texto);
    if (peloTexto) return peloTexto;
    if (doClube.length) return "mundo"; // só clubes de outros países
    if (MUNDO_TEXTO.test(texto)) return "mundo"; // ligas e clubes de outros países no texto
    const daFonte = srcCol[it.src] || PAIS_COL[srcPais[it.src]];
    if (daFonte && daFonte !== "mundo") return daFonte;
    // fonte do Resto do Mundo com país próprio (Brasil, Argentina, Turquia, Países Baixos…): a notícia é desse país
    const pf = srcPais[it.src];
    if (daFonte === "mundo" && pf && !PAIS_COL[pf] && pf !== "un" && pf !== "eu") return "mundo";
    return null;
  };
  const flagOf = (it) => (it.src === "resultados" ? null : it.pais || srcPais[it.src]); // país da fonte
  const topicOf = (it) => it.paisTema || (it.src === "resultados" ? leagueByKey[it.liga]?.pais || it.pais : null); // país de que a notícia trata
  // resultados em direto: só as ligas escolhidas (a escolha fica guardada neste browser)
  const ligaOn = (it) => !it.liga || ligasOn === null || ligasOn.has(it.liga);
  const srcOn = (it) => ligaOn(it) && (isOn(it.src) || (it.also || []).some((a) => isOn(a.src)));
  const toggleLiga = (key) => setLigasOn((cur) => {
    const n = new Set(cur ?? leagues.map((l) => l.key));
    n.has(key) ? n.delete(key) : n.add(key);
    try { localStorage.setItem("var-ligas", JSON.stringify([...n])); } catch { /* sem armazenamento */ }
    return n;
  });

  const matches = (it) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const s = srcOf(it);
    return strip([T(it), ...B(it), s.name, s.handle].join(" ")).toLowerCase().includes(q);
  };

  const visible = useMemo(() => {
    if (section === "favoritos") return favs.filter((f) => f.kind !== "story").filter(matches).sort(byTime);
    return items.filter((it) => srcOn(it) && inSection(it, section) && matches(it)
      && (section !== "modalidades" || modFilter === "todas" || it.mod === modFilter)).sort(byTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, favs, enabled, ligasOn, section, query, lang, modFilter]);

  // Destaques: as notícias mais relevantes de cada origem, uma coluna por proveniência.
  // A ordem dentro de cada coluna é por relevância (importância a perder peso com o tempo),
  // recalculada de minuto a minuto para não mexer no ecrã a cada segundo.
  const minuto = Math.floor(now / 60000);
  const colunas = useMemo(() => {
    const out = Object.fromEntries(COLS.map((c) => [c.id, []]));
    for (const it of items) {
      if (it.board || it.score || it.src === "resultados") continue; // resultados têm secção própria
      if ((it.imp || 0) < MIN_IMP_COL) continue;
      if (!srcOn(it) || !matches(it)) continue;
      const col = colOf(it);
      if (col && out[col]) out[col].push(it);
    }
    for (const k of Object.keys(out)) {
      out[k] = out[k].sort((a, b) => relevance(b, minuto * 60000) - relevance(a, minuto * 60000)).slice(0, COL_N);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled, ligasOn, query, lang, sourceList, minuto]);

  // barra de deslizar das colunas: medir a largura sempre que as colunas mudam
  useEffect(() => {
    const el = colsRef.current;
    if (!el) return setColsW(0);
    const medir = () => setColsW(el.scrollWidth);
    medir();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    window.addEventListener("resize", medir);
    return () => { ro?.disconnect(); window.removeEventListener("resize", medir); };
  }, [section, lang, colunas]);

  // Fase 2: os pontos, só das notícias que estão à vista na secção aberta — na primeira página
  // são as das colunas, nas outras secções é a lista. O resto do feed fica só com o título traduzido.
  useEffect(() => {
    if (!TRADUZIDAS[lang]) return;
    const sinal = { parado: false };
    const t = setTimeout(() => {
      const aVista = section === "destaque"
        ? COLS.flatMap((c) => (colunas[c.id] || []).slice(0, 6))
        : visible.slice(0, 24);
      traduz("tudo", aVista.filter((it) => !it.score && !it.pending && !it.b?.[lang]), sinal);
    }, 700);
    return () => { sinal.parado = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, section, colunas, visible]);

  const unreadBy = useMemo(() => {
    const out = {};
    for (const c of CATS) out[c.id] = items.filter((it) => it.unread && srcOn(it) && inSection(it, c.id)).length;
    return out;
  }, [items, enabled, ligasOn]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const it of items) {
      if (!it.score || !srcOn(it)) continue;
      const k = `${it.score.comp}|${it.score.h}|${it.score.a}`;
      if (map.has(k) && (map.get(k).upd || map.get(k).ts) >= (it.upd || it.ts)) continue;
      if (q && !`${it.score.comp} ${it.score.h} ${it.score.a}`.toLowerCase().includes(q)) continue;
      map.set(k, it);
    }
    return [...map.values()].sort((a, b) => (isLive(b.score, b.upd || b.ts, now) - isLive(a.score, a.upd || a.ts, now)) || (b.upd || b.ts) - (a.upd || a.ts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled, ligasOn, query, now]);

  // todos os jogos, sem o filtro de ligas, de fontes ou de pesquisa: servem para ligar cada vídeo ao seu jogo,
  // para o cartão do Feed ter sempre o resultado e o canal mesmo quando a liga está desligada nos Resultados
  const jogosTodos = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      if (!it.score) continue;
      const k = `${it.score.comp}|${it.score.h}|${it.score.a}`;
      if (map.has(k) && (map.get(k).upd || map.get(k).ts) >= (it.upd || it.ts)) continue;
      map.set(k, it);
    }
    return [...map.values()];
  }, [items]);

  // jogos a decorrer, para a página inicial (o quadro completo continua na secção Resultados)
  const aoVivo = useMemo(() => games.filter((it) => isLive(it.score, it.upd || it.ts, now)), [games, now]);
  // próximas transmissões na televisão portuguesa, quando não há jogos a decorrer
  const proximasTv = useMemo(() => zapping.filter((z) => z.inicio > now - 15 * 60000).slice(0, 10), [zapping, now]);

  const videosVis = useMemo(() => videos.filter((v) => vFiltro === "all" || v.category === vFiltro || (vFiltro === "cards" && v.category === "red"))
    .filter((v) => !query.trim() || `${v.title} ${v.player || ""} ${v.teams?.home || ""} ${v.teams?.away || ""}`.toLowerCase().includes(query.trim().toLowerCase())),
  [videos, vFiltro, query]);

  // Destaques de vídeo: os de maior interesse das últimas 24 h. A nota junta o tipo de lance (golo, expulsão e VAR
  // acima de defesas e fintas, e estas acima de resumos), o jogo (os três grandes, a Liga Portugal e os jogos a
  // decorrer), os golos tardios, o número de fontes que publicaram o mesmo vídeo (sinal de que é falado) e a
  // frescura (a nota cai para metade a cada 4 horas). No máximo dois vídeos por jogo, para a faixa não ficar só com um.
  const horaDest = Math.floor(now / 60000);
  const destaquesVid = useMemo(() => {
    const t = horaDest * 60000;
    const PESO = { goal: 5, red: 4.5, var: 4, save: 3.5, skill: 3, highlight: 2, other: 0.5 };
    const GRANDES = /benfica|porto|sporting/i;
    const aoVivoTok = aoVivo.map((g) => g.score);
    const nota = (v) => {
      const idadeH = (t - v.created_time) / 3600e3;
      if (idadeH > 24) return 0;
      const eq = `${v.teams?.home || ""} ${v.teams?.away || ""} ${v.title || ""}`;
      let n = PESO[v.category] ?? 1;
      if (GRANDES.test(eq)) n += 3;
      if (v.portugues) n += 1.5;
      if (v.teams && aoVivoTok.some((sc) => (eqIgualT(sc.h, v.teams.home) && eqIgualT(sc.a, v.teams.away)) || (eqIgualT(sc.h, v.teams.away) && eqIgualT(sc.a, v.teams.home)))) n += 1.5;
      const min = parseInt(v.minute, 10);
      if (v.category === "goal" && min >= 85) n += 1.5;
      if (v.player) n += 0.5;
      n += Math.min(3, ((v.sources?.length || 1) - 1) * 1);
      if (v.embed) n += 0.5;
      return n * Math.pow(0.5, idadeH / 4);
    };
    const porJogo = new Map();
    const out = [];
    for (const [v, n] of videos.map((v) => [v, nota(v)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])) {
      const k = v.teams ? `${eqTok(v.teams.home).join(" ")}|${eqTok(v.teams.away).join(" ")}` : v.video_id;
      if ((porJogo.get(k) || 0) >= 2) continue;
      porJogo.set(k, (porJogo.get(k) || 0) + 1);
      out.push(v);
      if (out.length >= 14) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, horaDest, aoVivo.length]);

  // Jogos e vídeos juntos: cada jogo com os vídeos que lhe pertencem. Primeiro os jogos a decorrer (com ou sem
  // vídeos), depois os jogos que já acabaram e ainda têm vídeos, e no fim os vídeos que não se ligam a nenhum jogo.
  const dezSeg = Math.floor(now / 10000);
  const blocos = useMemo(() => {
    const t = dezSeg * 10000;
    const grupos = new Map();
    const semJogo = [];
    const chaveJogo = (g) => `g:${g.score.comp}|${g.score.h}|${g.score.a}`;
    for (const g of games) if (isLive(g.score, g.upd || g.ts, t)) grupos.set(chaveJogo(g), { key: chaveJogo(g), jogo: g, live: true, vids: [], ult: g.upd || g.ts });
    // no Feed só entram jogos de agora: os vídeos de jogos que já acabaram ficam 3 horas e depois saem
    // (o feed guarda vídeos durante dias, e apareciam jogos do Brasileirão de há dois dias)
    const RECENTE = 3 * 3600e3;
    for (const v of videosVis) {
      const h = v.teams?.home || v.home_team, a = v.teams?.away || v.away_team;
      const velho = t - v.created_time > RECENTE;
      if (!h || !a) { if (!velho) semJogo.push(v); continue; }
      // o jogo com o par de equipas mais parecido (a decorrer primeiro, depois o mais próximo na hora)
      let jogo = null, nota = 0;
      for (const g of jogosTodos) {
        if (Math.abs((g.upd || g.ts) - v.created_time) > 5 * 3600e3) continue;
        const n = parNota(g.score.h, g.score.a, h, a) + (isLive(g.score, g.upd || g.ts, t) ? 0.5 : 0);
        if (n > 0.5 && n > nota) { nota = n; jogo = g; }
      }
      const key = jogo ? chaveJogo(jogo) : `t:${eqTok(h).join(" ")}|${eqTok(a).join(" ")}`;
      if (velho && !(grupos.get(key)?.live)) continue; // vídeo antigo de um jogo que não está a decorrer
      if (!grupos.has(key)) grupos.set(key, { key, jogo: jogo || null, live: !!jogo && isLive(jogo.score, jogo.upd || jogo.ts, t), vids: [], ult: 0, h, a, comp: v.competition, equipas: v.equipas });
      const gr = grupos.get(key);
      gr.vids.push(v);
      gr.ult = Math.max(gr.ult, v.created_time);
    }
    // ordem estável: os jogos a decorrer pela hora a que começaram (não saltam de lugar quando sai um vídeo),
    // depois os que já acabaram e têm vídeos, do vídeo mais recente para o mais antigo
    const lista = [...grupos.values()].sort((x, y) => (y.live - x.live)
      || (x.live ? (x.jogo?.ts || 0) - (y.jogo?.ts || 0) || String(x.key).localeCompare(String(y.key)) : y.ult - x.ult));
    return { lista, semJogo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, jogosTodos, videosVis, dezSeg]);
  const capasOrd = useMemo(() => [...capas].sort((a, b) => {
    const ia = ORDEM_CAPAS.indexOf(a.pais), ib = ORDEM_CAPAS.indexOf(b.pais);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a.nome).localeCompare(String(b.nome), "pt");
  }), [capas]);
  // secção Capas: os dias da semana que têm capas, do mais recente para o mais antigo, e as capas
  // do dia escolhido agrupadas por país
  const diasCapas = useMemo(() => {
    const d = new Set(capasSemana.map((c) => c.dia).filter(Boolean));
    if (capas.length) d.add(diaHoje);
    return [...d].sort().reverse();
  }, [capasSemana, capas, diaHoje]);
  const diaCapasSel = capasDia && diasCapas.includes(capasDia) ? capasDia : diasCapas[0] || diaHoje;
  const capasPorPais = useMemo(() => {
    const doDia = capasSemana.filter((c) => c.dia === diaCapasSel);
    // hoje: as capas da lista atual contam mesmo que ainda não tenham chegado ao arquivo
    const lista = diaCapasSel === diaHoje ? [...doDia, ...capas.filter((c) => !doDia.some((x) => x.id === c.id))] : doDia;
    const ord = [...lista].sort((a, b) => {
      const ia = ORDEM_CAPAS.indexOf(a.pais), ib = ORDEM_CAPAS.indexOf(b.pais);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a.nome).localeCompare(String(b.nome), "pt");
    });
    const g = new Map();
    for (const c of ord) { if (!g.has(c.pais)) g.set(c.pais, []); g.get(c.pais).push(c); }
    return [...g.entries()];
  }, [capasSemana, capas, diaCapasSel, diaHoje]);
  // vídeos por categoria, para os separadores da faixa de vídeos
  const vContagem = useMemo(() => {
    const o = { all: videos.length };
    for (const v of videos) { o[v.category] = (o[v.category] || 0) + 1; if (v.category === "red") o.cards = (o.cards || 0) + 1; }
    return o;
  }, [videos]);
  // um vídeo dos Destaques aberto a tocar também segura a faixa, para não sair do ecrã a meio
  const vToca = useRef(false);
  vToca.current = !!aTocar && destaquesVid.some((v) => v.video_id === aTocar);
  useEffect(() => {
    if (section !== "destaque") return undefined;
    const VEL = 0.045; // píxeis por milissegundo (cerca de 45 px por segundo)
    let raf = 0;
    let ultimo = performance.now();
    let pos = null;
    const passo = (t) => {
      const dt = Math.min(64, t - ultimo);
      ultimo = t;
      const el = vRef.current;
      const max = el ? el.scrollWidth - el.clientWidth : 0;
      if (el && max > 4 && !vPausa.current && !vToca.current && t >= vEspera.current) {
        // o leitor mexeu na faixa (setas, roda do rato, dedo): continua a partir de onde ela ficou
        if (pos == null || Math.abs(el.scrollLeft - pos) > 2) pos = el.scrollLeft;
        if (pos >= max - 1) {
          // chegou ao fim: pára um instante e volta ao início
          vEspera.current = t + 2500;
          pos = null;
          setTimeout(() => { const e = vRef.current; if (e && !vPausa.current) e.scrollTo({ left: 0, behavior: "smooth" }); }, 1500);
        } else {
          pos = Math.min(max, pos + dt * VEL);
          el.scrollLeft = pos;
        }
      }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [section]);
  const rolaVideos = (dir) => { const el = vRef.current; if (el) { vEspera.current = performance.now() + 1200; el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.85), behavior: "smooth" }); } };
  // volta à página inicial (clicar no nome do site)
  const irInicio = () => { setSection("destaque"); setQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const srcCounts = useMemo(() => {
    const out = {};
    for (const it of items) out[it.src] = (out[it.src] || 0) + 1;
    return out;
  }, [items]);

  const markAllRead = () => setItems((l) => l.map((x) => ({ ...x, unread: false })));
  const markRead = (id) => setItems((l) => l.map((x) => (x.id === id && x.unread ? { ...x, unread: false } : x)));
  const toggleSource = (h) =>
    setEnabled((s) => { const n = new Set(s ?? sourceList.map((x) => x[0])); n.has(h) ? n.delete(h) : n.add(h); return n; });

  const postText = (it) => {
    const s = srcOf(it);
    return [strip(T(it)), ...B(it).map((b) => `• ${strip(b)}`), srcName(s), postUrl(it)].filter(Boolean).join("\n");
  };
  const copy = async (it) => {
    const text = postText(it);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* sem acesso à área de transferência */ }
      ta.remove();
    }
    setCopiedId(it.id);
    setTimeout(() => setCopiedId(null), 1500);
  };
  const share = async (it) => {
    if (navigator.share) {
      try { await navigator.share({ title: strip(T(it)), text: postText(it) }); } catch { /* cancelado */ }
    } else copy(it);
  };

  const resultsFeed = useMemo(() => items
    .filter((it) => it.src === "resultados" && !it.board && !it.id.endsWith(":live") && ligaOn(it) && matches(it))
    .sort(byTime).slice(0, 80),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, ligasOn, query, lang]);
  const leagueLabels = (it) => [leagueName(it.liga), it.score?.comp].filter(Boolean);
  const eventsPanel = (
    <div className="panel events">
      <div className="panel-head"><h2>{ui.eventsTitle}</h2></div>
      {resultsFeed.length === 0 ? <p className="muted evempty">{ui.noEvents}</p> : (
        <ul className="evlist" aria-live="polite">
          {resultsFeed.map((it) => (
            <li key={it.id} className="ev">
              <div className="evh">
                <Flag code={topicOf(it)} lang={lang} />
                <span className="muted">{leagueName(it.liga) || it.score?.comp}</span>
                <span className="muted evt">{agoText(it.ts, now, ui)}</span>
              </div>
              <p className="evtitle">{it.equipas?.some((e) => e.logo) && <span className="evcrests">{it.equipas.map((e) => e.logo && <Crest key={e.nome} e={e} theme={theme} size={24} />)}</span>}<Rich text={T(it)} /></p>
              {B(it).filter((b) => !leagueLabels(it).includes(b)).map((b, i) => <p key={i} className="evb"><Rich text={b} /></p>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const modsPresent = useMemo(() => {
    const c = new Map();
    for (const it of items) if (it.cats.includes("modalidades") && it.mod) c.set(it.mod, (c.get(it.mod) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const leaguesPanel = (
    <div className="panel">
      <div className="panel-head">
        <h2>{ui.leaguesTitle}</h2>
        <div>
          <button className="textbtn" onClick={() => { setLigasOn(null); try { localStorage.removeItem("var-ligas"); } catch { /* */ } }}>{ui.all}</button>
          <button className="textbtn" onClick={() => { setLigasOn(new Set()); try { localStorage.setItem("var-ligas", "[]"); } catch { /* */ } }}>{ui.none}</button>
        </div>
      </div>
      <ul className="srclist">
        {leagues.map((l) => {
          const on = ligasOn === null || ligasOn.has(l.key);
          return (
            <li key={l.key}>
              <button className="srcrow" aria-pressed={on} onClick={() => toggleLiga(l.key)}>
                <span className="box">{on && <Check size={12} strokeWidth={3} />}</span>
                <span className="nm">{lang === "pt" ? l.nome : l.nome_en || l.nome}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  // fontes agrupadas pelo país de origem, Portugal e as cinco grandes primeiro
  const ORDEM_PAIS = ["pt", "gb", "gb-eng", "es", "it", "de", "fr"];
  const sourceGroups = useMemo(() => {
    const g = new Map();
    for (const s of sourceList) {
      const pais = s[2] || "un";
      if (!g.has(pais)) g.set(pais, []);
      g.get(pais).push(s);
    }
    return [...g.entries()]
      .map(([pais, list]) => [pais, [...list].sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pt"))])
      .sort((a, b) => {
        const ia = ORDEM_PAIS.indexOf(a[0]), ib = ORDEM_PAIS.indexOf(b[0]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b[1].length - a[1].length;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceList]);
  const toggleGroup = (list, on) => setEnabled((cur) => {
    const n = new Set(cur ?? sourceList.map((x) => x[0]));
    for (const [h] of list) on ? n.add(h) : n.delete(h);
    return n;
  });

  const resumoFontes = useMemo(() => {
    const v = Object.values(diag);
    return {
      google: v.filter((d) => d.via === "Google News" && d.ok !== false).length,
      direto: v.filter((d) => d.ok !== false && d.via && d.via !== "Google News").length,
      erro: v.filter((d) => d.ok === false).length,
    };
  }, [diag]);
  const temProblema = (h) => diag[h] && (diag[h].ok === false || diag[h].via === "Google News");
  const estadoFonte = (h) => {
    const d = diag[h];
    if (!d) return null;
    const quando = d.ultima ? `${ui.lastNews} ${agoText(d.ultima, now, ui)}` : ui.noNews;
    if (d.ok === false) return { cls: "bad", label: "✗", tip: `${ui.srcFail}: ${d.erro || ""} · ${quando}` };
    return { cls: d.via === "Google News" ? "slow" : "ok", label: d.via || "—", tip: `${d.feed || d.via || ""} · ${quando}` };
  };

  const sourcesPanel = (
    <div className="panel">
      <div className="panel-head">
        <h2>{ui.sources}</h2>
        <div>
          <button className="textbtn" onClick={() => setEnabled(null)}>{ui.all}</button>
          <button className="textbtn" onClick={() => setEnabled(new Set())}>{ui.none}</button>
        </div>
      </div>
      {Object.keys(diag).length > 0 && (
        <p className="srcstate">
          {ui.srcState(resumoFontes.direto, resumoFontes.google, resumoFontes.erro)}
          <button className={`textbtn ${soProblemas ? "on" : ""}`} aria-pressed={soProblemas} onClick={() => setSoProblemas((v) => !v)}>{ui.onlyProblems}</button>
        </p>
      )}
      <ul className="srclist" aria-label={ui.countryLabel}>
        {sourceGroups.map(([pais, todas], i) => {
          const list = soProblemas ? todas.filter(([h]) => temProblema(h)) : todas;
          if (!list.length) return null;
          const ligadas = list.filter(([h]) => isOn(h)).length;
          return (
            <li key={pais} className="srcgroup">
              <details open={i === 0}>
                <summary>
                  <Flag code={pais} lang={lang} />
                  <b>{countryName(pais, lang)}</b>
                  <span className="ct">{ligadas}/{list.length}</span>
                </summary>
                <div className="grpacts">
                  <button className="textbtn" onClick={() => toggleGroup(list, true)}>{ui.all}</button>
                  <button className="textbtn" onClick={() => toggleGroup(list, false)}>{ui.none}</button>
                </div>
                <ul className="srclist plain">
                  {list.map(([h, n]) => {
                    const on = isOn(h);
                    return (
                      <li key={h}>
                        <button className="srcrow" aria-pressed={on} onClick={() => toggleSource(h)}>
                          <span className="box">{on && <Check size={12} strokeWidth={3} />}</span>
                          <span className="nm">{h === "resultados" ? ui.resultsSource : n}</span>
                          {(() => {
                            const st = estadoFonte(h);
                            return st ? <span className={`fst ${st.cls}`} title={st.tip}>{st.label}</span> : null;
                          })()}
                          <span className="ct">{srcCounts[h] || 0}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="apito" data-theme={theme}>
      <style>{CSS}</style>

      <header className="hdr">
        <div className="wrap">
          <div className="bar">
            <div className="barl">
              {(conn !== "ok" || xStatus !== "ligado") && (
                <span className="pulse off status"><i />{conn !== "ok" ? ui.offline : ui.connecting}</span>
              )}
            </div>
            <div className="brand">
              <button className="brandbtn" onClick={irInicio} title={emLingua(CAT.destaque, lang)} aria-label={`VAR — ${ui.tagline}`} translate="no">
              <svg className="logo" width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
                <rect x="7" y="11.5" width="50" height="33" rx="6" fill="none" stroke="currentColor" strokeWidth="4.4" />
                <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                  <path d="M15.5 21.5h15" /><path d="M15.5 28h10" /><path d="M15.5 34.5h13" />
                </g>
                <path d="M41.5 17v22" stroke="var(--accent)" strokeWidth="4.4" strokeLinecap="round" strokeDasharray="3.4 4.6" />
                <path d="M32 44.5v6.5M22 55.5h20" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" />
              </svg>
              <b>VAR</b>
              <span className="tagline">{ui.tagline}</span>
              </button>
            </div>
            <div className="ctrls">
              <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={theme === "dark" ? ui.toLight : ui.toDark} title={theme === "dark" ? ui.toLight : ui.toDark}>
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <div className="settings">
                <button className="icon-btn" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}
                  aria-label={ui.settings} title={ui.settings}>
                  <SlidersHorizontal size={16} />
                </button>
                {showSources && (
                  <>
                    <div className="backdrop" onClick={() => setShowSources(false)} aria-hidden="true" />
                    <div className="menu" role="dialog" aria-label={ui.settings}>
                      {sourcesPanel}
                      {leagues.length > 0 && <div className="menusep">{leaguesPanel}</div>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="searchrow">
            <label className="search">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ui.search} aria-label={ui.search} />
            </label>
          </div>
          <nav className="tabs" aria-label={ui.sectionsLabel}>
            {CATS.map((c) => (
              <button key={c.id} className={`tab ${c.hl ? `hl hl-${c.hl}` : ""}`} aria-pressed={section === c.id} onClick={(e) => { setSection(c.id); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
                style={c.club ? { "--tabc": `var(--${c.id})` } : undefined}>
                {emLingua(c, lang)}
                {unreadBy[c.id] > 0 && <span className="count">{unreadBy[c.id]}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="wrap">
        {conn === "offline" && <p className="notice">{ui.offlineNote}</p>}
        <div className={`layout ${section === "resultados" ? "res" : "one"}`}>
          <main>
            <div className="feedhead">
              <h1 className={section === "historias" ? "hist" : ""}>{emLingua(CAT[section], lang)}</h1>
              {section === "resultados" && leagues.length > 0 && (
                <button className="textbtn" onClick={() => setShowLeagues((v) => !v)} aria-expanded={showLeagues}><ListFilter size={15} />{ui.pickLeagues}</button>
              )}
            </div>

            {section === "resultados" && showLeagues && <div className="mobpanel leagues">{leaguesPanel}</div>}

            {pending.length > 0 && (
              <button className="pending" onClick={() => { setPaused(false); flush(); }}>{ui.pending(pending.length)}</button>
            )}

            {section === "modalidades" && modsPresent.length > 1 && (
              <div className="seg lvls mods" role="group" aria-label={ui.allSports}>
                <button aria-pressed={modFilter === "todas"} onClick={() => setModFilter("todas")}>{ui.allSports}</button>
                {modsPresent.map(([m]) => (
                  <button key={m} aria-pressed={modFilter === m} onClick={() => setModFilter(m)}>{modName(m, lang) || m}</button>
                ))}
              </div>
            )}

            {section === "destaque" ? (
              <>
                <section className="livebar jv" aria-label={ui.liveNow}>
                  {aoVivo.length > 0 && (
                    <div className="livehead">
                      <span className="pulse"><i />{ui.liveNow}</span>
                    </div>
                  )}
                  {/* 1) faixa de jogos: a decorrer primeiro, depois os que já acabaram e têm vídeos; cada um serve de filtro */}
                  {(() => {
                    // os vídeos só aparecem depois de escolher um jogo (ou «Outros vídeos», os que não se ligam a nenhum jogo)
                    const OUTROS = "__outros";
                    const doSel = jogoSel === OUTROS ? (blocos.semJogo.length ? { key: OUTROS, vids: blocos.semJogo } : null)
                      : jogoSel ? blocos.lista.find((b) => b.key === jogoSel) || null : null;
                    const sel = doSel?.vids.length ? doSel.key : null;
                    const grelha = sel ? doSel.vids : [];
                    return (
                      <>
                        <ul className="livelist jvstrip">
                          {blocos.lista.map((b) => {
                            const it = b.jogo;
                            const sc = it?.score;
                            // jogo sem resultados em direto ligados: o resultado do vídeo mais recente e o canal pela grelha do Zapping
                            const placar = sc || placarDosVideos(b.vids);
                            const tv = it ? (it.tv || tvDaGrelha(sc, zapping, it.upd || it.ts)) : (b.h && b.a ? tvDaGrelha({ h: b.h, a: b.a }, zapping, b.ult) : null);
                            return (
                              <li key={b.key}>
                                <button className={`lcard ${b.live ? "" : "done"}`} aria-pressed={sel === b.key} disabled={!b.vids.length}
                                  onClick={() => { setJogoSel(sel === b.key ? null : b.key); setNGrelha(12); }}>
                                  <span className="lcomp">{sc ? <><Flag code={topicOf(it)} lang={lang} /> {leagueName(it.liga) || sc.comp}</> : b.comp || ui.otherVideos}</span>
                                  <span className="lrow">
                                    <span className="lteam">{(it?.equipas || b.equipas)?.[0]?.logo && <Crest e={(it?.equipas || b.equipas)[0]} theme={theme} size={18} />}{sc ? sc.h : b.h}</span>
                                    {placar && <b translate="no">{placar.hs}</b>}
                                  </span>
                                  <span className="lrow">
                                    <span className="lteam">{(it?.equipas || b.equipas)?.[1]?.logo && <Crest e={(it?.equipas || b.equipas)[1]} theme={theme} size={18} />}{sc ? sc.a : b.a}</span>
                                    {placar && <b translate="no">{placar.as}</b>}
                                  </span>
                                  <span className="lfoot">
                                    {sc && <span className={`lmin ${sc.ht || sc.pausa ? "pausa" : ""} ${sc.et || sc.pen ? "et" : ""}`} translate="no">{b.live ? minText(sc, lang, ui, now, it.upd || it.ts) : sc.ft ? minText(sc, lang, ui) : (sc.min || "")}</span>}
                                    {b.live && evText(sc?.ult, lang) && <span key={evText(sc.ult, lang)} className="lult" title={evText(sc.ult, lang)}>{evText(sc.ult, lang)}</span>}
                                    <span className={`jvn ${b.vids.length ? "" : "zero"}`} translate="no"><Play size={11} fill="currentColor" />{b.vids.length}</span>
                                  </span>
                                  {tv && <span className="ltv"><Tv tv={tv} /></span>}
                                </button>
                              </li>
                            );
                          })}
                          {blocos.semJogo.length > 0 && (
                            <li>
                              <button className="lcard done jvall" aria-pressed={sel === OUTROS} onClick={() => { setJogoSel(sel === OUTROS ? null : OUTROS); setNGrelha(12); }}>
                                <span className="lcomp">{ui.otherVideos}</span>
                                <span className="lfoot"><span className="jvn" translate="no"><Play size={11} fill="currentColor" />{blocos.semJogo.length}</span></span>
                              </button>
                            </li>
                          )}
                          {aoVivo.length === 0 && proximasTv.map((z) => (
                            <li key={`${z.casa}|${z.fora}|${z.inicio}`}>
                              <div className="lcard next">
                                <span className="lcomp">{new Date(z.inicio).toLocaleString(ui.locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })}{z.qualificador ? ` · ${z.qualificador}` : ""}</span>
                                <span className="lrow"><span className="lteam">{z.casa}</span></span>
                                <span className="lrow"><span className="lteam">{z.fora}</span></span>
                                <span className="lfoot"><Tv tv={z} /></span>
                              </div>
                            </li>
                          ))}
                        </ul>
                        {/* 2) uma só grelha de vídeos, do mais recente para o mais antigo, que se ajusta à largura do ecrã */}
                        {!sel ? (
                          (blocos.lista.length || blocos.semJogo.length || proximasTv.length ? null : <p className="cempty jvhint">{ui.noLive}</p>)
                        ) : (
                          <>
                            <ul className="vlist jvgrid" aria-live="polite">
                              {grelha.slice(0, nGrelha).map((v) => (
                                <VideoCard key={v.video_id} v={v} lang={lang} now={now} ui={ui} theme={theme} playing={aTocar === v.video_id} onPlay={setATocar} auto={autoVid} mini />
                              ))}
                            </ul>
                            {grelha.length > nGrelha && (
                              <div className="jvmais"><button className="textbtn vmais" onClick={() => setNGrelha((n) => n + 12)}>{(VTXT[lang] || VTXT.pt).more} ({grelha.length - nGrelha})</button></div>
                            )}
                          </>
                        )}
                      </>
                    );
                  })()}
                </section>
                {destaquesVid.length > 0 && (
                  <section className="vbar vdest" aria-label={ui.videoHighlights}>
                    <div className="livehead">
                      <h2 className="vdesth">{ui.videoHighlights}</h2>
                      <span className="muted small">{ui.videoHighlightsNote}</span>
                      <div className="varrows">
                        <button className="icon-btn" onClick={() => rolaVideos(-1)} aria-label="←"><ChevronLeft size={16} /></button>
                        <button className="icon-btn" onClick={() => rolaVideos(1)} aria-label="→"><ChevronRight size={16} /></button>
                      </div>
                    </div>
                    <ul className="vlist vrow" ref={vRef}
                      onMouseEnter={() => { vPausa.current = true; }}
                      onMouseLeave={() => { vPausa.current = false; }}
                      onTouchStart={() => { vPausa.current = true; }}
                      onTouchEnd={() => { vPausa.current = false; vEspera.current = performance.now() + 2500; }}>
                      {destaquesVid.map((v) => (
                        <VideoCard key={v.video_id} v={v} lang={lang} now={now} ui={ui} theme={theme} playing={aTocar === v.video_id} onPlay={setATocar} auto={autoVid} mini />
                      ))}
                    </ul>
                  </section>
                )}
                <div className="colsbar" ref={barraRef} onScroll={() => sincroniza(barraRef, colsRef)} aria-hidden="true">
                  <div style={{ width: colsW || 1 }} />
                </div>
                <div className="cols" ref={colsRef} onScroll={() => sincroniza(colsRef, barraRef)}>
                  {COLS.map((c) => (
                    <section key={c.id} className="col">
                      <h2 className="colh"><Flag code={c.pais} lang={lang} /> {emLingua(c, lang)}</h2>
                      {colunas[c.id].length === 0 ? <p className="cempty">{ui.colEmpty}</p> : (
                        <ul className="clist" aria-live="polite">
                          {colunas[c.id].map((it) => {
                            const s = srcOf(it);
                            return (
                              <li key={it.id} id={`c-${it.id}`} className={`citem ${it.hot ? "hot" : ""} ${it.unread ? "unread" : ""} ${it.fresh ? "fresh" : ""}`} onClick={() => { markRead(it.id); traduzAoAbrir(it); }}>
                                <div className="cmeta">
                                  <Flag code={flagOf(it)} lang={lang} title={ui.fromTitle} />
                                  <span className="src">{srcName(s)}</span>
                                  <span className="muted ctime" translate="no">{agoText(it.ts, now, ui)}</span>
                                </div>
                                <h3 className="ctitle"><Rich text={T(it)} /></h3>
                                {B(it)[0] && <p className="cbul"><Rich text={B(it)[0]} /></p>}
                                <div className="cacts">
                                  {it.hot && <span className="chip hot">{ui.hot}</span>}
                                  {it.mod && <span className="chip mod">{modName(it.mod, lang) || it.mod}</span>}
                                  {it.also?.length > 0 && (
                                    <span className={`chip conf mini ${now - (it.upd || 0) < 10 * 60000 ? "now" : ""}`} title={`${ui.confirms}: ${it.also.map((a) => a.name || a.src).join(", ")}`}>
                                      {it.also.slice(0, 3).map((a) => <Flag key={a.postId || a.src} code={a.pais || srcPais[a.src]} lang={lang} />)}
                                      {ui.nConfirms(it.also.length)}
                                    </span>
                                  )}
                                  {postUrl(it) && (
                                    <a className="textbtn" href={postUrl(it)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                      title={isXUrl(postUrl(it)) ? ui.viewX : ui.viewSrc} style={{ textDecoration: "none" }}>
                                      <ExternalLink size={13} />
                                    </a>
                                  )}
                                </div>
                                <FontesLinks it={it} lang={lang} srcPais={srcPais} nome={srcName(s)} pais={flagOf(it)} ui={ui} />
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>
                {ofic.grupos.length > 0 && (() => {
                  const q = semAcentos(query).trim();
                  const lista = ofic.itens.filter((x) => (ofTipo === "todos" || x.tipo === ofTipo) && (!q || semAcentos(`${x.org} ${x.titulo} ${x.titulo_pt || ""}`).includes(q)));
                  const quando = (x) => (x.soDia ? nomeDia(diaLisboa(x.ts), lang) : agoText(x.ts, now, ui));
                  return (
                    <section className="ofic" aria-label={ui.oficiais}>
                      <div className="livehead">
                        <h2 className="vdesth">{ui.oficiais}</h2>
                        <div className="seg lvls" role="group" aria-label={ui.oficiais}>
                          {[["todos", ui.ofTodos], ["noticia", ui.ofNoticias], ["comunicado", ui.ofComunicados]].map(([k, t]) => (
                            <button key={k} aria-pressed={ofTipo === k} onClick={() => setOfTipo(k)}>{t}</button>
                          ))}
                        </div>
                      </div>
                      <div className="cols ocols">
                        {ofic.grupos.map((g) => {
                          const daCol = lista.filter((x) => x.grupo === g.id);
                          const n = ofN[g.id] || 15;
                          return (
                            <section key={g.id} className="col">
                              <h2 className="colh"><Flag code={g.pais} lang={lang} /> {g.nome}</h2>
                              {daCol.length === 0 ? <p className="cempty">{ui.colEmpty}</p> : (
                                <ul className="clist" aria-live="polite">
                                  {daCol.slice(0, n).map((x) => (
                                    <li key={x.id} className={`citem oitem ${now - (x.vistoEm || 0) < 3000 ? "fresh" : ""}`}>
                                      <div className="cmeta">
                                        <span className="src">{x.org}</span>
                                        <span className={`chip otipo ${x.tipo}`}>{x.tipo === "comunicado" ? ui.ofComunicado : ui.ofNoticia}</span>
                                        {x.pdf && <span className="chip opdf" translate="no">PDF</span>}
                                        <span className="muted ctime" translate="no" title={new Date(x.ts).toLocaleString(ui.locale)}>{quando(x)}</span>
                                      </div>
                                      <h3 className="ctitle">
                                        <a href={x.url} target="_blank" rel="noreferrer" title={x.titulo_pt ? x.titulo : undefined}>{x.titulo_pt || x.titulo}</a>
                                      </h3>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {daCol.length > n && (
                                <button className="textbtn vmais omais" onClick={() => setOfN((o) => ({ ...o, [g.id]: n + 15 }))}>{(VTXT[lang] || VTXT.pt).more} ({daCol.length - n})</button>
                              )}
                            </section>
                          );
                        })}
                      </div>
                    </section>
                  );
                })()}
              </>
            ) : section === "efemerides" ? (
              <EfemeridesView dados={efem} lang={lang} theme={theme} query={query} />
            ) : section === "historias" ? (
              <StoriesView stories={stories} items={items} lang={lang} ui={ui} now={now} theme={theme} leagueName={leagueName} leaguePais={(k) => leagueByKey[k]?.pais} isFavStory={isFav} onFavStory={toggleFavStory} onOpen={(id) => { setSection("destaque"); setQuery(""); setTimeout(() => document.getElementById(`n-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }} />
            ) : section === "resultados" ? (
              <>
              {games.length === 0 ? <p className="empty">{ui.noResults}</p> : (
                <ul className="board" aria-live="polite">
                  {games.map((it) => {
                    const sc = it.score, s = srcOf(it);
                    return (
                      <li key={`${sc.comp}|${sc.h}|${sc.a}`} className={`match ${isLive(sc, it.upd || it.ts, now) ? "on" : ""}`}>
                        <span className="comp"><Flag code={topicOf(it)} lang={lang} /> {leagueName(it.liga) || sc.comp}{it.mod && <span className="modtag">{modName(it.mod, lang)}</span>}{(it.tv || tvDaGrelha(sc, zapping, it.upd || it.ts)) && <span className="comptv"><Tv tv={it.tv || tvDaGrelha(sc, zapping, it.upd || it.ts)} size={18} /></span>}</span>
                        <span className="team h">{sc.h}{it.equipas?.[0]?.logo && <Crest e={it.equipas[0]} theme={theme} size={30} />}</span>
                        <span className="res" translate="no">{sc.hs}–{sc.as}</span>
                        <span className="team">{it.equipas?.[1]?.logo && <Crest e={it.equipas[1]} theme={theme} size={30} />}{sc.a}</span>
                        <span className="st" translate="no">{isLive(sc, it.upd || it.ts, now) ? <span className="pulse"><i />{minText(sc, lang, ui, now, it.upd || it.ts)}</span> : <span className="muted">{sc.ft ? minText(sc, lang, ui) : sc.min || "—"}</span>}</span>
                        <span className="upd">{isLive(sc, it.upd || it.ts, now) && evText(sc.ult, lang) && <b className="lultb">{evText(sc.ult, lang)} · </b>}{ui.updated(agoText(it.upd || it.ts, now, ui), srcName(s))}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mobevents">{eventsPanel}</div>
              </>
            ) : visible.length === 0 && !(section === "favoritos" && favStories.length > 0) ? (
              <p className="empty">{section === "favoritos" ? ui.noFavs : items.length === 0 ? ui.waiting : ui.empty}</p>
            ) : (
              <ol className="feed" aria-live="polite">
                {visible.map((it) => {
                  const s = srcOf(it);
                  const cls = ["item", it.unread && "unread", it.fresh && "fresh", it.hot && "hot"].filter(Boolean).join(" ");
                  return (
                    <li key={it.id} id={`n-${it.id}`} className={cls}>
                      <div className="gut" translate="no" title={new Date(it.ts).toLocaleTimeString(ui.locale)}>
                        {(() => {
                          const a = ago(it.ts, now);
                          const tip = it.tsAprox ? ui.approx : undefined;
                          return a
                            ? <><span className="n" title={tip}>{it.tsAprox ? "~" : ""}{a[0]}</span><span className="u">{a[1]}</span></>
                            : <span className="u" title={tip}>{ui.now}</span>;
                        })()}
                      </div>
                      <div className="rail"><span className="dot" /></div>
                      <article className="body" onClick={() => { markRead(it.id); traduzAoAbrir(it); }}>
                        <div className="mrow">
                          <Flag code={flagOf(it)} lang={lang} title={ui.fromTitle} />
                          <span className="src">{srcName(s)}</span>
                          {it.via && <span className="muted">{it.via}</span>}
                          {it.also?.length > 0
                            ? <span className="chip first" title={ui.confirmed(it.also.length + 1)}>{ui.gaveFirst}</span>
                            : (it.imp || 0) >= 4 && !it.pending && <span className="chip only">{ui.onlyHere}</span>}
                          <span className="chips">
                            {topicOf(it) && <span className="about" title={ui.aboutTitle(countryName(topicOf(it), lang))}>{ui.about} <Flag code={topicOf(it)} lang={lang} title={ui.aboutTitle} /></span>}
                            {it.mod && <span className="chip mod">{modName(it.mod, lang) || it.mod}</span>}
                            {it.unread && <span className="chip new">{ui.fresh}</span>}
                            {it.hot && <span className="chip hot">{ui.hot}</span>}
                            {!SEM_ETIQUETA.has(section) && it.cats.filter((c) => CAT[c]).map((c) => (
                              <span key={c} className={`chip ${CAT[c].club ? "club" : ""}`} style={CAT[c].club ? { "--c": `var(--${c})` } : undefined}>
                                {emLingua(CAT[c], lang)}
                              </span>
                            ))}
                          </span>
                        </div>

                        {!it.score && <Crests eq={it.equipas} theme={theme} lang={lang} />}
                        <h3 className="title"><Rich text={T(it)} /></h3>

                        {it.score && (
                          <div className="score">
                            {it.equipas?.[0]?.logo && <Crest e={it.equipas[0]} theme={theme} size={28} />}
                            <span>{it.score.h}</span>
                            <span className="n" translate="no">{it.score.hs}–{it.score.as}</span>
                            <span>{it.score.a}</span>
                            {it.equipas?.[1]?.logo && <Crest e={it.equipas[1]} theme={theme} size={28} />}
                            {it.score.ft
                              ? <span className="m muted" translate="no">{minText(it.score, lang, ui)}</span>
                              : <span className="m live" translate="no">{it.score.ht || it.score.et || it.score.pen || it.score.pausa ? minText(it.score, lang, ui) : it.score.min || ""}</span>}
                            <Tv tv={it.tv} size={18} />
                          </div>
                        )}

                        {B(it).length > 0 && (
                          <ul className="bul">
                            {B(it).map((b, i) => <li key={i}><Rich text={b} /></li>)}
                          </ul>
                        )}

                        <Confirms it={it} lang={lang} ui={ui} now={now} srcPais={srcPais} />

                        <div className="acts">
                          <button className="textbtn" onClick={() => copy(it)}>
                            {copiedId === it.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === it.id ? ui.copied : ui.copy}
                          </button>
                          <button className="textbtn" onClick={() => share(it)}><Share2 size={14} />{ui.share}</button>
                          {postUrl(it) ? (
                            <a className="textbtn" href={postUrl(it)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                              <ExternalLink size={14} />{isXUrl(postUrl(it)) ? ui.viewX : ui.viewSrc}
                            </a>
                          ) : (
                            <span className="textbtn off" title={ui.noPost} aria-disabled="true">
                              <ExternalLink size={14} />{ui.viewSrc}
                            </span>
                          )}
                          {!it.pending && it.orig && it.orig !== "multi" && it.orig !== lang && (!it.raw || it.tr?.[lang]) && <span className="tr">{ui.trFrom[it.orig] || ui.trOther}</span>}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </main>

          {section === "resultados" && <aside className="desk">{eventsPanel}</aside>}
        </div>
      </div>
      {capaAberta && (
        <div className="lightbox" role="dialog" aria-label={capaAberta.nome} onClick={() => setCapaAberta(null)}>
          <button className="icon-btn lbclose" aria-label={(VTXT[lang] || VTXT.pt).close} onClick={() => setCapaAberta(null)}><Fechar size={18} /></button>
          <Capa c={capaAberta} lang={lang} onOpen={() => {}} />
        </div>
      )}
    </div>
  );
}
