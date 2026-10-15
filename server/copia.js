// Cópia de segurança dos dados dos resultados: o Northflank apaga a pasta data/ a cada atualização do site, e os
// campeonatos (sobretudo os distritais, que vêm da pesquisa na web, com um limite diário de pedidos) levavam horas a
// voltar. Um workflow do GitHub (.github/workflows/copia-dados.yml) pede a cópia de hora a hora (com um token OIDC do
// GitHub, sem chaves combinadas) e guarda-a como ficheiro de uma «release» do repositório; quando o servidor arranca
// sem dados, vai buscá-la lá. O repositório é público: a cópia leva só os resultados, sem mensagens de erro e com
// qualquer coisa parecida com uma chave tapada.
import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { verificarOidc } from "./oidc-github.js";

export const REPO = () => process.env.COPIA_REPO || process.env.YOUTUBE_RELAY_REPO || "morenomasbranco/VAR---Vozes-autorizadas-do-relvado";
// (com o «Nesta semana» e a pesquisa na web de cada dia: refazê-los a cada atualização levava horas e gastava a quota
// gratuita do Gemini, e entretanto a secção ficava sem acontecimentos)
export const FICHEIROS = ["pt.json", "pt-eventos.json", "pt-clubes.json", "youtube-canais.json", "efemerides.json", "efemerides-claude.json"];
const PASTA = fileURLToPath(new URL("../data/", import.meta.url));
export const ENDERECO = () => process.env.COPIA_URL || `https://github.com/${REPO()}/releases/download/dados/dados.json.gz`;

// tapa o que possa ser uma chave (num endereço ou num texto) e tira as mensagens de erro guardadas
export function limparTexto(s) {
  return String(s)
    .replace(/((?:key|access_token|token|secret|sig|signature|password|sessionid)=)[^&"\s\\]+/gi, "$1…")
    .replace(/\bAIza[\w-]{30,}/g, "…")
    .replace(/\bEAA[A-Za-z0-9]{40,}/g, "…");
}
function semErros(v) {
  if (Array.isArray(v)) return v.map(semErros);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== "erro" && k !== "ultimoErro") o[k] = semErros(x);
    return o;
  }
  return v;
}

// os ficheiros que existem agora, prontos a guardar
export function fazerCopia({ pasta = PASTA, agora = Date.now() } = {}) {
  const ficheiros = {};
  for (const f of FICHEIROS) {
    try { ficheiros[f] = JSON.parse(limparTexto(JSON.stringify(semErros(JSON.parse(fs.readFileSync(`${pasta}${f}`, "utf8")))))); } catch { /* não existe ainda */ }
  }
  const pt = ficheiros["pt.json"] || {};
  return { v: 1, ts: agora, resumo: { competicoes: Object.keys(pt.comps || {}).length, jogos: Object.keys(pt.jogos || {}).length }, ficheiros };
}

// ao arrancar: se não há dados dos resultados, vão-se buscar à última cópia (nunca se escreve por cima do que existe)
export async function restaurar({ pasta = PASTA, pedir = fetch, log = console.log, prazo = 25000 } = {}) {
  if (process.env.COPIA === "0") return { feito: false, motivo: "desligado (COPIA=0)" };
  if (fs.existsSync(`${pasta}pt.json`)) return { feito: false, motivo: "já há dados" };
  try {
    const r = await pedir(ENDERECO(), { signal: AbortSignal.timeout(prazo), redirect: "follow" });
    if (!r.ok) throw new Error(`a cópia respondeu ${r.status}`);
    let buf = Buffer.from(await r.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    const c = JSON.parse(buf.toString("utf8"));
    if (c?.v !== 1 || !c.ficheiros) throw new Error("cópia com formato desconhecido");
    fs.mkdirSync(pasta, { recursive: true });
    const escritos = [];
    for (const f of FICHEIROS) {
      if (!c.ficheiros[f] || fs.existsSync(`${pasta}${f}`)) continue;
      fs.writeFileSync(`${pasta}${f}`, JSON.stringify(c.ficheiros[f]));
      escritos.push(f);
    }
    log(`[cópia] dados repostos da cópia de ${new Date(c.ts).toISOString()} (${c.resumo?.competicoes ?? "?"} competições, ${c.resumo?.jogos ?? "?"} jogos): ${escritos.join(", ") || "nada"}`);
    return { feito: true, ts: c.ts, resumo: c.resumo, escritos };
  } catch (e) {
    log(`[cópia] sem cópia para repor: ${e.message}`);
    return { feito: false, motivo: e.message };
  }
}

// a rota que o workflow do GitHub chama (com o token OIDC dele) para levar a cópia
export function rotasCopia(app, { verificar = verificarOidc } = {}) {
  app.get("/api/copia", async (req, res) => {
    try {
      await verificar(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), {
        audiencia: "var-copia",
        repositorio: REPO(),
        workflow: ".github/workflows/copia-dados.yml",
      });
    } catch (e) { return res.status(401).json({ erro: e.message }); }
    const gz = zlib.gzipSync(JSON.stringify(fazerCopia()));
    res.set({ "Content-Type": "application/gzip", "Cache-Control": "no-store" }).send(gz);
  });
}
