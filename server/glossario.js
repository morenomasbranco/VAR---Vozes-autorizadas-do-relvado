// Glossário: sinónimos e antónimos de uma palavra, procurados na internet quando o glossário do site (web/src/glossario)
// não tem a palavra. Primeiro no sinonimos.com.br e no antonimos.com.br (gratuitos, português do Brasil), onde cada
// sentido da palavra é uma lista de palavras separadas por vírgulas; quando não dão nada (ou não respondem a tempo),
// no Wikcionário em português (API da Wikimedia, gratuita).
// A página dos sites lê-se à medida que chega: em produção chega devagar, e as listas vêm logo no início.
// As respostas ficam guardadas uma semana, para não se pedir a mesma palavra duas vezes.

const SITES = {
  sinonimos: (slug) => `https://www.sinonimos.com.br/${slug}/`,
  antonimos: (slug) => `https://www.antonimos.com.br/${slug}/`,
};
const GUARDA_MS = 7 * 24 * 3600e3;
const MAX_GUARDADAS = 2000;
const PRAZO_MS = 8000;

const semAcentos = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// o endereço da palavra nesses sites: sem acentos, em minúsculas e com hífens no lugar dos espaços
export const slugDe = (p) => semAcentos(p).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// só palavras (letras, hífens, apóstrofos e espaços), até 40 caracteres
export const palavraValida = (p) => /^[\p{L}][\p{L}' -]{0,39}$/u.test(String(p || "").trim());

// as letras acentuadas escritas como entidades («&ecirc;» → «ê»)
const MARCAS = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327" };
const ENTIDADES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
const texto = (html) => String(html)
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-zA-Z])(acute|grave|circ|tilde|uml|cedil);/g, (m, l, k) => (l + MARCAS[k]).normalize("NFC"))
  .replace(/&(\w+);/g, (m, n) => ENTIDADES[n] ?? m)
  .replace(/\s+/g, " ")
  .trim();

// lê a página: uma lista por sentido, com o título do sentido («Qualquer tipo de conquista ou triunfo») quando o há.
// Cada sentido é um <div class="content-detail--subtitle"> seguido de <p class="syn-list"> (ou "ant-list" nos
// antónimos), com o número do sentido num <em> e as palavras separadas por vírgulas.
const LISTA = { sinonimos: "(?:syn-list|sinonimos)", antonimos: "(?:ant-list|antonimos)" };
export function lerPagina(html, tipo) {
  const sentidos = [];
  const re = new RegExp(`(?:<div[^>]*class="[^"]*(?:subtitle|sentido)[^"]*"[^>]*>([\\s\\S]*?)</div>\\s*)?<p[^>]*class="[^"]*\\b${LISTA[tipo]}\\b[^"]*"[^>]*>([\\s\\S]*?)</p>`, "gi");
  for (const m of String(html || "").matchAll(re)) {
    const palavras = texto(m[2].replace(/<em[^>]*>[\s\S]*?<\/em>/gi, "")).replace(/\.$/, "").split(/\s*,\s*/).map((p) => p.trim()).filter((p) => p && p.length <= 60);
    if (palavras.length) sentidos.push({ sentido: m[1] ? texto(m[1]).replace(/:$/, "") : null, palavras: [...new Set(palavras)] });
  }
  return sentidos;
}

// o Wikcionário: as listas das secções de sinónimos (ou antónimos) da parte em português da página
const WIKI = (p) => `https://pt.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(p)}`;
const TITULO_WIKI = { sinonimos: /-sin-|sin[oóô]nimo/i, antonimos: /-ant-|ant[oóô]nimo/i };
export function lerWiki(wikitext, tipo) {
  let t = String(wikitext || "");
  // só a parte em português (= {{-pt-}} =), até à língua seguinte
  const pt = t.search(/^=\s*\{\{-pt-\}\}\s*=\s*$/m);
  if (pt >= 0) {
    t = t.slice(pt);
    const outra = t.slice(1).search(/^=\s*\{\{-[a-z-]+-\}\}\s*=\s*$/m);
    if (outra >= 0) t = t.slice(0, outra + 1);
  }
  const palavras = [];
  let dentro = false;
  for (const linha of t.split("\n")) {
    const h = linha.match(/^(=+)\s*(.*?)\s*\1\s*$/);
    if (h) { dentro = TITULO_WIKI[tipo].test(h[2]); continue; }
    if (!dentro) continue;
    for (const m of linha.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const p = m[1].trim();
      if (p && !p.includes(":") && p.length <= 60) palavras.push(p);
    }
  }
  const unicas = [...new Set(palavras)];
  return unicas.length ? [{ sentido: null, palavras: unicas }] : [];
}

// prazo a sério: em produção, um pedido pendurado nem sempre respeita o sinal de abort (como no YouTube)
function comPrazo(promessa, ms, msg) {
  let t;
  return Promise.race([promessa, new Promise((_, rejeitar) => { t = setTimeout(() => rejeitar(new Error(msg)), ms); })]).finally(() => clearTimeout(t));
}

