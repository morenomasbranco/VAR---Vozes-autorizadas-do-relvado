// Stories e posts dos clubes SEM conta de Instagram nenhuma.
//
// O Instagram só mostra stories a quem tem sessão iniciada. Sem conta, a única maneira é passar por um dos
// «visualizadores anónimos» públicos (imginn, anonyig, storiesig, fastdl…): sites gratuitos que vão buscar ao
// Instagram os stories de contas públicas e os mostram a quem lá for. O VAR pergunta-lhes, só pelos clubes que
// estão a jogar, e lê o texto de cada imagem com o OCR. Os posts (legendas «Resultado final…») vêm do endereço
// público do próprio Instagram, que responde sem sessão a um número limitado de pedidos por hora.
//
// Estes sites não são oficiais, mudam de endereço e de formato e às vezes deixam de responder. Por isso:
//   - há vários, experimentados por ordem, e um que falhe fica de castigo uns minutos (o seguinte toma o lugar);
//   - a lista está no .env (STORIES_FONTES), com {u} no lugar do nome da conta, para se trocar sem mexer no código;
//   - o leitor não depende do formato de nenhum: procura nas respostas (JSON ou HTML) as ligações das imagens e
//     vídeos do Instagram e, quando as há, as datas de publicação.
// Como estes sites não dizem sempre a hora do story, conta a hora a que o VAR o viu pela primeira vez (com o ciclo
// de 60 s, fica a menos de um minuto da publicação, o que chega para o relógio do jogo).
import { sleep, hash } from "../../util.js";
import { lerStory } from "./ocr.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CICLO_MS = Math.max(30, Number(process.env.STORIES_ANONIMO_SEGUNDOS) || 60) * 1000;
const POSTS_MS = Math.max(60, Number(process.env.IG_POSTS_SEGUNDOS) || 300) * 1000;
const POSTS_POR_CICLO = Math.max(1, Number(process.env.IG_POSTS_POR_CICLO) || 10);
const POR_MINUTO = Math.max(5, Number(process.env.STORIES_ANONIMO_PEDIDOS_MINUTO) || 30);
const CASTIGO_MS = 10 * 60e3;

// visualizadores anónimos conhecidos (a ordem é a da experiência); trocam-se no .env sem tocar no código
export const FONTES_PADRAO = [
  "https://anonyig.com/api/ig/story?url=https%3A%2F%2Fwww.instagram.com%2Fstories%2F{u}%2F",
  "https://imginn.com/stories/{u}/",
  "https://storiesig.info/api/ig/story?url=https%3A%2F%2Fwww.instagram.com%2Fstories%2F{u}%2F",
  "https://fastdl.app/api/ig/story?url=https%3A%2F%2Fwww.instagram.com%2Fstories%2F{u}%2F",
];
const fontesDoEnv = () => (process.env.STORIES_FONTES || "").split(/[\s,]+/).filter((u) => u.includes("{u}"));

