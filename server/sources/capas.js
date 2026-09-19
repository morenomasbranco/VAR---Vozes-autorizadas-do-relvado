// Capas dos jornais desportivos, lidas na página do SAPO (https://sapo.pt/noticias/jornais/desporto).
// Além das capas do dia, o servidor guarda as da última semana: as que vai vendo ao longo dos dias e as
// que vai buscar à página datada de cada jornal (…/desporto/a-bola-4137/20260916), para a semana ficar
// completa mesmo depois de o servidor reiniciar.
// A página é lida de 20 em 20 minutos (de 5 em 5 entre a meia-noite e as 9h de Lisboa, que é quando as
// capas novas saem). Cada capa guarda o endereço da imagem; o site mostra-a através do servidor
// (/api/capas/img/<id>), com cópia em memória, para a imagem aparecer sempre mesmo que o SAPO recuse
// imagens pedidas de outros sites.
import fs from "node:fs";
import { sleep, slug, norm } from "../util.js";

const PAGINA = process.env.CAPAS_PAGINA || "https://sapo.pt/noticias/jornais/desporto";
// se a página principal falhar ou vier sem capas, experimenta a nova página do SAPO
const PAGINAS = [PAGINA, "https://novo.sapo.pt/jornais/desporto"].filter((u, i, a) => a.indexOf(u) === i);
// recurso quando o SAPO não dá capas de hoje: as imagens do Kiosko.net, com endereço fixo por dia
// (img.kiosko.net/AAAA/MM/DD/<país>/<jornal>.750.jpg); cada jornal tem os nomes possíveis no Kiosko
const KIOSKO = [
  ["A Bola", "pt", ["a_bola", "abola"], /^a ?bola\b/],
  ["Record", "pt", ["record"], /^record\b/],
  ["O Jogo", "pt", ["o_jogo", "ojogo"], /^o ?jogo\b/],
  ["Marca", "es", ["marca"], /^marca\b/],
  ["AS", "es", ["as"], /^as$/],
  ["Mundo Deportivo", "es", ["mundo_deportivo"], /^(el )?mundo deportivo/],
  ["Sport", "es", ["sport"], /^sport$/],
  ["L'Équipe", "fr", ["lequipe", "l_equipe"], /equipe/],
  ["La Gazzetta dello Sport", "it", ["gazzetta_sport", "gazzetta_dello_sport"], /gazzetta/],
  ["Corriere dello Sport", "it", ["corriere_sport", "corriere_dello_sport"], /corriere dello sport/],
  ["Tuttosport", "it", ["tuttosport"], /^tuttosport/],
  ["Kicker", "de", ["kicker"], /^kicker/],
  ["Olé", "ar", ["ole"], /^ole\b/],
  ["Lance!", "br", ["lance"], /^lance\b/],
];
const KIOSKO_REF = "https://www.kiosko.net/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FICHEIRO = new URL("../../data/capas.json", import.meta.url);
const FICHEIRO_SEMANA = new URL("../../data/capas-semana.json", import.meta.url);
const DIAS = Math.max(1, Number(process.env.CAPAS_DIAS) || 7); // dias guardados, contando com hoje
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'" };
const decode = (s) => String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n] ?? m);