// lê o corpo da resposta à medida que chega, até ao fim da parte que interessa (ou até ao prazo): se a página
// parar a meio, fica o que já chegou
const INICIO_LISTAS = /class="[^"]*\b(?:syn-list|ant-list)\b/i;
const FIM_LISTAS = /content-reviewer|<footer/i;
async function lerCorpo(res, prazo) {
  const leitor = res.body?.getReader?.();
  if (!leitor) return { html: await comPrazo(res.text(), prazo, "a página não chegou a tempo"), completo: true };
  const dec = new TextDecoder();
  const limite = Date.now() + prazo;
  let html = "";
  try {
    for (;;) {
      const falta = limite - Date.now();
      const r = falta > 0 ? await comPrazo(leitor.read(), falta, "prazo").catch(() => null) : null;
      if (!r) return { html, completo: false };
      if (r.done) return { html: html + dec.decode(), completo: true };
      html += dec.decode(r.value, { stream: true });
      // o fim só conta depois da primeira lista (o CSS do cabeçalho também fala de «content-reviewer»)
      const i = html.search(INICIO_LISTAS);
      if ((i >= 0 && FIM_LISTAS.test(html.slice(i))) || html.length > 2e6) return { html, completo: true };
    }
  } finally {
    leitor.cancel().catch(() => {});
  }
}

export function createGlossario({ pedir = fetch, agora = () => Date.now(), prazo = PRAZO_MS } = {}) {
  const guardadas = new Map();
  const estado = { pedidos: 0, erros: 0, ultimoErro: null, ultimoOk: null, fontes: {} };
  const daFonte = (host) => (estado.fontes[host] ||= { ok: 0, vazias: 0, erros: 0, ultimo: null });
  const CABECALHOS = { "User-Agent": "Mozilla/5.0 (VAR glossário)", "Accept-Language": "pt-PT,pt;q=0.9" };

  // um pedido com prazo; anota em estado.fontes o que aconteceu
  async function pedirCom(url, ler) {
    const host = new URL(url).hostname;
    const f = daFonte(host);
    const ctl = new AbortController();
    const inicio = agora();
    try {
      const res = await comPrazo(pedir(url, { headers: CABECALHOS, signal: ctl.signal }), prazo, `${host}: sem resposta em ${prazo / 1000} s`);
      const r = await ler(res);
      f[r.sentidos.length ? "ok" : "vazias"]++;
      f.ultimo = { ms: agora() - inicio, sentidos: r.sentidos.length, ...(r.info || {}), ts: agora() };
      return { sentidos: r.sentidos, fonte: host };
    } catch (e) {
      ctl.abort();
      f.erros++;
      f.ultimo = { erro: e.message, causa: e.cause?.code || e.cause?.message || null, ms: agora() - inicio, ts: agora() };
      throw e;
    }
  }

  const doSite = (tipo, slug) => pedirCom(SITES[tipo](slug), async (res) => {
    if (res.status === 404) return { sentidos: [] };
    if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
    const { html, completo } = await lerCorpo(res, prazo);
    const sentidos = lerPagina(html, tipo);
    if (!sentidos.length && !completo) throw new Error(`a página não chegou em ${prazo / 1000} s (${html.length} caracteres)`);
    return { sentidos, info: { caracteres: html.length, completo } };
  });

  const daWiki = (palavra, tipo) => pedirCom(WIKI(palavra.trim().toLowerCase()), async (res) => {
    if (!res.ok) throw new Error(`o Wikcionário respondeu ${res.status}`);
    const j = await comPrazo(res.json(), prazo, "o Wikcionário não respondeu a tempo");
    return { sentidos: j?.parse?.wikitext ? lerWiki(j.parse.wikitext, tipo) : [] };
  });

  async function procurar(palavra, tipo = "sinonimos") {
    if (!SITES[tipo]) throw Object.assign(new Error("tipo desconhecido"), { status: 400 });
    if (!palavraValida(palavra)) throw Object.assign(new Error("palavra inválida"), { status: 400 });
    const slug = slugDe(palavra);
    const chave = `${tipo}|${slug}`;
    const g = guardadas.get(chave);
    if (g && agora() - g.ts < GUARDA_MS) return g.dados;
    estado.pedidos++;
    let achado = null, erro = null;
    try { achado = await doSite(tipo, slug); } catch (e) { erro = e; }
    if (!achado?.sentidos.length) {
      try { const w = await daWiki(palavra, tipo); if (w.sentidos.length || !achado) achado = w; } catch (e) { erro ||= e; }
    }
    if (!achado) {
      estado.erros++;
      estado.ultimoErro = { palavra, tipo, erro: erro?.message, ts: agora() };
      throw erro || new Error("sem resposta");
    }
    const dados = { palavra, tipo, ...achado };
    guardar(chave, dados);
    estado.ultimoOk = { palavra, tipo, fonte: achado.fonte, ts: agora() };
    return dados;
  }

  function guardar(chave, dados) {
    if (guardadas.size >= MAX_GUARDADAS) guardadas.delete(guardadas.keys().next().value);
    guardadas.set(chave, { ts: agora(), dados });
  }

  return { procurar, estado: () => ({ ...estado, guardadas: guardadas.size }) };
}
