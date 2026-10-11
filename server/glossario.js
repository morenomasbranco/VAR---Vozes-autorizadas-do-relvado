// Glossário: sinónimos e antónimos de uma palavra, procurados na internet quando o glossário do site (web/src/glossario)
// não tem a palavra. As páginas vêm do sinonimos.com.br e do antonimos.com.br (gratuitos, português do Brasil):
// cada sentido da palavra é um bloco <p class="sinonimos"> (ou "antonimos") com as palavras separadas por vírgulas.
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

// lê a página: uma lista por sentido, com o título do sentido («Sentido de vencer:») quando o há
export function lerPagina(html, tipo) {
  const sentidos = [];
  const re = new RegExp(`(?:<div[^>]*class="[^"]*sentido[^"]*"[^>]*>([\\s\\S]*?)</div>\\s*)?<p[^>]*class="[^"]*\\b${tipo}\\b[^"]*"[^>]*>([\\s\\S]*?)</p>`, "gi");
  for (const m of String(html || "").matchAll(re)) {
    const palavras = texto(m[2]).replace(/\.$/, "").split(/\s*,\s*/).map((p) => p.trim()).filter((p) => p && p.length <= 60);
    if (palavras.length) sentidos.push({ sentido: m[1] ? texto(m[1]).replace(/:$/, "") : null, palavras: [...new Set(palavras)] });
  }
  return sentidos;
}

export function createGlossario({ pedir = fetch, agora = () => Date.now() } = {}) {
  const guardadas = new Map();
  const estado = { pedidos: 0, erros: 0, ultimoErro: null };

  async function procurar(palavra, tipo = "sinonimos") {
    if (!SITES[tipo]) throw Object.assign(new Error("tipo desconhecido"), { status: 400 });
    if (!palavraValida(palavra)) throw Object.assign(new Error("palavra inválida"), { status: 400 });
    const slug = slugDe(palavra);
    const chave = `${tipo}|${slug}`;
    const g = guardadas.get(chave);
    if (g && agora() - g.ts < GUARDA_MS) return g.dados;
    estado.pedidos++;
    try {
      const res = await pedir(SITES[tipo](slug), {
        headers: { "User-Agent": "Mozilla/5.0 (VAR glossário)", "Accept-Language": "pt-PT,pt;q=0.9" },
        signal: AbortSignal.timeout(PRAZO_MS),
      });
      if (res.status === 404) {
        const dados = { palavra, tipo, sentidos: [], fonte: new URL(SITES[tipo](slug)).hostname };
        guardar(chave, dados);
        return dados;
      }
      if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
      const dados = { palavra, tipo, sentidos: lerPagina(await res.text(), tipo), fonte: new URL(SITES[tipo](slug)).hostname };
      guardar(chave, dados);
      return dados;
    } catch (e) {
      estado.erros++;
      estado.ultimoErro = { palavra, tipo, erro: e.message, ts: agora() };
      throw e;
    }
  }

  function guardar(chave, dados) {
    if (guardadas.size >= MAX_GUARDADAS) guardadas.delete(guardadas.keys().next().value);
    guardadas.set(chave, { ts: agora(), dados });
  }

  return { procurar, estado: () => ({ ...estado, guardadas: guardadas.size }) };
}
