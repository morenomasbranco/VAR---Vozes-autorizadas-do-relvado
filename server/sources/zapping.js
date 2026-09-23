// Zapping do zerozero: o canal português que transmite cada jogo.
// O feed público (https://www.zerozero.pt/rss/zapping) traz uma linha por transmissão,
// sempre no formato «Casa x Fora - DD/MM HH:MM - Canal», com a hora de Lisboa.
// As transmissões ficam guardadas algumas horas depois do apontamento, porque o feed
// deixa de as listar quando o jogo acaba e o cartão do jogo ainda está no site.
import fs from "node:fs";
import Parser from "rss-parser";
import { norm, sleep, lerTexto } from "../util.js";

const FEED = process.env.ZAPPING_FEED || "https://www.zerozero.pt/rss/zapping";
const INTERVALO = Math.max(10, Number(process.env.ZAPPING_SEGUNDOS) || 60) * 1000;
const VALIDADE = 6 * 3600e3; // tempo que uma transmissão fica guardada depois da hora do jogo
const JANELA = 5 * 3600e3; // diferença máxima entre a hora do jogo e a hora do cartão
const UA = "Mozilla/5.0 (compatible; VAR-feed/1.0; agregador de notícias de desporto)";
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const parser = new Parser({ timeout: 10000 });

const FICHEIRO = new URL("../../data/zapping.json", import.meta.url);
const readJson = (url, alt) => { try { return JSON.parse(fs.readFileSync(url, "utf8")); } catch { return alt; } };
const CANAIS = (readJson(new URL("../../canais.json", import.meta.url), {}).canais || [])
  .map((c) => ({ ...c, rx: new RegExp(c.re, "i") }));

// logótipo do canal: o indicado no canais.json ou o ícone do próprio site do canal
const logoDe = (c) => c.logo || (c.dominio ? `https://www.google.com/s2/favicons?domain=${c.dominio}&sz=64` : null);
export function canalDe(texto) {
  const nome = String(texto || "").trim();
  if (!nome) return null;
  const c = CANAIS.find((x) => x.rx.test(nome));
  return { canal: nome, nome: c ? c.nome : nome, id: c?.id || null, logo: c ? logoDe(c) : null, cor: c?.cor || null };
}

// nomes de equipa comparáveis: sem acentos, sem siglas de clube e sem palavras de ligação
const RUIDO = /\b(fc|sc|cf|ac|sl|cd|ad|ca|rc|afc|sad|ud|cs|gd|ss|us|ssc|vfl|vfb|bsc|tsg|fsv|nk|fk|sk|if|bk|cp|aa|gc|se|ec|club|clube|de|da|do|of|the|and|le|la|el)\b/g;
// abreviaturas que o zerozero e a ESPN escrevem de maneiras diferentes
const NOMES = {
  "vitoria": "vitoria guimaraes", "guimaraes": "vitoria guimaraes", "vitoria guimaraes": "vitoria guimaraes",
  "sporting braga": "braga", "inter": "inter milan", "internazionale": "inter milan",
  "atleti": "atletico madrid", "atletico": "atletico madrid", "psg": "paris saint germain",
  "betis": "real betis", "spurs": "tottenham", "wolves": "wolverhampton",
  "leipzig": "rb leipzig", "brighton": "brighton hove albion", "leverkusen": "bayer leverkusen", "dortmund": "borussia dortmund",
  "athletic": "athletic bilbao", "olympique marseille": "marseille", "olympique lyonnais": "lyon", "olympique lyon": "lyon",
  "saint etienne": "saint etienne", "estoril": "estoril praia", "estoril praia": "estoril praia",
};
// palavras que os dois sites escrevem de forma diferente
const PALAVRAS = {
  munique: "munich", munchen: "munich", muenchen: "munich", koln: "cologne", colonia: "cologne",
  utd: "united", gladbach: "monchengladbach", mgladbach: "monchengladbach", nottm: "nottingham", afs: "avs",
  wanderers: "wanderers", hotspur: "tottenham", albion: "albion",
};
export const chave = (n) => {
  const base = norm(n).replace(/[.'’`-]/g, " ").replace(RUIDO, " ").replace(/\s+/g, " ").trim();
  return (NOMES[base] || base).split(" ").map((w) => PALAVRAS[w] || w).join(" ");
};
// duas equipas são a mesma se quase todas as palavras coincidirem; «Man United» e
// «Manchester United» coincidem porque uma palavra que começa pela outra conta como igual
export function simil(a, b) {
  const A = chave(a).split(" ").filter(Boolean);
  const B = chave(b).split(" ").filter(Boolean);
  if (!A.length || !B.length) return 0;
  let iguais = 0;
  for (const x of A) if (B.some((y) => x === y || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))))) iguais++;
  return iguais / Math.max(A.length, B.length);
}

// hora de Lisboa → instante real, com o fuso do dia em causa (verão ou inverno)
function deLisboa(y, mes, dia, h, min) {
  const palpite = Date.UTC(y, mes - 1, dia, h, min);
  const fuso = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", timeZoneName: "longOffset" }).format(new Date(palpite));
  const m = fuso.match(/GMT([+-])(\d{2}):(\d{2})/);
  const off = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60000 : 0;
  return palpite - off;
}

