// Diretório de clubes e seleções com os emblemas que a ESPN disponibiliza nas suas listas de equipas.
// Os emblemas não são copiados para o projeto: o site mostra-os a partir do servidor de imagens da ESPN.
// Serve para pôr ao lado de cada notícia os emblemas dos clubes ou seleções de que ela trata.
import fs from "node:fs";
import { norm, sleep } from "./util.js";

const SITE = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
const CORE = process.env.ESPN_CORE_BASE || "https://sports.core.api.espn.com/v2/sports";
const FILE = new URL("../data/emblemas.json", import.meta.url);
const PACE = Number(process.env.EMBLEMAS_PAUSA_MS) || 1200; // ritmo do varrimento de fundo
const MAX_AGE = (Number(process.env.EMBLEMAS_DIAS) || 30) * 86400e3;
// ligas carregadas logo no arranque (as do VAR entram à frente destas)
const PRIORITY = [
  "soccer/por.1", "soccer/por.2", "soccer/por.taca.portugal", "soccer/por.taca_liga",
  "soccer/eng.1", "soccer/esp.1", "soccer/ita.1", "soccer/ger.1", "soccer/fra.1",
  "soccer/uefa.champions", "soccer/uefa.europa", "soccer/uefa.europa.conf",
  "soccer/fifa.world", "soccer/uefa.euro", "soccer/conmebol.america", "soccer/fifa.friendly",
  "soccer/ned.1", "soccer/tur.1", "soccer/ksa.1", "soccer/bra.1", "soccer/usa.1",
  "soccer/eng.2", "soccer/esp.2", "soccer/ita.2", "soccer/ger.2", "soccer/fra.2",
  "soccer/bel.1", "soccer/sco.1", "soccer/gre.1", "soccer/sui.1", "soccer/aut.1", "soccer/den.1",
  "soccer/arg.1", "soccer/mex.1", "basketball/nba", "basketball/wnba",
];
// palavras que não ajudam a distinguir clubes («FC Porto» e «Porto» são o mesmo)
const STOP = new Set(["fc", "cf", "sc", "afc", "ac", "as", "ss", "sl", "cd", "ud", "rc", "rcd", "sad", "club", "clube", "de", "da", "do", "del", "futebol", "football", "calcio", "the"]);
// país do clube, pela liga nacional da ESPN de onde veio («soccer/eng.1» → Inglaterra); as competições
// internacionais (UEFA, FIFA, CONMEBOL…) não dizem o país e ficam de fora
const PAIS_LIGA = { por: "pt", eng: "gb-eng", esp: "es", ita: "it", ger: "de", fra: "fr", ned: "nl", tur: "tr", ksa: "sa", bra: "br", usa: "us",
  bel: "be", sco: "gb-sct", gre: "gr", sui: "ch", aut: "at", den: "dk", arg: "ar", mex: "mx", jpn: "jp", chn: "cn", rus: "ru", ukr: "ua",
  nor: "no", swe: "se", pol: "pl", cze: "cz", cro: "hr", srb: "rs", rou: "ro", col: "co", chi: "cl", uru: "uy", par: "py", per: "pe", ecu: "ec",
  aus: "au", kor: "kr", qat: "qa", uae: "ae", egy: "eg", rsa: "za", mar: "ma", irl: "ie", wal: "gb-wls", nir: "gb-nir", isr: "il", cyp: "cy" };
const INTERNACIONAL = /^(uefa|fifa|conmebol|concacaf|caf|afc|club\.friendly|friendly|global|olympics)/;
export const paisDaLiga = (slugPath) => {
  const [sport, liga = ""] = String(slugPath).split("/");
  if (sport !== "soccer" || INTERNACIONAL.test(liga)) return null;
  const cod = liga.split(".")[0];
  return PAIS_LIGA[cod] || (/^[a-z]{3}$/.test(cod) ? `x-${cod}` : null); // «x-…»: outro país, sem bandeira conhecida
};
export const teamKey = (s) => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");
// nomes correntes que não coincidem com os da ESPN
const ALIASES = {
  "sporting": "sporting cp", "sporting lisbon": "sporting cp", "sporting clube portugal": "sporting cp",
  "man united": "manchester united", "man utd": "manchester united", "man city": "manchester city",
  "psg": "paris saint germain", "paris sg": "paris saint germain", "inter": "internazionale", "inter milan": "internazionale",
  "bayern": "bayern munich", "bayern munchen": "bayern munich", "barca": "barcelona", "atletico": "atletico madrid",
  "spurs": "tottenham hotspur", "tottenham": "tottenham hotspur", "wolves": "wolverhampton wanderers",
  "leverkusen": "bayer leverkusen", "dortmund": "borussia dortmund", "gladbach": "borussia monchengladbach",
  "guimaraes": "vitoria guimaraes", "vitoria": "vitoria guimaraes", "al hilal": "al hilal", "al nassr": "al nassr",
};

