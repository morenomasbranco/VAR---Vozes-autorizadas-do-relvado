// Glossário › Declarações: o servidor escreve a peça a partir das declarações coladas (com as regras do zerozero),
// traduz para português de Portugal o que vier noutra língua ou do Brasil, e passa a texto a fala de um vídeo.
// - escrever(): pede a um modelo de linguagem (server/ia.js) o título, o micro-título, o lead e o corpo;
// - transcrever(): o som do vídeo (o ffmpeg tira-o do ficheiro enviado ou do endereço do vídeo, em mp3 mono) vai ao
//   Whisper do Groq. Os endereços aceites são os ficheiros de vídeo, as páginas que os indicam (streamff, streamin…),
//   e os vídeos do Telegram (os grandes dos canais de vídeos passam pelo próprio servidor).
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pedirIA, transcrever as whisper } from "./ia.js";
import { REGRAS_TEXTO } from "../web/src/glossario/regras-zerozero.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const MAX_TEXTO = 20000;
const MAX_AUDIO = 24 * 1024 * 1024; // o Whisper do Groq aceita até 25 MB
const MAX_ENVIO = (Number(process.env.DECLARACOES_MAX_MB) || 300) * 1048576; // vídeos enviados pelo site
const MAX_MIN = Number(process.env.DECLARACOES_MAX_MIN) || 40; // minutos de som, no máximo
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TIPOS = {
  peca: "uma notícia de declarações completa: título para o site, título para o Liveticker SIC (diferente do do site), micro-título, lead e corpo",
  curta: "uma notícia curta: título para o site, título para o Liveticker SIC, lead e um ou dois parágrafos (o micro-título é facultativo)",
  pr: "uma peça de pergunta/resposta (declarações numa conferência de imprensa): introdução e depois cada pergunta e resposta, com o ponto final dentro das aspas",
  citacoes: "só as citações, limpas e arrumadas (sem título nem lead): cada uma com o verbo declarativo (disse, afirmou, acrescentou, continuou…) e quem fala",
};

const SISTEMA = `És jornalista do zerozero e escreves em português de Portugal (norma europeia, Acordo Ortográfico de 1990).
Recebes declarações de alguém do desporto: coladas de uma conferência de imprensa, de uma entrevista, de uma rede social, ou passadas a texto automaticamente a partir de um vídeo (com erros de transcrição).

O que fazes:
1. Se as declarações não estiverem em português de Portugal (português do Brasil, inglês, espanhol, francês, italiano, alemão ou outra língua), traduzes para português de Portugal, fiel ao sentido e ao tom de quem fala. Do Brasil: «time» → «equipa», «gol» → «golo», «goleiro» → «guarda-redes», «torcida» → «adeptos», «técnico» → «treinador», «estamos trabalhando» → «estamos a trabalhar», «me sinto» → «sinto-me», etc.
2. Numa transcrição automática, corriges o que é claramente erro de transcrição (nomes de jogadores e clubes mal ouvidos, pontuação), sem mudar o que a pessoa disse.
3. Escreves o pedido seguindo à risca as regras do zerozero:
${REGRAS_TEXTO}

Regras que nunca quebras:
- Nunca inventas factos, resultados, datas, números, nomes ou declarações que não estejam nas declarações ou no contexto. Se faltar algo (o dia, o jogo, o cargo), escreves sem isso e dizes o que falta em «notas».
- As citações vão sempre entre aspas «», e as aspas dentro de citações são “”.
- Não falas na voz de quem fala: deixas a pessoa falar e acrescentas «acrescentou», «continuou», «atirou», «explicou», variando os verbos.
- A declaração escolhida para o título aparece no corpo do texto, nunca no lead; as declarações do lead não se repetem no parágrafo seguinte.
- Itálico com <i></i> e negrito com <b></b> (sem markdown).
- Escreves na terceira pessoa.

Respondes APENAS com um objeto JSON, sem mais texto:
{"lingua_original": "pt-PT" | "pt-BR" | "en" | "es" | "fr" | "it" | "de" | "outra", "titulo_site": "…", "titulo_liveticker": "…", "microtitulo": "…", "lead": "…", "corpo": ["parágrafo", "…"], "citacoes": ["«…», disse X.", "…"], "notas": ["o que falta confirmar ou pode melhorar", "…"]}
Os campos que o pedido não usa vão vazios ("" ou []).`;

