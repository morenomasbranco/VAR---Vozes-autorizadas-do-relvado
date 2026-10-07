// Recolha dos stories e posts dos clubes no Instagram, sem custos e sem pedir nada aos clubes.
//
// Como funciona: o servidor usa a sessão de uma conta de Instagram qualquer (o cookie «sessionid», copiado do
// browser — ver README). A conta NÃO precisa de seguir os clubes: os stories de contas públicas leem-se
// diretamente, 20 clubes por pedido, e só dos que estão a jogar. Seguir é opcional e só poupa pedidos:
//   - reels_tray: UM pedido diz que contas seguidas têm stories novos;
//   - reels_media: os stories de até 20 contas por pedido (seguidas ou não);
//   - web_profile_info: os últimos posts (legendas «Resultado final…»), só dos clubes que estão a jogar.
// Só se consultam os clubes que têm jogo a decorrer (ou a começar, ou acabado há pouco). Cada story novo vai
// para o OCR (ocr.js) e o texto segue para o motor de evidência.
//
// Isto usa a API interna do Instagram, como qualquer browser; não é uma API oficial. O Instagram pode pedir
// verificação à conta usada ou bloqueá-la se houver pedidos a mais — por isso há um limite de pedidos por
// minuto (IG_PEDIDOS_MINUTO), pausas automáticas e o retransmissor (scripts/instagram-relay.js), que corre num
// computador de casa, onde o Instagram desconfia menos.
import { sleep } from "../../util.js";
import { lerStory } from "./ocr.js";

const APP_ID = "936619743392459";
const UA = process.env.IG_UA || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CICLO_MS = Math.max(20, Number(process.env.IG_SEGUNDOS) || 45) * 1000;
const DIRETO_MS = Math.max(45, Number(process.env.IG_DIRETO_SEGUNDOS) || 60) * 1000; // clubes que a conta não segue
const POSTS_MS = Math.max(120, Number(process.env.IG_POSTS_SEGUNDOS) || 420) * 1000;
const POR_MINUTO = Math.max(5, Number(process.env.IG_PEDIDOS_MINUTO) || 40);

export function cookieDoEnv(env = process.env) {
  if (env.IG_COOKIE) return env.IG_COOKIE.trim();
  if (!env.IG_SESSIONID) return null;
  const partes = [`sessionid=${env.IG_SESSIONID.trim()}`];
  if (env.IG_DS_USER_ID) partes.push(`ds_user_id=${env.IG_DS_USER_ID.trim()}`);
  if (env.IG_CSRFTOKEN) partes.push(`csrftoken=${env.IG_CSRFTOKEN.trim()}`);
  return partes.join("; ");
}