// «Casa x Fora - 12/09 20:30 - SportTV 2»
export function parseLinha(titulo, agora = Date.now()) {
  const m = String(titulo || "").match(/^(.+?)\s+x\s+(.+?)\s+-\s+(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s+-\s+(.+)$/);
  if (!m) return null;
  const [, casa, fora, dia, mes, h, min, canal] = m;
  const hoje = new Date(agora);
  let ano = hoje.getUTCFullYear();
  let ts = deLisboa(ano, Number(mes), Number(dia), Number(h), Number(min));
  if (ts - agora > 180 * 86400e3) ts = deLisboa(--ano, Number(mes), Number(dia), Number(h), Number(min)); // jogo de dezembro visto em janeiro
  if (agora - ts > 180 * 86400e3) ts = deLisboa(++ano, Number(mes), Number(dia), Number(h), Number(min)); // jogo de janeiro visto em dezembro
  // «Benfica (Andebol)» ou «Sporting (Feminino)»: a modalidade ou o escalão vem entre parênteses
  const marca = (t) => t.match(/\(([^)]+)\)\s*$/)?.[1] || null;
  return {
    casa: casa.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    fora: fora.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    qualificador: marca(casa) || marca(fora) || null, // nulo = futebol de onze masculino
    inicio: ts,
    ...canalDe(canal),
  };
}

// modalidade indicada entre parênteses no Zapping → modalidade dos cartões de resultados
const MODS = { basket: "basquetebol", basquetebol: "basquetebol", andebol: "andebol", futsal: "futsal", hoquei: "hoquei_patins", volei: "voleibol", voleibol: "voleibol" };
const modCompativel = (qualificador, mod) => {
  if (!qualificador) return !mod || mod === null; // sem parênteses: futebol de onze masculino
  const primeira = norm(qualificador).split(/[\s(]/)[0];
  const dada = MODS[primeira];
  return dada ? dada === mod : false; // escalões e femininos não entram nos cartões de resultados
};

export function createZapping({ log = () => {} } = {}) {
  const jogos = new Map(); // casa|fora|hora → transmissão
  const estado = { at: null, jogos: 0, erro: null, semCanal: [] }; // semCanal: jogos que não casaram com nenhuma transmissão

  // a grelha fica guardada em disco: um reinício a meio da tarde não perde as transmissões
  // dos jogos que começaram de manhã e que já saíram do feed
  for (const t of readJson(FICHEIRO, [])) {
    if (t?.casa && t?.inicio && Date.now() - t.inicio < VALIDADE) jogos.set(`${chave(t.casa)}|${chave(t.fora)}|${t.inicio}`, t);
  }
  const gravar = () => {
    try {
      fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true });
      fs.writeFileSync(FICHEIRO, JSON.stringify([...jogos.values()]));
    } catch { /* sem disco de escrita: a grelha vive só em memória */ }
  };

  const guardar = (t) => {
    if (!t) return;
    jogos.set(`${chave(t.casa)}|${chave(t.fora)}|${t.inicio}`, t);
  };
  const limpar = () => {
    for (const [k, t] of jogos) if (Date.now() - t.inicio > VALIDADE) jogos.delete(k);
  };

  async function ler() {
    const accept = "application/rss+xml, application/xml;q=0.9, */*;q=0.8";
    let res = await fetch(FEED, { headers: { "User-Agent": UA, Accept: accept } });
    // o zerozero recusa por vezes pedidos de programas (403/429): repete uma vez como um browser normal
    if ([401, 403, 429].includes(res.status)) {
      res = await fetch(FEED, { headers: { "User-Agent": UA_BROWSER, Accept: accept, "Accept-Language": "pt-PT,pt;q=0.9", Referer: "https://www.zerozero.pt/" } });
    }
    if (!res.ok) throw new Error(`o feed respondeu ${res.status}`);
    const parsed = await parser.parseString(await lerTexto(res));
    for (const it of parsed.items || []) guardar(parseLinha(it.title));
    limpar();
    estado.at = Date.now();
    estado.jogos = jogos.size;
    estado.erro = null;
    gravar();
  }

  async function start() {
    for (;;) {
      try {
        await ler();
      } catch (e) {
        estado.erro = e.message;
        log(`[Zapping] ${e.message}`);
      }
      await sleep(INTERVALO);
    }
  }

  // transmissão de um jogo, pelos nomes das equipas e pela hora aproximada
  function find(casa, fora, ts = Date.now(), mod = null) {
    let melhor = null;
    let melhorNota = 0;
    for (const t of jogos.values()) {
      if (!modCompativel(t.qualificador, mod || null)) continue; // andebol, futsal, femininos e escalões só entram no cartão da mesma modalidade
      const dif = Math.abs(t.inicio - ts);
      if (dif > JANELA) continue;
      const nc = simil(t.casa, casa);
      const nf = simil(t.fora, fora);
      // cada equipa tem de se parecer, e o par no conjunto tem de ser convincente: como se exigem
      // as duas, um limiar mais baixo não engana (o Sporting e o Sp. Braga têm adversários diferentes)
      if (nc < 0.5 || nf < 0.5 || nc + nf < 1.3) continue;
      const nota = nc + nf;
      const total = nota - dif / JANELA / 10; // entre dois jogos iguais, o mais próximo na hora
      if (total > melhorNota) { melhorNota = total; melhor = t; }
    }
    if (!melhor) {
      // fica registado para se poder ver no /api/zapping/estado quais é que estão a falhar
      const chaveJogo = `${casa} x ${fora}${mod ? ` (${mod})` : ""}`;
      if (!estado.semCanal.includes(chaveJogo)) estado.semCanal = [chaveJogo, ...estado.semCanal].slice(0, 30);
      return null;
    }
    return { canal: melhor.canal, nome: melhor.nome, logo: melhor.logo, cor: melhor.cor, inicio: melhor.inicio };
  }

  // toda a grelha, da mais próxima para a mais distante (usada em /api/zapping)
  const all = () => [...jogos.values()].sort((a, b) => a.inicio - b.inicio);

  return { start, find, all, estado: () => estado };
}
