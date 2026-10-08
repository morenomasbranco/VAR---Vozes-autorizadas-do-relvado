// Posts das páginas de Facebook dos clubes, sem conta e sem a API do Facebook (que exige uma aprovação que um site
// destes não consegue).
//
// A via é o «plugin de página» (facebook.com/plugins/page.php): a caixa que qualquer site pode pôr para mostrar a
// cronologia de uma página pública. A página vem já com os posts mais recentes: a hora de cada um (data-utime),
// o texto, a ligação e a imagem. O leitor não depende das classes do Facebook: corta a página pelas horas dos
// posts e, em cada pedaço, procura a ligação do post, o texto e a imagem maior.
//
// Se o Facebook passar a pedir sessão, o FB_COOKIE (os cookies c_user e xs de uma conta qualquer, copiados do
// browser) é enviado com o pedido. Isto não é uma API oficial e pode mudar.
import { hash, entidades, conserta } from "../util.js";
import { buscar } from "../ponte.js";

const UA = process.env.FB_UA || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// botões e rodapés do plugin que não fazem parte do texto do post
const FIM_TEXTO = /\s(?:Ver tradução|Ver mais|See Translation|See more|Gosto|Comentar|Partilhar|Like|Comment|Share|\d+\s+(?:coment[aá]rios?|partilhas?|comments?|shares?))\b/i;

const limpa = (h) => conserta(entidades(String(h || "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")))
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

// «onze.esperancas» ou «profile.php?id=1000…» a partir do endereço da página
export function paginaFacebook(url) {
  try {
    const u = new URL(String(url || "").replace(/^http:/, "https:"));
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    const id = u.searchParams.get("id");
    if (/profile\.php/.test(u.pathname) && id) return { chave: `id${id}`, url: `https://www.facebook.com/profile.php?id=${id}` };
    const nome = u.pathname.split("/").filter(Boolean).filter((p) => !/^(pages|pg|people)$/i.test(p))[0];
    if (!nome || /^(groups|events|watch|share|sharer|login|plugins)$/i.test(nome)) return null;
    return { chave: nome.toLowerCase(), url: `https://www.facebook.com/${nome}/` };
  } catch { return null; }
}

export const urlPlugin = (pagina) => `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(pagina)}&tabs=timeline&width=500&height=2000&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false&locale=pt_PT`;

// os posts que o plugin traz
export function lerPlugin(html, clube, agora = Date.now()) {
  const src = String(html || "");
  const horas = [...src.matchAll(/data-utime=["'](\d{9,11})["']/g)];
  const out = [];
  const vistos = new Set();
  const LINK = /href=["']([^"']*(?:\/posts\/|story_fbid=|\/permalink\/|\/photos\/|\/videos\/|\/reel\/|fbid=)[^"']*)["']/g;
  horas.forEach((m, i) => {
    const ts = +m[1] * 1000;
    if (!ts || ts > agora + 60e3) return;
    const ini = m.index;
    const fim = i + 1 < horas.length ? horas[i + 1].index : Math.min(src.length, ini + 25000);
    const bloco = src.slice(ini, fim);
    // a hora está dentro da ligação do post: a última ligação antes dela (ou a primeira depois)
    const antes = src.slice(Math.max(0, ini - 1500), ini);
    let link = [...antes.matchAll(LINK)].at(-1)?.[1] || [...bloco.matchAll(LINK)][0]?.[1] || null;
    if (link) {
      link = entidades(link);
      try { link = new URL(link, "https://www.facebook.com/").href.replace(/[?&](__cft__|__tn__|ref)[^&]*/g, ""); } catch { link = null; }
    }
    // texto: o bloco «userContent» se o houver; senão o texto do pedaço, até aos botões do post
    const k = bloco.search(/class=["'][^"']*userContent/);
    let texto = limpa(k >= 0 ? bloco.slice(k, k + 6000).replace(/^[^>]*>/, "") : bloco.replace(/^[^>]*>/, ""));
    const corte = texto.search(FIM_TEXTO);
    if (corte > 0) texto = texto.slice(0, corte);
    texto = texto.replace(new RegExp(`^${clube.nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").trim().slice(0, 700);
    // imagem: a maior do pedaço (sem fotografias de perfil nem ícones)
    const img = [...bloco.matchAll(/<img[^>]+src=["'](https:\/\/[^"']*fbcdn\.net[^"']+)["'][^>]*>/g)]
      .map((x) => ({ url: entidades(x[1]), tag: x[0] }))
      .filter((x) => !/\/[ps]\d{2,3}x\d{2,3}\/|_s\.jpg|emoji|static\.xx\.fbcdn/.test(x.url) && !/width=["']([1-9]\d?)["']/.test(x.tag))[0]?.url || null;
    if (!texto && !img) return;
    const id = `fb:${hash(link || `${ts}:${clube.nome}`)}`;
    if (vistos.has(id)) return;
    vistos.add(id);
    out.push({ id, rede: "facebook", clube: clube.nome, org: clube.org, ts, legenda: texto, url: link || clube.facebook, img, video: /\/videos\/|\/reel\//.test(link || "") });
  });
  return out;
}

// lê uma página; devolve { posts } ou lança um erro com o estado (para as pausas)
export async function lerPaginaFacebook(clube, { cookie = process.env.FB_COOKIE || null } = {}) {
  const p = paginaFacebook(clube.facebook);
  if (!p) return { posts: [] };
  const res = await buscar(urlPlugin(p.url), {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.7", Referer: "https://www.google.com/", ...(cookie ? { Cookie: cookie } : {}) },
    redirect: "follow", signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw Object.assign(new Error(`Facebook respondeu ${res.status}`), { status: res.status });
  const html = await res.text();
  if (/id=["']login_form["']|\/login\/\?next=|checkpoint/i.test(html) && !/data-utime/.test(html)) throw Object.assign(new Error("Facebook pediu sessão"), { status: 401 });
  return { posts: lerPlugin(html, clube) };
}