export function createInstagram({ cookie, alvos, entregar, guardar = () => {}, info = () => ({}), log = () => {} }) {
  const estado = { ativo: !!cookie, pedidos: 0, erros: 0, ultimoErro: null, pausaAte: 0, stories: 0, posts: 0, tray: null, seguidas: 0, alvos: 0, ultimoCiclo: null };
  if (!cookie) return { estado, parar() {} };
  const csrf = cookie.match(/csrftoken=([^;]+)/)?.[1];
  const vezes = [];
  const vistos = new Set(); // ids de stories e posts já tratados

  async function pedir(url) {
    if (Date.now() < estado.pausaAte) throw Object.assign(new Error("Instagram em pausa"), { pausa: true });
    // limite de pedidos por minuto
    for (;;) {
      const agora = Date.now();
      while (vezes.length && agora - vezes[0] > 60e3) vezes.shift();
      if (vezes.length < POR_MINUTO) break;
      await sleep(60e3 - (agora - vezes[0]) + 250);
    }
    vezes.push(Date.now());
    estado.pedidos++;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "X-IG-App-ID": APP_ID, "X-Requested-With": "XMLHttpRequest", Accept: "*/*", Referer: "https://www.instagram.com/", Cookie: cookie, ...(csrf ? { "X-CSRFToken": csrf } : {}) },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 429) { estado.pausaAte = Date.now() + 15 * 60e3; throw new Error("Instagram pediu calma (429): pausa de 15 min"); }
    if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
      estado.pausaAte = Date.now() + 30 * 60e3;
      throw new Error(`Instagram recusou a sessão (${res.status}): confirma o IG_SESSIONID e se a conta pede verificação; pausa de 30 min`);
    }
    if (!res.ok) throw new Error(`Instagram respondeu ${res.status}`);
    const j = await res.json();
    if (j.status === "fail" || j.require_login || j.message === "checkpoint_required") {
      estado.pausaAte = Date.now() + 30 * 60e3;
      throw new Error(`Instagram: ${j.message || "sessão inválida"}; pausa de 30 min`);
    }
    return j;
  }

  async function idDe(handle) {
    const i = info(handle);
    if (i.igId) return i.igId;
    const j = await pedir(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`);
    const id = j?.data?.user?.id;
    if (id) guardar(handle, { igId: id });
    return id || null;
  }

  // um story → evidência
  async function tratarStory(handle, it, alvo) {
    const id = String(it.pk || it.id);
    if (vistos.has(id)) return;
    vistos.add(id);
    const ts = (it.taken_at || 0) * 1000;
    if (ts && alvo.desde && ts < alvo.desde) return; // anterior à janela do jogo
    const video = it.media_type === 2;
    const url = video ? it.video_versions?.[0]?.url : it.image_versions2?.candidates?.[0]?.url;
    // texto que vem nos autocolantes (menções, hashtags, links) também ajuda a identificar o jogo
    const autocolantes = [
      ...(it.story_hashtags || []).map((h) => `#${h.hashtag?.name || ""}`),
      ...(it.reel_mentions || it.story_mentions || []).map((m) => `@${m.user?.username || ""}`),
    ].join(" ");
    const texto = await lerStory({ url, video, alt: it.accessibility_caption || "", legenda: [it.caption?.text, autocolantes].filter(Boolean).join("\n") });
    estado.stories++;
    await entregar({ id: `ig:story:${id}`, tipo: "story", rede: "instagram", conta: handle, ts: ts || Date.now(), texto, url: `https://www.instagram.com/stories/${handle}/${id}/` });
  }

  async function lerReels(handles, porHandle) {
    const ids = [];
    for (const h of handles) { const id = await idDe(h).catch(() => null); if (id) ids.push([h, id]); }
    for (let i = 0; i < ids.length; i += 20) {
      const lote = ids.slice(i, i + 20);
      const q = lote.map(([, id]) => `reel_ids=${id}`).join("&");
      const j = await pedir(`https://www.instagram.com/api/v1/feed/reels_media/?${q}`);
      const reels = j.reels || Object.fromEntries((j.reels_media || []).map((r) => [String(r.id), r]));
      for (const [h, id] of lote) {
        const items = (reels[id]?.items || []).sort((a, b) => (a.taken_at || 0) - (b.taken_at || 0));
        for (const it of items) await tratarStory(h, it, porHandle.get(h)).catch((e) => log(`[Instagram] story de @${h}: ${e.message}`));
        guardar(h, { vistoStory: Date.now() });
      }
    }
  }

  async function lerPosts(handle, alvo) {
    const j = await pedir(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`);
    const user = j?.data?.user;
    if (user?.id && !info(handle).igId) guardar(handle, { igId: user.id });
    const edges = user?.edge_owner_to_timeline_media?.edges || [];
    for (const { node } of edges.slice(0, 6)) {
      const id = `ig:post:${node.id}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      const ts = (node.taken_at_timestamp || 0) * 1000;
      if (alvo.desde && ts < alvo.desde) continue;
      const legenda = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
      // o texto do post está muitas vezes na imagem: o texto alternativo do Instagram e, se for preciso, OCR
      const texto = await lerStory({ url: legenda && /\d\s*[-–x]\s*\d/.test(legenda) ? null : node.display_url, video: false, alt: node.accessibility_caption || "", legenda });
      estado.posts++;
      await entregar({ id, tipo: "post", rede: "instagram", conta: handle, ts, texto, url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : null });
    }
    guardar(handle, { vistoPost: Date.now() });
  }

  let parar = false;
  const ultimoDireto = new Map();
  const ultimoPost = new Map();
  (async () => {
    log(`[Instagram] recolha ativa (${POR_MINUTO} pedidos/min no máximo, ciclo de ${CICLO_MS / 1000}s)`);
    while (!parar) {
      const lista = alvos(); // [{ handle, desde, fim, jogoId }]
      estado.alvos = lista.length;
      estado.ultimoCiclo = Date.now();
      if (lista.length && Date.now() >= estado.pausaAte) {
        const porHandle = new Map(lista.map((a) => [a.handle, a]));
        try {
          // 1. barra dos stories: quem das contas seguidas publicou algo novo
          // (se a conta não segue ninguém, a barra vem vazia e tudo passa pela leitura direta)
          const semSeguir = estado.seguidas === 0 && Date.now() - (estado.tray || 0) < 30 * 60e3; // barra vazia há pouco: não se volta a pedir
          const tray = semSeguir ? { tray: [] } : await pedir("https://www.instagram.com/api/v1/feed/reels_tray/");
          const naBarra = new Map((tray.tray || []).map((t) => [String(t.user?.username || "").toLowerCase(), (t.latest_reel_media || 0) * 1000]));
          if (!semSeguir) { estado.tray = Date.now(); estado.seguidas = naBarra.size; }
          const novos = [];
          const fora = [];
          for (const a of lista) {
            if (naBarra.has(a.handle)) {
              if (naBarra.get(a.handle) > (info(a.handle).vistoStory || 0) - 5000) novos.push(a.handle);
            } else fora.push(a.handle);
          }
          if (novos.length) await lerReels(novos, porHandle);
          // 2. clubes que a conta não segue: leitura direta, 20 de cada vez
          const devidos = fora.filter((h) => Date.now() - (ultimoDireto.get(h) || 0) > DIRETO_MS);
          if (devidos.length) {
            devidos.forEach((h) => ultimoDireto.set(h, Date.now()));
            await lerReels(devidos, porHandle);
          }
          // 3. posts: só a partir da hora do fim provável do jogo (resultado final) e de tempos a tempos
          for (const a of lista) {
            if (Date.now() < (a.postsDesde || 0) || Date.now() - (ultimoPost.get(a.handle) || 0) < POSTS_MS) continue;
            ultimoPost.set(a.handle, Date.now());
            await lerPosts(a.handle, a).catch((e) => log(`[Instagram] posts de @${a.handle}: ${e.message}`));
          }
        } catch (e) {
          estado.erros++;
          estado.ultimoErro = { erro: e.message, ts: Date.now() };
          log(`[Instagram] ${e.message}`);
        }
      }
      if (vistos.size > 50000) vistos.clear();
      await sleep(lista.length ? CICLO_MS : 60e3);
    }
  })();
  return { estado, parar() { parar = true; } };
}
