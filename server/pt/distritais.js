// «Distritais»: os posts mais recentes dos clubes de cada associação de futebol, numa coluna por associação.
//
// Os clubes estão no pt/clubes.json (com o Instagram de cada um). Não há forma de pedir ao Instagram «os posts
// novos de 570 contas» de uma vez, por isso o servidor percorre os perfis devagar, um de cada vez:
//   - os clubes que ainda não foram lidos primeiro; depois, os que publicam muito (a cada ~45 min) antes dos
//     que publicam pouco (a cada ~4 h);
//   - com a sessão de uma conta (IG_SESSIONID), um perfil a cada 6 s; sem sessão, pelo endereço público, um a cada
//     12 s (DISTRITAIS_SEGUNDOS), e se o Instagram recusar, pela página pública do perfil num visualizador anónimo;
//   - os perfis que a recolha dos jogos já leu (clubes a jogar) entram aqui também, sem pedido a mais.
// As imagens do Instagram não abrem noutros sites, por isso passam pelo servidor (/api/distritais/img).
// Tudo fica em data/pt-distritais.json; cada post novo segue para o site no mesmo instante (evento «distrital»).
import fs from "node:fs";
import { sleep } from "../util.js";
import { ASSOCIACOES } from "./catalogo.js";

const FICHEIRO = new URL("../../data/pt-distritais.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const APP_ID = "936619743392459";
const POR_CLUBE = 6; // posts guardados de cada clube
const IDADE_MAX = (Number(process.env.DISTRITAIS_DIAS) || 21) * 86400e3;
const ATIVO_MS = 45 * 60e3; // clube que publicou nos últimos 3 dias
const CALMO_MS = 4 * 3600e3;
const CDN = /^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net)\//;

// o que interessa de um post do Instagram (formato do web_profile_info)
export function dePost(node, clube) {
  const legenda = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
  const ts = (node.taken_at_timestamp || 0) * 1000;
  if (!node.id || !ts) return null;
  return {
    id: `ig:${node.id}`, handle: clube.instagram, clube: clube.nome, org: clube.org, ts,
    legenda: legenda.slice(0, 700), alt: !legenda ? String(node.accessibility_caption || "").slice(0, 300) : undefined,
    url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : `https://www.instagram.com/${clube.instagram}/`,
    img: node.thumbnail_src || node.display_url || null, video: !!node.is_video,
  };
}

