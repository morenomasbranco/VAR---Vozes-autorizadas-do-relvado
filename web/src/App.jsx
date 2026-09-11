import { useState, useEffect, useMemo, useRef } from "react";
import { Sun, Moon, Pause, Play, Copy, Share2, ExternalLink, Search, Check, CheckCheck, SlidersHorizontal, ListFilter } from "lucide-react";

/* ───────── Fontes (contas do X) ───────── */
const SOURCES = []; // a lista de fontes vem do servidor (/api/sources)
const SRC = Object.fromEntries(SOURCES.map(([h, n]) => [h, { handle: h, name: n }]));
// endereço do servidor; vazio quando o site e o servidor estão no mesmo domínio
const API = import.meta.env.VITE_API_URL || "";
const srcOf = (it) => SRC[it.src] || { handle: it.src, name: it.name || it.src };

/* ───────── Secções ───────── */
const CATS = [
  { id: "destaque", pt: "Destaques", en: "Top stories" },
  { id: "live", pt: "Live", en: "Live" },
  { id: "resultados", pt: "Resultados", en: "Results" },
  { id: "x", pt: "Só no X", en: "Only on X" },
  { id: "futebol", pt: "Futebol", en: "Football" },
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
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));

const inSection = (it, s) =>
  s === "x" ? false : s === "live" ? true : s === "resultados" ? !!it.score : s === "destaque" ? (it.imp || 0) >= 3 : s === "futebol" ? !it.cats.includes("modalidades") : it.cats.includes(s);

/* ───────── Textos da interface ───────── */
const UI = {
  pt: {
    live: "Ao vivo", paused: "Em pausa", nSources: (n) => `${n} fontes`, markRead: "Marcar tudo como lido",
    pause: "Pausar", resume: "Retomar", search: "Pesquisar notícias", copy: "Copiar", copied: "Copiado",
    share: "Partilhar", viewX: "Ver no X", trFrom: { pt: "Traduzido do português", en: "Traduzido do inglês", fr: "Traduzido do francês", es: "Traduzido do espanhol", it: "Traduzido do italiano", tr: "Traduzido do turco" },
    pending: (n) => `Mostrar ${n} ${n === 1 ? "nova notícia" : "novas notícias"}`,
    empty: "Sem notícias nesta secção para as fontes ativas. Ativa mais fontes ou escolhe outra secção.",
    connecting: "A ligar ao X", offline: "Sem ligação", offlineNote: "O servidor não responde. A tentar ligar de novo…",
    waiting: "À espera das primeiras notícias. Aparecem aqui assim que uma das fontes publicar.",
    trOther: "Traduzido", moreSources: (n) => `+${n} ${n === 1 ? "fonte" : "fontes"}`,
    all: "Todas", none: "Nenhuma", sources: "Fontes", hot: "Destaque", fresh: "Novo", ft: "Final",
    toLight: "Mudar para modo claro", toDark: "Mudar para modo escuro", locale: "pt-PT",
    tagline: "Vozes Autorizadas do Relvado",
    now: "agora", noResults: "Ainda não há resultados das fontes ativas.",
    noPost: "Esta notícia não tem link para a fonte.", viewSrc: "Ver na fonte",
    pickLeagues: "Escolher ligas", leaguesTitle: "Ligas com resultados em direto", processing: "A traduzir…",
    xNote: "Publicações das contas que só existem no X, mostradas pelo próprio X. Aparecem tal como foram publicadas, sem tradução, e não entram nas outras secções.",
    xNoList: "Ainda não há uma lista do X configurada. Cria uma lista pública no X com estas contas e põe o link no campo listaX do fontes.json.",
    xFailed: "O X não mostrou a lista. Pode estar a pedir sessão iniciada no X.", xOpen: "Abrir a lista no X", xLoading: "A carregar as publicações do X…",
    updated: (t, src) => `Atualizado ${t} por ${src}`, agoWord: (t) => `há ${t}`,
  },
  en: {
    live: "Live", paused: "Paused", nSources: (n) => `${n} sources`, markRead: "Mark all as read",
    pause: "Pause", resume: "Resume", search: "Search news", copy: "Copy", copied: "Copied",
    share: "Share", viewX: "View on X", trFrom: { pt: "Translated from Portuguese", en: "Translated from English", fr: "Translated from French", es: "Translated from Spanish", it: "Translated from Italian", tr: "Translated from Turkish" },
    pending: (n) => `Show ${n} new ${n === 1 ? "story" : "stories"}`,
    empty: "No stories in this section from the active sources. Turn on more sources or pick another section.",
    connecting: "Connecting to X", offline: "Offline", offlineNote: "The server is not responding. Trying to reconnect…",
    waiting: "Waiting for the first stories. They appear here as soon as a source posts.",
    trOther: "Translated", moreSources: (n) => `+${n} ${n === 1 ? "source" : "sources"}`,
    all: "All", none: "None", sources: "Sources", hot: "Top story", fresh: "New", ft: "FT",
    toLight: "Switch to light mode", toDark: "Switch to dark mode", locale: "en-GB",
    tagline: "Voices, Action & Reports",
    now: "now", noResults: "No results from the active sources yet.",
    noPost: "This story has no link to its source.", viewSrc: "View source",
    pickLeagues: "Choose leagues", leaguesTitle: "Leagues with live results", processing: "Translating…",
    xNote: "Posts from accounts that only publish on X, shown by X itself. They appear as posted, untranslated, and are not included in the other sections.",
    xNoList: "No X list has been set up yet. Create a public list on X with these accounts and put its link in the listaX field of fontes.json.",
    xFailed: "X did not load the list. It may be asking visitors to sign in.", xOpen: "Open the list on X", xLoading: "Loading posts from X…",
    updated: (t, src) => `Updated ${t} by ${src}`, agoWord: (t) => `${t} ago`,
  },
};

