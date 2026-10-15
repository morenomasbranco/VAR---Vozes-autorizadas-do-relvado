// «Nesta semana»: a Wikipédia «Neste dia» da semana, nas seis línguas, lida a partir das GitHub Actions (que chegam à
// Wikipédia; o servidor do site, no Northflank, fica sem resposta) e enviada ao site com um token OIDC do GitHub, que o
// servidor confirma (não há chaves a configurar). Corre de hora a hora (.github/workflows/wikipedia-semana.yml).
import { wikipediaDaSemana, semanaLisboa, LINGUAS } from "../server/sources/efemerides.js";

const SITE = (process.env.SITE || "http://localhost:3001").replace(/\/$/, "");

async function token() {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: chave } = process.env;
  if (!url || !chave) return null;
  const r = await fetch(`${url}&audience=var-wikipedia`, { headers: { Authorization: `Bearer ${chave}` } });
  return (await r.json()).value || null;
}

const sem = semanaLisboa();
// o site já tem a Wikipédia desta semana, recente: não há nada a fazer (o workflow corre de 10 em 10 minutos para
// repor depressa o que se perde quando o site reinicia, e assim quase todas as execuções acabam aqui)
try {
  const e = await (await fetch(`${SITE}/api/efemerides/estado`, { signal: AbortSignal.timeout(30000) })).json();
  const w = e.wikiGitHub;
  if (w?.semana === sem.id && Date.now() - w.at < 6 * 3600e3 && Object.values(w.contagem || {}).some((n) => n > 0)) {
    console.log(`o site já tem a semana ${sem.id} (enviada há ${Math.round((Date.now() - w.at) / 60000)} min): nada a fazer`);
    process.exit(0);
  }
} catch (err) { console.log(`estado do site: ${err.message} (envio na mesma)`); }
const t0 = Date.now();
const { semana, wiki, erros } = await wikipediaDaSemana(sem);
console.log(`semana ${semana}: ${LINGUAS.map((l) => `${l} ${wiki[l].length}`).join(" · ")} em ${Math.round((Date.now() - t0) / 1000)} s`);
if (Object.keys(erros).length) console.log("erros:", JSON.stringify(erros).slice(0, 2000));
const t = await token();
if (!t) { console.log("sem token OIDC (fora das GitHub Actions): não envio"); process.exit(0); }
const r = await fetch(`${SITE}/api/efemerides/wiki`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
  body: JSON.stringify({ semana, wiki }), signal: AbortSignal.timeout(120000),
});
console.log(`site: ${r.status} ${(await r.text()).slice(0, 500)}`);
if (!r.ok) process.exit(1);