const SISTEMA_TRADUZIR = `És tradutor do zerozero. Traduzes declarações de pessoas do desporto para português de Portugal (norma europeia, Acordo Ortográfico de 1990), fiel ao sentido, ao tom e ao registo de quem fala, sem acrescentar nada.
Do português do Brasil: vocabulário de Portugal («equipa», «golo», «guarda-redes», «adeptos», «treinador», «relvado», «plantel», «balneário»), «estar a + infinitivo» em vez do gerúndio, pronomes depois do verbo («sinto-me»), acentos de Portugal («fenómeno», «António»).
Regras do zerozero para as citações: aspas «» (e “” dentro delas); frase completa citada com o ponto final antes das aspas finais; citação com acrescento depois («…», acrescentou X.) com o ponto fora; de zero a dez por extenso; percentagens por extenso (90 por cento); milhares com ponto (6.140).
Respondes APENAS com um objeto JSON: {"lingua_original": "pt-BR" | "en" | "es" | "fr" | "it" | "de" | "pt-PT" | "outra", "texto": "a tradução"}`;

const limpaTexto = (x, max = 2000) => String(x ?? "").replace(/\s+\n/g, "\n").trim().slice(0, max);
const listaDe = (x, max = 30) => (Array.isArray(x) ? x : x ? [x] : []).map((p) => limpaTexto(p)).filter(Boolean).slice(0, max);

export function lerPeca(j) {
  return {
    lingua: limpaTexto(j.lingua_original, 10) || null,
    tituloSite: limpaTexto(j.titulo_site, 200),
    tituloLiveticker: limpaTexto(j.titulo_liveticker, 200),
    microtitulo: limpaTexto(j.microtitulo, 300),
    lead: limpaTexto(j.lead, 1500),
    corpo: listaDe(j.corpo),
    citacoes: listaDe(j.citacoes, 40),
    notas: listaDe(j.notas, 10),
  };
}

// o som de um vídeo (ficheiro local ou endereço) em mp3 mono, pequeno o bastante para o Whisper
function audioDe(src, { cabecalhos } = {}) {
  return new Promise((ok, falha) => {
    // só os protocolos de que precisa: um ficheiro enviado (ou uma lista m3u8 vinda de fora) não pode ir ler
    // outros ficheiros do servidor
    const web = /^https?:/.test(src);
    const args = ["-hide_banner", "-loglevel", "error", "-protocol_whitelist", web ? "http,https,tcp,tls,crypto" : "file",
      ...(web ? ["-user_agent", UA, ...(cabecalhos ? ["-headers", cabecalhos] : [])] : []),
      "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-t", String(MAX_MIN * 60), "-f", "mp3", "pipe:1"];
    const pr = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    const partes = [];
    let tam = 0, erro = "";
    const fim = setTimeout(() => { pr.kill("SIGKILL"); }, 4 * 60e3);
    pr.stdout.on("data", (b) => { tam += b.length; if (tam <= MAX_AUDIO) partes.push(b); else pr.kill("SIGKILL"); });
    pr.stderr.on("data", (b) => { erro = (erro + b).slice(-400); });
    pr.on("error", (e) => { clearTimeout(fim); falha(e.code === "ENOENT" ? new Error("o servidor não tem o ffmpeg") : e); });
    pr.on("close", () => {
      clearTimeout(fim);
      const buf = Buffer.concat(partes);
      if (buf.length < 2000) return falha(Object.assign(new Error(`não foi possível tirar o som do vídeo${erro ? ` (${erro.trim().split("\n").pop()})` : ""}`), { status: 422 }));
      ok(buf);
    });
  });
}