const isHot = (it) => (it.imp || 0) >= 4;
// relevância = importância a perder peso com o tempo (metade ao fim de 3 horas)
const relevance = (it, now) => (it.imp || 1) / (1 + (now - it.ts) / 3600000 / 3);
const TOP_N = 8;
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
// lista pública do X mostrada pelo widget oficial do X (gratuito, sem API)
function XEmbed({ url, theme, lang, ui }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!url || !el) return;
    el.innerHTML = "";
    setFailed(false);
    const a = document.createElement("a");
    a.className = "twitter-timeline";
    a.href = url;
    Object.assign(a.dataset, { theme, lang, dnt: "true", chrome: "noheader nofooter transparent", height: "1600" });
    a.textContent = ui.xLoading;
    el.appendChild(a);
    const load = () => window.twttr?.widgets?.load(el);
    let script = document.getElementById("x-widgets");
    if (window.twttr?.widgets) load();
    else if (script) script.addEventListener("load", load);
    else {
      script = Object.assign(document.createElement("script"), { id: "x-widgets", src: "https://platform.twitter.com/widgets.js", async: true });
      script.addEventListener("load", load);
      document.body.appendChild(script);
    }
    const t = setTimeout(() => { if (!el.querySelector("iframe")) setFailed(true); }, 12000);
    return () => clearTimeout(t);
  }, [url, theme, lang, ui.xLoading]);
  if (!url) return <p className="empty">{ui.xNoList}</p>;
  return (
    <div className="xembed">
      <p className="xnote">{ui.xNote}</p>
      <div ref={ref} />
      {failed && <p className="xnote">{ui.xFailed} <a href={url} target="_blank" rel="noreferrer">{ui.xOpen}</a></p>}
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
  --porto:#1D4E9E;--sporting:#0B7A47;--benfica:#C8102E;
  font-family:Barlow,system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;font-size:16px;line-height:1.5}
