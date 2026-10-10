// Verificação dos tokens OIDC das GitHub Actions: um workflow do repositório pede ao GitHub um token assinado
// (permissions: id-token: write) e manda-o ao servidor; o servidor confirma a assinatura com as chaves públicas do
// GitHub e confirma que o token é deste repositório, deste workflow e do ramo main. Assim o GitHub pode enviar dados
// ao servidor sem chaves combinadas (nada a configurar no Northflank nem nos segredos do GitHub).
import crypto from "node:crypto";

export const EMISSOR = "https://token.actions.githubusercontent.com";
let cache = { chaves: null, ts: 0 };
async function chavesDoGitHub(forcar = false) {
  if (!forcar && cache.chaves && Date.now() - cache.ts < 3600e3) return cache.chaves;
  const r = await fetch(`${EMISSOR}/.well-known/jwks`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`o GitHub respondeu ${r.status} ao pedir as chaves`);
  cache = { chaves: (await r.json()).keys || [], ts: Date.now() };
  return cache.chaves;
}
const b64 = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// devolve as declarações do token, ou lança um erro a dizer porquê
export async function verificarOidc(token, { audiencia, repositorio, workflow = null, ramo = "refs/heads/main", obterChaves = chavesDoGitHub, agora = Date.now() } = {}) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) throw new Error("token em falta ou mal formado");
  let cab, dec;
  try { cab = JSON.parse(b64(h)); dec = JSON.parse(b64(p)); } catch { throw new Error("token mal formado"); }
  if (cab.alg !== "RS256") throw new Error("algoritmo do token não aceite");
  let chave = (await obterChaves()).find((k) => k.kid === cab.kid);
  if (!chave) chave = (await obterChaves(true)).find((k) => k.kid === cab.kid); // o GitHub pode ter trocado de chave
  if (!chave) throw new Error("token assinado com uma chave desconhecida");
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: chave, format: "jwk" }), b64(s));
  if (!ok) throw new Error("assinatura do token inválida");
  const t = agora / 1000;
  if (dec.iss !== EMISSOR) throw new Error("o token não é do GitHub");
  if (dec.aud !== audiencia) throw new Error("o token é para outro destino");
  if (!(dec.exp > t - 60) || (dec.nbf && dec.nbf > t + 60)) throw new Error("token fora de prazo");
  if (String(dec.repository).toLowerCase() !== String(repositorio).toLowerCase()) throw new Error(`o token é de outro repositório (${dec.repository})`);
  if (ramo && dec.ref !== ramo) throw new Error(`o token é de outro ramo (${dec.ref})`);
  if (workflow && !String(dec.workflow_ref || "").includes(workflow)) throw new Error("o token é de outro workflow");
  return dec;
}
