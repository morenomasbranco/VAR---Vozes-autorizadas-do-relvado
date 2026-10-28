// Glossário › Declarações: o que se faz sem IA, no próprio browser.
// - arrumar(): as regras mecânicas do zerozero (aspas «», ponto final dentro ou fora das aspas, números por extenso,
//   milhares com ponto, milhões e percentagens);
// - ptbr(): as diferenças mais comuns entre o português do Brasil e o de Portugal (vocabulário do futebol, «estar
//   fazendo» → «estar a fazer», acentos de «fenômeno», pronomes);
// - avisos(): o que as regras pedem e a máquina não corrige sozinha (o título com mais de 90 caracteres, «hoje», «no
//   Chipre», siglas sem significado, parágrafos seguidos com a mesma letra…).
// Tudo é texto simples: o itálico e o negrito marcam-se com <i></i> e <b></b>, como no site do zerozero.

const POR_EXTENSO = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const POR_EXTENSO_F = { 1: "uma", 2: "duas" };
const ORDINAIS = ["", "primeiro", "segundo", "terceiro", "quarto", "quinto", "sexto", "sétimo", "oitavo", "nono"];
const MESES = "janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
// palavras femininas que costumam vir depois de um número (para «duas vitórias», «uma derrota»)
const FEMININAS = /^(vez|vezes|vit[oó]ria|derrota|jornada|parte|bola|assist[eê]ncia|defesa|oportunidade|ocasi[aã]o|temporada|[eé]poca|semana|hora|equipa|substitui[cç][aã]o|falta|les[aã]o|partida|final|meia-final|competi[cç][aã]o|ta[cç]a|liga|mudan[cç]a|altera[cç][aã]o|conquista|presen[cç]a|internacionaliza[cç][aã]o|grande|penalidade|expuls[aã]o|amarela|amarelas|vermelha|vermelhas|baliza)/i;

// as aspas retas e as curvas passam a «»; as de dentro de uma citação ficam “”. Uma aspa reta abre quando vem depois de
// um espaço (ou no início) e fecha quando vem colada ao fim de uma palavra
export function aspas(t) {
  const s = String(t).replace(/[“”„‟″]/g, '"');
  let out = "", fundo = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "«") { fundo++; out += c; continue; }
    if (c === "»") { fundo = Math.max(0, fundo - 1); out += c; continue; }
    if (c !== '"') { out += c; continue; }
    const antes = s[i - 1] || " ", depois = s[i + 1] || " ";
    const abre = /[\s(\[{—–-]/.test(antes) && !/\s/.test(depois) ? true : /[\s.,;:!?…)\]}]/.test(depois) && !/\s/.test(antes) ? false : fundo === 0;
    if (abre) { out += fundo ? "“" : "«"; fundo++; } else if (fundo) { fundo--; out += fundo ? "”" : "»"; } else out += c;
  }
  return out;
}

// regra 8: frase completa citada → ponto final dentro das aspas; citação com acrescento («…», acrescentou X.) → sem
// ponto antes da vírgula; em pergunta/resposta (conferência de imprensa) o ponto fica sempre dentro
export function pontuacao(t, { perguntaResposta = false } = {}) {
  let s = String(t);
  s = s.replace(/\.\s*»\s*,/g, "»,");
  // dois pontos com citação direta completa: maiúscula
  s = s.replace(/(:\s*«)([a-zà-ý])/g, (m, a, l) => a + l.toUpperCase()); // «Estamos prontos.», disse → «Estamos prontos», disse
  // depois de dois pontos com citação completa (maiúscula): «…». → «….»
  s = s.replace(/(:\s*«)([A-ZÀ-Ý][^«»]*?[^.!?…])»\./g, "$1$2.»");
  if (perguntaResposta) s = s.replace(/«([^«»]*?[^.!?…])»\./g, "«$1.»");
  return s;
}

const pontos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const decimal = (x) => String(x).replace(".", ",");

