// Procura o Instagram e o Facebook oficiais dos clubes que ainda não os têm no pt/clubes.json, como se faria à mão:
// pesquisa «site:instagram.com "Clube" terra futebol» e fica com o primeiro resultado que seja um perfil
// (não uma publicação, reel ou hashtag). O mesmo para o Facebook.
//
//   npm run procurar-redes                 # todos os que faltam
//   npm run procurar-redes -- --limite 50  # só os primeiros 50 (para ir aos poucos)
//   npm run procurar-redes -- --assoc "AF Porto"
//
// Usa o DuckDuckGo (versão HTML) e, se falhar, o Bing: gratuitos e sem chave. Os links encontrados ficam no
// pt/redes-encontradas.json, marcados como «auto», e entram logo no pt/clubes.json com o estado «Pesquisa
// automática (1.º resultado)», para serem revistos. Um pedido a cada 4 segundos, para não ser bloqueado.
import fs from "node:fs";
import { norm } from "../server/util.js";

const RAIZ = new URL("../pt/", import.meta.url);
const CLUBES = new URL("clubes.json", RAIZ);
const ENCONTRADAS = new URL("redes-encontradas.json", RAIZ);
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LIMITE = Number(opt("--limite")) || Infinity;
const ASSOC = opt("--assoc");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dados = JSON.parse(fs.readFileSync(CLUBES, "utf8"));
let encontradas = { clubes: [] };
try { encontradas = JSON.parse(fs.readFileSync(ENCONTRADAS, "utf8")); } catch { /* novo */ }

const NAO_PERFIL_IG = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "about", "developer", "legal", "directory"]);
const NAO_PERFIL_FB = /^(groups|events|watch|hashtag|marketplace|login|sharer|share|story\.php|photo|photos|videos|reel|posts|permalink\.php|help|policies|pages\/category|gaming)$/i;
function perfilIg(url) {
  const m = String(url).match(/instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?:[?#]|$)/);
  return m && !NAO_PERFIL_IG.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
}
function perfilFb(url) {
  const u = String(url);
  const id = u.match(/facebook\.com\/profile\.php\?id=(\d+)/);
  if (id) return `https://www.facebook.com/profile.php?id=${id[1]}`;
  const m = u.match(/facebook\.com\/(?:p\/)?([A-Za-z0-9.\-]{3,80})\/?(?:[?#]|$)/);
  if (!m || NAO_PERFIL_FB.test(m[1])) return null;
  const pid = m[1].match(/-(\d{10,})$/); // «/p/Nome-Do-Clube-100063519462640/»
  return pid ? `https://www.facebook.com/profile.php?id=${pid[1]}` : `https://www.facebook.com/${m[1]}/`;
}

async function pesquisar(q) {
  const links = [];
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9" } });
    const html = await r.text();
    for (const m of html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)) {
      const u = m[1].includes("uddg=") ? decodeURIComponent(m[1].split("uddg=")[1].split("&")[0]) : m[1];
      links.push(u);
    }
  } catch { /* tenta o Bing */ }
  if (!links.length) {
    try {
      const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=pt-PT`, { headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9" } });
      const html = await r.text();
      for (const m of html.matchAll(/<li class="b_algo"[\s\S]*?<a[^>]+href="([^"]+)"/g)) links.push(m[1].replace(/&amp;/g, "&"));
    } catch { /* nada */ }
  }
  return links;
}

// o perfil tem de ter alguma palavra do nome do clube (sem siglas), para não ficar com outro clube qualquer
const palavrasNome = (n) => norm(n).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(clube|club|futebol|sport|sporting|grupo|desportivo|associacao|uniao|recreativo|cultural)$/.test(w));
const parece = (perfil, nome) => {
  const p = norm(perfil).replace(/[^a-z0-9]/g, "");
  return palavrasNome(nome).some((w) => p.includes(w.slice(0, Math.max(4, w.length - 2))));
};

const faltam = dados.clubes.filter((c) => (!c.instagram || !c.facebook) && (!ASSOC || c.assoc === ASSOC)).slice(0, LIMITE);
console.log(`${faltam.length} clubes sem Instagram ou sem Facebook${ASSOC ? ` (${ASSOC})` : ""}`);
let nIg = 0, nFb = 0;
for (const [i, c] of faltam.entries()) {
  const terra = String(c.assoc || "").replace(/^AF\s+/i, "").split(",")[0];
  const nome = c.nome.replace(/"/g, "");
  const reg = encontradas.clubes.find((x) => x.clube === c.nome && x.assoc === c.assoc) || { clube: c.nome, assoc: c.assoc };
  if (!c.instagram) {
    const links = await pesquisar(`site:instagram.com "${nome}" ${terra} futebol`);
    const h = links.map(perfilIg).find((x) => x && parece(x, nome));
    if (h) { c.instagram = h; c.estadoInstagram = "Pesquisa automática (1.º resultado)"; reg.ig = `https://www.instagram.com/${h}/`; reg.conf_ig = "auto"; nIg++; }
    await sleep(4000);
  }
  if (!c.facebook) {
    const links = await pesquisar(`site:facebook.com "${nome}" ${terra} futebol`);
    const f = links.map(perfilFb).find((x) => x && (x.includes("profile.php") || parece(x.replace(/^.*facebook\.com\//, ""), nome)));
    if (f) { c.facebook = f; c.estadoFacebook = "Pesquisa automática (1.º resultado)"; reg.fb = f; reg.conf_fb = "auto"; nFb++; }
    await sleep(4000);
  }
  if ((reg.ig || reg.fb) && !encontradas.clubes.includes(reg)) encontradas.clubes.push(reg);
  console.log(`[${i + 1}/${faltam.length}] ${c.nome} (${c.assoc}): ${c.instagram ? `@${c.instagram}` : "—"} · ${c.facebook || "—"}`);
  if ((i + 1) % 10 === 0 || i === faltam.length - 1) {
    fs.writeFileSync(CLUBES, JSON.stringify(dados, null, 1));
    fs.writeFileSync(ENCONTRADAS, JSON.stringify(encontradas, null, 1));
  }
}
console.log(`Encontrados ${nIg} Instagram e ${nFb} Facebook. Revê os marcados «Pesquisa automática» no pt/redes-encontradas.json.`);