.apito[data-theme="dark"]{--bg:#0F1914;--raise:#16241D;--ink:#E4EDE7;--muted:#8E9F96;--line:#27382F;--accent:#F4C542;--live:#FF5B4D;
  --porto:#83A9EE;--sporting:#4CC68D;--benfica:#FF6E7E}
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
.apito .tabs{display:flex;flex-wrap:wrap;gap:0 2px;margin:0 -8px;padding:0 8px}
@media(max-width:699px){
  .apito .tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-right:48px;
    -webkit-mask-image:linear-gradient(to right,#000 82%,transparent);mask-image:linear-gradient(to right,#000 82%,transparent)}
  .apito .tabs::-webkit-scrollbar{height:4px}
  .apito .tabs::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px}
}
.apito .tab{white-space:nowrap;padding:9px clamp(6px,0.55vw,10px) 10px;font-size:clamp(13px,0.95vw,15px);font-weight:500;color:var(--muted);border-bottom:3px solid transparent;display:inline-flex;align-items:center;gap:6px}
.apito .tab:hover{color:var(--ink)}
.apito .tab[aria-pressed="true"]{color:var(--ink);border-bottom-color:var(--tabc,var(--ink));font-weight:600}
.apito .count{font-size:10px;font-weight:700;background:var(--accent);color:#1B1B1B;border-radius:999px;padding:0 5px;line-height:16px;min-width:16px;text-align:center}
.apito .textbtn.off{opacity:.45;cursor:not-allowed}
.apito .notice{font-size:13px;color:var(--muted);padding:14px 0 0}
.apito .layout{display:grid;grid-template-columns:minmax(0,1fr);gap:40px;padding:10px 0 64px}
@media(min-width:1000px){.apito .layout{grid-template-columns:minmax(0,1fr) 250px}}
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
.apito .xembed{max-width:560px}
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
  const [listaX, setListaX] = useState("");
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
        setSourceList(list.map((x) => [x.handle, x.name]));
      })
      .catch(() => {});
    fetch(`${API}/api/leagues`).then((r) => r.json()).then((l) => !stop && setLeagues(l)).catch(() => {});
    fetch(`${API}/api/config`).then((r) => r.json()).then((c) => !stop && setListaX(c.listaX || "")).catch(() => {});

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
        setItems((l) => (l.some((x) => x.id === item.id) ? l : [item, ...l].slice(0, MAX_ITEMS)));
        unfresh([item.id]);
      }
    });
    // o post afinal não era notícia, ou juntou-se a outra: sai do feed
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
      setPending((p) => p.map(up));
    });
    return () => { stop = true; es.close(); };
  }, []);

  const ui = UI[lang];
  const live = !paused && conn === "ok" && xStatus === "ligado";

  const flush = () => {
    if (!pending.length) return;
    const fresh = pending.map((p) => ({ ...p, ts: p.ts, fresh: true }));
    setItems((l) => [...fresh, ...l].slice(0, MAX_ITEMS));
    unfresh(fresh.map((f) => f.id));
    setPending([]);
  };
  const togglePause = () => {
    if (paused) { setPaused(false); flush(); } else setPaused(true);
  };

  const isOn = (h) => enabled === null || enabled.has(h);
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
    const list = items.filter((it) => srcOn(it) && inSection(it, section) && matches(it));
    if (section !== "destaque") return list;
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
      .slice(0, TOP_N);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, enabled, ligasOn, section, query, lang, section === "destaque" ? now : 0]);

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
      if (map.has(k)) continue;
      if (q && !`${it.score.comp} ${it.score.h} ${it.score.a}`.toLowerCase().includes(q)) continue;
      map.set(k, it);
    }
    return [...map.values()].sort((a, b) => (isLive(b.score, b.ts, now) - isLive(a.score, a.ts, now)) || b.ts - a.ts);
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
    return [strip(it.t[lang]), ...it.b[lang].map((b) => `• ${strip(b)}`), s.name, postUrl(it)].filter(Boolean).join("\n");
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
                <span className="nm">{n === h ? `@${h}` : n}</span>
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
              <div className="seg" role="group" aria-label="Idioma / Language">
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
          <nav className="tabs" aria-label="Secções">
            {CATS.map((c) => (
              <button key={c.id} className="tab" aria-pressed={section === c.id} onClick={(e) => { setSection(c.id); e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }}
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
        <div className="layout">
          <main>
            {showSources && <div className="mobpanel">{sourcesPanel}</div>}

            <div className="feedhead">
              <h1>{CAT[section][lang]}</h1>
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
                          <span className="nm">{l.nome}</span>
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

            {section === "x" ? (
              <XEmbed url={listaX} theme={theme} lang={lang} ui={ui} />
            ) : section === "resultados" ? (
              games.length === 0 ? <p className="empty">{ui.noResults}</p> : (
                <ul className="board" aria-live="polite">
                  {games.map((it) => {
                    const sc = it.score, s = srcOf(it);
                    return (
                      <li key={`${sc.comp}|${sc.h}|${sc.a}`} className={`match ${isLive(sc, it.ts, now) ? "on" : ""}`}>
                        <span className="comp">{sc.comp}</span>
                        <span className="team h">{sc.h}</span>
                        <span className="res">{sc.hs}–{sc.as}</span>
                        <span className="team">{sc.a}</span>
                        <span className="st">{isLive(sc, it.ts, now) ? <span className="pulse"><i />{sc.min || ui.live}</span> : <span className="muted">{sc.ft ? ui.ft : sc.min || "—"}</span>}</span>
                        <span className="upd">{ui.updated(agoText(it.ts, now, ui), s.name === s.handle ? `@${s.handle}` : s.name)}</span>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : visible.length === 0 ? (
              <p className="empty">{items.length === 0 ? ui.waiting : ui.empty}</p>
            ) : (
              <ol className="feed" aria-live="polite">
                {visible.map((it) => {
                  const s = srcOf(it);
                  const cls = ["item", it.unread && "unread", it.fresh && "fresh", it.hot && "hot"].filter(Boolean).join(" ");
                  return (
                    <li key={it.id} className={cls}>
                      <div className="gut" title={new Date(it.ts).toLocaleTimeString(ui.locale)}>
                        {(() => { const a = ago(it.ts, now); return a ? <><span className="n">{a[0]}</span><span className="u">{a[1]}</span></> : <span className="u">{ui.now}</span>; })()}
                      </div>
                      <div className="rail"><span className="dot" /></div>
                      <article className="body" onClick={() => markRead(it.id)}>
                        <div className="mrow">
                          <span className="src">{s.name === s.handle ? `@${s.handle}` : s.name}</span>
                          {it.via && <span className="muted">{it.via}</span>}
                          {it.also?.length > 0 && (
                            <span className="muted" title={it.also.map((a) => a.name || `@${a.src}`).join(", ")}>{ui.moreSources(it.also.length)}</span>
                          )}
                          <span className="chips">
                            {it.unread && <span className="chip new">{ui.fresh}</span>}
                            {it.hot && <span className="chip hot">{ui.hot}</span>}
                            {it.cats.filter((c) => CAT[c]).map((c) => (
                              <span key={c} className={`chip ${CAT[c].club ? "club" : ""}`} style={CAT[c].club ? { "--c": `var(--${c})` } : undefined}>
                                {CAT[c][lang]}
                              </span>
                            ))}
                          </span>
                        </div>

                        <h3 className="title"><Rich text={it.t[lang]} /></h3>

                        {it.score && (
                          <div className="score">
                            <span>{it.score.h}</span>
                            <span className="n">{it.score.hs}–{it.score.as}</span>
                            <span>{it.score.a}</span>
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

          <aside className="desk">{sourcesPanel}</aside>
        </div>
      </div>
    </div>
  );
}