export function numeros(t) {
  let s = String(t);
  // percentagens: 90% → 90 por cento
  s = s.replace(/(\d+(?:[.,]\d+)?)\s?%/g, "$1 por cento");
  // milhões: 60.000.000 €, 60 000 000 euros, 60M€, €60M, 1,5 M€ → 60 milhões de euros
  const milhoes = (v) => {
    const n = Number(String(v).replace(/[.\s]/g, "").replace(",", "."));
    return `${decimal(n)} ${n === 1 ? "milhão" : "milhões"} de euros`;
  };
  s = s.replace(/€\s?(\d+(?:[.,]\d+)?)\s?(?:M|mi|milh(?:ões|ão))\b/g, (m, v) => milhoes(v));
  s = s.replace(/(\d+(?:[.,]\d+)?)\s?(?:M€|M\s€|mi?\s?€|milh(?:ões|ão) de €)/g, (m, v) => milhoes(v));
  s = s.replace(/\b(\d{1,3}(?:[.\s]000){2})\s?(?:€|euros)/g, (m, v) => `${Number(v.replace(/[.\s]/g, "")) / 1e6 === 1 ? "1 milhão" : `${pontos(Number(v.replace(/[.\s]/g, "")) / 1e6)} milhões`} de euros`);
  s = s.replace(/(\d+(?:[.,]\d+)?)\s?(?:mil)\s?€/g, "$1 mil euros");
  // milhares com ponto: 6140 → 6.140 (os anos ficam como estão)
  s = s.replace(/(^|[^\d.,:/])(\d{4,})(?![\d.,:/])/g, (m, a, n) => (n.length === 4 && +n >= 1800 && +n <= 2100 ? m : a + pontos(n)));
  // ordinais até ao nono: 1.º → primeiro, 3.ª → terceira
  s = s.replace(/\b([1-9])\.?\s?([ºª])(?!\d)/g, (m, n, g) => (g === "ª" ? ORDINAIS[n].replace(/o$/, "a") : ORDINAIS[n]));
  // zero a dez por extenso, menos nas datas (4 de outubro), nos resultados (2-1), nas horas (9h00), nos minutos (9'),
  // nas táticas (4-3-3) e nos nomes (Liga 2, Fórmula 1)
  s = s.replace(/(^|[^\p{L}\d.,:/–\-+'’#])(\d{1,2})(?![\d.,:/–\-'’°ºª%h])(?=(\s+[\p{L}-]+(?:\s+[\p{L}-]+)?)?)/gu, (m, a, n, seg, pos, str) => {
    const v = Number(n);
    if (v > 10 || (n.length > 1 && n.startsWith("0"))) return m;
    if (seg && new RegExp(`^\\s+de\\s+(${MESES})`, "i").test(seg)) return m;
    const antes = str.slice(0, pos + a.length);
    if (/(Fórmula|Formula|Liga|Grupo|Série|Serie|Divisão|Jornada|Ronda|Moto|número|camisola|n\.º)\s$/iu.test(antes)) return m;
    if (/(^|[^.!?…«\s]\s*)\p{Lu}[\p{L}-]*\s$/u.test(antes) && !/(^|[.!?…«:]»?\s*)\p{Lu}[\p{L}-]*\s$/u.test(antes)) return m;
    const prox = (seg || "").trim().split(/\s+/)[0];
    const ext = FEMININAS.test(prox) && POR_EXTENSO_F[v] ? POR_EXTENSO_F[v] : POR_EXTENSO[v];
    return a + ext;
  });
  return s;
}

export function arrumar(t, opts = {}) {
  let s = String(t || "").replace(/\r\n?/g, "\n");
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  s = s.replace(/\.\.\./g, "…").replace(/ ([,.;:!?»])/g, "$1").replace(/« /g, "«");
  s = aspas(s);
  s = pontuacao(s, opts);
  s = numeros(s);
  return s;
}

