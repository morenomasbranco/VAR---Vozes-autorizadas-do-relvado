// Capas dos jornais desportivos do dia, lidas na página do SAPO (https://sapo.pt/noticias/jornais/desporto).
// A página é lida de 20 em 20 minutos (de 5 em 5 entre a meia-noite e as 9h de Lisboa, que é quando as
// capas novas saem). Cada capa guarda o endereço da imagem; o site mostra-a através do servidor
// (/api/capas/img/<id>), com cópia em memória, para a imagem aparecer sempre mesmo que o SAPO recuse
// imagens pedidas de outros sites.
import fs from "node:fs";
import { sleep, slug, norm } from "../util.js";

const PAGINA = process.env.CAPAS_PAGINA || "https://sapo.pt/noticias/jornais/desporto";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FICHEIRO = new URL("../../data/capas.json", import.meta.url);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };
const decode = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);

// país de cada jornal, pelo nome; os que não estão aqui ficam em «Outros»
const PAISES = [
  ["pt", /^(a bola|record|o jogo|abola)\b/i],
  ["es", /^(marca|as|mundo deportivo|sport|super deporte|estadio deportivo|el desmarque)\b/i],
  ["fr", /^(l.?[ée]quipe|france football|le 10 sport|so foot)\b/i],
  ["it", /^(la gazzetta|gazzetta|corriere dello sport|tuttosport|il romanista)\b/i],
  ["de", /^(kicker|bild|sport ?bild|sport1)\b/i],
  ["gb-eng", /^(the sun|daily mirror|daily star|daily express|daily mail|the times|telegraph|guardian|sport)\b/i],
  ["br", /^(lance|gazeta esportiva|o globo esporte)\b/i],
  ["ar", /^(ol[ée]|tyc|diario ol[ée])\b/i],
  ["be", /^(sport\/?foot|la derni[èe]re heure|het nieuwsblad)\b/i],
  ["nl", /^(voetbal international|de telegraaf)\b/i],
];
export const paisDe = (nome) => PAISES.find(([, re]) => re.test(norm(nome)))?.[0] || "un";