// dia de Lisboa (AAAA-MM-DD) de um instante, e o dia de há n dias
export const diaLisboa = (ts = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date(ts));
const diaMenos = (dia, n) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// data escrita na página ou no endereço da imagem: «16/09/2026», «2026-09-16», «20260916», «2026/09/16»
export function dataEm(texto) {
  const t = String(texto || "");
  let m = t.match(/\b(\d{2})[/.-](\d{2})[/.-](20\d{2})\b/);
  if (m) return valida(`${m[3]}-${m[2]}-${m[1]}`);
  m = t.match(/\b(20\d{2})[/-](\d{2})[/-](\d{2})\b/);
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`);
  m = t.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (m) return valida(`${m[1]}-${m[2]}-${m[3]}`);
  return null;
}
function valida(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dia) return null;
  const hoje = diaLisboa();
  return dia <= hoje && dia >= diaMenos(hoje, 60) ? dia : null; // datas absurdas (ids, tamanhos) ficam de fora
}
// endereço base da página de um jornal, sem data no fim («…/a-bola-4137»)
const baseJornal = (u) => String(u || "").replace(/[?#].*$/, "").replace(/\/(\d{8}|arquivo)\/?$/, "").replace(/\/+$/, "");

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
let baseLida = PAGINA; // página de onde veio o HTML que está a ser lido
const absoluto = (u) => { try { return new URL(decode(u), baseLida).href; } catch { return null; } };

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
    // data da capa: na ligação, no texto do bloco ou no endereço da imagem
    const data = dataEm(href) || dataEm(bloco.replace(/<[^>]+>/g, " ")) || dataEm(url);
    capas.set(chave, { id: chave, nome: nome || nomeDoSlug(href), img: absoluto(url), pagina: absoluto(href), data });
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
            if (chave && !capas.has(chave)) capas.set(chave, { id: chave, nome, img, pagina: o.url ? absoluto(o.url) : PAGINA, data: dataEm(o.date || o.publishedAt || "") || dataEm(img) });
          }
          Object.values(o).forEach(visitar);
        };
        visitar(JSON.parse(json));
      } catch { /* JSON diferente do esperado */ }
    }
  }
  return [...capas.values()].map((c) => ({ ...c, pais: paisDe(c.nome) }));
}

// imagem da capa na página datada de um jornal: primeiro uma imagem com a data no endereço, depois uma com o
// nome do jornal no texto alternativo, e por fim a imagem de partilha da página (og:image)
export function imagemDaPagina(html, nome, dia) {
  const src = String(html || "");
  const compacto = dia.replace(/-/g, "");
  const cands = [];
  for (const tag of src.match(/<(img|source)\b[^>]*>/gi) || []) {
    const at = (n) => tag.match(new RegExp(`\\b${n}="([^"]*)"`, "i"))?.[1];
    const url = melhorSrcset(at("srcset") || at("data-srcset")) || at("data-src") || at("data-original") || at("src");
    if (!url || /^data:|\.svg(\?|$)|logo|icon|avatar|sprite|placeholder/i.test(url)) continue;
    cands.push({ url: absoluto(url), alt: decode(at("alt") || at("title") || "") });
  }
  const og = src.match(/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] || src.match(/<meta\b[^>]*content="([^"]+)"[^>]*property="og:image"/i)?.[1];
  const comData = cands.find((c) => c.url && (c.url.includes(compacto) || c.url.includes(dia) || c.url.includes(dia.replace(/-/g, "/"))));
  const n = norm(nome).split(" ").filter((w) => w.length > 2);
  const comNome = cands.find((c) => c.alt && n.length && n.every((w) => norm(c.alt).includes(w)));
  const escolhida = comData?.url || comNome?.url || (og && !/logo|default|share/i.test(og) ? absoluto(og) : null);
  // a página diz que data mostra? se disser outra, a imagem não é deste dia
  const escrita = dataEm(src.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  if (escrita && escrita !== dia) return null;
  return escolhida;
}

