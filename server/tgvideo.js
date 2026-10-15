// Vídeos grandes dos canais públicos do Telegram: a página pública (t.me/s/<canal>) não dá o ficheiro dos vídeos
// grandes («Media is too big»), por isso o servidor descarrega-os com a conta do Telegram (a de TG_SESSION) e
// manda-os ao site aos bocados, respondendo aos pedidos de intervalo (Range) do leitor de vídeo: assim o vídeo
// começa logo, dá para andar para a frente e para trás, e nunca fica inteiro na memória.
// Cada pedido ao Telegram leva 2 a 8 segundos a dar o primeiro byte, e o leitor pede o início do ficheiro e depois o
// fim (onde costuma estar o índice, o «moov»): sem mais nada, o vídeo ficava muito tempo a carregar. Por isso:
// - os pedaços já descarregados ficam guardados em memória (até TG_CACHE_MB), e servem os pedidos seguintes na hora;
// - quando um vídeo entra no Feed, o início e o fim do ficheiro são descarregados logo (aquecer), antes de alguém
//   carregar no play;
// - quando o leitor desiste de um pedido (para pedir o fim do ficheiro, ou porque se fechou o vídeo), o servidor
//   pára de descarregar, em vez de continuar e de atrasar o pedido seguinte.
import bigInt from "big-integer";

const PEDACO = 512 * 1024; // o Telegram dá o ficheiro em pedaços de até 1 MB, alinhados; 512 KB serve bem o leitor
const MAX_RESPOSTA = 8 * 1024 * 1024; // cada resposta leva no máximo 8 MB (o leitor pede o resto a seguir)
const CACHE_MAX = (Number(process.env.TG_CACHE_MB) || 64) * 1024 * 1024;
const PONTAS = 2; // pedaços do início e do fim que se descarregam antes do play (1 MB de cada lado)
const documentos = new Map(); // «canal/id» → { media, doc, ts }
const cache = new Map(); // «canal/id:posição» → Buffer (do mais antigo para o mais recente)
let cacheBytes = 0;

