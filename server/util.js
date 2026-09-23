export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
// janela da recolha inicial: no arranque só entram posts das últimas horas
export const BACKFILL_MS = (Number(process.env.RECOLHA_INICIAL_HORAS) || 12) * 3600e3;
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Texto de uma resposta HTTP na codificação certa. O fetch lê tudo como UTF-8, e há feeds e páginas em
// ISO-8859-1/Windows-1252 (zerozero e outros sites portugueses mais antigos) — era daí que vinham os «�» e os «Ã©».
// A codificação vem do cabeçalho Content-Type, da declaração XML ou da meta charset; sem nenhuma, experimenta
// UTF-8 e, se aparecerem caracteres inválidos, passa para Windows-1252.
const ALIAS = { "iso-8859-1": "windows-1252", latin1: "windows-1252", "iso8859-1": "windows-1252", "us-ascii": "utf-8", ascii: "utf-8" };
const descodifica = (buf, cs) => { try { return new TextDecoder(ALIAS[cs] || cs).decode(buf); } catch { return null; } };
export async function lerTexto(res) {
  const buf = new Uint8Array(await res.arrayBuffer());
  const cab = (res.headers.get("content-type") || "").match(/charset=["']?([\w-]+)/i)?.[1];
  const inicio = new TextDecoder("latin1").decode(buf.slice(0, 2048));
  const doc = inicio.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i)?.[1] || inicio.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const cs = (doc || cab || "").toLowerCase();
  if (cs && !/^utf-?8$/.test(cs)) {
    const t = descodifica(buf, cs);
    if (t != null) return conserta(t);
  }
  const utf = new TextDecoder("utf-8").decode(buf);
  if (!cs && (utf.match(/\uFFFD/g) || []).length > 2) return conserta(new TextDecoder("windows-1252").decode(buf));
  return conserta(utf);
}

// Texto já estragado (UTF-8 lido como Latin-1, «NotÃ­cia», «SÃ£o», «â€“»): volta a pô-lo direito.
// Só troca quando o resultado fica sem caracteres inválidos e com menos sinais de estrago do que o original.
const ESTRAGO = /Ã[\u0080-\u00BF]|Ã[ ¡-ÿ]|Â[\u00A0-\u00BF]|â€[\u0080-\u00BF™œ”“˜¦¢]/g;
export function conserta(s) {
  if (typeof s !== "string" || !ESTRAGO.test(s)) return s;
  ESTRAGO.lastIndex = 0;
  const antes = (s.match(ESTRAGO) || []).length;
  // os bytes do Windows-1252 (€, ™, “…) voltam ao byte original antes de se reler como UTF-8
  const CP = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 256) bytes.push(c);
    else if (CP[ch] != null) bytes.push(CP[ch]);
    else return s; // há caracteres que não vieram de uma leitura em Latin-1: não se mexe
  }
  const novo = new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
  if (novo.includes("\uFFFD")) return s;
  const depois = (novo.match(ESTRAGO) || []).length;
  return depois < antes ? novo : s;
}

// entidades HTML, incluindo as duplamente escapadas («&amp;eacute;») que alguns feeds trazem
const ENTIDADES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", bull: "•", middot: "·", deg: "°", ordm: "º", ordf: "ª",
  euro: "€", pound: "£", copy: "©", reg: "®", trade: "™", times: "×", iexcl: "¡", iquest: "¿", shy: "", zwj: "", zwnj: "",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", iacute: "í", igrave: "ì", icirc: "î", iuml: "ï", ntilde: "ñ",
  oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø", uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
  yacute: "ý", yuml: "ÿ", szlig: "ß", scaron: "š", zcaron: "ž", ccaron: "č",
  Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ", Ccedil: "Ç",
  Eacute: "É", Egrave: "È", Ecirc: "Ê", Euml: "Ë", Iacute: "Í", Igrave: "Ì", Icirc: "Î", Iuml: "Ï", Ntilde: "Ñ",
  Oacute: "Ó", Ograve: "Ò", Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø", Uacute: "Ú", Ugrave: "Ù", Ucirc: "Û", Uuml: "Ü", Scaron: "Š", Zcaron: "Ž", Ccaron: "Č",
};
const ponto = (n) => { try { return String.fromCodePoint(n); } catch { return ""; } };
export function entidades(t) {
  let s = String(t ?? "");
  for (let i = 0; i < 2 && /&(#\d+|#x[0-9a-f]+|[a-z]+\d?);/i.test(s); i++) {
    s = s.replace(/&#(\d+);/g, (_, n) => ponto(+n))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => ponto(parseInt(n, 16)))
      .replace(/&([A-Za-z]+\d?);/g, (m, n) => ENTIDADES[n] ?? m);
  }
  return s;
}