export function createCapas({ log = () => {}, broadcast = () => {} } = {}) {
  let capas = [];
  try { capas = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { capas = []; }
  // arquivo da semana: uma entrada por jornal e por dia
  let semana = [];
  try { semana = JSON.parse(fs.readFileSync(FICHEIRO_SEMANA, "utf8")); } catch { semana = []; }
  const estado = { at: null, erro: null, total: capas.length, amostra: null, semana: { at: null, dias: 0, capas: 0, pedidos: 0, falhas: 0 } };
  const cache = new Map(); // «id|dia» → { url, tipo, buf, at }

  const gravar = () => {
    try {
      fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true });
      fs.writeFileSync(FICHEIRO, JSON.stringify(capas));
      fs.writeFileSync(FICHEIRO_SEMANA, JSON.stringify(semana));
    } catch { /* só em memória */ }
  };
  const podar = () => {
    const limite = diaMenos(diaLisboa(), DIAS - 1);
    semana = semana.filter((c) => c.dia >= limite);
  };
  // guarda uma capa no arquivo; devolve true se for nova ou tiver mudado
  const arquivar = (c, dia, via) => {
    if (!c.img || !dia) return false;
    const i = semana.findIndex((x) => x.id === c.id && x.dia === dia);
    // a mesma imagem já arquivada noutro dia: a data da página datada vale mais do que a da lista
    // (que é só o dia em que o servidor a viu); fora disso, fica a data que já estava
    const outro = semana.find((x) => x.id === c.id && x.dia !== dia && x.img === c.img);
    if (outro) {
      if (!(via === "pagina" && outro.via === "lista")) return false;
      semana = semana.filter((x) => x !== outro);
    }
    const novo = { id: c.id, nome: c.nome, pais: c.pais || paisDe(c.nome), img: c.img, pagina: baseJornal(c.pagina), dia, via, desde: i >= 0 && semana[i].img === c.img ? semana[i].desde : Date.now() };
    if (i >= 0) {
      if (semana[i].img === c.img) return false;
      semana[i] = novo;
    } else semana.push(novo);
    return true;
  };
  // dia de uma capa da lista: o do arquivo para a mesma imagem manda (pode ter sido corrigido pela página datada)
  const diaDe = (c) => semana.find((x) => x.id === c.id && x.img === c.img)?.dia || c.dia || c.data || (c.desde ? diaLisboa(c.desde) : null);

  async function ler() {
    let novas = [];
    let erro = null;
    for (const pag of PAGINAS) {
      try {
        const res = await fetch(pag, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-PT,pt;q=0.9" }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`o SAPO respondeu ${res.status} (${pag})`);
        const html = await res.text();
        baseLida = res.url || pag;
        novas = lerCapas(html);
        baseLida = PAGINA;
        if (novas.length) break;
        estado.amostra = html.replace(/\s+/g, " ").slice(0, 1500); // para ver no /api/capas/estado o que a página trouxe
        erro = new Error(`não encontrei capas em ${pag} (o SAPO pode ter mudado o formato)`);
      } catch (e) { erro = e; }
    }
    if (!novas.length) throw erro || new Error("sem capas no SAPO");
    const agora = Date.now();
    const antes = new Map(capas.map((c) => [c.id, c]));
    const hoje = diaLisboa(agora);
    let mudou = false;
    capas = novas.map((c) => {
      const a = antes.get(c.id);
      // «desde»: quando esta imagem apareceu; muda quando o jornal publica a capa do dia seguinte
      const desde = a && a.img === c.img ? a.desde : agora;
      if (!a || a.img !== c.img) mudou = true;
      // dia da capa: o que a página indica; senão, o que já estava no arquivo para esta imagem; senão, o dia em que apareceu
      const arquivada = semana.find((x) => x.id === c.id && x.img === c.img);
      const dia = c.data || arquivada?.dia || diaLisboa(desde);
      return { ...c, desde, visto: agora, dia };
    });
    // as capas de hoje que vieram do Kiosko ficam, a não ser que o SAPO já traga o mesmo jornal
    for (const k of semana) {
      if (k.via !== "kiosko" || k.dia !== hoje) continue;
      const re = KIOSKO.find((x) => slug(x[0]) === k.id)?.[3];
      if (!capas.some((c) => c.id === k.id || (re && re.test(norm(c.nome))))) capas.push({ ...k, data: k.dia, visto: agora });
    }
    for (const c of capas) if (c.via !== "kiosko" && c.dia >= diaMenos(hoje, DIAS - 1) && arquivar(c, c.dia, "lista")) mudou = true;
    podar();
    for (const k of cache.keys()) if (!semana.some((x) => `${x.id}|${x.dia}` === k) && !capas.some((x) => x.id === k)) cache.delete(k);
    Object.assign(estado, { at: agora, erro: null, total: capas.length, amostra: null });
    gravar();
    if (mudou) broadcast("capas", { at: agora });
  }

  // completa a semana: para cada jornal e cada dia em falta, lê a página datada do jornal no SAPO
  let aCompletar = false;
  async function completarSemana() {
    if (aCompletar || !capas.length) return;
    aCompletar = true;
    const hoje = diaLisboa();
    let novas = 0;
    try {
      for (let n = 0; n < DIAS; n++) {
        const dia = diaMenos(hoje, n);
        for (const c of capas) {
          if (semana.some((x) => x.id === c.id && x.dia === dia)) continue;
          if (c.via === "kiosko") continue;
          const base = baseJornal(c.pagina);
          if (!base || base === baseJornal(PAGINA)) continue;
          estado.semana.pedidos++;
          try {
            const r = await fetch(`${base}/${dia.replace(/-/g, "")}`, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-PT,pt;q=0.9" }, redirect: "follow" });
            // a página redirecionou para outro dia (ou para a capa atual): não serve
            if (!r.ok || (r.redirected && !r.url.includes(dia.replace(/-/g, "")))) { estado.semana.falhas++; await sleep(800); continue; }
            const img = imagemDaPagina(await r.text(), c.nome, dia);
            if (img && arquivar({ ...c, img }, dia, "pagina")) novas++;
          } catch { estado.semana.falhas++; }
          await sleep(1200); // um pedido de cada vez, com calma
        }
      }
    } finally {
      aCompletar = false;
      podar();
      Object.assign(estado.semana, { at: Date.now(), dias: new Set(semana.map((x) => x.dia)).size, capas: semana.length });
      gravar();
      if (novas) { log(`[Capas] semana: mais ${novas} capas de dias anteriores`); broadcast("capas", { at: Date.now() }); }
    }
  }

  // Kiosko.net: para cada dia da semana, os jornais que ainda não têm capa nesse dia
  const kiosko = new Map(); // «id|dia» → { id, dia, re, capa }
  const kioskoFalhas = new Map(); // «id|dia» → quando falhou (volta a tentar passada uma hora)
  async function existeImagem(url) {
    const h = { "User-Agent": UA, Referer: KIOSKO_REF, Accept: "image/*" };
    try {
      let r = await fetch(url, { method: "HEAD", headers: h, signal: AbortSignal.timeout(10000) });
      if (r.status === 405 || r.status === 501) r = await fetch(url, { headers: { ...h, Range: "bytes=0-1023" }, signal: AbortSignal.timeout(10000) });
      const tipo = r.headers.get("content-type") || "";
      const tam = Number(r.headers.get("content-length") || 0);
      return r.ok && /image/i.test(tipo) && (!tam || tam > 8000 || r.status === 206);
    } catch { return false; }
  }
  let aKiosko = false;
  async function completarKiosko() {
    if (aKiosko) return;
    aKiosko = true;
    const hoje = diaLisboa();
    let novas = 0;
    try {
      for (let n = 0; n < DIAS; n++) {
        const dia = diaMenos(hoje, n);
        for (const [nome, cc, nomes, re] of KIOSKO) {
          const id = slug(nome);
          const chave = `${id}|${dia}`;
          if (kiosko.has(chave)) continue;
          // já há capa deste jornal neste dia (vinda do SAPO)?
          const tem = (l) => l.some((c) => (c.dia || c.data) === dia && (c.id === id || re.test(norm(c.nome))));
          if (tem(semana) || (dia === hoje && tem(capas))) continue;
          if (Date.now() - (kioskoFalhas.get(chave) || 0) < 3600e3) continue;
          let url = null;
          for (const k of nomes) {
            const u = `https://img.kiosko.net/${dia.replace(/-/g, "/")}/${cc}/${k}.750.jpg`;
            if (await existeImagem(u)) { url = u; break; }
            await sleep(250);
          }
          if (!url) { kioskoFalhas.set(chave, Date.now()); continue; }
          const agora = Date.now();
          const capa = { id, nome, pais: paisDe(nome), img: url, pagina: `https://www.kiosko.net/${cc}/`, data: dia, dia, desde: agora, visto: agora, via: "kiosko" };
          kiosko.set(chave, { id, dia, re, capa });
          if (dia === hoje) { capas = capas.filter((c) => c.id !== id); capas.push(capa); }
          if (arquivar(capa, dia, "kiosko")) novas++;
          await sleep(250);
        }
      }
    } finally {
      aKiosko = false;
      for (const k of [...kiosko.keys()]) if (k.split("|")[1] < diaMenos(hoje, DIAS - 1)) kiosko.delete(k);
      estado.kiosko = { at: Date.now(), capas: kiosko.size };
      if (novas) {
        podar();
        gravar();
        log(`[Capas] Kiosko: mais ${novas} capas`);
        broadcast("capas", { at: Date.now() });
      }
    }
  }

  async function start() {
    let ultimoCompletar = 0;
    for (;;) {
      try { await ler(); } catch (e) { estado.erro = e.message; log(`[Capas] ${e.message}`); }
      // o que o SAPO não trouxe (ou tudo, se o SAPO falhar) vem do Kiosko
      completarKiosko().catch((e) => log(`[Capas] Kiosko: ${e.message}`));
      // a semana completa-se no arranque e depois de seis em seis horas (e logo que muda o dia)
      const diaAgora = diaLisboa();
      if (Date.now() - ultimoCompletar > 6 * 3600e3 || diaLisboa(ultimoCompletar) !== diaAgora) {
        ultimoCompletar = Date.now();
        completarSemana().catch((e) => log(`[Capas] semana: ${e.message}`));
      }
      const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(new Date()));
      await sleep((hora < 9 ? 5 : 20) * 60e3);
    }
  }

  // imagem da capa, pedida pelo servidor e guardada em memória enquanto for a mesma;
  // com «dia», é a capa desse dia no arquivo da semana
  async function imagem(id, dia = null) {
    const c = dia ? semana.find((x) => x.id === id && x.dia === dia) || (capas.find((x) => x.id === id && x.dia === dia)) : capas.find((x) => x.id === id);
    if (!c?.img) return null;
    const chave = dia ? `${id}|${dia}` : id;
    const em = cache.get(chave);
    if (em && em.url === c.img) return em;
    const r = await fetch(c.img, { headers: { "User-Agent": UA, Referer: /kiosko\.net/i.test(c.img) ? KIOSKO_REF : PAGINA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`imagem respondeu ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const novo = { url: c.img, tipo: r.headers.get("content-type") || "image/jpeg", buf, at: Date.now() };
    cache.set(chave, novo);
    if (cache.size > 400) cache.delete(cache.keys().next().value); // memória limitada
    return novo;
  }

  // capas de hoje (só as que são mesmo de hoje) e arquivo da semana, do dia mais recente para o mais antigo
  const hoje = () => { const d = diaLisboa(); return capas.filter((c) => diaDe(c) === d).map((c) => ({ ...c, dia: d })); };
  const daSemana = () => {
    const porChave = new Map(semana.map((c) => [`${c.id}|${c.dia}`, c]));
    for (const c of capas) {
      const d = diaDe(c);
      if (d && !porChave.has(`${c.id}|${d}`) && ![...porChave.values()].some((x) => x.id === c.id && x.img === c.img)) porChave.set(`${c.id}|${d}`, { ...c, dia: d });
    }
    const limite = diaMenos(diaLisboa(), DIAS - 1);
    return [...porChave.values()].filter((c) => c.dia >= limite).sort((a, b) => b.dia.localeCompare(a.dia));
  };

  return { start, all: () => capas, hoje, semana: daSemana, imagem, estado: () => ({ ...estado, arquivo: semana.length }) };
}