async function documento(client, canal, id) {
  const k = `${canal}/${id}`;
  const c = documentos.get(k);
  if (c && Date.now() - c.ts < 3600e3) return c;
  const [m] = await client.getMessages(canal, { ids: [Number(id)] });
  const doc = m?.media?.document;
  if (!doc || !/^video\//.test(doc.mimeType || "")) return null;
  const r = { media: m.media, doc, ts: Date.now() };
  documentos.set(k, r);
  if (documentos.size > 300) documentos.delete(documentos.keys().next().value);
  return r;
}

function guardar(chave, parte) {
  if (cache.has(chave)) return;
  cache.set(chave, parte);
  cacheBytes += parte.length;
  while (cacheBytes > CACHE_MAX && cache.size) {
    const [k, b] = cache.entries().next().value;
    cache.delete(k);
    cacheBytes -= b.length;
  }
}
function lerCache(chave) {
  const b = cache.get(chave);
  if (b) { cache.delete(chave); cache.set(chave, b); } // usado agora: passa para o fim da fila
  return b;
}

// os pedaços do ficheiro de «inicio» (múltiplo de PEDACO) até «fim»: os guardados saem logo, os que faltam vêm do
// Telegram de seguida (um pedido por sequência de pedaços em falta) e ficam guardados
async function* pedacos(client, d, k, inicio, fim) {
  const tamanho = Number(d.doc.size);
  let pos = inicio;
  while (pos <= fim) {
    const c = lerCache(`${k}:${pos}`);
    if (c) { yield c; pos += c.length; continue; }
    let n = 0;
    for (let p = pos; p <= fim && !cache.has(`${k}:${p}`); p += PEDACO) n++;
    const antes = pos;
    for await (const parte of client.iterDownload({
      file: d.media, offset: bigInt(pos), requestSize: PEDACO, limit: n, fileSize: bigInt(tamanho), dcId: d.doc.dcId,
    })) {
      const b = Buffer.from(parte);
      guardar(`${k}:${pos}`, b);
      yield b;
      pos += b.length;
      if (pos > fim) return;
    }
    if (pos === antes) throw new Error("o Telegram não deu o pedaço pedido");
  }
}

// o intervalo pedido («bytes=100-», «bytes=100-200»), dentro do tamanho do ficheiro
export function intervalo(range, tamanho) {
  const m = String(range || "").match(/^bytes=(\d*)-(\d*)$/);
  let ini = 0, fim = tamanho - 1;
  if (m) {
    if (m[1] === "" && m[2] !== "") { ini = Math.max(0, tamanho - Number(m[2])); }
    else { ini = Number(m[1] || 0); if (m[2] !== "") fim = Math.min(fim, Number(m[2])); }
  }
  if (ini >= tamanho || ini > fim) return null;
  fim = Math.min(fim, ini + MAX_RESPOSTA - 1);
  return { ini, fim, parcial: !!m };
}

export async function enviarVideoTelegram(client, canal, id, req, res) {
  const d = await documento(client, canal, id);
  if (!d) return res.status(404).json({ erro: "vídeo não encontrado" });
  const tamanho = Number(d.doc.size);
  const r = intervalo(req.headers.range, tamanho);
  if (!r) { res.setHeader("Content-Range", `bytes */${tamanho}`); return res.status(416).end(); }
  res.status(r.parcial ? 206 : 200);
  res.setHeader("Content-Type", d.doc.mimeType || "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Length", String(r.fim - r.ini + 1));
  if (r.parcial) res.setHeader("Content-Range", `bytes ${r.ini}-${r.fim}/${tamanho}`);
  // o leitor desistiu (fechou a ligação): pára de descarregar. É a resposta que diz quando a ligação fecha; o
  // «close» do pedido, desde o Node 16, chega quando o pedido acaba de ser lido, não quando a ligação cai
  let fechado = false;
  const fechou = () => { fechado = true; };
  res.on?.("close", fechou);
  req.on?.("aborted", fechou);
  // os pedaços começam em múltiplos do tamanho do pedaço: corta-se o que vem antes e depois
  const inicio = r.ini - (r.ini % PEDACO);
  let pos = inicio;
  for await (const parte of pedacos(client, d, `${canal}/${id}`, inicio, r.fim)) {
    if (fechado) break;
    const de = Math.max(0, r.ini - pos), ate = Math.min(parte.length, r.fim + 1 - pos);
    if (ate > de && !res.write(parte.subarray(de, ate))) await new Promise((ok) => { res.once("drain", ok); res.once("close", ok); });
    pos += parte.length;
    if (fechado) break; // antes de pedir o pedaço seguinte
  }
  res.end();
}

// o início e o fim do ficheiro de um vídeo novo, descarregados antes de alguém carregar no play (um vídeo de cada vez)
const filaAquecer = [];
let aAquecer = false;
export function aquecerVideoTelegram(client, canal, id, { log = () => {} } = {}) {
  if (filaAquecer.some((x) => x.canal === canal && x.id === id)) return;
  filaAquecer.push({ canal, id });
  if (filaAquecer.length > 50) filaAquecer.shift();
  if (aAquecer) return;
  aAquecer = true;
  (async () => {
    try {
      while (filaAquecer.length) {
        const { canal: c, id: i } = filaAquecer.shift();
        try {
          const d = await documento(client, c, i);
          if (!d) continue;
          const tamanho = Number(d.doc.size);
          const ultimo = Math.floor((tamanho - 1) / PEDACO) * PEDACO;
          const k = `${c}/${i}`;
          for await (const _ of pedacos(client, d, k, 0, Math.min(tamanho - 1, PONTAS * PEDACO - 1))) { /* fica guardado */ }
          for await (const _ of pedacos(client, d, k, Math.max(0, ultimo - (PONTAS - 1) * PEDACO), tamanho - 1)) { /* idem */ }
        } catch (e) { log(`[Vídeos] Telegram ${c}/${i} (aquecer): ${e.message}`); }
      }
    } finally { aAquecer = false; }
  })();
}

export const _tgTeste = { limpar: () => { cache.clear(); cacheBytes = 0; documentos.clear(); }, emCache: (k) => [...cache.keys()].filter((x) => x.startsWith(`${k}:`)) };
