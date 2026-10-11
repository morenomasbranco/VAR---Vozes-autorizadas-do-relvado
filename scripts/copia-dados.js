// Corre no workflow .github/workflows/copia-dados.yml: pede ao site a cópia dos dados dos resultados (com um token
// OIDC do GitHub) e grava-a em dados.json.gz para o workflow a pôr na release «dados». Nunca troca uma cópia boa por
// uma pior (por exemplo, logo a seguir a uma atualização do site, quando o servidor ainda está vazio).
import fs from "node:fs";
import zlib from "node:zlib";

const SITE = process.env.SITE || "https://p01--var--tdhb8zl9kmy6.code.run";
const ANTERIOR = process.env.ANTERIOR || "anterior.json.gz";
const SAIDA = process.env.SAIDA || "dados.json.gz";
const saida = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

async function tokenOidc() {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: chave } = process.env;
  if (!url || !chave) throw new Error("sem token OIDC (falta «permissions: id-token: write»)");
  const r = await fetch(`${url}&audience=var-copia`, { headers: { Authorization: `Bearer ${chave}` } });
  return (await r.json()).value;
}
const lerGz = (buf) => JSON.parse(zlib.gunzipSync(buf).toString("utf8"));

// a cópia nova serve se tiver jogos e não tiver muito menos do que a anterior (salvo se a anterior for velha)
export function vale(nova, anterior, agora = Date.now()) {
  const n = nova?.resumo?.jogos || 0;
  if (!n) return { ok: false, porque: "o site ainda não tem jogos" };
  const a = anterior?.resumo?.jogos || 0;
  const velha = !anterior?.ts || agora - anterior.ts > 3 * 86400e3;
  if (a && n < a * 0.6 && !velha) return { ok: false, porque: `tem ${n} jogos e a anterior tinha ${a}` };
  return { ok: true, porque: `${nova.resumo.competicoes} competições, ${n} jogos (antes: ${a})` };
}

async function main() {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await fetch(`${SITE}/api/copia`, { headers: { Authorization: `Bearer ${await tokenOidc()}` }, signal: AbortSignal.timeout(90000) }).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) break;
    await new Promise((f) => setTimeout(f, 20000));
  }
  if (!r.ok) { console.log(`o site respondeu ${r.status}${r.text ? `: ${(await r.text()).slice(0, 200)}` : ""}`); saida("guardar", "0"); return; }
  const buf = Buffer.from(await r.arrayBuffer());
  const nova = lerGz(buf);
  let anterior = null;
  try { anterior = lerGz(fs.readFileSync(ANTERIOR)); } catch { /* ainda não há */ }
  const v = vale(nova, anterior);
  console.log(`cópia de ${new Date(nova.ts).toISOString()}: ${v.ok ? "guardar" : "não guardar"} (${v.porque}) · ${(buf.length / 1e6).toFixed(2)} MB`);
  if (v.ok) fs.writeFileSync(SAIDA, buf);
  saida("guardar", v.ok ? "1" : "0");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main().catch((e) => { console.log(`erro: ${e.message}`); saida("guardar", "0"); });