// nome a partir do endereço («.../desporto/a-bola-12» → «A Bola»)
const nomeDoSlug = (href) => {
  const s = (String(href).match(/\/desporto\/([^/?#]+)/)?.[1] || "").replace(/-\d+$/, "");
  if (!s) return "";
  const n = s.split("-").map((w) => (w.length <= 2 && w !== "o" && w !== "a" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
  return n.replace(/^(O|A) /, (m) => m);
};

const melhorSrcset = (ss) => {
  const c = String(ss || "").split(",").map((x) => x.trim().split(/\s+/)).filter((x) => x[0]);
  c.sort((a, b) => (parseInt(b[1], 10) || 0) - (parseInt(a[1], 10) || 0));
  return c[0]?.[0] || null;
};
const absoluto = (u) => { try { return new URL(decode(u), PAGINA).href; } catch { return null; } };

// procura na página cada capa: uma imagem dentro de uma ligação para a página desse jornal
export function lerCapas(html, estrito = true) {
  const capas = new Map();
  const src = String(html || "");
  // 1) blocos <a …href="…/jornais/…">…<img …></a>; a página de cada jornal acaba em «nome-número» (…/desporto/as-1846)
  const reA = /<a\b[^>]*href="([^"]*\/jornais\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = reA.exec(src))) {
    const href = decode(m[1]);
    if (/\/arquivo|\/jornais\/?(desporto)?\/?$|[?&]page=/i.test(href)) continue;
    if (estrito && !/\/[a-z0-9-]+-\d+\/?(\?|#|$)/i.test(href)) continue;
    const bloco = m[2];
    const img = bloco.match(/<img\b[^>]*>/i)?.[0];
    const fonteSrc = bloco.match(/<source\b[^>]*srcset="([^"]+)"/i)?.[1];
    if (!img && !fonteSrc) continue;
    const at = (n) => img?.match(new RegExp(`\\b${n}="([^"]*)"`, "i"))?.[1];
    const url = melhorSrcset(at("srcset") || at("data-srcset") || fonteSrc) || at("data-src") || at("data-original") || at("src");
    if (!url || /^data:|\.svg(\?|$)|logo|icon|avatar/i.test(url)) continue;
    let nome = decode(at("alt") || at("title") || bloco.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .replace(/^(capa|primeira p[aá]gina)( d[oa])?\s+(jornal\s+)?/i, "").replace(/\s+(de hoje|do dia)$/i, "").trim().slice(0, 60);
    if (!nome || /^(capa|jornal|imagem|image|ver)$/i.test(nome)) nome = nomeDoSlug(href);
    const chave = slug(nomeDoSlug(href) || nome);
    if (!chave || capas.has(chave)) continue;
    capas.set(chave, { id: chave, nome: nome || nomeDoSlug(href), img: absoluto(url), pagina: absoluto(href) });
  }
  if (!capas.size && estrito) return lerCapas(html, false);
  // 2) páginas feitas em Next.js: os dados vêm num JSON dentro da página
  if (!capas.size) {
    const json = src.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (json) {
      try {
        const visitar = (o) => {
          if (!o || typeof o !== "object") return;
          if (Array.isArray(o)) return o.forEach(visitar);
          const img = Object.values(o).find((v) => typeof v === "string" && /^https?:\/\/[^"]+\.(jpe?g|png|webp)|imgs\.sapo|thumbs\.web\.sapo/i.test(v));
          const nome = o.name || o.title || o.nome || o.publicationName;
          if (img && typeof nome === "string" && nome.length < 60) {
            const chave = slug(nome);
            if (chave && !capas.has(chave)) capas.set(chave, { id: chave, nome, img, pagina: o.url ? absoluto(o.url) : PAGINA, data: o.date || o.publishedAt || null });
          }
          Object.values(o).forEach(visitar);
        };
        visitar(JSON.parse(json));
      } catch { /* JSON diferente do esperado */ }
    }
  }
  return [...capas.values()].map((c) => ({ ...c, pais: paisDe(c.nome) }));
}

export function createCapas({ log = () => {} } = {}) {
  let capas = [];
  try { capas = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { capas = []; }
  const estado = { at: null, erro: null, total: capas.length, amostra: null };
  const cache = new Map(); // id → { url, tipo, buf, at }

  const gravar = () => {
    try { fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(capas)); } catch { /* só em memória */ }
  };

  async function ler() {
    const res = await fetch(PAGINA, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-PT,pt;q=0.9" } });
    if (!res.ok) throw new Error(`o SAPO respondeu ${res.status}`);
    const html = await res.text();
    const novas = lerCapas(html);
    if (!novas.length) {
      estado.amostra = html.replace(/\s+/g, " ").slice(0, 1500); // para ver no /api/capas/estado o que a página trouxe
      throw new Error("não encontrei capas na página (o SAPO pode ter mudado o formato)");
    }
    const agora = Date.now();
    const antes = new Map(capas.map((c) => [c.id, c]));
    capas = novas.map((c) => {
      const a = antes.get(c.id);
      // «desde»: quando esta imagem apareceu; muda quando o jornal publica a capa do dia seguinte
      return { ...c, desde: a && a.img === c.img ? a.desde : agora, visto: agora };
    });
    for (const [id, c] of cache) if (!capas.some((x) => x.id === id && x.img === c.url)) cache.delete(id);
    Object.assign(estado, { at: agora, erro: null, total: capas.length, amostra: null });
    gravar();
  }

  async function start() {
    for (;;) {
      try { await ler(); } catch (e) { estado.erro = e.message; log(`[Capas] ${e.message}`); }
      const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(new Date()));
      await sleep((hora < 9 ? 5 : 20) * 60e3);
    }
  }

  // imagem da capa, pedida pelo servidor e guardada em memória enquanto for a mesma
  async function imagem(id) {
    const c = capas.find((x) => x.id === id);
    if (!c?.img) return null;
    const em = cache.get(id);
    if (em && em.url === c.img) return em;
    const r = await fetch(c.img, { headers: { "User-Agent": UA, Referer: PAGINA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" } });
    if (!r.ok) throw new Error(`imagem respondeu ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const novo = { url: c.img, tipo: r.headers.get("content-type") || "image/jpeg", buf, at: Date.now() };
    cache.set(id, novo);
    return novo;
  }

  return { start, all: () => capas, imagem, estado: () => estado };
}
