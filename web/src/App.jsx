import { useState, useEffect, useMemo, useRef } from "react";
import { Sun, Moon, Pause, Play, Copy, Share2, ExternalLink, Search, Check, CheckCheck, SlidersHorizontal, ListFilter, Star, ArrowRight } from "lucide-react";

/* ───────── Fontes (contas do X) ───────── */
const SOURCES = []; // a lista de fontes vem do servidor (/api/sources)
const SRC = Object.fromEntries(SOURCES.map(([h, n]) => [h, { handle: h, name: n }]));
// endereço do servidor; vazio quando o site e o servidor estão no mesmo domínio
const API = import.meta.env.VITE_API_URL || "";
const srcOf = (it) => SRC[it.src] || { handle: it.src, name: it.name || it.src };

/* ───────── Secções ───────── */
const CATS = [
  { id: "destaque", pt: "Destaques", en: "Top stories", hl: "dest" },
  { id: "live", pt: "Live", en: "Live", hl: "live" },
  { id: "resultados", pt: "Resultados", en: "Results" },
  { id: "favoritos", pt: "Favoritos", en: "Saved" },
  { id: "porto", pt: "Porto", en: "Porto", club: true },
  { id: "sporting", pt: "Sporting", en: "Sporting", club: true },
  { id: "benfica", pt: "Benfica", en: "Benfica", club: true },
  { id: "mercado", pt: "Mercado", en: "Transfers" },
  { id: "modalidades", pt: "Modalidades", en: "Other sports" },
  { id: "estatisticas", pt: "Estatísticas", en: "Stats" },
  { id: "premios", pt: "Prémios", en: "Awards" },
  { id: "portugueses", pt: "Portugueses pelo mundo", en: "Portuguese abroad" },
  { id: "historias", pt: "Possíveis histórias", en: "Story leads", hl: "hist" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

/* ───────── Colunas dos Destaques (proveniência da notícia) ───────── */
const COLS = [
  { id: "pt", pt: "Portugal", en: "Portugal", pais: "pt" },
  { id: "en", pt: "Inglaterra", en: "England", pais: "gb-eng" },
  { id: "es", pt: "Espanha", en: "Spain", pais: "es" },
  { id: "it", pt: "Itália", en: "Italy", pais: "it" },
  { id: "de", pt: "Alemanha", en: "Germany", pais: "de" },
  { id: "fr", pt: "França", en: "France", pais: "fr" },
  { id: "mundo", pt: "Resto do Mundo", en: "Rest of the world", pais: "un" },
  { id: "portugueses", pt: "Portugueses pelo mundo", en: "Portuguese abroad", pais: "pt" },
];
// país de que a notícia trata → coluna; os países que não estão aqui caem no Resto do Mundo
const PAIS_COL = { pt: "pt", gb: "en", "gb-eng": "en", es: "es", it: "it", de: "de", fr: "fr" };
const COL_N = 14; // notícias por coluna
const MIN_IMP_COL = 2; // importância mínima para entrar nos Destaques

const inSection = (it, s) => {
  if (s === "historias" || s === "favoritos") return false;
  if (s === "resultados") return !!it.score;
  if (it.board) return false; // o cartão que se atualiza durante o jogo vive no quadro de resultados
  if (s === "live") return true;
  if (it.src === "resultados") return false; // notícias dos resultados em direto só no Live e nos Resultados
  if (s === "destaque") return (it.imp || 0) >= MIN_IMP_COL;
  return it.cats.includes(s);
};

/* ───────── Textos da interface ───────── */
const UI = {
  pt: {
    live: "Ao vivo", paused: "Em pausa", nSources: (n) => `${n} fontes`, markRead: "Marcar tudo como lido",
    pause: "Pausar", resume: "Retomar", search: "Pesquisar notícias", copy: "Copiar", copied: "Copiado",
    share: "Partilhar", viewX: "Ver no X", trFrom: { pt: "Traduzido do português", en: "Traduzido do inglês", fr: "Traduzido do francês", es: "Traduzido do espanhol", it: "Traduzido do italiano", de: "Traduzido do alemão", tr: "Traduzido do turco" },
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
    share: "Share", viewX: "View on X", trFrom: { pt: "Translated from Portuguese", en: "Translated from English", fr: "Translated from French", es: "Translated from Spanish", it: "Translated from Italian", de: "Translated from German", tr: "Translated from Turkish" },
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
const MOD = {
  futsal: ["Futsal", "Futsal"], praia: ["Futebol de praia", "Beach soccer"], andebol: ["Andebol", "Handball"],
  basquetebol: ["Basquetebol", "Basketball"], voleibol: ["Voleibol", "Volleyball"],
  hoquei_patins: ["Hóquei em patins", "Roller hockey"], hoquei_gelo: ["Hóquei no gelo", "Ice hockey"],
  futebol_americano: ["Futebol americano", "American football"], tenis: ["Ténis", "Tennis"], padel: ["Padel", "Padel"],
  ciclismo: ["Ciclismo", "Cycling"], atletismo: ["Atletismo", "Athletics"], natacao: ["Natação", "Swimming"],
  automobilismo: ["Automobilismo", "Motorsport"], golfe: ["Golfe", "Golf"], ragby: ["Râguebi", "Rugby"],
  criquete: ["Críquete", "Cricket"], beisebol: ["Beisebol", "Baseball"], combate: ["Desportos de combate", "Combat sports"],
  equestre: ["Equestre", "Equestrian"], outra: ["Outra modalidade", "Other sport"],
};
const modName = (id, lang) => (MOD[id] ? MOD[id][lang === "en" ? 1 : 0] : null);

const GB_PARTS = { "gb-sct": ["Escócia", "Scotland"], "gb-wls": ["País de Gales", "Wales"], "gb-nir": ["Irlanda do Norte", "Northern Ireland"] };
function countryName(code, lang) {
  const own = COUNTRIES[code] || GB_PARTS[code];
  if (own) return own[lang === "en" ? 1 : 0];
  try { return new Intl.DisplayNames([lang === "en" ? "en" : "pt-PT"], { type: "region" }).of(code.toUpperCase()); } catch { return code.toUpperCase(); }
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
        <ArrowRight size={15} aria-label={lang === "en" ? "to" : "para"} />
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
          <tbody>{f.stats.map((st) => <tr key={st.id}><td>{st.casa}</td><td>{lang === "en" ? st.en : st.pt}</td><td>{st.fora}</td></tr>)}</tbody>
        </table>
      )}
      {f.tabela?.length > 0 && <p><b>{ui.tableLbl}:</b> {f.tabela.map((t) => `${t.equipa} ${ui.ord(t.pos)}${t.pts != null ? ` (${t.pts} ${ui.pts})` : ""}`).join(" · ")}</p>}
    </div>
  );
}

// possíveis histórias, da mais recente para a mais antiga, com filtros de nível e de tom
function StoriesView({ stories, items, lang, ui, now, onOpen, leagueName, leaguePais, theme }) {
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
            <li key={s.id} className={`story lv-${s.nivel}`}>
              <div className="mrow">
                <span className="lvl">{ui.levels[s.nivel]}</span>
                <span className={`tone t-${toneOf(s)}`}>{toneOf(s) === "positiva" ? "▲" : toneOf(s) === "negativa" ? "▼" : "●"} {ui.tones[toneOf(s)]}</span>
                <Flag code={s.pais || leaguePais(s.liga)} lang={lang} />
                {s.ligaNome && <span className="muted">{leagueName(s.liga) || s.ligaNome}</span>}
                <span className="muted">{agoText(s.ts, now, ui)}</span>
              </div>
              <Crests eq={s.crests} theme={theme} lang={lang} />
              <h3 className="title">{s.t[lang]}</h3>
              {s.ficha && <Ficha f={s.ficha} lang={lang} ui={ui} />}
              {s.narrativa?.[lang] && <p className="narr"><b>{ui.thread}:</b> {s.narrativa[lang]}</p>}
              {s.possibilidades?.length > 0 && (
                <div className="block poss">
                  <b>{ui.whatNext}</b> <span className="muted small">{ui.possNote}</span>
                  <ul className="bul">
                    {s.possibilidades.map((p, i) => (
                      <li key={i}>{p[lang]}{p.se?.[lang] && <span className="muted"> — {ui.ifWord} {p.se[lang].replace(/^(se|if)\s+/i, "")}</span>}</li>
                    ))}
                  </ul>
                </div>
              )}
              {s.consequencias?.length > 0 && (
                <div className="block cons">
                  <b>{ui.consequences}</b>
                  <ul className="bul">
                    {s.consequencias.map((c, i) => (
                      <li key={i}>{c.tipo && <span className="chip tipo">{ui.consTypes[c.tipo] || c.tipo}</span>} {c[lang]}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="angle"><b>{ui.angle}:</b> {s.angulo[lang]}</p>
              {s.dados?.[lang]?.length > 0 && <p className="sdata"><b>{ui.data}:</b> {s.dados[lang].join(" · ")}</p>}
              {s.verificar?.[lang]?.length > 0 && (
                <div className="check"><b>{ui.check}:</b><ul className="bul">{s.verificar[lang].map((v, i) => <li key={i}>{v}</li>)}</ul></div>
              )}
              <div className="chips crit">
                {s.crit.map((c) => <span key={c.id} className="chip">{c[lang]}</span>)}
                {s.noticia && items.some((x) => x.id === s.noticia) && (
                  <button className="textbtn" onClick={() => onOpen(s.noticia)}><ExternalLink size={14} />{ui.seeNews}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// quem confirmou a notícia depois da fonte que a deu primeiro: um quadradinho por órgão,
// com «acabou de confirmar» nos primeiros minutos e a hora a partir daí
function Confirms({ it, lang, ui, now, srcPais }) {
  if (!it.also?.length) return null;
  return (
    <div className="confs">
      <span className="conflbl">{ui.confirms}</span>
      {it.also.map((a) => {
        const quando = a.at || a.ts;
        const recente = now - quando < 10 * 60000;
        return (
          <span key={a.postId || a.src} className={`conf ${recente ? "now" : ""}`}>
            <Flag code={a.pais || srcPais[a.src]} lang={lang} />
            <b>{a.name || a.src}</b>
            <span className="muted">{recente ? ui.justConfirmed : ui.confirmedAt(agoText(quando, now, ui))}</span>
          </span>
        );
      })}
    </div>
  );
}

function Rich({ text }) {
  return text.split(/==(.+?)==/g).map((p, i) => (i % 2 ? <mark key={i} className="hl">{p}</mark> : <span key={i}>{p}</span>));
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
.apito .bar{display:flex;align-items:center;gap:12px 16px;padding:14px 0 8px;flex-wrap:wrap}
.apito .brand{display:flex;align-items:center;gap:10px;margin-right:auto}
.apito .brand b{font-family:var(--display);font-weight:700;font-size:27px;line-height:1;letter-spacing:-.02em}
.apito .tagline{font-size:13px;color:var(--muted);margin-right:6px}
.apito .status{display:flex;align-items:center;gap:10px;font-size:14px}
.apito .pulse{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:var(--live)}
.apito .pulse i{width:8px;height:8px;border-radius:50%;background:var(--live);animation:apl 1.6s ease-out infinite}
@keyframes apl{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--live) 55%,transparent)}100%{box-shadow:0 0 0 8px transparent}}
.apito .pulse.off{color:var(--muted)} .apito .pulse.off i{background:var(--muted);animation:none}
.apito .muted{color:var(--muted)}
.apito .ctrls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.apito .search{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:var(--raise);width:230px;color:var(--muted)}
.apito .search input{border:0;background:transparent;color:var(--ink);font:inherit;font-size:14px;outline:none;width:100%}
.apito .seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px;background:var(--raise)}
.apito .seg button{padding:4px 11px;border-radius:999px;font-size:13px;font-weight:600;color:var(--muted)}
.apito .seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.apito .icon-btn{width:34px;height:34px;display:inline-grid;place-items:center;border:1px solid var(--line);border-radius:999px;background:var(--raise)}
.apito .tabs{display:flex;flex-wrap:nowrap;align-items:center;gap:0 2px;margin:0 -8px;padding:0 8px 2px;overflow-x:auto;scrollbar-width:thin}
.apito .tabs::-webkit-scrollbar{height:4px}
.apito .tabs::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
@media(max-width:699px){
  .apito .tabs{padding-right:48px;-webkit-mask-image:linear-gradient(to right,#000 82%,transparent);mask-image:linear-gradient(to right,#000 82%,transparent)}
}
.apito .tab.hl{border-radius:8px 8px 0 0;font-weight:600}
.apito .tab.hl-live{color:var(--live);--tabc:var(--live)}
.apito .tab.hl-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--live);animation:apl 1.6s ease-out infinite}
.apito .tab.hl-dest{color:var(--ink);--tabc:var(--accent);background:color-mix(in srgb,var(--accent) 16%,transparent)}
.apito .tab.hl-hist{color:var(--hist);--tabc:var(--hist);background:color-mix(in srgb,var(--hist) 14%,transparent);margin-left:auto}
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
.apito .livelist{list-style:none;margin:0;padding:0 0 8px;display:flex;gap:10px;overflow-x:auto;scrollbar-width:thin}
.apito .livelist::-webkit-scrollbar{height:6px}
.apito .livelist::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
.apito .lcard{flex:0 0 auto;width:214px;border:1px solid var(--line);border-top:3px solid var(--live);border-radius:8px;padding:8px 10px 9px;background:var(--raise)}
.apito .lcard.next{border-top-color:var(--accent)}
.apito .lcomp{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.apito .lrow{display:flex;align-items:center;gap:8px;margin-top:4px;font-family:var(--display);font-size:15px;letter-spacing:-.01em;font-weight:600;line-height:1.1}
.apito .lrow b{margin-left:auto;font-size:20px;font-variant-numeric:tabular-nums}
.apito .lteam{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .lfoot{display:flex;align-items:center;gap:8px;margin-top:8px}
.apito .lmin{font-size:13px;font-weight:700;color:var(--live)}
.apito .lfoot .tv{margin-left:auto}
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
.apito .cols{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(248px,1fr);gap:0;overflow-x:auto;padding:0 0 14px;scrollbar-width:thin}
.apito .cols::-webkit-scrollbar{height:6px}
.apito .cols::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
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

/* ───────── App ───────── */
export default function App() {
  const [theme, setTheme] = useState(() =>
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [lang, setLang] = useState("pt");
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
  // grelha de transmissões: lida no arranque e refrescada de minuto a minuto
  useEffect(() => {
    const load = () => fetch(`${API}/api/zapping`).then((r) => r.json()).then((l) => Array.isArray(l) && setZapping(l)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  // ao voltar ao separador, busca o que entrou enquanto o site esteve em segundo plano
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`${API}/api/items?limit=400`).then((r) => r.json()).then((list) => {
        setItems((l) => {
          const known = new Set(l.map((x) => x.id));
          const novos = list.filter((x) => !known.has(x.id));
          return novos.length ? [...novos, ...l].sort(byTime).slice(0, MAX_ITEMS) : l;
        });
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onBack);
    return () => document.removeEventListener("visibilitychange", onBack);
  }, []);
  const isFav = (id) => favs.some((f) => f.id === id);
  const toggleFav = (it) => setFavs((f) => (f.some((x) => x.id === it.id)
    ? f.filter((x) => x.id !== it.id)
    : [{ ...it, unread: false, fresh: false, favAt: Date.now() }, ...f]));
  // título da página e língua do documento acompanham o botão PT/EN
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "pt-PT";
    document.title = UI[lang].docTitle;
  }, [lang]);
  const [showSources, setShowSources] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

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
    fetch(`${API}/api/leagues`).then((r) => r.json()).then((l) => !stop && setLeagues(l)).catch(() => {});
    fetch(`${API}/api/stories`).then((r) => r.json()).then((l) => !stop && setStories(l)).catch(() => {});

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
    es.onopen = () => setConn("ok");
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
    es.addEventListener("remove", (e) => {
      const { id } = JSON.parse(e.data);
      setItems((l) => l.filter((x) => x.id !== id));
      setPending((p) => p.filter((x) => x.id !== id));
    });
    // a notícia foi tratada, ou a mesma notícia chegou por outra fonte: atualiza o cartão existente
    es.addEventListener("update", (e) => {
      const it = JSON.parse(e.data);
      const up = (x) => (x.id === it.id ? { ...x, ...it, hot: isHot(it) } : x);
      setItems((l) => l.map(up));
      setFavs((f) => (f.some((x) => x.id === it.id) ? f.map((x) => (x.id === it.id ? { ...x, ...it, hot: isHot(it) } : x)) : f));
      setPending((p) => p.map(up));
    });
    return () => { stop = true; es.close(); };
  }, []);

  const ui = UI[lang];
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
  const leagueName = (k) => { const l = leagueByKey[k]; return l ? (lang === "en" ? l.nome_en || l.nome : l.nome) : null; };
  const srcPais = useMemo(() => Object.fromEntries(sourceList.map(([h, , p]) => [h, p])), [sourceList]);
  const srcCol = useMemo(() => Object.fromEntries(sourceList.map(([h, , , c]) => [h, c])), [sourceList]);
  // coluna dos Destaques: o país de que a notícia trata manda; sem essa indicação, vale a proveniência da fonte
  const colOf = (it) => {
    if (it.cats?.includes("portugueses")) return "portugueses";
    if (it.paisTema) return PAIS_COL[it.paisTema] || "mundo";
    return srcCol[it.src] || PAIS_COL[srcPais[it.src]] || "mundo";
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
    return strip([it.t[lang], ...it.b[lang], s.name, s.handle].join(" ")).toLowerCase().includes(q);
  };

  const visible = useMemo(() => {
    if (section === "favoritos") return [...favs].filter(matches).sort(byTime);
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
      (out[colOf(it)] || out.mundo).push(it);
    }
    for (const k of Object.keys(out)) {
      out[k] = out[k].sort((a, b) => relevance(b, minuto * 60000) - relevance(a, minuto * 60000)).slice(0, COL_N);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled, ligasOn, query, lang, sourceList, minuto]);

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

  // jogos a decorrer, para a página inicial (o quadro completo continua na secção Resultados)
  const aoVivo = useMemo(() => games.filter((it) => isLive(it.score, it.upd || it.ts, now)), [games, now]);
  // próximas transmissões na televisão portuguesa, quando não há jogos a decorrer
  const proximasTv = useMemo(() => zapping.filter((z) => z.inicio > now - 15 * 60000).slice(0, 10), [zapping, now]);

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
    return [strip(it.t[lang]), ...it.b[lang].map((b) => `• ${strip(b)}`), srcName(s), postUrl(it)].filter(Boolean).join("\n");
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
      try { await navigator.share({ title: strip(it.t[lang]), text: postText(it) }); } catch { /* cancelado */ }
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
              <p className="evtitle">{it.equipas?.some((e) => e.logo) && <span className="evcrests">{it.equipas.map((e) => e.logo && <Crest key={e.nome} e={e} theme={theme} size={24} />)}</span>}<Rich text={it.t[lang]} /></p>
              {it.b[lang].filter((b) => !leagueLabels(it).includes(b)).map((b, i) => <p key={i} className="evb"><Rich text={b} /></p>)}
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
                <span className="nm">{lang === "en" ? l.nome_en || l.nome : l.nome}</span>
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
            <div className="brand">
              <svg className="logo" width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
                <rect x="7" y="11.5" width="50" height="33" rx="6" fill="none" stroke="currentColor" strokeWidth="4.4" />
                <g stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                  <path d="M15.5 21.5h15" /><path d="M15.5 28h10" /><path d="M15.5 34.5h13" />
                </g>
                <path d="M41.5 17v22" stroke="var(--accent)" strokeWidth="4.4" strokeLinecap="round" strokeDasharray="3.4 4.6" />
                <path d="M32 44.5v6.5M22 55.5h20" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" />
              </svg>
              <b>VAR</b>
              <span className="tagline">{ui.tagline}</span>
              <div className="status">
                <span className={`pulse ${live ? "" : "off"}`}><i />{paused ? ui.paused : conn !== "ok" ? ui.offline : xStatus !== "ligado" ? ui.connecting : ui.live}</span>
                <span className="muted">{ui.nSources(enabled === null ? sourceList.length : enabled.size)}</span>
              </div>
            </div>
            <div className="ctrls">
              <label className="search">
                <Search size={15} aria-hidden="true" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ui.search} aria-label={ui.search} />
              </label>
              <div className="seg" role="group" aria-label={ui.langLabel}>
                <button aria-pressed={lang === "pt"} onClick={() => setLang("pt")}>PT</button>
                <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              </div>
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
          <nav className="tabs" aria-label={ui.sectionsLabel}>
            {CATS.map((c) => (
              <button key={c.id} className={`tab ${c.hl ? `hl hl-${c.hl}` : ""}`} aria-pressed={section === c.id} onClick={(e) => { setSection(c.id); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
                style={c.club ? { "--tabc": `var(--${c.id})` } : undefined}>
                {c[lang]}
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
              <h1 className={section === "historias" ? "hist" : ""}>{CAT[section][lang]}</h1>
              {section === "resultados" && leagues.length > 0 && (
                <button className="textbtn" onClick={() => setShowLeagues((v) => !v)} aria-expanded={showLeagues}><ListFilter size={15} />{ui.pickLeagues}</button>
              )}
              <button className="textbtn" onClick={togglePause}>
                {paused ? <Play size={15} /> : <Pause size={15} />}{paused ? ui.resume : ui.pause}
              </button>
              <button className="textbtn" onClick={markAllRead}><CheckCheck size={15} />{ui.markRead}</button>
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
                <section className="livebar">
                  <div className="livehead">
                    <span className={`pulse ${aoVivo.length ? "" : "off"}`}><i />{aoVivo.length ? ui.liveNow : ui.nextTv}</span>
                    <button className="textbtn" onClick={() => setSection("resultados")}>{ui.allResults}</button>
                  </div>
                  {aoVivo.length > 0 ? (
                    <ul className="livelist">
                      {aoVivo.map((it) => {
                        const sc = it.score;
                        return (
                          <li key={it.id} className="lcard">
                            <span className="lcomp"><Flag code={topicOf(it)} lang={lang} /> {leagueName(it.liga) || sc.comp}</span>
                            <div className="lrow">
                              <span className="lteam">{it.equipas?.[0]?.logo && <Crest e={it.equipas[0]} theme={theme} size={20} />}{sc.h}</span>
                              <b>{sc.hs}</b>
                            </div>
                            <div className="lrow">
                              <span className="lteam">{it.equipas?.[1]?.logo && <Crest e={it.equipas[1]} theme={theme} size={20} />}{sc.a}</span>
                              <b>{sc.as}</b>
                            </div>
                            <div className="lfoot">
                              <span className="lmin">{sc.ft ? ui.ft : sc.min || ui.live}</span>
                              <Tv tv={it.tv} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : proximasTv.length > 0 ? (
                    <ul className="livelist tvlist">
                      {proximasTv.map((z) => (
                        <li key={`${z.casa}|${z.fora}|${z.inicio}`} className="lcard next">
                          <span className="lcomp">{new Date(z.inicio).toLocaleString(ui.locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })}{z.qualificador ? ` · ${z.qualificador}` : ""}</span>
                          <div className="lrow"><span className="lteam">{z.casa}</span></div>
                          <div className="lrow"><span className="lteam">{z.fora}</span></div>
                          <div className="lfoot"><Tv tv={z} /></div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="cempty">{ui.noLive}</p>}
                </section>
                <p className="xnote">{ui.colsNote}</p>
                <div className="cols">
                  {COLS.map((c) => (
                    <section key={c.id} className="col">
                      <h2 className="colh"><Flag code={c.pais} lang={lang} /> {c[lang]}</h2>
                      {colunas[c.id].length === 0 ? <p className="cempty">{ui.colEmpty}</p> : (
                        <ul className="clist" aria-live="polite">
                          {colunas[c.id].map((it) => {
                            const s = srcOf(it);
                            return (
                              <li key={it.id} id={`c-${it.id}`} className={`citem ${it.hot ? "hot" : ""} ${it.unread ? "unread" : ""} ${it.fresh ? "fresh" : ""}`} onClick={() => markRead(it.id)}>
                                <div className="cmeta">
                                  <Flag code={flagOf(it)} lang={lang} title={ui.fromTitle} />
                                  <span className="src">{srcName(s)}</span>
                                  <span className="muted ctime">{agoText(it.ts, now, ui)}</span>
                                </div>
                                <h3 className="ctitle"><Rich text={it.t[lang]} /></h3>
                                {it.b[lang][0] && <p className="cbul"><Rich text={it.b[lang][0]} /></p>}
                                <div className="cacts">
                                  {it.hot && <span className="chip hot">{ui.hot}</span>}
                                  {it.mod && <span className="chip mod">{modName(it.mod, lang) || it.mod}</span>}
                                  {it.also?.length > 0 && (
                                    <span className={`chip conf mini ${now - (it.upd || 0) < 10 * 60000 ? "now" : ""}`} title={`${ui.confirms}: ${it.also.map((a) => a.name || a.src).join(", ")}`}>
                                      {it.also.slice(0, 3).map((a) => <Flag key={a.postId || a.src} code={a.pais || srcPais[a.src]} lang={lang} />)}
                                      {ui.nConfirms(it.also.length)}
                                    </span>
                                  )}
                                  <button className={`textbtn ${isFav(it.id) ? "on" : ""}`} aria-pressed={isFav(it.id)} title={isFav(it.id) ? ui.saved : ui.save}
                                    onClick={(e) => { e.stopPropagation(); toggleFav(it); }}>
                                    <Star size={13} fill={isFav(it.id) ? "currentColor" : "none"} />
                                  </button>
                                  {postUrl(it) && (
                                    <a className="textbtn" href={postUrl(it)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                      title={isXUrl(postUrl(it)) ? ui.viewX : ui.viewSrc} style={{ textDecoration: "none" }}>
                                      <ExternalLink size={13} />
                                    </a>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ))}
                </div>
              </>
            ) : section === "historias" ? (
              <StoriesView stories={stories} items={items} lang={lang} ui={ui} now={now} theme={theme} leagueName={leagueName} leaguePais={(k) => leagueByKey[k]?.pais} onOpen={(id) => { setSection("live"); setQuery(""); setTimeout(() => document.getElementById(`n-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }} />
            ) : section === "resultados" ? (
              <>
              {games.length === 0 ? <p className="empty">{ui.noResults}</p> : (
                <ul className="board" aria-live="polite">
                  {games.map((it) => {
                    const sc = it.score, s = srcOf(it);
                    return (
                      <li key={`${sc.comp}|${sc.h}|${sc.a}`} className={`match ${isLive(sc, it.upd || it.ts, now) ? "on" : ""}`}>
                        <span className="comp"><Flag code={topicOf(it)} lang={lang} /> {leagueName(it.liga) || sc.comp}{it.mod && <span className="modtag">{modName(it.mod, lang)}</span>}{it.tv && <span className="comptv"><Tv tv={it.tv} size={18} /></span>}</span>
                        <span className="team h">{sc.h}{it.equipas?.[0]?.logo && <Crest e={it.equipas[0]} theme={theme} size={30} />}</span>
                        <span className="res">{sc.hs}–{sc.as}</span>
                        <span className="team">{it.equipas?.[1]?.logo && <Crest e={it.equipas[1]} theme={theme} size={30} />}{sc.a}</span>
                        <span className="st">{isLive(sc, it.upd || it.ts, now) ? <span className="pulse"><i />{sc.min || ui.live}</span> : <span className="muted">{sc.ft ? ui.ft : sc.min || "—"}</span>}</span>
                        <span className="upd">{ui.updated(agoText(it.upd || it.ts, now, ui), srcName(s))}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mobevents">{eventsPanel}</div>
              </>
            ) : visible.length === 0 ? (
              <p className="empty">{section === "favoritos" ? ui.noFavs : items.length === 0 ? ui.waiting : ui.empty}</p>
            ) : (
              <ol className="feed" aria-live="polite">
                {visible.map((it) => {
                  const s = srcOf(it);
                  const cls = ["item", it.unread && "unread", it.fresh && "fresh", it.hot && "hot"].filter(Boolean).join(" ");
                  return (
                    <li key={it.id} id={`n-${it.id}`} className={cls}>
                      <div className="gut" title={new Date(it.ts).toLocaleTimeString(ui.locale)}>
                        {(() => {
                          const a = ago(it.ts, now);
                          const tip = it.tsAprox ? ui.approx : undefined;
                          return a
                            ? <><span className="n" title={tip}>{it.tsAprox ? "~" : ""}{a[0]}</span><span className="u">{a[1]}</span></>
                            : <span className="u" title={tip}>{ui.now}</span>;
                        })()}
                      </div>
                      <div className="rail"><span className="dot" /></div>
                      <article className="body" onClick={() => markRead(it.id)}>
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
                            {it.cats.filter((c) => CAT[c]).map((c) => (
                              <span key={c} className={`chip ${CAT[c].club ? "club" : ""}`} style={CAT[c].club ? { "--c": `var(--${c})` } : undefined}>
                                {CAT[c][lang]}
                              </span>
                            ))}
                          </span>
                        </div>

                        {!it.score && <Crests eq={it.equipas} theme={theme} lang={lang} />}
                        <h3 className="title"><Rich text={it.t[lang]} /></h3>

                        {it.score && (
                          <div className="score">
                            {it.equipas?.[0]?.logo && <Crest e={it.equipas[0]} theme={theme} size={28} />}
                            <span>{it.score.h}</span>
                            <span className="n">{it.score.hs}–{it.score.as}</span>
                            <span>{it.score.a}</span>
                            {it.equipas?.[1]?.logo && <Crest e={it.equipas[1]} theme={theme} size={28} />}
                            {it.score.ft
                              ? <span className="m muted">{ui.ft}</span>
                              : <span className="m live">{it.score.min || ""}</span>}
                            <Tv tv={it.tv} size={18} />
                          </div>
                        )}

                        {it.b[lang].length > 0 && (
                          <ul className="bul">
                            {it.b[lang].map((b, i) => <li key={i}><Rich text={b} /></li>)}
                          </ul>
                        )}

                        <Confirms it={it} lang={lang} ui={ui} now={now} srcPais={srcPais} />

                        <div className="acts">
                          <button className="textbtn" onClick={() => copy(it)}>
                            {copiedId === it.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === it.id ? ui.copied : ui.copy}
                          </button>
                          <button className="textbtn" onClick={() => share(it)}><Share2 size={14} />{ui.share}</button>
                          <button className={`textbtn ${isFav(it.id) ? "on" : ""}`} aria-pressed={isFav(it.id)} onClick={(e) => { e.stopPropagation(); toggleFav(it); }}>
                            <Star size={14} fill={isFav(it.id) ? "currentColor" : "none"} />{isFav(it.id) ? ui.saved : ui.save}
                          </button>
                          {postUrl(it) ? (
                            <a className="textbtn" href={postUrl(it)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                              <ExternalLink size={14} />{isXUrl(postUrl(it)) ? ui.viewX : ui.viewSrc}
                            </a>
                          ) : (
                            <span className="textbtn off" title={ui.noPost} aria-disabled="true">
                              <ExternalLink size={14} />{ui.viewSrc}
                            </span>
                          )}
                          {it.pending ? <span className="tr">{ui.processing}</span> : it.orig && it.orig !== "multi" && it.orig !== lang && !it.raw && <span className="tr">{ui.trFrom[it.orig] || ui.trOther}</span>}
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
    </div>
  );
}