export function createTeams({ log }) {
  const byKey = new Map(); // chave normalizada → equipa
  let keys = [];
  const done = new Set(); // ligas já lidas
  let dirty = false;

  const put = (k, t) => {
    if (!k) return;
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, t); dirty = true; return; }
    // a mesma equipa vista primeiro numa competição da UEFA e depois na liga do país: fica com o país
    if (!cur.pais && t.pais && cur.logo === t.logo) { cur.pais = t.pais; dirty = true; }
  };

  // o diretório é guardado em disco: no arranque seguinte fica pronto de imediato
  function loadCache() {
    try {
      const c = JSON.parse(fs.readFileSync(FILE, "utf8"));
      if (!c.at || Date.now() - c.at > MAX_AGE || c.v !== 2) return false; // v2: as equipas passaram a ter o país
      for (const [k, t] of Object.entries(c.teams || {})) byKey.set(k, t);
      (c.done || []).forEach((x) => done.add(x));
      keys = [...byKey.keys()];
      dirty = false;
      return byKey.size > 0;
    } catch { return false; }
  }
  function saveCache() {
    if (!dirty) return;
    try {
      fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ v: 2, at: Date.now(), teams: Object.fromEntries(byKey), done: [...done] }));
      dirty = false;
    } catch { /* disco cheio ou sem permissão: o diretório fica só em memória */ }
  }

  async function loadLeague(slugPath) {
    done.add(slugPath);
    const res = await fetch(`${SITE}/${slugPath}/teams`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);
    const body = await res.json();
    const list = body.sports?.[0]?.leagues?.[0]?.teams?.map((x) => x.team) || [];
    for (const t of list) {
      const logos = t.logos || [];
      const logo = logos.find((l) => l.rel?.includes("default"))?.href || logos[0]?.href;
      if (!logo) continue;
      const team = { nome: t.shortDisplayName || t.displayName, logo, logoDark: logos.find((l) => l.rel?.includes("dark"))?.href, pais: paisDaLiga(slugPath) || undefined };
      for (const n of [t.displayName, t.shortDisplayName, t.name, t.location && t.name ? `${t.location} ${t.name}` : null]) put(teamKey(n), team);
    }
    return list.length;
  }

  // todos os slugs de ligas que a ESPN conhece (uma só chamada; o slug vem no próprio endereço)
  async function allLeagueSlugs(sport) {
    const res = await fetch(`${CORE}/${sport}/leagues?limit=1000`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);
    const body = await res.json();
    return (body.items || []).map((x) => x.$ref?.match(/\/leagues\/([^?/]+)/)?.[1]).filter(Boolean).map((s) => `${sport}/${s}`);
  }

  // varrimento lento de todas as ligas, em segundo plano, uma vez por mês
  async function sweep() {
    let slugs = [];
    for (const sport of ["soccer", "basketball"]) {
      try { slugs.push(...await allLeagueSlugs(sport)); } catch (e) { log(`[Emblemas] lista de ligas de ${sport}: ${e.message}`); }
      await sleep(PACE);
    }
    const pending = slugs.filter((p) => !done.has(p));
    if (!pending.length) return;
    log(`[Emblemas] a completar o diretório com ${pending.length} liga(s), em segundo plano`);
    let fails = 0;
    for (const p of pending) {
      try { await loadLeague(p); fails = 0; } catch (e) {
        if (/40[13]|429/.test(e.message) && ++fails >= 5) { log("[Emblemas] a ESPN está a recusar pedidos; paro o varrimento"); break; }
      }
      keys = [...byKey.keys()];
      if (byKey.size % 200 < 5) saveCache();
      await sleep(PACE);
    }
    saveCache();
    log(`[Emblemas] diretório completo: ${byKey.size} nomes de clubes e seleções`);
  }

  // ordem de prioridade: em nomes iguais, fica a equipa da liga que aparece primeiro
  async function load(leagues) {
    const cached = loadCache();
    const order = [...new Set([...leagues.map((l) => l.espn), ...PRIORITY])].filter((p) => !cached || !done.has(p));
    for (const p of order) {
      try { await loadLeague(p); } catch { /* competições sem lista de equipas */ }
      await sleep(cached ? PACE : 300);
    }
    keys = [...byKey.keys()];
    saveCache();
    log(`[Emblemas] ${byKey.size} nomes de clubes e seleções com emblema${cached ? " (do ficheiro guardado)" : ""}`);
    setTimeout(() => sweep().catch((e) => log(`[Emblemas] ${e.message}`)), 30000);
    setInterval(saveCache, 60000).unref();
  }

  function find(name) {
    let k = teamKey(name);
    if (!k) return null;
    if (ALIASES[k]) k = teamKey(ALIASES[k]);
    if (byKey.has(k)) return byKey.get(k);
    if (k.length < 4) return null;
    // «Sporting CP Lisbon» ou «Braga» contra «SC Braga»: aceita quando um nome começa pelo outro
    const hit = keys.find((x) => x.length >= 4 && (x.startsWith(`${k} `) || k.startsWith(`${x} `)));
    return hit ? byKey.get(hit) : null;
  }

  // [{ nome, papel }] → [{ nome, papel, logo, logoDark }]; os nomes sem emblema ficam só com o nome
  function resolve(list = []) {
    const out = [];
    for (const e of list.slice(0, 4)) {
      if (!e?.nome) continue;
      const t = find(e.nome);
      const item = { nome: t?.nome || e.nome, papel: e.papel || "envolvido", ...(t ? { logo: t.logo, logoDark: t.logoDark, pais: t.pais } : {}) };
      if (!out.some((o) => o.nome === item.nome && o.papel === item.papel)) out.push(item);
    }
    return out;
  }

  return { load, resolve, find, size: () => byKey.size };
}
