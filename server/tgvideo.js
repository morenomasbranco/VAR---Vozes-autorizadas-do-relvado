// Vídeos grandes dos canais públicos do Telegram: a página pública (t.me/s/<canal>) não dá o ficheiro dos vídeos
// grandes («Media is too big»), por isso o servidor descarrega-os com a conta do Telegram (a de TG_SESSION) e
// manda-os ao site aos bocados, respondendo aos pedidos de intervalo (Range) do leitor de vídeo: assim o vídeo
// começa logo, dá para andar para a frente e para trás, e nunca fica inteiro na memória.
import bigInt from "big-integer";

const PEDACO = 512 * 1024; // o Telegram dá o ficheiro em pedaços de até 1 MB, alinhados; 512 KB serve bem o leitor
const MAX_RESPOSTA = 8 * 1024 * 1024; // cada resposta leva no máximo 8 MB (o leitor pede o resto a seguir)
const documentos = new Map(); // «canal/id» → { media, doc, ts }

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
  // os pedaços do Telegram começam em múltiplos do tamanho do pedaço: corta-se o que vem antes e depois
  const inicio = r.ini - (r.ini % PEDACO);
  let pos = inicio;
  let fechado = false;
  req.on("close", () => { fechado = true; });
  for await (const parte of client.iterDownload({
    file: d.media, offset: bigInt(inicio), requestSize: PEDACO,
    limit: Math.ceil((r.fim + 1 - inicio) / PEDACO), fileSize: bigInt(tamanho), dcId: d.doc.dcId,
  })) {
    if (fechado) break;
    const de = Math.max(0, r.ini - pos), ate = Math.min(parte.length, r.fim + 1 - pos);
    if (ate > de && !res.write(parte.subarray(de, ate))) await new Promise((ok) => { res.once("drain", ok); res.once("close", ok); });
    pos += parte.length;
    if (pos > r.fim) break;
  }
  res.end();
}
