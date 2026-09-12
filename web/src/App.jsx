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
  { id: "futebol", pt: "Nacional", en: "Portugal" },
  { id: "porto", pt: "Porto", en: "Porto", club: true },
  { id: "sporting", pt: "Sporting", en: "Sporting", club: true },
  { id: "benfica", pt: "Benfica", en: "Benfica", club: true },
  { id: "mercado", pt: "Mercado", en: "Transfers" },
  { id: "big5", pt: "Big 5", en: "Big 5" },
  { id: "perifericos", pt: "Campeonatos periféricos", en: "Other leagues" },
  { id: "modalidades", pt: "Modalidades", en: "Other sports" },
  { id: "estatisticas", pt: "Estatísticas", en: "Stats" },
  { id: "premios", pt: "Prémios", en: "Awards" },
  { id: "portugueses", pt: "Portugueses pelo mundo", en: "Portuguese abroad" },
  { id: "historias", pt: "Possíveis histórias", en: "Story leads", hl: "hist" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

const BIG3 = ["porto", "sporting", "benfica"];
// futebol nacional: notícias sobre Portugal (Gemini) ou, sem essa indicação, sobre os três grandes
const isNational = (it) => !it.cats.includes("modalidades") && !it.cats.includes("portugueses") && (it.paisTema ? it.paisTema === "pt" : it.cats.some((c) => BIG3.includes(c)));
const inSection = (it, s) => {
  if (s === "historias" || s === "favoritos") return false;
  if (s === "live") return true;
  if (s === "resultados") return !!it.score;
  if (it.src === "resultados") return false; // notícias dos resultados em direto só no Live e nos Resultados
  if (s === "destaque") return (it.imp || 0) >= 3;
  if (s === "futebol") return isNational(it);
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
    allSports: "Todas as modalidades", sourcesLbl: "Fontes", confirmed: (n) => `Confirmada por ${n} fontes`,
    about: "Sobre", aboutTitle: (c) => `Notícia sobre: ${c}`, fromTitle: (c) => `Origem: ${c}`,
    pending: (n) => `Mostrar ${n} ${n === 1 ? "nova notícia" : "novas notícias"}`,
    empty: "Sem notícias nesta secção para as fontes ativas. Ativa mais fontes ou escolhe outra secção.",
    connecting: "A ligar ao X", offline: "Sem ligação", offlineNote: "O servidor não responde. A tentar ligar de novo…",
    waiting: "À espera das primeiras notícias. Aparecem aqui assim que uma das fontes publicar.",
    trOther: "Traduzido", moreSources: (n) => `+${n} ${n === 1 ? "fonte" : "fontes"}`,
    all: "Todas", none: "Nenhuma", sources: "Fontes", hot: "Destaque", fresh: "Novo", ft: "Final",
    toLight: "Mudar para modo claro", toDark: "Mudar para modo escuro", locale: "pt-PT",
    tagline: "Vozes Autorizadas do Relvado",
    docTitle: "VAR — Vozes Autorizadas do Relvado", langLabel: "Idioma", sectionsLabel: "Secções", resultsSource: "Resultados em direto",
    save: "Guardar", saved: "Guardado", noFavs: "Ainda não guardaste notícias. Carrega em «Guardar» numa notícia para a encontrares aqui.",
    now: "agora", noResults: "Ainda não há resultados das fontes ativas.",
    noPost: "Esta notícia não tem link para a fonte.", viewSrc: "Ver na fonte",
    pickLeagues: "Escolher ligas", leaguesTitle: "Ligas com resultados em direto", processing: "A traduzir…",
    levels: { alto: "Interesse alto", medio: "Interesse médio", baixo: "Interesse baixo" }, allLevels: "Todos",
    tones: { positiva: "Positiva", negativa: "Negativa", neutra: "Neutra" }, allTones: "Todas", toneLabel: "Tom", levelLabel: "Nível",
    angle: "Ângulo", data: "Dados", check: "A verificar", seeNews: "Ver a notícia",
    noStories: "Ainda não há pistas. Aparecem quando os resultados, as classificações ou as notícias mostram algo fora do normal.",
    storiesNote: "Pistas para notícias encontradas nos dados. O nível de interesse vem dos critérios de noticiabilidade que cada pista cumpre.",
    updated: (t, src) => `Atualizado ${t} por ${src}`, agoWord: (t) => `há ${t}`,
  },
  en: {
    live: "Live", paused: "Paused", nSources: (n) => `${n} sources`, markRead: "Mark all as read",
    pause: "Pause", resume: "Resume", search: "Search news", copy: "Copy", copied: "Copied",
    share: "Share", viewX: "View on X", trFrom: { pt: "Translated from Portuguese", en: "Translated from English", fr: "Translated from French", es: "Translated from Spanish", it: "Translated from Italian", de: "Translated from German", tr: "Translated from Turkish" },
    eventsTitle: "Match events", noEvents: "Goals, half-times and full-times appear here as they happen.",
    goals: "Goals", reds: "Red cards", matchStats: "Match stats", tableLbl: "Table", pts: "pts", ord: (n) => `#${n}`,
    allSports: "All sports", sourcesLbl: "Sources", confirmed: (n) => `Confirmed by ${n} sources`,
    about: "About", aboutTitle: (c) => `Story about: ${c}`, fromTitle: (c) => `Source: ${c}`,
    pending: (n) => `Show ${n} new ${n === 1 ? "story" : "stories"}`,
    empty: "No stories in this section from the active sources. Turn on more sources or pick another section.",
    connecting: "Connecting to X", offline: "Offline", offlineNote: "The server is not responding. Trying to reconnect…",
    waiting: "Waiting for the first stories. They appear here as soon as a source posts.",
    trOther: "Translated", moreSources: (n) => `+${n} ${n === 1 ? "source" : "sources"}`,
    all: "All", none: "None", sources: "Sources", hot: "Top story", fresh: "New", ft: "FT",
    toLight: "Switch to light mode", toDark: "Switch to dark mode", locale: "en-GB",
    tagline: "Voices, Action & Reports",
    docTitle: "VAR — Voices, Action & Reports", langLabel: "Language", sectionsLabel: "Sections", resultsSource: "Live results",
    save: "Save", saved: "Saved", noFavs: "No saved stories yet. Tap «Save» on a story to find it here.",
    now: "now", noResults: "No results from the active sources yet.",
    noPost: "This story has no link to its source.", viewSrc: "View source",
    pickLeagues: "Choose leagues", leaguesTitle: "Leagues with live results", processing: "Translating…",
    levels: { alto: "High interest", medio: "Medium interest", baixo: "Low interest" }, allLevels: "All",
    tones: { positiva: "Positive", negativa: "Negative", neutra: "Neutral" }, allTones: "All", toneLabel: "Tone", levelLabel: "Level",
    angle: "Angle", data: "Data", check: "To check", seeNews: "See the story",
    noStories: "No leads yet. They appear when results, tables or news show something out of the ordinary.",
    storiesNote: "Story leads found in the data. The interest level comes from the news values each lead meets.",
    updated: (t, src) => `Updated ${t} by ${src}`, agoWord: (t) => `${t} ago`,
  },
};

