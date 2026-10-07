// Texto de um story (imagem ou vídeo), tudo gratuito e por esta ordem:
//   1. o texto alternativo que o próprio Instagram gera («Pode ser uma imagem de texto que diz "GOLO 1-0"»);
//   2. Tesseract, o OCR livre, instalado no servidor (no Docker: tesseract-ocr com o português);
//      os vídeos passam primeiro pelo ffmpeg, que tira 3 fotogramas;
//   3. Gemini (o mesmo GEMINI_API_KEY das notícias, plano gratuito), só quando os dois primeiros não dão nada
//      com números e dentro de um limite por hora, para não gastar a quota das notícias.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.STORIES_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_POR_HORA = Number(process.env.STORIES_GEMINI_POR_HORA ?? 60);
export const estado = { tesseract: null, ffmpeg: null, lidos: 0, tesseractUsado: 0, alt: 0, gemini: 0, geminiErros: 0, falhas: 0 };
const usosGemini = [];

function correr(cmd, args, { entrada = null, timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    let out = "", err = "";
    let p;
    try { p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] }); } catch { return resolve({ ok: false, out: "", err: "não existe" }); }
    const t = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => { clearTimeout(t); resolve({ ok: false, out, err: "não existe" }); });
    p.on("close", (code) => { clearTimeout(t); resolve({ ok: code === 0, out, err }); });
    if (entrada) p.stdin.end(entrada); else p.stdin.end();
  });
}

export async function verificar() {
  if (estado.tesseract === null) {
    const r = await correr("tesseract", ["--list-langs"], { timeout: 8000 });
    estado.tesseract = r.ok || /List of available/i.test(r.out + r.err) ? { linguas: (r.out + r.err).split(/\s+/).filter((l) => /^[a-z]{3}$/.test(l)) } : false;
  }
  if (estado.ffmpeg === null) estado.ffmpeg = (await correr("ffmpeg", ["-version"], { timeout: 8000 })).ok;
  return estado;
}

// texto alternativo automático do Instagram: «… que diz "GOLO! 1-0"» / «… that says 'GOAL 1-0'»
export function textoAlternativo(alt) {
  const s = String(alt || "");
  const m = s.match(/(?:que diz|that says|texto que diz|with the text)\s*[:]?\s*["'“‘](.+?)["'”’]\s*\.?$/is) || s.match(/["'“](.{4,})["'”]/s);
  return m ? m[1].trim() : "";
}

async function tesseract(ficheiro) {
  const ling = estado.tesseract?.linguas?.includes("por") ? "por+eng" : "eng";
  // psm 11: texto solto pela imagem (os stories não têm parágrafos); psm 6 como segunda leitura
  const a = await correr("tesseract", [ficheiro, "stdout", "-l", ling, "--psm", "11"]);
  let t = a.ok ? a.out : "";
  if (!/\d\s*[-–x:]\s*\d/.test(t)) {
    const b = await correr("tesseract", [ficheiro, "stdout", "-l", ling, "--psm", "6"]);
    if (b.ok) t = `${t}\n${b.out}`;
  }
  estado.tesseractUsado++;
  return t.split("\n").map((l) => l.trim()).filter((l) => l.length > 1).join("\n");
}

// prepara a imagem para o OCR (maior, em cinzentos e com mais contraste) e, nos vídeos, tira 3 fotogramas
async function fotogramas(ficheiro, video) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "var-story-"));
  const saida = path.join(dir, "f%02d.png");
  const filtro = "scale='min(1600,iw*2)':-2,format=gray,eq=contrast=1.4";
  const args = video
    ? ["-y", "-loglevel", "error", "-i", ficheiro, "-vf", `fps=1/2,${filtro}`, "-frames:v", "3", saida]
    : ["-y", "-loglevel", "error", "-i", ficheiro, "-vf", filtro, "-frames:v", "1", saida];
  const r = estado.ffmpeg ? await correr("ffmpeg", args, { timeout: 45000 }) : { ok: false };
  const lista = r.ok ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")).map((f) => path.join(dir, f)) : [];
  return { dir, lista };
}

async function gemini(buf, tipo) {
  if (!GEMINI_KEY || GEMINI_POR_HORA <= 0) return "";
  const agora = Date.now();
  while (usosGemini.length && agora - usosGemini[0] > 3600e3) usosGemini.shift();
  if (usosGemini.length >= GEMINI_POR_HORA) return "";
  usosGemini.push(agora);
  try {
    const res = await fetch(`${GEMINI_API}/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType: tipo, data: buf.toString("base64") } },
          { text: "Transcreve todo o texto visível nesta imagem de um story de um clube de futebol, linha a linha, tal como está escrito (resultados como 2-1, minutos como 23', nomes). Se aparecerem os nomes ou siglas das duas equipas ao lado do resultado, escreve-os na mesma linha pela ordem em que aparecem, no formato «Equipa A 2-1 Equipa B». Responde só com o texto, sem comentários." },
        ] }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const body = await res.json();
    estado.gemini++;
    return body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
  } catch {
    estado.geminiErros++;
    return "";
  }
}

const temNumeros = (t) => /\d\s*[-–x:]\s*\d|\d{1,3}\s*['’]/.test(t || "");

// lê o texto de um story: { url, video, alt } → texto
export async function lerStory({ url, video = false, alt = "", legenda = "" }) {
  await verificar();
  estado.lidos++;
  const partes = [];
  const altTxt = textoAlternativo(alt);
  if (altTxt) { partes.push(altTxt); estado.alt++; }
  if (legenda) partes.push(legenda);
  if (temNumeros(partes.join(" ")) || !url) return partes.join("\n");
  let buf = null, tipo = video ? "video/mp4" : "image/jpeg";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`media ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    tipo = res.headers.get("content-type") || tipo;
  } catch {
    estado.falhas++;
    return partes.join("\n");
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "var-media-"));
  const orig = path.join(dir, video ? "story.mp4" : "story.jpg");
  fs.writeFileSync(orig, buf);
  let imagemParaGemini = video ? null : buf;
  try {
    if (estado.tesseract) {
      const { dir: d2, lista } = await fotogramas(orig, video);
      const alvo = lista.length ? lista : video ? [] : [orig];
      for (const f of alvo) partes.push(await tesseract(f));
      if (video && lista.length) imagemParaGemini = fs.readFileSync(lista[Math.min(1, lista.length - 1)]);
      fs.rmSync(d2, { recursive: true, force: true });
    } else if (video && estado.ffmpeg) {
      const { dir: d2, lista } = await fotogramas(orig, true);
      if (lista.length) imagemParaGemini = fs.readFileSync(lista[Math.min(1, lista.length - 1)]);
      fs.rmSync(d2, { recursive: true, force: true });
    }
    const texto = partes.join("\n");
    if (!temNumeros(texto) && imagemParaGemini) {
      const g = await gemini(imagemParaGemini, video ? "image/png" : tipo.startsWith("image/") ? tipo : "image/jpeg");
      if (g) partes.push(g);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return partes.filter(Boolean).join("\n");
}