// endereços da própria máquina ou da rede interna (não se vai lá buscar nada a pedido de quem usa o site)
export const interno = (h) => /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|\[?::1?\]?|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[?f[cd][0-9a-f]*:.*|\[?fe80:.*)$/i.test(String(h));

// o ficheiro de vídeo que uma página indica (og:video, <video>, <source>, um .mp4/.m3u8 no meio do HTML)
async function videoDaPagina(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
  if (!r.ok) throw Object.assign(new Error(`a página do vídeo respondeu ${r.status}`), { status: 422 });
  if (interno(new URL(r.url).hostname)) throw Object.assign(new Error("endereço inválido"), { status: 400 });
  if (/^(video|audio)\//i.test(r.headers.get("content-type") || "")) { r.body?.cancel?.(); return r.url; }
  const html = (await r.text()).slice(0, 2e6);
  const cand = [
    html.match(/<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i)?.[1],
    html.match(/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i)?.[1],
    html.match(/<source[^>]+src=["']([^"']+)["']/i)?.[1],
    html.match(/<video[^>]+src=["']([^"']+)["']/i)?.[1],
    html.match(/"contentUrl"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i)?.[1],
    html.match(/["'](https?:[^"'\s]+\.(?:mp4|m3u8)(?:\?[^"'\s]*)?)["']/i)?.[1],
  ].filter(Boolean).map((u) => { try { return new URL(u.replace(/&amp;/g, "&").replace(/\\\//g, "/"), r.url).href; } catch { return null; } }).filter(Boolean);
  return cand.find((x) => { try { return !interno(new URL(x).hostname); } catch { return false; } }) || null;
}

export function createDeclaracoes({ log = () => {}, porta = 3001, canaisTelegram = () => [] } = {}) {
  const estado = { escritas: 0, traduzidas: 0, transcritas: 0, erros: 0, ultimoErro: null };
  const falhou = (e) => { estado.erros++; estado.ultimoErro = { msg: String(e.detalhe || e.message).slice(0, 300), ts: Date.now() }; };

  async function escrever({ texto, quem = "", contexto = "", tipo = "peca" } = {}) {
    const t = limpaTexto(texto, MAX_TEXTO);
    if (t.length < 10) throw Object.assign(new Error("cola as declarações primeiro"), { status: 400 });
    const pedido = [
      `Pedido: ${TIPOS[tipo] || TIPOS.peca}.`,
      quem && `Quem fala: ${limpaTexto(quem, 300)}.`,
      contexto && `Contexto: ${limpaTexto(contexto, 1500)}.`,
      `Declarações:\n"""\n${t}\n"""`,
    ].filter(Boolean).join("\n\n");
    try {
      const r = await pedirIA({ sistema: SISTEMA, pedido, temperatura: 0.5, uso: "declarações" });
      estado.escritas++;
      return { ...lerPeca(r.json), motor: r.motor, modelo: r.modelo };
    } catch (e) { falhou(e); throw e; }
  }

  async function traduzir({ texto } = {}) {
    const t = limpaTexto(texto, MAX_TEXTO);
    if (t.length < 2) throw Object.assign(new Error("cola o texto primeiro"), { status: 400 });
    try {
      const r = await pedirIA({ sistema: SISTEMA_TRADUZIR, pedido: `"""\n${t}\n"""`, temperatura: 0.2, uso: "tradução" });
      estado.traduzidas++;
      return { lingua: limpaTexto(r.json.lingua_original, 10) || null, texto: limpaTexto(r.json.texto, MAX_TEXTO * 2), motor: r.motor, modelo: r.modelo };
    } catch (e) { falhou(e); throw e; }
  }

  // de onde se tira o som: um ficheiro enviado (guardado num ficheiro temporário) ou um endereço
  async function origem(url) {
    let u;
    try { u = new URL(String(url).trim()); } catch { throw Object.assign(new Error("endereço inválido"), { status: 400 }); }
    if (!/^https?:$/.test(u.protocol) || interno(u.hostname)) throw Object.assign(new Error("endereço inválido"), { status: 400 });
    if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) throw Object.assign(new Error("o YouTube não deixa tirar o som dos vídeos: descarrega o vídeo e envia o ficheiro"), { status: 422 });
    // Telegram: os vídeos grandes dos canais de vídeos vêm pelo próprio servidor; os outros, pela página pública
    const tg = u.hostname.match(/^(www\.)?(t\.me|telegram\.me)$/i) && u.pathname.match(/^\/(?:s\/)?([\w]{4,64})\/(\d{1,9})/);
    if (tg) {
      const [, canal, id] = tg;
      if (canaisTelegram().some((c) => c.toLowerCase() === canal.toLowerCase())) return `http://127.0.0.1:${porta}/api/videos/tg/${canal}/${id}`;
      const f = await videoDaPagina(`https://t.me/${canal}/${id}?embed=1&mode=tme`);
      if (f) return f;
      throw Object.assign(new Error("o Telegram não mostra este vídeo publicamente"), { status: 422 });
    }
    if (/\.(mp4|m3u8|webm|mov|mkv|mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u.pathname)) return u.href;
    const f = await videoDaPagina(u.href);
    if (!f) throw Object.assign(new Error("não encontrei o vídeo nesta página"), { status: 422 });
    return f;
  }

  // o vídeo enviado vai direto para um ficheiro temporário (sem ficar todo na memória do servidor)
  const guardarPedido = (req, destino) => new Promise((ok, falha) => {
    let tam = 0;
    const out = createWriteStream(destino);
    req.on("data", (b) => {
      tam += b.length;
      if (tam > MAX_ENVIO) { req.unpipe(out); out.destroy(); req.destroy(); falha(Object.assign(new Error(`o vídeo tem mais de ${MAX_ENVIO / 1048576} MB: envia só a parte com as declarações`), { status: 413 })); }
    });
    req.pipe(out);
    out.on("finish", () => ok(tam));
    out.on("error", falha);
    req.on("error", falha);
  });

  async function transcrever({ url, req, nome = "" } = {}) {
    let tmp = null;
    try {
      let src;
      if (req && !url) {
        tmp = path.join(os.tmpdir(), `var-decl-${crypto.randomBytes(6).toString("hex")}${(path.extname(String(nome)).match(/^\.\w{1,5}$/) || [".bin"])[0]}`);
        const tam = await guardarPedido(req, tmp);
        if (!tam) throw Object.assign(new Error("envia um vídeo ou o endereço dele"), { status: 400 });
        src = tmp;
      } else if (url) src = await origem(url);
      else throw Object.assign(new Error("envia um vídeo ou o endereço dele"), { status: 400 });
      const audio = await audioDe(src);
      const r = await whisper(audio);
      if (!r.texto) throw Object.assign(new Error("o vídeo não tem fala que se perceba"), { status: 422 });
      estado.transcritas++;
      return r;
    } catch (e) { falhou(e); log(`[Declarações] vídeo: ${e.message}`); throw e; }
    finally { if (tmp) fs.unlink(tmp).catch(() => {}); }
  }

  return { escrever, traduzir, transcrever, estado: () => estado };
}

// Limite de pedidos por pessoa (por IP): os modelos gratuitos têm quota por dia, e um abuso deixava o site sem eles
export function limitador({ porHora = 40 } = {}) {
  const contas = new Map();
  return (req, res, next) => {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
    const agora = Date.now();
    const c = contas.get(ip) || { n: 0, desde: agora };
    if (agora - c.desde > 3600e3) { c.n = 0; c.desde = agora; }
    c.n++;
    contas.set(ip, c);
    if (contas.size > 5000) contas.clear();
    if (c.n > porHora) return res.status(429).json({ erro: "demasiados pedidos: tenta daqui a pouco" });
    next();
  };
}
