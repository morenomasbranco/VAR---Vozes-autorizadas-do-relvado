// Instagram pela API oficial da Meta (Graph API, «Business Discovery»): uma conta profissional nossa (Criador ou
// Empresa, ligada a uma página de Facebook) lê os dados públicos de outras contas profissionais, como os clubes, a
// FPF e as associações: seguidores e os posts mais recentes (texto, imagem, data e ligação). Como é a API oficial,
// os pedidos vão para graph.facebook.com com a nossa chave e não há bloqueios a servidores nem risco para contas.
// Limites: só contas profissionais (as pessoais ficam de fora); só posts (os stories de outras contas não); cerca de
// 200 pedidos por hora.
//
//   IG_GRAPH_TOKEN    a chave (token de acesso de longa duração, do Graph API Explorer)
//   IG_GRAPH_USER_ID  o número da nossa conta profissional de Instagram (instagram_business_account)
//   FB_APP_ID, FB_APP_SECRET   (opcionais) da app da Meta: com eles, a chave é renovada sozinha antes de expirar
//   IG_GRAPH_POR_HORA (150)    pedidos por hora que o servidor se permite
// Passo a passo: deploy/GUIA-INSTAGRAM-API.md. Teste: /api/distritais/teste-instagram-api?conta=fcporto
import fs from "node:fs";

const VERSAO = () => process.env.IG_GRAPH_VERSION || "v23.0";
const BASE = () => (process.env.IG_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "");
const FICHEIRO = new URL("../../data/instagram-api.json", import.meta.url);
export const POR_HORA = () => Math.max(10, Number(process.env.IG_GRAPH_POR_HORA) || 150);