// ligações de imagens e vídeos do Instagram dentro de qualquer resposta (JSON com campos à Instagram ou HTML)
const MEDIA = /https?:\\?\/\\?\/[^"'\s<>]*?(?:cdninstagram\.com|fbcdn\.net)[^"'\s<>]*/g;
const limpa = (u) => u.replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
const chaveMedia = (u) => (u.match(/\/(\d+_\d+_\d+_n)\.(jpg|webp|mp4|heic)/) || u.match(/\/([^/?]+)\.(jpg|webp|mp4|heic)/) || [])[1] || u.split("?")[0];

export function lerResposta(texto, agora = Date.now()) {
  const out = new Map();
  // 1. JSON com itens à Instagram (a família anonyig/fastdl/storiesig devolve isto)
  try {
    const j = JSON.parse(texto);
    const itens = [];
    const anda = (x) => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(anda);
      if (x.image_versions2 || x.video_versions || x.taken_at) itens.push(x);
      else Object.values(x).forEach(anda);
    };
    anda(j);
    for (const it of itens) {
      const video = it.media_type === 2 || !!it.video_versions?.length;
      const url = video ? it.video_versions?.[0]?.url : it.image_versions2?.candidates?.[0]?.url;
      if (!url) continue;
      const id = String(it.pk || it.id || chaveMedia(url));
      out.set(id, { id, url, video, ts: it.taken_at ? it.taken_at * 1000 : null, alt: it.accessibility_caption || "" });
    }
    if (out.size) return [...out.values()];
  } catch { /* não é JSON */ }
  // 2. HTML (ou JSON noutro formato): as ligações de media e, se houver, a data mais próxima
  for (const m of texto.matchAll(MEDIA)) {
    const url = limpa(m[0]);
    if (/\/(s150x150|s320x320|p150x150|t51\.2885-19)\//.test(url) || /profile_pic|\/t51\.2885-19\//.test(url)) continue; // fotografias de perfil
    const video = /\.mp4(\?|$)/.test(url);
    const id = chaveMedia(url);
    if (out.has(id) && !(video && !out.get(id).video)) continue;
    // a data mais próxima antes da ligação (o bloco do story costuma abrir com ela) ou logo a seguir
    const antes = texto.slice(Math.max(0, m.index - 600), m.index);
    const depois = texto.slice(m.index, m.index + 400);
    const DATA = /data-(?:created|time|timestamp)=["'](\d{10})["']|"taken_at(?:_timestamp)?"\s*:\s*(\d{10})|datetime=["']([^"']+)["']/g;
    const t = [...antes.matchAll(DATA)].at(-1) || depois.match(new RegExp(DATA.source));
    const ts = t ? (t[1] || t[2] ? +(t[1] || t[2]) * 1000 : Date.parse(t[3]) || null) : null;
    // o texto alternativo da própria etiqueta da imagem
    const tag = texto.slice(texto.lastIndexOf("<", m.index), texto.indexOf(">", m.index) + 1);
    const alt = (tag.match(/alt=["']([^"']{4,400})["']/) || [])[1] || "";
    out.set(id, { id, url, video, ts: ts && ts <= agora + 60e3 ? ts : null, alt });
  }
  return [...out.values()];
}

export function createAnonimo({ alvos, entregar, perfil = () => {}, log = () => {} }) {
  const fontes = (fontesDoEnv().length ? fontesDoEnv() : FONTES_PADRAO).map((url) => ({ url, castigoAte: 0, ok: 0, falhas: 0, ultimoErro: null }));
  const estado = { ativo: true, modo: "sem conta (visualizadores anónimos)", fontes, pedidos: 0, stories: 0, posts: 0, alvos: 0, ultimoCiclo: null, postsBloqueadoAte: 0 };
  const vistos = new Map(); // id do story → primeira vez visto
  const legendas = new Map(); // post → versão da legenda já lida
  const vezes = [];
  const espera = async () => {
    for (;;) {
      const agora = Date.now();
      while (vezes.length && agora - vezes[0] > 60e3) vezes.shift();
      if (vezes.length < POR_MINUTO) break;
      await sleep(60e3 - (agora - vezes[0]) + 250);
    }
    vezes.push(Date.now());
    estado.pedidos++;
  };

  async function storiesDe(handle) {
    for (const f of fontes) {
      if (Date.now() < f.castigoAte) continue;
      await espera();
      try {
        const res = await fetch(f.url.replace("{u}", encodeURIComponent(handle)), { headers: { "User-Agent": UA, Accept: "application/json,text/html;q=0.9,*/*;q=0.8", "Accept-Language": "pt-PT,pt;q=0.9", Referer: new URL(f.url).origin + "/" }, signal: AbortSignal.timeout(25000) });
        if (res.status === 404) { f.ok++; return []; } // a conta não tem stories (ou não existe)
        if (!res.ok) throw new Error(`respondeu ${res.status}`);
        const itens = lerResposta(await res.text());
        f.ok++;
        return itens;
      } catch (e) {
        f.falhas++;
        f.ultimoErro = { erro: e.message, ts: Date.now() };
        f.castigoAte = Date.now() + CASTIGO_MS; // passa para o seguinte durante uns minutos
      }
    }
    return null; // nenhuma fonte respondeu
  }

  // posts pelo endereço público do Instagram (sem sessão): poucos pedidos por hora, por isso há um limite por volta
  // e os clubes que costumam dar os golos por post vêm primeiro
  async function postsDe(handle, alvo) {
    if (Date.now() < estado.postsBloqueadoAte) return;
    await espera();
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, { headers: { "User-Agent": UA, "X-IG-App-ID": "936619743392459", Accept: "*/*", Referer: "https://www.instagram.com/" }, signal: AbortSignal.timeout(20000) });
    if (res.status === 429 || res.status === 401 || res.status === 403) { estado.postsBloqueadoAte = Date.now() + 30 * 60e3; return; }
    if (!res.ok) return;
    const j = await res.json().catch(() => null);
    perfil(handle, j?.data?.user?.edge_owner_to_timeline_media?.edges || []); // também para a secção «Distritais»
    for (const { node } of (j?.data?.user?.edge_owner_to_timeline_media?.edges || []).slice(0, 6)) {
      const legenda = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
      // cada versão da legenda conta (clubes que vão editando o mesmo post durante o jogo)
      const id = `ig:post:${node.id}:${hash(legenda)}`;
      if (vistos.has(id)) continue;
      const editado = legendas.has(node.id) && legendas.get(node.id) !== id;
      legendas.set(node.id, id);
      vistos.set(id, Date.now());
      const ts = editado ? Date.now() : (node.taken_at_timestamp || 0) * 1000;
      if (alvo.desde && ts < alvo.desde) continue;
      const texto = await lerStory({ url: /\d\s*[-–x]\s*\d/.test(legenda) ? null : node.display_url, alt: node.accessibility_caption || "", legenda });
      estado.posts++;
      await entregar({ id, tipo: "post", rede: "instagram", conta: handle, ts, texto, url: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : null });
    }
  }

  let parar = false;
  let volta = 0;
  const ultimoPost = new Map();
  (async () => {
    log(`[Instagram] sem conta: stories pelos visualizadores anónimos (${fontes.length} fonte(s)), posts pelo endereço público`);
    while (!parar) {
      const lista = alvos(); // já vem por prioridade: jogo a decorrer e clubes que costumam publicar primeiro
      estado.alvos = lista.length;
      estado.ultimoCiclo = Date.now();
      volta++;
      // posts desta volta: os devidos, por prioridade e os mais atrasados primeiro, até POSTS_POR_CICLO
      const postsDaVolta = new Set(lista
        .filter((a) => Date.now() >= (a.postsDesde || 0) && Date.now() - (ultimoPost.get(a.handle) || 0) >= (a.postsMs || POSTS_MS))
        .sort((x, y) => (y.prioridade || 0) - (x.prioridade || 0) || (ultimoPost.get(x.handle) || 0) - (ultimoPost.get(y.handle) || 0))
        .slice(0, POSTS_POR_CICLO).map((a) => a.handle));
      for (const a of lista) {
        if (parar) break;
        // jogos que ainda não começaram (ou acabaram) de clubes que nunca publicaram: uma volta em cada três
        if (!a.prioridade && volta % 3) continue;
        const itens = await storiesDe(a.handle).catch(() => null);
        for (const it of itens || []) {
          const id = `ig:story:${it.id}`;
          if (vistos.has(id)) continue;
          const primeiraVez = Date.now();
          vistos.set(id, primeiraVez);
          const ts = it.ts || primeiraVez;
          if (a.desde && ts < a.desde) continue;
          try {
            const texto = await lerStory({ url: it.url, video: it.video, alt: it.alt });
            estado.stories++;
            await entregar({ id, tipo: "story", rede: "instagram", conta: a.handle, ts, texto, url: `https://www.instagram.com/stories/${a.handle}/` });
          } catch (e) { log(`[Instagram] story de @${a.handle}: ${e.message}`); }
        }
        if (postsDaVolta.has(a.handle)) {
          ultimoPost.set(a.handle, Date.now());
          await postsDe(a.handle, a).catch(() => {});
        }
      }
      if (vistos.size > 50000) { vistos.clear(); legendas.clear(); }
      await sleep(lista.length ? CICLO_MS : 60e3);
    }
  })();
  return { estado, parar() { parar = true; } };
}