// página pública de um perfil num visualizador anónimo (imginn e parecidos): posts com imagem, texto e ligação
export function lerPerfilAnonimo(html, clube, agora = Date.now()) {
  const out = [];
  const vistos = new Set();
  for (const m of String(html || "").matchAll(/href=["'][^"']*\/(?:p|post|reel)\/([A-Za-z0-9_-]{5,})\/?["'][\s\S]{0,1500}?<img[^>]+(?:data-src|src)=["']([^"']+)["'][^>]*>/g)) {
    const [bloco, codigo, src] = m;
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    const alt = (bloco.match(/alt=["']([^"']{3,700})["']/) || [])[1] || "";
    const t = bloco.match(/data-(?:created|time|timestamp)=["'](\d{10})["']|datetime=["']([^"']+)["']/);
    const ts = t ? (t[1] ? +t[1] * 1000 : Date.parse(t[2]) || null) : null;
    out.push({
      id: `ig:sc:${codigo}`, handle: clube.instagram, clube: clube.nome, org: clube.org, ts: ts && ts <= agora + 60e3 ? ts : null,
      // um número comprido é o id interno do post (não dá endereço no Instagram): fica a ligação para o perfil
      legenda: alt.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), url: /^\d{12,}$/.test(codigo) ? `https://www.instagram.com/${clube.instagram}/` : `https://www.instagram.com/p/${codigo}/`,
      img: src.replace(/&amp;/g, "&"), video: false,
    });
  }
  return out;
}

export function createDistritais({ clubes, broadcast = () => {}, cookie = null, log = () => {} }) {
  const lista = clubes.clubes.filter((c) => c.instagram && c.org && c.org.startsWith("af-"));
  const porHandle = new Map(lista.map((c) => [c.instagram, c]));
  let dados = { posts: {}, lido: {} }; // handle → posts; handle → { ts, ativo, falhas }
  try { dados = { posts: {}, lido: {}, ...JSON.parse(fs.readFileSync(FICHEIRO, "utf8")) }; } catch { /* primeira vez */ }
  // versões antigas marcavam como «não existe» os perfis que o Instagram recusou: voltam a ser lidos
  for (const [h, l] of Object.entries(dados.lido)) if (l.naoExiste && !l.confirmado) delete dados.lido[h];
  const estado = { ativo: process.env.DISTRITAIS !== "0", clubes: lista.length, lidos: 0, pedidos: 0, erros: 0, ultimoErro: null, pausaAte: 0, comSessao: !!cookie, ultimo: null };
  let sujo = false;
  setInterval(() => {
    if (!sujo) return;
    try { fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(dados)); sujo = false; } catch (e) { log(`[Distritais] não consegui gravar: ${e.message}`); }
  }, 30e3).unref();

  // junta os posts lidos de um clube; os novos seguem para o site
  function juntar(handle, posts, { lido = true } = {}) {
    const clube = porHandle.get(handle);
    if (!clube) return 0;
    const antes = dados.posts[handle] || [];
    const jaLido = !!dados.lido[handle]?.ts && !dados.lido[handle]?.naoExiste;
    const agora = Date.now();
    const lidos = new Map(posts.filter(Boolean).map((p) => [p.id, p]));
    // os que já se conheciam ficam com a hora e a imagem/legenda mais recentes (legendas editadas)
    const conhecidos = antes.map((p) => (lidos.has(p.id) ? { ...p, ...lidos.get(p.id), ts: p.ts, vistoEm: p.vistoEm } : p));
    const ids = new Set(antes.map((p) => p.id));
    const novos = [...lidos.values()].filter((p) => !ids.has(p.id)).map((p) => ({ ...p, ts: p.ts || agora, vistoEm: agora }));
    dados.posts[handle] = [...conhecidos, ...novos].filter((p) => agora - p.ts < IDADE_MAX).sort((a, b) => b.ts - a.ts).slice(0, POR_CLUBE);
    if (lido) dados.lido[handle] = { ts: agora, ativo: dados.posts[handle].some((p) => agora - p.ts < 3 * 86400e3), falhas: 0 };
    sujo = true;
    // na primeira leitura de um clube não se anuncia nada (eram posts antigos); depois, cada post novo
    if (jaLido) for (const p of novos) if (agora - p.ts < 6 * 3600e3) broadcast("distrital", p);
    return novos.length;
  }

  // posts que a recolha dos jogos já leu (web_profile_info) entram aqui também
  function deEdges(handle, edges) {
    const clube = porHandle.get(handle);
    if (!clube) return;
    juntar(handle, (edges || []).slice(0, POR_CLUBE).map(({ node }) => dePost(node, clube)).filter(Boolean));
  }

  async function lerInstagram(clube) {
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clube.instagram)}`, {
      headers: { "User-Agent": UA, "X-IG-App-ID": APP_ID, Accept: "*/*", Referer: "https://www.instagram.com/", ...(cookie ? { Cookie: cookie } : {}) },
      redirect: "manual", signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) return { naoExiste: true };
    if (!res.ok) throw Object.assign(new Error(`Instagram respondeu ${res.status}`), { status: res.status });
    const j = await res.json().catch(() => null);
    // sem «user» é o Instagram a pedir sessão (ou a dizer para esperar), não uma conta que não existe
    if (!j?.data?.user) throw Object.assign(new Error(`Instagram não deu o perfil (${j?.message || j?.status || "pediu sessão"})`), { status: 401 });
    const edges = j.data.user.edge_owner_to_timeline_media?.edges;
    return { posts: (edges || []).slice(0, POR_CLUBE).map(({ node }) => dePost(node, clube)).filter(Boolean) };
  }
  // visualizadores anónimos (páginas públicas dos perfis); trocam-se no .env (DISTRITAIS_FONTES, com {u})
  const ANONIMOS = (process.env.DISTRITAIS_FONTES || "https://imginn.com/{u}/ https://www.picnob.com/profile/{u}/ https://www.pixwox.com/profile/{u}/")
    .split(/[\s,]+/).filter((u) => u.includes("{u}")).map((url) => ({ url, castigoAte: 0 }));
  async function lerAnonimo(clube) {
    let tentou = false;
    for (const f of ANONIMOS) {
      if (Date.now() < f.castigoAte) continue;
      tentou = true;
      try {
        const res = await fetch(f.url.replace("{u}", encodeURIComponent(clube.instagram)), { headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "pt-PT,pt;q=0.9" }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) { if (res.status !== 404) f.castigoAte = Date.now() + 15 * 60e3; continue; }
        const posts = lerPerfilAnonimo(await res.text(), clube);
        if (posts.length) return { posts };
      } catch { f.castigoAte = Date.now() + 10 * 60e3; }
    }
    throw new Error(tentou ? "nenhum visualizador anónimo deu os posts" : "visualizadores anónimos em pausa");
  }

  // o próximo clube a ler. Nunca lidos primeiro, alternando entre associações (para todas as colunas terem posts
  // cedo); depois o que está há mais tempo à espera do seu intervalo. «ocupados»: os que outra via está a ler.
  const ocupados = new Set();
  let vez = 0;
  function proximo(agora = Date.now()) {
    const porLer = lista.filter((c) => !dados.lido[c.instagram] && !ocupados.has(c.instagram));
    if (porLer.length) {
      const orgs = [...new Set(porLer.map((c) => c.org))];
      const org = orgs[vez++ % orgs.length];
      return porLer.find((c) => c.org === org);
    }
    let melhor = null, atraso = -Infinity;
    for (const c of lista) {
      if (ocupados.has(c.instagram)) continue;
      const l = dados.lido[c.instagram];
      const devido = l.ts + (l.naoExiste ? 7 * 86400e3 : l.ativo ? ATIVO_MS : CALMO_MS) * (1 + Math.min(4, l.falhas || 0));
      if (agora - devido > atraso) { atraso = agora - devido; melhor = c; }
    }
    return atraso >= 0 ? melhor : null;
  }

  function erro(c, e) {
    estado.erros++;
    estado.ultimoErro = { handle: c.instagram, erro: e.message, ts: Date.now() };
    const l = dados.lido[c.instagram] || {};
    // sem nenhuma leitura certa, o clube volta à fila daqui a pouco (não fica 4 horas à espera)
    dados.lido[c.instagram] = { ...l, ts: l.ok ? Date.now() : Date.now() - CALMO_MS + 10 * 60e3, falhas: (l.falhas || 0) + 1, ok: l.ok };
  }
  function certo(c, r) {
    if (r.naoExiste) dados.lido[c.instagram] = { ts: Date.now(), naoExiste: true, confirmado: true, falhas: 0 };
    else { juntar(c.instagram, r.posts); dados.lido[c.instagram].ok = true; estado.lidos++; }
    sujo = true;
  }

  // duas vias em paralelo, cada uma ao seu ritmo: o Instagram (que pode pedir uma pausa) e os visualizadores anónimos
  const GAP_IG = Math.max(2, Number(process.env.DISTRITAIS_SEGUNDOS) || (cookie ? 4 : 8)) * 1000;
  const GAP_ANON = Math.max(2, Number(process.env.DISTRITAIS_ANONIMO_SEGUNDOS) || 6) * 1000;
  let parar = false;
  estado.vias = { instagram: { ok: 0, erros: 0, pausaAte: 0 }, anonimo: { ok: 0, erros: 0 }, retransmissor: { ok: 0, ultimo: null } };
  async function via(nome, ler, gap) {
    const v = estado.vias[nome];
    while (!parar) {
      if (nome === "instagram" && Date.now() < v.pausaAte) { await sleep(Math.min(60e3, v.pausaAte - Date.now())); continue; }
      const c = proximo();
      if (!c) { await sleep(30e3); continue; }
      ocupados.add(c.instagram);
      estado.pedidos++;
      estado.ultimo = Date.now();
      try {
        certo(c, await ler(c));
        v.ok++;
      } catch (e) {
        v.erros++;
        if (nome === "instagram" && ([401, 403, 429].includes(e.status) || (e.status >= 300 && e.status < 400))) {
          v.pausaAte = Date.now() + (v.ok ? 15 : 30) * 60e3; // o Instagram está a recusar este servidor: pausa
          v.ultimoErro = e.message;
        } else erro(c, e);
      } finally { ocupados.delete(c.instagram); }
      await sleep(gap);
    }
  }
  async function correr() {
    log(`[Distritais] ${lista.length} clubes das associações com Instagram; pelo Instagram (um a cada ${GAP_IG / 1000} s) e pelos visualizadores anónimos (um a cada ${GAP_ANON / 1000} s)`);
    await Promise.all([via("instagram", lerInstagram, GAP_IG), via("anonimo", lerAnonimo, GAP_ANON)]);
  }

  // retransmissor de casa (npm run instagram-relay): pede clubes para ler e devolve os posts
  function paraRetransmissor(n = 5) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = proximo();
      if (!c) break;
      ocupados.add(c.instagram);
      setTimeout(() => ocupados.delete(c.instagram), 3 * 60e3).unref?.();
      out.push(c.instagram);
    }
    return out;
  }
  function doRetransmissor(handle, edges) {
    const c = porHandle.get(handle);
    if (!c) return false;
    ocupados.delete(handle);
    certo(c, { posts: (edges || []).slice(0, POR_CLUBE).map(({ node }) => dePost(node, c)).filter(Boolean) });
    estado.vias.retransmissor.ok++;
    estado.vias.retransmissor.ultimo = Date.now();
    return true;
  }

  // as imagens passam pelo servidor (o Instagram não as deixa abrir noutros sites); cache pequena em memória
  const imagens = new Map();
  async function imagem(url) {
    if (!CDN.test(url || "")) return null;
    if (imagens.has(url)) return imagens.get(url);
    const res = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.instagram.com/" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 600e3) return null;
    const img = { tipo: res.headers.get("content-type") || "image/jpeg", buf };
    imagens.set(url, img);
    if (imagens.size > 400) imagens.delete(imagens.keys().next().value);
    return img;
  }

  function feed({ org = null, limite = 40 } = {}) {
    const porOrg = {};
    for (const [handle, posts] of Object.entries(dados.posts)) {
      const c = porHandle.get(handle);
      if (!c || (org && c.org !== org)) continue;
      for (const p of posts) (porOrg[c.org] ||= []).push(p);
    }
    for (const k of Object.keys(porOrg)) porOrg[k] = porOrg[k].sort((a, b) => b.ts - a.ts).slice(0, limite);
    return {
      orgs: ASSOCIACOES.map((a) => ({ key: a.key, nome: a.nome, clubes: lista.filter((c) => c.org === a.key).length })).filter((a) => a.clubes),
      posts: porOrg,
      estado: { ...estado, lidosTotal: Object.keys(dados.lido).length },
    };
  }

  return {
    start() { if (estado.ativo) correr().catch((e) => log(`[Distritais] ${e.message}`)); },
    parar() { parar = true; },
    juntar, deEdges, feed, imagem, paraRetransmissor, doRetransmissor, estado: () => estado,
  };
}