// a chave renovada fica gravada (a do Northflank é a de partida); usa-se a mais recente das duas
let guardada = {};
try { guardada = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { /* primeira vez */ }
const token = () => (guardada.token && guardada.origem === process.env.IG_GRAPH_TOKEN ? guardada.token : process.env.IG_GRAPH_TOKEN) || "";
export const grafoAtivo = () => !!(process.env.IG_GRAPH_TOKEN && process.env.IG_GRAPH_USER_ID);

export const estadoGrafo = { pedidos: 0, erros: 0, ultimoOk: null, ultimoErro: null, renovadaEm: guardada.renovadaEm || null, expira: guardada.expira || null, usoMeta: null };
const usos = []; // instantes dos pedidos da última hora
export function grafoLivre(agora = Date.now()) {
  while (usos.length && agora - usos[0] > 3600e3) usos.shift();
  return usos.length < POR_HORA();
}

// os erros da Meta, explicados (https://developers.facebook.com/docs/graph-api/guides/error-handling)
export function explicarErro(err = {}) {
  const c = Number(err.code), s = Number(err.error_subcode);
  if (c === 190) return { tipo: "chave", texto: "a chave (IG_GRAPH_TOKEN) é inválida ou expirou: gera outra no Graph API Explorer" };
  if ([4, 17, 32, 613].includes(c) || c === 80002) return { tipo: "limite", texto: "a Meta pediu para abrandar (limite de pedidos por hora)" };
  if (c === 10 || c === 200 || (c >= 200 && c < 300)) return { tipo: "permissao", texto: "falta uma permissão na chave (instagram_basic, pages_show_list, pages_read_engagement) ou a app ainda não tem acesso" };
  if (c === 110 || s === 2207013 || /cannot be found|not.*business|professional/i.test(err.message || "")) return { tipo: "pessoal", texto: "essa conta não é profissional (Empresa ou Criador), ou não existe: a API oficial só lê contas profissionais" };
  if (c === 100) return { tipo: "pedido", texto: `a Meta não aceitou o pedido: ${err.message || "parâmetro inválido"} (o IG_GRAPH_USER_ID é o número da conta de Instagram, não o da página?)` };
  return { tipo: "outro", texto: err.message || "erro desconhecido da Meta" };
}

const CAMPOS = "id,username,name,followers_count,media_count,profile_picture_url,media.limit({n}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}";
// um pedido à Business Discovery; devolve o objeto business_discovery ou lança um erro explicado
export async function descobrir(conta, { n = 6, agora = Date.now() } = {}) {
  const u = String(conta || "").replace(/^@/, "").replace(/[^a-z0-9._]/gi, "");
  if (!u) throw Object.assign(new Error("conta vazia"), { tipo: "pedido" });
  usos.push(agora);
  estadoGrafo.pedidos++;
  const url = `${BASE()}/${VERSAO()}/${encodeURIComponent(process.env.IG_GRAPH_USER_ID)}?fields=${encodeURIComponent(`business_discovery.username(${u}){${CAMPOS.replace("{n}", n)}}`)}&access_token=${encodeURIComponent(token())}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  // a Meta diz quanto do limite já se gastou (percentagens)
  const uso = r.headers.get("x-app-usage") || r.headers.get("x-business-use-case-usage");
  if (uso) { try { estadoGrafo.usoMeta = JSON.parse(uso); } catch { /* */ } }
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.error || !j?.business_discovery) {
    const ex = explicarErro(j?.error || { message: `a Meta respondeu ${r.status}` });
    estadoGrafo.erros++;
    estadoGrafo.ultimoErro = { conta: u, erro: ex.texto, codigo: j?.error?.code, ts: Date.now() };
    throw Object.assign(new Error(ex.texto), { tipo: ex.tipo, status: r.status, meta: j?.error || null });
  }
  estadoGrafo.ultimoOk = Date.now();
  return j.business_discovery;
}

// os posts no mesmo formato das outras leituras das Distritais
export function postsDoGrafo(bd, clube) {
  return (bd?.media?.data || []).map((m) => {
    const ts = Date.parse(m.timestamp || "");
    if (!m.id || !ts) return null;
    const video = /VIDEO|REELS/i.test(m.media_type || "");
    return {
      id: `ig:${m.id}`, handle: clube.instagram, clube: clube.nome, org: clube.org, ts,
      legenda: String(m.caption || "").slice(0, 700), url: m.permalink || `https://www.instagram.com/${clube.instagram}/`,
      img: (video ? m.thumbnail_url : m.media_url) || m.thumbnail_url || m.media_url || null, video,
    };
  }).filter(Boolean);
}

// renovar a chave de longa duração (60 dias) antes de expirar: precisa do id e do segredo da app
export async function renovarChave({ log = () => {} } = {}) {
  const { FB_APP_ID, FB_APP_SECRET } = process.env;
  if (!FB_APP_ID || !FB_APP_SECRET || !grafoAtivo()) return false;
  if (guardada.renovadaEm && Date.now() - guardada.renovadaEm < 7 * 86400e3 && guardada.origem === process.env.IG_GRAPH_TOKEN) return false;
  try {
    const r = await fetch(`${BASE()}/${VERSAO()}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(FB_APP_ID)}&client_secret=${encodeURIComponent(FB_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(token())}`, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    if (!j.access_token) throw new Error(explicarErro(j.error).texto);
    guardada = { origem: process.env.IG_GRAPH_TOKEN, token: j.access_token, renovadaEm: Date.now(), expira: j.expires_in ? Date.now() + j.expires_in * 1000 : null };
    Object.assign(estadoGrafo, { renovadaEm: guardada.renovadaEm, expira: guardada.expira });
    fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true });
    fs.writeFileSync(FICHEIRO, JSON.stringify(guardada));
    log(`[Instagram API] chave renovada${guardada.expira ? ` (válida até ${new Date(guardada.expira).toLocaleDateString("pt-PT")})` : ""}`);
    return true;
  } catch (e) {
    log(`[Instagram API] não consegui renovar a chave: ${e.message}`);
    return false;
  }
}
