// Leitura do texto de um story ou de um post de um clube (texto do OCR da imagem, ou legenda do post).
// O que os clubes escrevem é quase sempre uma combinação de: o momento do jogo (início, intervalo, 2.ª parte,
// final), um resultado («2-1»), o minuto («23'») e quem marcou. Este módulo não decide nada sobre o jogo: diz só
// o que o texto contém; quem decide é o motor de evidência (evidencia.js), que conhece o estado do jogo.
import { norm } from "../../util.js";

// o OCR troca letras por números e vice-versa nos sítios previsíveis: «O» por «0», «l» por «1», «S» por «5»
function arrumaOcr(t) {
  return String(t || "")
    .replace(/[“”«»"]/g, " ")
    .replace(/[‘’´`]/g, "'")
    .replace(/\b[oO]\s*([-–—:x])\s*(\d)/g, "0$1$2")
    .replace(/(\d)\s*([-–—:x])\s*[oO]\b/g, "$1$20")
    .replace(/\b[lI|]\s*([-–—])\s*(\d)/g, "1$1$2")
    .replace(/(\d)\s*([-–—])\s*[lI|]\b/g, "$1$21")
    .replace(/[ \t]+/g, " ");
}

const EVENTOS = [
  ["final", /\b(resultado final|fim (do|de) jogo|final do jogo|terminou|termina(do)?|apito final|full ?time|\bft\b|final da partida|acabou)\b|^\s*final\b|\bfinal\s*[:|!]|\bfinal\b(?=[^a-z]*\d+\s*[-–x:]\s*\d)/],
  ["intervalo", /\b(intervalo|half ?time|\bht\b|descanso|ao intervalo|final da 1[aª.]? parte|fim da 1[aª.]? parte|final da primeira parte|fim da primeira parte)\b/],
  ["recomeco", /\b(2[aª.]?\s*parte|segunda parte|recome[cç]|reat(a|ou)|come[cç]ou a 2|come[cç]a a 2|in[ií]cio da 2|inicio da segunda|2nd half|second half|bola a rolar para a 2)\b/],
  ["inicio", /\b(come[cç]ou|come[cç]a o jogo|come[cç]ou o jogo|in[ií]cio do jogo|apito inicial|bola a rolar|kick ?off|j[aá] se joga|arrancou|vai come[cç]ar|est[aá] a come[cç]ar|1[aª.]?\s*parte|primeira parte)\b/],
  ["golo_sofrido", /\b(golo (sofrido|do advers[aá]rio|adversario|deles)|sofremos|reduz(em|iu) o advers|o advers[aá]rio (marca|reduz|empata))\b/],
  ["golo", /\bgo+l+o+o*s?\b|\bgo+a+l+\b|\bgolaz\w*|\bmarca(mos)?\b|\bmarcou\b|\bfaz o \d|\bempat(a|amos|ou)\b|\bpassamos para a frente|\bvira(mos)? o jogo|\bam?plia(mos)?\b|\breduz(imos)?\b|⚽/],
  ["onze", /\b(onze inicial|11 inicial|convocad|equipa inicial|starting (xi|eleven)|os eleitos|line ?up)\b/],
  ["adiado", /\b(adiad|cancelad|suspens|interromp)\w*/],
  ["vermelho", /\b(cart[aã]o vermelho|expuls\w*|vermelho direto|duplo amarelo)\b|🟥/],
  ["penalti", /\b(pen[aá]lti|grande penalidade|castigo m[aá]ximo)\b/],
  ["autogolo", /\b(autogolo|auto-golo|own goal|na pr[oó]pria baliza)\b/],
  ["anulado", /\b(golo anulado|anulad[oa])\b/],
  ["agenda", /\b(pr[oó]ximo jogo|matchday|dia de jogo|hoje jogamos|hoje h[aá] jogo|amanh[aã]|vamos a jogo|convocat[oó]ria|bilhetes|venha apoiar|todos ao|anteviso|antevis[aã]o)\b/],
];

// «2-1», «2 - 1», «2x1», «2:1», «2 – 1», também separados por quebra de linha («2\n-\n1»)
const PLACAR = /(?<![\d:/.])(\d{1,2})\s*(?:[-–—x×:]|\s+[-–—]\s+)\s*(\d{1,2})(?![\d:/.]|\s*(?:h\b|min|['’]|\/|de (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)))/gi;
// «23'», «23’», «45+2'», «min 23», «23 min», «aos 23 minutos», «minuto 23»
const MINUTO = /(?:\b(?:min\.?|minuto)\s*(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\b)|(?:\b(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*(?:['’′]|\bmin(?:utos?)?\b))|(?:\baos\s*(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\b)/i;

// datas, horas e números de telefone não são resultados
const NAO_PLACAR = (t, idx, txt) => {
  const antes = txt.slice(Math.max(0, idx - 3), idx);
  const depois = txt.slice(idx + t.length, idx + t.length + 3);
  return /[/:.]$/.test(antes) || /^[/:.]/.test(depois) || /^\s*h\d/i.test(depois);
};

export function lerPlacares(texto) {
  const t = arrumaOcr(texto);
  const out = [];
  for (const m of t.matchAll(PLACAR)) {
    const a = +m[1], b = +m[2];
    if (a > 30 || b > 30) continue;
    if (/:/.test(m[0]) && a <= 23 && b >= 10) continue; // «15:30» é uma hora
    if (NAO_PLACAR(m[0], m.index, t)) continue;
    out.push({ a, b, idx: m.index, len: m[0].length });
  }
  return out;
}

export function lerMinuto(texto) {
  const m = arrumaOcr(texto).match(MINUTO);
  if (!m) return null;
  const base = +(m[1] || m[3] || m[5]);
  const extra = +(m[2] || m[4] || m[6] || 0);
  if (!base || base > 130) return null;
  return { min: base, extra: extra || 0 };
}

// quem marcou: o nome depois de «golo de», «marca», «⚽» ou antes do minuto («João Silva 23'»)
const NOME = "([A-ZÀ-Ý][\\wÀ-ÿ'.-]+(?:\\s+(?:d[aeo]s?\\s+)?[A-ZÀ-Ý][\\wÀ-ÿ'.-]+){0,2})";
const MARCADORES = [
  new RegExp(`(?:[Gg]olo+|GOLO+|[Gg]oal|GOAL|[Gg]ol|GOL)\\s+(?:de|do|da|of|DE|DO|DA)\\s+${NOME}`, "g"),
  new RegExp(`${NOME}\\s+(?:marca|MARCA|faz o|bisa|bisou|marcou|MARCOU|empata|reduz|amplia)`, "g"),
  new RegExp(`⚽\\s*${NOME}`, "g"),
  new RegExp(`${NOME}\\s*\\(?\\s*\\d{1,3}(?:\\s*\\+\\s*\\d{1,2})?\\s*['’′]`, "g"),
];
const NAO_NOME = /^(Golo|Goal|Gol|Intervalo|Final|Resultado|Jogo|Fim|Minuto|Min|Jornada|Campeonato|Divis|Liga|Taça|Hoje|Agora|Vamos|Bora|Força|Parabéns|Obrigado|Grande|Primeira|Segunda|Parte|Início|Inicio|Sporting|Clube|Futebol|Grupo|Associação|União|Desportivo|Atlético|Penálti|Autogolo|Cartão|Vermelho|Amarelo|Substituição|Entra|Sai|Golooo\w*)$/i;
export function lerMarcadores(texto) {
  const t = arrumaOcr(texto);
  const out = [];
  for (const re of MARCADORES) {
    for (const m of t.matchAll(re)) {
      const nome = m[1].trim().replace(/[.'’-]+$/, "");
      if (nome.length < 3 || NAO_NOME.test(nome.split(" ")[0]) || /\d/.test(nome)) continue;
      if (!out.includes(nome)) out.push(nome);
    }
  }
  return out;
}

// lista de golos com minuto, como nos posts de resumo: «⚽ Tiago Mendes 12', Rui Costa 67' (g.p.)»,
// «12' Tiago Mendes», «Tiago Mendes (12', 80')» → [{ nome, min, extra }] por ordem do minuto
const MIN_TXT = "(\\d{1,3})(?:\\s*\\+\\s*(\\d{1,2}))?\\s*['’′]";
export function lerListaGolos(texto) {
  const t = arrumaOcr(texto);
  const out = [];
  const junta = (nome, min, extra) => {
    nome = String(nome || "").trim().replace(/[.'’,;:-]+$/, "");
    if (nome.length < 3 || NAO_NOME.test(nome.split(" ")[0]) || /\d/.test(nome) || !min || +min > 130) return;
    if (!out.some((g) => g.min === +min && g.extra === +(extra || 0))) out.push({ nome, min: +min, extra: +(extra || 0) });
  };
  // nome seguido de um ou mais minutos
  for (const m of t.matchAll(new RegExp(`${NOME}\\s*\\(?\\s*((?:\\d{1,3}(?:\\s*\\+\\s*\\d{1,2})?\\s*['’′]\\s*[,e/]?\\s*)+)`, "g"))) {
    for (const x of m[2].matchAll(new RegExp(MIN_TXT, "g"))) junta(m[1], x[1], x[2]);
  }
  // minuto seguido do nome
  if (!out.length) for (const m of t.matchAll(new RegExp(`${MIN_TXT}\\s*[-–:]?\\s*${NOME}`, "g"))) junta(m[3], m[1], m[2]);
  return out.sort((a, b) => a.min - b.min || a.extra - b.extra);
}

// lê tudo o que interessa num texto
export function lerTexto(texto) {
  const original = String(texto || "");
  const n = norm(arrumaOcr(original));
  const eventos = new Set();
  for (const [ev, re] of EVENTOS) if (re.test(n) || re.test(original)) eventos.add(ev);
  // «inicio» e «recomeco» confundem-se («início da 2.ª parte»): fica o mais específico
  if (eventos.has("recomeco")) eventos.delete("inicio");
  // «final da 1.ª parte» é intervalo, não final
  if (eventos.has("intervalo") && /final da (1|primeira)|fim da (1|primeira)/.test(n)) eventos.delete("final");
  if (eventos.has("golo_sofrido")) eventos.delete("golo");
  const placares = lerPlacares(original);
  const minuto = lerMinuto(original);
  const marcadores = eventos.has("golo") || eventos.has("golo_sofrido") || eventos.has("penalti") || placares.length ? lerMarcadores(original) : [];
  // o resultado principal é o maior (num story de golo com o histórico «1-0 … 2-0» o atual é o último e maior)
  const principal = placares.length ? placares.reduce((m, p) => (p.a + p.b >= m.a + m.b ? p : m)) : null;
  let confianca = 0.3;
  if (principal) confianca += 0.3;
  if (minuto) confianca += 0.1;
  if (eventos.size) confianca += 0.2;
  if (eventos.has("agenda") && !eventos.has("golo") && !eventos.has("final")) confianca -= 0.3;
  const listaGolos = placares.length || eventos.has("final") ? lerListaGolos(original) : [];
  return { texto: original, eventos: [...eventos], placar: principal, placares, minuto, marcadores, listaGolos, confianca: Math.max(0, Math.min(0.95, confianca)) };
}

// posição do nome de uma equipa no texto (para saber qual dos números é de quem)
// (as posições contam no texto arrumado, o mesmo em que lerPlacares mede o índice de cada resultado)
const semAcento = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC").toLowerCase();
export function posicaoNome(texto, nomes) {
  const t = semAcento(arrumaOcr(texto));
  let melhor = -1;
  for (const n of nomes) {
    const k = norm(n).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (k.length < 3) continue;
    const i = t.indexOf(k);
    if (i >= 0 && (melhor < 0 || i < melhor)) melhor = i;
  }
  return melhor;
}
