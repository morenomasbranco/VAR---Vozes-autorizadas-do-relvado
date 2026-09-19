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
// Fonte principal: o VerCapas (vercapas.com), que publica todos os dias as capas dos desportivos com um
// endereço fixo por jornal (…/capa/a-bola.html) e por dia (…/capa/arquivo/a-bola/2026-09-16.html), e a
// imagem com a data no nome (imgs.vercapas.com/covers/a-bola/2026/a-bola-2026-09-16-<código>.jpg).
// O SAPO e o Kiosko ficam como complemento, para os jornais que o VerCapas não tenha.
const VERCAPAS = [
  ["a-bola", "A Bola", /^a ?bola\b/],
  ["record", "Record", /^(jornal )?record\b/],
  ["o-jogo", "O Jogo", /^o ?jogo\b/],
  ["jornal-marca", "Marca", /^(jornal )?marca\b/],
  ["jornal-as", "AS", /^(jornal )?as$/],
  ["mundo-deportivo", "Mundo Deportivo", /^(el )?mundo deportivo/],
  ["lequipe", "L'Équipe", /equipe/],
  ["tuttosport", "Tuttosport", /^tuttosport/],
];
const VERCAPAS_BASE = "https://www.vercapas.com";
const VERCAPAS_REF = "https://www.vercapas.com/";
// Além da lista fixa, o servidor lê as categorias de desporto do VerCapas e do VerPortadas (o site irmão
// espanhol: Marca, AS, Sport, Mundo Deportivo, Superdeporte, L'Esportiu) e acrescenta todas as publicações
// de desporto que tenham capa na última semana — diárias, semanários de clube, revistas.
const VERCAPAS_DESPORTO = "https://www.vercapas.com/capas-de-jornais-e-revistas/desporto/";
const VERPORTADAS_BASE = "https://www.verportadas.es";
const VERPORTADAS_DESPORTO = "https://www.verportadas.es/prensa-deportiva/";
const NOMES_VC = { "jornal-as": "AS", "jornal-marca": "Marca", as: "AS" }; // nomes limpos para juntar com as outras fontes
// nome → expressão que reconhece o mesmo jornal noutra fonte (SAPO, Kiosko), pelo id normalizado
const RE_JORNAL = new Map([...KIOSKO.map(([n, , , re]) => [slug(n), re]), ...VERCAPAS.map(([, n, re]) => [slug(n), re]), ["sport", /^sport$/]]);
const mesmoJornal = (a, b) => a.id === b.id || !!RE_JORNAL.get(a.id)?.test(norm(b.nome)) || !!RE_JORNAL.get(b.id)?.test(norm(a.nome));
const PRIO = (c) => (c.via === "vercapas" ? 3 : c.via === "kiosko" ? 1 : 2); // VerCapas > SAPO > Kiosko
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
    const novo = { id: c.id, nome: c.nome, pais: c.pais || paisDe(c.nome), img: c.img, pagina: via === "vercapas" ? c.pagina : baseJornal(c.pagina), dia, via, desde: i >= 0 && semana[i].img === c.img ? semana[i].desde : Date.now() };
    if (i >= 0) {
      if (PRIO(semana[i]) > PRIO(novo)) return false; // a capa do VerCapas não é trocada pela de outra fonte
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
    // sem capas no SAPO: fica o que já havia, e o VerCapas e o Kiosko continuam a completar
    const erroSapo = novas.length ? null : (erro || new Error("sem capas no SAPO")).message;
    const agora = Date.now();
    const antes = new Map(capas.map((c) => [c.id, c]));
    const hoje = diaLisboa(agora);
    let mudou = false;
    if (novas.length) capas = novas.map((c) => {
      const a = antes.get(c.id);
      // «desde»: quando esta imagem apareceu; muda quando o jornal publica a capa do dia seguinte
      const desde = a && a.img === c.img ? a.desde : agora;
      if (!a || a.img !== c.img) mudou = true;
      // dia da capa: o que a página indica; senão, o que já estava no arquivo para esta imagem; senão, o dia em que apareceu
      const arquivada = semana.find((x) => x.id === c.id && x.img === c.img);
      const dia = c.data || arquivada?.dia || diaLisboa(desde);
      return { ...c, desde, visto: agora, dia };
    });
    if (sobrepor()) mudou = true;
    for (const c of capas) if (!c.via && c.dia >= diaMenos(hoje, DIAS - 1) && arquivar(c, c.dia, "lista")) mudou = true;
    podar();
    for (const k of cache.keys()) if (!semana.some((x) => `${x.id}|${x.dia}` === k) && !capas.some((x) => x.id === k)) cache.delete(k);
    Object.assign(estado, { at: agora, erro: erroSapo, total: capas.length });
    if (!erroSapo) estado.amostra = null;
    gravar();
    if (mudou) broadcast("capas", { at: agora });
  }

  // capas de hoje do VerCapas e do Kiosko entram na lista do dia; cada jornal fica com a da fonte mais fiável
  function sobrepor() {
    const hoje = diaLisboa();
    let mudou = false;
    for (const k of semana) {
      if (k.dia !== hoje || (k.via !== "vercapas" && k.via !== "kiosko")) continue;
      const i = capas.findIndex((c) => mesmoJornal(c, k));
      const nova = { ...k, data: k.dia, visto: Date.now() };
      if (i < 0) { capas.push(nova); mudou = true; }
      else if (capas[i].img !== k.img && (capas[i].dia !== hoje || PRIO(k) > PRIO(capas[i]))) { capas[i] = nova; mudou = true; }
    }
    return mudou;
  }

  // VerCapas: a capa de hoje (página do jornal) e a dos dias anteriores (página datada do arquivo)
  const vercapasFalhas = new Map(); // «site:slug|dia» → quando falhou (volta a ser tentado passada uma hora)
  const pedir = async (url) => {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-PT,pt;q=0.9,es;q=0.8" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`respondeu ${r.status} (${url})`);
    return r.text();
  };
  const ogImage = (html) => html.match(/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] || html.match(/<meta\b[^>]*content="([^"]+)"[^>]*property="og:image"/i)?.[1] || "";

  // VerCapas: imagem da capa de um dia, na página datada do arquivo
  async function imagemVercapas(vslug, dia) {
    const url = `${VERCAPAS_BASE}/capa/arquivo/${vslug}/${dia}.html`;
    const html = await pedir(url);
    const esc = vslug.replace(/[-]/g, "\\-");
    const re = new RegExp(`https?://imgs\\.vercapas\\.com/(?:thumbc/\\d+/)?covers/${esc}/\\d{4}/${esc}-(\\d{4}-\\d{2}-\\d{2})-[0-9a-z]+\\.(?:jpe?g|png|webp)`, "i");
    // a imagem de partilha (og:image) é a capa desta página; se não servir, a imagem com o nome do jornal
    const m = ogImage(html).match(/https?:\/\/imgs\.vercapas\.com\/(?:thumbc\/\d+\/)?covers\/[^/]+\/\d{4}\/[^/]+-(\d{4}-\d{2}-\d{2})-[0-9a-z]+\.(?:jpe?g|png|webp)/i) || html.match(re);
    if (!m || m[1] !== dia) return null; // a página datada mostra outro dia
    return { img: m[0].replace(/\/thumbc\/\d+\//, "/"), dia, pagina: url };
  }
  // VerCapas: os dias com capa de um jornal, na página de arquivo (…/arquivo/a-bola.html)
  async function diasVercapas(vslug) {
    const html = await pedir(`${VERCAPAS_BASE}/arquivo/${vslug}.html`);
    const re = new RegExp(`/capa/arquivo/${vslug.replace(/[-]/g, "\\-")}/(\\d{4}-\\d{2}-\\d{2})\\.html`, "gi");
    return [...new Set([...html.matchAll(re)].map((m) => m[1]))];
  }
  // VerPortadas: a capa atual de um jornal (a data vem no nome da imagem, em DDMMAAAA)
  async function imagemVerportadas(pslug) {
    const url = `${VERPORTADAS_BASE}/portada/${pslug}.html`;
    const html = await pedir(url);
    const src = ogImage(html) || html.match(/https?:\/\/cdn\.verportadas\.es\/covers\/[^"' ]+\.(?:jpe?g|png|webp)/i)?.[0] || "";
    const m = src.match(/-(\d{2})(\d{2})(20\d{2})-[0-9a-z]+\.(?:jpe?g|png|webp)/i);
    if (!m) return null;
    return { img: src.replace("/thumb/covers/", "/covers/"), dia: valida(`${m[3]}-${m[2]}-${m[1]}`), pagina: url };
  }

  // lista de jornais: a fixa e as categorias de desporto dos dois sites (relida de seis em seis horas)
  let jornais = VERCAPAS.map(([vslug, nome]) => ({ site: "vc", vslug, nome, ultimo: null }));
  let jornaisAt = 0;
  async function descobrir() {
    if (Date.now() - jornaisAt < 6 * 3600e3) return;
    jornaisAt = Date.now();
    const lista = new Map(VERCAPAS.map(([vslug, nome]) => [`vc:${vslug}`, { site: "vc", vslug, nome, ultimo: null }]));
    try {
      const html = await pedir(VERCAPAS_DESPORTO);
      for (const a of html.match(/<a\b[^>]*>/gi) || []) {
        const href = a.match(/href="([^"]+)"/i)?.[1] || "";
        const vslug = href.match(/\/capa\/([a-z0-9-]+)\.html$/i)?.[1];
        if (!vslug) continue;
        const titulo = decode(a.match(/title="([^"]+)"/i)?.[1] || "");
        const m = titulo.match(/^(.*?)\s*-\s*(\d{4}-\d{2}-\d{2})$/);
        const antigo = lista.get(`vc:${vslug}`);
        lista.set(`vc:${vslug}`, { site: "vc", vslug, nome: antigo?.nome || NOMES_VC[vslug] || (m ? m[1] : titulo) || vslug, ultimo: m ? m[2] : null });
      }
    } catch (e) { estado.vercapasErro = `categoria desporto: ${e.message}`; jornaisAt = Date.now() - 5.5 * 3600e3; }
    try {
      const html = await pedir(VERPORTADAS_DESPORTO);
      for (const m of html.matchAll(/href="(?:https?:\/\/www\.verportadas\.es)?\/portada\/([a-z0-9-]+)\.html"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const pslug = m[1];
        const nome = decode(m[2].match(/alt="(?:Portada (?:peri[oó]dico|revista) )?([^"]+)"/i)?.[1] || "") || pslug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
        if (!lista.has(`vp:${pslug}`)) lista.set(`vp:${pslug}`, { site: "vp", vslug: pslug, nome: nome.replace(/^As$/, "AS"), ultimo: null });
      }
    } catch (e) { estado.verportadasErro = `prensa deportiva: ${e.message}`; jornaisAt = Date.now() - 5.5 * 3600e3; }
    // publicações paradas há mais de uma semana (revistas que deixaram de sair) ficam de fora
    const limite = diaMenos(diaLisboa(), DIAS - 1);
    jornais = [...lista.values()].filter((j) => !j.ultimo || j.ultimo >= limite);
    estado.jornais = jornais.map((j) => `${j.nome} (${j.site === "vp" ? "VerPortadas" : "VerCapas"})`);
  }

  let aVercapas = false;
  async function completarVercapas() {
    if (aVercapas) return;
    aVercapas = true;
    const hoje = diaLisboa();
    const limite = diaMenos(hoje, DIAS - 1);
    let novas = 0;
    let falhas = 0;
    const guardar = (j, c) => {
      const nome = j.nome;
      const id = slug(nome);
      // cada jornal e cada dia só uma vez (o mesmo jornal pode estar nos dois sites)
      if (semana.some((x) => x.dia === c.dia && x.via === "vercapas" && mesmoJornal(x, { id, nome }))) return;
      const pais = paisDe(nome) !== "un" ? paisDe(nome) : j.site === "vp" ? "es" : "pt";
      const capa = { id, nome, pais, img: c.img, pagina: c.pagina, data: c.dia, dia: c.dia, desde: Date.now(), visto: Date.now(), via: "vercapas" };
      if (arquivar(capa, c.dia, "vercapas")) novas++;
    };
    try {
      await descobrir();
      for (const j of jornais) {
        const chave = `${j.site}:${j.vslug}`;
        try {
          if (j.site === "vp") {
            // VerPortadas: só a capa atual; os dias anteriores ficam no arquivo à medida que passam
            if (Date.now() - (vercapasFalhas.get(`${chave}|${hoje}`) || 0) < 20 * 60e3) continue;
            const c = await imagemVerportadas(j.vslug);
            if (c?.dia && c.dia >= limite) guardar(j, c); else vercapasFalhas.set(`${chave}|${hoje}`, Date.now());
          } else {
            // VerCapas: os dias da semana que o arquivo do jornal tem e que ainda faltam
            const dias = (await diasVercapas(j.vslug)).filter((d) => d >= limite && d <= hoje);
            for (const dia of dias) {
              const id = slug(j.nome);
              if (semana.some((x) => x.dia === dia && x.via === "vercapas" && mesmoJornal(x, { id, nome: j.nome }))) continue;
              if (Date.now() - (vercapasFalhas.get(`${chave}|${dia}`) || 0) < 3600e3) continue;
              const c = await imagemVercapas(j.vslug, dia);
              if (c) guardar(j, c); else vercapasFalhas.set(`${chave}|${dia}`, Date.now());
              await sleep(400);
            }
          }
        } catch (e) { falhas++; vercapasFalhas.set(`${chave}|${hoje}`, Date.now()); estado.vercapasErro = e.message; }
        await sleep(400);
      }
    } finally {
      aVercapas = false;
      for (const k of [...vercapasFalhas.keys()]) if (k.split("|")[1] < limite) vercapasFalhas.delete(k);
      estado.vercapas = { at: Date.now(), jornais: jornais.length, capas: semana.filter((x) => x.via === "vercapas").length, hoje: semana.filter((x) => x.via === "vercapas" && x.dia === hoje).length, falhas };
      if (novas) {
        sobrepor();
        podar();
        gravar();
        estado.total = capas.length;
        log(`[Capas] VerCapas/VerPortadas: mais ${novas} capas`);
        broadcast("capas", { at: Date.now() });
      }
    }
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
          if (c.via) continue; // só as capas do SAPO têm página datada no SAPO
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
      // VerCapas primeiro (fonte principal); o Kiosko só procura o que ainda faltar
      await completarVercapas().catch((e) => log(`[Capas] VerCapas: ${e.message}`));
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
    const r = await fetch(c.img, { headers: { "User-Agent": UA, Referer: /kiosko\.net/i.test(c.img) ? KIOSKO_REF : /vercapas\.com/i.test(c.img) ? VERCAPAS_REF : /verportadas\.es/i.test(c.img) ? `${VERPORTADAS_BASE}/` : PAGINA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(20000) });
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
    const lista = [...porChave.values()].filter((c) => c.dia >= limite).sort((a, b) => PRIO(b) - PRIO(a));
    const fica = [];
    for (const c of lista) if (!fica.some((x) => x.dia === c.dia && mesmoJornal(x, c))) fica.push(c);
    return fica.sort((a, b) => b.dia.localeCompare(a.dia));
  };

  return { start, all: () => capas, hoje, semana: daSemana, imagem, estado: () => ({ ...estado, arquivo: semana.length }) };
}