/* ───── Português do Brasil → português de Portugal ───── */
// [do Brasil, de Portugal]; as palavras inteiras, com a maiúscula do original
const VOCAB = [
  ["goleiros", "guarda-redes"], ["goleiro", "guarda-redes"], ["gols", "golos"], ["gol", "golo"], ["golaço", "golaço"],
  ["zagueiros", "defesas-centrais"], ["zagueiro", "defesa-central"], ["laterais-esquerdos", "laterais esquerdos"],
  ["volantes", "médios-defensivos"], ["volante", "médio-defensivo"], ["atacantes", "avançados"], ["atacante", "avançado"],
  ["meio-campistas", "médios"], ["meio-campista", "médio"], ["meias", "médios"], ["centroavante", "ponta de lança"], ["centroavantes", "pontas de lança"],
  ["artilheiro", "melhor marcador"], ["artilheiros", "melhores marcadores"], ["artilharia", "lista de marcadores"],
  ["torcedores", "adeptos"], ["torcedor", "adepto"], ["torcedora", "adepta"], ["torcida", "massa adepta"], ["torcidas", "massas adeptas"],
  ["gramado", "relvado"], ["gramados", "relvados"], ["elenco", "plantel"], ["elencos", "plantéis"],
  ["treinamentos", "treinos"], ["treinamento", "treino"], ["técnicos", "treinadores"],
  ["chutes", "remates"], ["chute", "remate"], ["chutou", "rematou"], ["chutar", "rematar"], ["chutando", "a rematar"],
  ["escanteios", "cantos"], ["escanteio", "canto"], ["impedimento", "fora de jogo"], ["impedido", "em fora de jogo"],
  ["pênaltis", "penáltis"], ["pênalti", "penálti"], ["placar", "resultado"], ["placares", "resultados"],
  ["vestiário", "balneário"], ["vestiários", "balneários"], ["uniforme", "equipamento"], ["uniformes", "equipamentos"],
  ["camisa", "camisola"], ["camisas", "camisolas"], ["equipe", "equipa"], ["equipes", "equipas"],
  ["ônibus", "autocarro"], ["trem", "comboio"], ["celular", "telemóvel"], ["celulares", "telemóveis"], ["banheiro", "casa de banho"],
  ["fato", "facto"], ["fatos", "factos"], ["contato", "contacto"], ["contatos", "contactos"], ["registro", "registo"], ["registros", "registos"],
  ["goleada", "goleada"], ["bandeirinha", "árbitro assistente"], ["juiz", "árbitro"], ["cartão vermelho", "cartão vermelho"],
  ["clássico", "clássico"], ["Copa do Mundo", "Campeonato do Mundo"], ["copa", "taça"], ["Copa", "Taça"],
  ["seleção brasileira", "seleção brasileira"], ["acho que", "acho que"], ["xingar", "insultar"],
  ["xingamentos", "insultos"], ["parabenizar", "dar os parabéns a"], ["parabenizo", "dou os parabéns a"],
  ["tá", "está"], ["pra", "para"], ["pro", "para o"], ["pros", "para os"], ["pras", "para as"], ["né", "não é"],
];
const RE_VOCAB = VOCAB.filter(([a, b]) => a !== b).map(([a, b]) => [new RegExp(`(^|[^\\p{L}-])(${a})(?![\\p{L}-])`, "giu"), b]);
const comMaiuscula = (orig, novo) => (orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? novo[0].toUpperCase() + novo.slice(1) : novo);

// «o time» → «a equipa» (o artigo e o possessivo passam ao feminino)
const FEM = { o: "a", do: "da", no: "na", ao: "à", pelo: "pela", um: "uma", nosso: "nossa", meu: "minha", seu: "sua", teu: "tua", este: "esta", esse: "essa", aquele: "aquela", deste: "desta", desse: "dessa", naquele: "naquela", neste: "nesta", nesse: "nessa", grande: "grande", bom: "boa", novo: "nova", os: "as", dos: "das", nos: "nas", aos: "às", pelos: "pelas", uns: "umas", nossos: "nossas", meus: "minhas", seus: "suas", estes: "estas", esses: "essas" };
const TIME = /(^|[^\p{L}])(?:(o|do|no|ao|pelo|um|nosso|meu|seu|teu|este|esse|aquele|deste|desse|naquele|neste|nesse|grande|bom|novo|os|dos|nos|aos|pelos|uns|nossos|meus|seus|estes|esses)\s+)?(times?)(?![\p{L}-])/giu;

// «o técnico» (o treinador), mas não «o departamento técnico»
const TECNICO = /(^|[^\p{L}])((?:o|O|do|Do|ao|Ao|pelo|Pelo|um|Um|novo|nosso|meu|seu|antigo)\s+)técnico(?![\p{L}-])/gu;

// estar/continuar/ficar + gerúndio → estar a + infinitivo («estamos trabalhando» → «estamos a trabalhar»)
const AUX = "est(?:ou|á|ás|amos|ão|ava|avas|ávamos|avam|ive|eve|ivemos|iveram|ar|ando|aria|ará|arei|aremos|arão|eja|ejam|ejamos)|continu(?:o|a|as|amos|am|ar|ou|ava|aram)|fic(?:o|a|as|amos|am|ar|ou|ava|aram|amos)|and(?:o|a|amos|am|ar|ava)|vive|vivo|vivem|seguimos|segue|seguem";
const GERUNDIO = new RegExp(`(^|[^\\p{L}])(${AUX})(\\s+)(\\p{L}+?)(ando|endo|indo|ondo)(?![\\p{L}])`, "giu");
const infinitivo = (raiz, fim) => raiz + (fim === "ando" ? "ar" : fim === "endo" ? "er" : fim === "indo" ? "ir" : "or");

