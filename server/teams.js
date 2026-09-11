// Diretório de clubes e seleções com os emblemas que a ESPN disponibiliza nas suas listas de equipas.
// Os emblemas não são copiados para o projeto: o site mostra-os a partir do servidor de imagens da ESPN.
// Serve para pôr ao lado de cada notícia os emblemas dos clubes ou seleções de que ela trata.
import { norm, sleep } from "./util.js";

const SITE = process.env.ESPN_BASE || "https://site.api.espn.com/apis/site/v2/sports";
// ligas consultadas só para completar o diretório (além das que o VAR acompanha nos resultados)
const EXTRA = [
  "soccer/fifa.world", "soccer/uefa.euro", "soccer/conmebol.america",
  "soccer/eng.2", "soccer/esp.2", "soccer/ita.2", "soccer/ger.2", "soccer/fra.2",
  "soccer/bel.1", "soccer/sco.1", "soccer/gre.1", "soccer/sui.1", "soccer/aut.1", "soccer/den.1",
  "soccer/arg.1", "soccer/mex.1", "soccer/uefa.super_cup", "basketball/nba",
];
// palavras que não ajudam a distinguir clubes («FC Porto» e «Porto» são o mesmo)
const STOP = new Set(["fc", "cf", "sc", "afc", "ac", "as", "ss", "sl", "cd", "ud", "rc", "rcd", "sad", "club", "clube", "de", "da", "do", "del", "futebol", "football", "calcio", "the"]);
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

  const put = (k, t) => { if (k && !byKey.has(k)) byKey.set(k, t); };

  async function loadLeague(slugPath) {
    const res = await fetch(`${SITE}/${slugPath}/teams`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`ESPN respondeu ${res.status}`);
    const body = await res.json();
    const list = body.sports?.[0]?.leagues?.[0]?.teams?.map((x) => x.team) || [];
    for (const t of list) {
      const logos = t.logos || [];
      const logo = logos.find((l) => l.rel?.includes("default"))?.href || logos[0]?.href;
      if (!logo) continue;
      const team = { nome: t.shortDisplayName || t.displayName, logo, logoDark: logos.find((l) => l.rel?.includes("dark"))?.href };
      for (const n of [t.displayName, t.shortDisplayName, t.name, t.location && t.name ? `${t.location} ${t.name}` : null]) put(teamKey(n), team);
    }
    return list.length;
  }

  // ordem de prioridade: em nomes iguais, fica a equipa da liga que aparece primeiro
  async function load(leagues) {
    const order = [...new Set([...leagues.map((l) => l.espn), ...EXTRA])];
    let total = 0;
    for (const p of order) {
      try { total += await loadLeague(p); } catch { /* competições sem lista de equipas */ }
      await sleep(300);
    }
    keys = [...byKey.keys()];
    log(`[Emblemas] ${byKey.size} nomes de clubes e seleções com emblema (${total} equipas lidas)`);
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
      const item = { nome: t?.nome || e.nome, papel: e.papel || "envolvido", ...(t ? { logo: t.logo, logoDark: t.logoDark } : {}) };
      if (!out.some((o) => o.nome === item.nome && o.papel === item.papel)) out.push(item);
    }
    return out;
  }

  return { load, resolve, find, size: () => byKey.size };
}