const isHot = (it) => (it.imp || 0) >= 4;
// relevância = importância a perder peso com o tempo (metade ao fim de 3 horas)
const relevance = (it, now) => (it.imp || 1) / (1 + (now - it.ts) / 3600000 / 3);
const TOP_N = 8;
const byTime = (a, b) => b.ts - a.ts; // mais recente primeiro
const MAX_ITEMS = 500;

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
  const list = stories
    .filter((s) => lvl === "todos" || s.nivel === lvl)
    .filter((s) => tone === "todas" || toneOf(s) === tone)
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

function Rich({ text }) {
  return text.split(/==(.+?)==/g).map((p, i) => (i % 2 ? <mark key={i} className="hl">{p}</mark> : <span key={i}>{p}</span>));
}

/* ───────── Estilos ───────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap');
.apito{--bg:#EEF2ED;--raise:#F8FAF7;--ink:#16221C;--muted:#58685F;--line:#C8D3CB;--accent:#E3AA12;--live:#CF3128;
  --porto:#1D4E9E;--sporting:#0B7A47;--benfica:#C8102E;--hist:#6A41D8;
  font-family:Barlow,system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;font-size:16px;line-height:1.5}
.apito[data-theme="dark"]{--bg:#0F1914;--raise:#16241D;--ink:#E4EDE7;--muted:#8E9F96;--line:#27382F;--accent:#F4C542;--live:#FF5B4D;
  --porto:#83A9EE;--sporting:#4CC68D;--benfica:#FF6E7E;--hist:#B29BFF}
.apito *{box-sizing:border-box}
.apito button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
.apito :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.apito .wrap{max-width:1560px;margin:0 auto;padding:0 20px}
.apito .hdr{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line)}
.apito .bar{display:flex;align-items:center;gap:12px 16px;padding:14px 0 8px;flex-wrap:wrap}
.apito .brand{display:flex;align-items:center;gap:10px;margin-right:auto}
.apito .brand b{font-family:'Barlow Condensed',Barlow,sans-serif;font-weight:700;font-size:30px;line-height:1}
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
@media(min-width:1000px){.apito .layout{grid-template-columns:minmax(0,1fr) 250px} .apito .layout.res{grid-template-columns:minmax(0,1fr) 360px}}
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
.apito .feedhead h1{font-family:'Barlow Condensed',Barlow,sans-serif;font-weight:600;font-size:26px;margin:0 auto 0 0;line-height:1.1}
.apito .textbtn{font-size:14px;color:var(--muted);display:inline-flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px}
.apito .textbtn:hover{color:var(--ink)}
.apito .pending{display:block;width:100%;margin:0 0 12px;padding:9px;border:1px dashed var(--accent);border-radius:8px;font-weight:600;font-size:14px;background:color-mix(in srgb,var(--accent) 12%,transparent)}
.apito .feed{list-style:none;margin:0;padding:0}
.apito .item{display:grid;grid-template-columns:50px 24px minmax(0,1fr)}
.apito .gut{text-align:right;padding-top:13px;font-family:'Barlow Condensed',Barlow,sans-serif;font-weight:600;font-size:21px;line-height:1;font-variant-numeric:tabular-nums;color:var(--muted)}
.apito .item.unread .gut{color:var(--ink)}
.apito .gut .n{display:block}
.apito .gut .u{display:block;font-family:Barlow,system-ui,sans-serif;font-size:12px;font-weight:500;margin-top:3px;color:var(--muted)}
.apito .score .m.live{color:var(--live)}
.apito .board{list-style:none;margin:0;padding:0;border-top:1px solid var(--line);max-width:720px}
.apito .match{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 76px;align-items:center;gap:4px 14px;padding:12px 4px;border-bottom:1px solid var(--line)}
.apito .match .comp{grid-column:1/-1;font-size:12px;font-weight:600;color:var(--muted)}
.apito .match .team{font-family:'Barlow Condensed',Barlow,sans-serif;font-size:22px;font-weight:600;line-height:1.1}
.apito .match .team.h{text-align:right}
.apito .match .res{font-family:'Barlow Condensed',Barlow,sans-serif;font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;min-width:70px;text-align:center;padding:0 8px;border:1px solid var(--line);border-radius:6px;background:var(--raise)}
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
.apito .title{font-family:'Barlow Condensed',Barlow,sans-serif;font-weight:600;font-size:24px;line-height:1.15;margin:6px 0 2px;max-width:44ch}
.apito .item.hot .title{font-size:29px}
.apito .bul{margin:6px 0 0;padding:0;list-style:none;max-width:68ch}
.apito .bul li{position:relative;padding-left:16px;margin:3px 0}
.apito .bul li::before{content:"";position:absolute;left:2px;top:.62em;width:6px;height:6px;border-radius:1px;background:var(--muted)}
.apito mark.hl{background:color-mix(in srgb,var(--accent) 30%,transparent);color:inherit;padding:0 2px;border-radius:2px}
.apito .score{display:inline-flex;align-items:center;gap:12px;margin:8px 0 2px;padding:5px 12px;border:1px solid var(--line);border-radius:6px;background:var(--raise);font-family:'Barlow Condensed',Barlow,sans-serif;font-size:21px;font-weight:600}
.apito .score .n{font-variant-numeric:tabular-nums;font-size:27px;font-weight:700}
.apito .score .m{font-size:14px;font-weight:700}
.apito .acts{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px;margin-top:10px}
.apito .acts .textbtn{font-size:13px;padding:2px 4px}
.apito .tr{font-size:13px;color:var(--muted);font-style:italic;margin-left:auto}
.apito .panel{position:sticky;top:200px}
.apito .panel-head{display:flex;align-items:baseline;justify-content:space-between}
.apito .panel h2{font-family:'Barlow Condensed',Barlow,sans-serif;font-size:22px;font-weight:600;margin:0}
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
.apito .fres{display:flex;align-items:center;justify-content:center;gap:12px;font-family:'Barlow Condensed',Barlow,sans-serif;font-size:20px;font-weight:600}
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
.apito .empty{padding:40px 0 40px 74px;color:var(--muted);max-width:60ch}
@media(max-width:640px){
  .apito .search{width:100%;order:5}
  .apito .item{grid-template-columns:40px 20px minmax(0,1fr)}
  .apito .gut{font-size:18px}
  .apito .match{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 56px;gap:4px 8px}
  .apito .match .team{font-size:18px} .apito .match .res{font-size:23px;min-width:56px}
  .apito .title{font-size:21px} .apito .item.hot .title{font-size:24px}
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
  const [section, setSection] = useState("live");
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
  const [modFilter, setModFilter] = useState("todas");
  const [favs, setFavs] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("var-favoritos")); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("var-favoritos", JSON.stringify(favs)); } catch { /* sem armazenamento */ } }, [favs]);
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
        setSourceList(list.map((x) => [x.handle, x.name, x.pais]));
      })
      .catch(() => {});
    fetch(`${API}/api/leagues`).then((r) => r.json()).then((l) => !stop && setLeagues(l)).catch(() => {});
    fetch(`${API}/api/stories`).then((r) => r.json()).then((l) => !stop && setStories(l)).catch(() => {});

    fetch(`${API}/api/items`)
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
    const list = items.filter((it) => srcOn(it) && inSection(it, section) && matches(it)
      && (section !== "modalidades" || modFilter === "todas" || it.mod === modFilter));
    if (section !== "destaque") return list.sort(byTime);
    // nos Destaques, cada jogo aparece uma só vez (o estado mais recente) e a ordem é por relevância
    const seen = new Set();
    return list
      .filter((it) => {
        if (!it.score) return true;
        const k = `${it.score.comp}|${it.score.h}|${it.score.a}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => relevance(b, now) - relevance(a, now))
      .slice(0, TOP_N)
      .sort(byTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, favs, enabled, ligasOn, section, query, lang, modFilter, section === "destaque" ? now : 0]);

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
    .filter((it) => it.src === "resultados" && !it.id.endsWith(":live") && ligaOn(it) && matches(it))
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

  const sourcesPanel = (
    <div className="panel">
      <div className="panel-head">
        <h2>{ui.sources}</h2>
        <div>
          <button className="textbtn" onClick={() => setEnabled(null)}>{ui.all}</button>
          <button className="textbtn" onClick={() => setEnabled(new Set())}>{ui.none}</button>
        </div>
      </div>
      <ul className="srclist">
        {sourceList.map(([h, n]) => {
          const on = isOn(h);
          return (
            <li key={h}>
              <button className="srcrow" aria-pressed={on} onClick={() => toggleSource(h)}>
                <span className="box">{on && <Check size={12} strokeWidth={3} />}</span>
                <span className="nm">{h === "resultados" ? ui.resultsSource : n}</span>
                <span className="ct">{srcCounts[h] || 0}</span>
              </button>
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
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <rect x="1.5" y="2.5" width="23" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="15.5" y1="5.5" x2="15.5" y2="15.5" stroke="var(--accent)" strokeWidth="2" strokeDasharray="2 2" />
                <line x1="13" y1="18.5" x2="13" y2="22.5" stroke="currentColor" strokeWidth="2" />
                <line x1="8" y1="23.5" x2="18" y2="23.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
              <button className="icon-btn mob" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources} aria-label={ui.sources} title={ui.sources}>
                <SlidersHorizontal size={16} />
              </button>
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
        <div className={`layout ${section === "resultados" ? "res" : ""}`}>
          <main>
            {showSources && <div className="mobpanel">{sourcesPanel}</div>}

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

            {section === "resultados" && showLeagues && (
              <div className="mobpanel leagues">
                <div className="panel-head">
                  <h2>{ui.leaguesTitle}</h2>
                  <div>
                    <button className="textbtn" onClick={() => { setLigasOn(null); try { localStorage.removeItem("var-ligas"); } catch { /* */ } }}>{ui.all}</button>
                    <button className="textbtn" onClick={() => { setLigasOn(new Set()); try { localStorage.setItem("var-ligas", "[]"); } catch { /* */ } }}>{ui.none}</button>
                  </div>
                </div>
                <ul className="srclist cols">
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
            )}

            {pending.length > 0 && (
              <button className="pending" onClick={() => { setPaused(false); flush(); }}>{ui.pending(pending.length)}</button>
            )}

            {section === "modalidades" && modsPresent.length > 1 && (
              <div className="seg lvls mods" role="group" aria-label={ui.allSports}>
                <button aria-pressed={modFilter === "todas"} onClick={() => setModFilter("todas")}>{ui.allSports}</button>
                {modsPresent.map(([m, n]) => (
                  <button key={m} aria-pressed={modFilter === m} onClick={() => setModFilter(m)}>{modName(m, lang) || m} <span className="muted">{n}</span></button>
                ))}
              </div>
            )}
            {section === "historias" ? (
              <StoriesView stories={stories} items={items} lang={lang} ui={ui} now={now} theme={theme} leagueName={leagueName} leaguePais={(k) => leagueByKey[k]?.pais} onOpen={(id) => { setSection("live"); setQuery(""); setTimeout(() => document.getElementById(`n-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }} />
            ) : section === "resultados" ? (
              <>
              {games.length === 0 ? <p className="empty">{ui.noResults}</p> : (
                <ul className="board" aria-live="polite">
                  {games.map((it) => {
                    const sc = it.score, s = srcOf(it);
                    return (
                      <li key={`${sc.comp}|${sc.h}|${sc.a}`} className={`match ${isLive(sc, it.upd || it.ts, now) ? "on" : ""}`}>
                        <span className="comp"><Flag code={topicOf(it)} lang={lang} /> {leagueName(it.liga) || sc.comp}{it.mod && <span className="modtag">{modName(it.mod, lang)}</span>}</span>
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
                        {(() => { const a = ago(it.ts, now); return a ? <><span className="n">{a[0]}</span><span className="u">{a[1]}</span></> : <span className="u">{ui.now}</span>; })()}
                      </div>
                      <div className="rail"><span className="dot" /></div>
                      <article className="body" onClick={() => markRead(it.id)}>
                        <div className="mrow">
                          <Flag code={flagOf(it)} lang={lang} title={ui.fromTitle} />
                          <span className="src">{srcName(s)}</span>
                          {it.via && <span className="muted">{it.via}</span>}
                          {it.also?.length > 0 && (
                            <span className="muted srcs" title={ui.confirmed(it.also.length + 1)}>
                              {ui.moreSources(it.also.length)}: {it.also.map((a) => a.name || a.src).join(", ")}
                            </span>
                          )}
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
                          </div>
                        )}

                        {it.b[lang].length > 0 && (
                          <ul className="bul">
                            {it.b[lang].map((b, i) => <li key={i}><Rich text={b} /></li>)}
                          </ul>
                        )}

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

          <aside className="desk">{section === "resultados" ? eventsPanel : sourcesPanel}</aside>
        </div>
      </div>
    </div>
  );
}