// pronome antes do verbo (próclise do Brasil) → depois do verbo, com hífen: «eu me sinto» → «eu sinto-me»
const PROCLISE = /(^|[.!?…«]\s*|(?:[Ee]u|[Ee]le|[Ee]la|[Nn]ós|[Ee]les|[Ee]las|[Vv]ocê|[Vv]ocês|[Tt]ambém|[Aa]inda|[Ss]empre)\s+)([Mm]e|[Tt]e|[Ss]e|[Nn]os|[Ll]hes?)\s+(\p{Ll}+)(?![\p{L}-])/gu;
const NAO_MEXER = /^(que|de|a|o|em|para|por|com|e|ou|se|não|já|nunca|também|sempre|mais|muito|bem|só)$/;

export function ptbr(t) {
  let s = String(t || "");
  for (const [re, novo] of RE_VOCAB) s = s.replace(re, (m, a, p) => a + comMaiuscula(p, novo));
  s = s.replace(TIME, (m, a, art, time) => {
    const eq = comMaiuscula(time, time.length > 4 ? "equipas" : "equipa");
    return art ? `${a}${comMaiuscula(art, FEM[art.toLowerCase()] || art)} ${eq}` : a + eq;
  });
  s = s.replace(TECNICO, (m, a, ant) => `${a}${ant}treinador`);
  s = s.replace(GERUNDIO, (m, a, aux, esp, raiz, fim) => `${a}${aux}${esp}a ${infinitivo(raiz, fim.toLowerCase())}`);
  s = s.replace(PROCLISE, (m, antes, pron, verbo) => {
    if (NAO_MEXER.test(verbo)) return m;
    const inicio = /[.!?…«]\s*$/.test(antes) || antes === "";
    if (inicio && /^se$/i.test(pron)) return m; // «Se ganharmos…» é uma condição
    return `${antes}${inicio ? verbo[0].toUpperCase() + verbo.slice(1) : verbo}-${pron.toLowerCase()}`;
  });
  // acentos: «fenômeno», «Antônio», «gênio», «prêmio», «econômico» → ó/é antes de m/n seguido de vogal
  s = s.replace(/([êô])(?=[mn][aeiouáéíóú])/g, (m) => (m === "ê" ? "é" : "ó")).replace(/([ÊÔ])(?=[mn][aeiouáéíóú])/gi, (m) => (m === "Ê" ? "É" : "Ó"));
  return s;
}

// parece português do Brasil? (para propor a tradução)
export function pareceBrasil(t) {
  const s = ` ${String(t || "").toLowerCase()} `;
  const sinais = [/\s(time|gols?|goleiro|torcida|técnico|equipe|placar|gramado|elenco)\s/, /(ando|endo|indo)\s/, /\s(a gente|pra|tá|né|você)\s/, /\s(me|se|te)\s\p{Ll}+(o|a|amos|em|ei)\s/u, /[êô][mn][aeiou]/];
  return sinais.filter((r) => r.test(s)).length >= 2;
}

/* ───── Avisos ───── */
const SEM_ARTIGO = "Chipre|Portugal|Espanha|França|Inglaterra|Itália|Malta|Israel|Angola|Moçambique|Cabo Verde|Marrocos|Andorra|Timor|Gales|San Marino|Mónaco|Macau|Cuba";
const SIGLAS_CONHECIDAS = new Set(["UEFA", "FIFA", "VAR", "FC", "SC", "SL", "SAD", "PSG", "AC", "CF", "CD", "UD", "RB", "SV", "AS", "OK", "TV", "SIC", "RTP", "TVI", "CMTV", "NBA", "NFL", "NHL", "MLS", "EUA", "UE", "IA", "PS", "PSD", "GD", "AFC", "CA", "FK", "SK", "BK", "IF", "KV", "KRC", "AZ", "PSV", "VFL", "VFB", "OGC", "LOSC", "RC", "RCD", "SD", "CP"]);

export function avisos(texto, { titulo = "", microtitulo = "", lead = "" } = {}) {
  const out = [];
  const add = (regra, msg) => out.push({ regra, msg });
  const t = String(texto || "");
  const tudo = [titulo, microtitulo, lead, t].join("\n");
  const fora = tudo.replace(/«[^«»]*»/g, " "); // o texto fora das citações
  if (titulo) {
    if (titulo.length > 90) add("Títulos", `O título tem ${titulo.length} caracteres (máximo 90).`);
    if (/\.\s*$/.test(titulo)) add("Títulos", "O título não leva ponto final.");
    if (/\bpasses?\b/i.test(`${titulo} ${microtitulo}`)) add("Títulos", "No título e no micro-título, «contribuições» em vez de «passes».");
    const pal = (x) => new Set(String(x).toLowerCase().match(/\p{L}{5,}/gu) || []);
    if (microtitulo) {
      const rep = [...pal(titulo)].filter((p) => pal(microtitulo).has(p));
      if (rep.length) add("Títulos", `Palavras repetidas no título e no micro-título: ${rep.join(", ")}.`);
    }
    const dt = titulo.match(/:\s*(\p{Lu})/u);
    if (dt && !/:\s*«/.test(titulo) && !/:\s*\p{Lu}\p{Ll}+\s\p{Lu}/u.test(titulo)) add("Títulos", "Depois dos dois pontos, no título, normalmente minúscula (exceto nomes próprios ou citações).");
  }
  if (/\b(hoje|ontem|amanhã)\b/i.test(fora)) add("Referências temporais", "Evitar «hoje», «ontem» e «amanhã»: usar o dia da semana ou a data (desta quarta-feira, 4 de outubro).");
  if (/\b(passad[oa])\b/i.test(fora) && /\b(esta|este|desta|deste)\s+semana\b/i.test(fora)) add("Referências temporais", "Na semana presente não se usa «passada/passado».");
  const corpo = [lead, t].filter(Boolean).join("\n").trim();
  if (new RegExp(`^(no |na |em |a |este |esta |desta |deste )?(dia )?(\\d{1,2} de (${MESES})|(segunda|terça|quarta|quinta|sexta)-feira|sábado|domingo)`, "i").test(corpo)) add("Referências temporais", "Não começar a peça com uma data.");
  const semArt = fora.match(new RegExp(`\\b(n[oa]s?)\\s+(${SEM_ARTIGO})\\b`, "g"));
  if (semArt) add("Nomes próprios", `Países sem artigo: ${[...new Set(semArt)].map((x) => `«${x}»`).join(", ")} → «em …».`);
  if (/\b(eu|meu|minha|meus|minhas|comigo)\b/i.test(fora)) add("Discurso direto", "Fora das citações, nunca a primeira pessoa do singular (sempre a terceira, nós/zerozero).");
  if (/\b(tu|contigo|teu|tua)\b/i.test(fora)) add("Entrevistas", "Não tratar por «tu» (salvo casos específicos).");
  if (/%/.test(tudo)) add("Números", "Percentagens por extenso (90 por cento).");
  if (/(^|[^\w.,:/–\-#])([0-9]|10)(?=\s+(?!de\s))[^\w]/.test(fora)) add("Números", "De zero a dez, por extenso.");
  if (/\b\d{5,}\b/.test(fora)) add("Números", "Milhares com ponto (6.140).");
  // siglas na primeira vez sem o significado
  const vistas = new Set();
  for (const m of fora.matchAll(/\b([A-Z]{2,6})\b(\s*\()?/g)) {
    const [, s, par] = m;
    if (SIGLAS_CONHECIDAS.has(s) || vistas.has(s)) continue;
    vistas.add(s);
    if (!par) add("Siglas", `«${s}»: na primeira vez, com o significado — ${s} (…).`);
  }
  // parágrafos seguidos com a mesma letra
  const pars = corpo.split(/\n+/).map((p) => p.trim().replace(/^[«"“(]+/, "")).filter(Boolean);
  for (let i = 1; i < pars.length; i++) {
    const a = pars[i - 1][0]?.toLowerCase(), b = pars[i][0]?.toLowerCase();
    if (a && a === b) { add("Atenções", `Os parágrafos ${i} e ${i + 1} começam pela mesma letra («${pars[i][0]}»).`); break; }
  }
  if (lead && pars.length > 1 && /«/.test(lead) && /«/.test(pars[1] || "")) add("Discurso direto", "Não colocar declarações do lead logo no parágrafo seguinte.");
  const citTitulo = titulo.match(/«([^«»]+)»/);
  if (citTitulo) {
    const c = citTitulo[1].replace(/[.…]+$/, "").toLowerCase();
    if (lead.toLowerCase().includes(c)) add("Discurso direto", "A declaração do título não vai no lead: tem de estar no corpo do texto.");
    else if (!t.toLowerCase().includes(c.slice(0, 40))) add("Discurso direto", "A declaração do título tem de aparecer no corpo do texto.");
  }
  if (/\bno qual\b|\bna qual\b|\bem que\b/i.test(fora) && /\b(estádio|cidade|campo|pavilhão|país)\b/i.test(fora)) add("Atenções", "Lugares: usar sempre «onde».");
  if (/[.!?]»\s*,/.test(tudo)) add("Discurso direto", "Citação com acrescento depois: sem ponto antes das aspas («…», acrescentou).");
  if (/\s"[^"]+"/.test(tudo)) add("Citações e formatação", "Aspas «» em vez de \"\".");
  return out;
}
