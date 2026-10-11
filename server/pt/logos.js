// Logótipos dos clubes das distritais: a fotografia de perfil da página de Facebook do clube (quase sempre o emblema),
// pedida à Graph API da Meta (com a chave da app, FB_APP_ID|FB_APP_SECRET, quando existe). O clube vem do diretório
// (pt/clubes.json, com o Facebook de cada um); a imagem fica guardada e passa pelo servidor (/api/distritais/logo),
// porque os endereços do Facebook expiram. Clubes sem página ou com a silhueta por omissão ficam sem logótipo.

const GUARDA_MS = 7 * 24 * 3600e3;
const SEM_LOGO_MS = 24 * 3600e3;
const MAX = 800;

// o identificador da página a partir do endereço: «/onze.esperancas/», «profile.php?id=123», «/p/Nome-123/», «/people/Nome/123/»
export function paginaDoFacebook(url) {
  const s = String(url || "").trim();
  if (!/facebook\.com|fb\.com/i.test(s)) return null;
  let u;
  try { u = new URL(/^https?:/i.test(s) ? s : `https://${s}`); } catch { return null; }
  const id = u.searchParams.get("id");
  if (id && /^\d+$/.test(id)) return id;
  const partes = u.pathname.split("/").filter(Boolean);
  if (!partes.length) return null;
  if (partes[0] === "p" && partes[1]) return partes[1].match(/-(\d{6,})$/)?.[1] || null;
  if ((partes[0] === "people" || partes[0] === "pages") && partes.length >= 3 && /^\d+$/.test(partes[2])) return partes[2];
  if (["groups", "events", "watch", "share", "sharer", "profile.php", "pg"].includes(partes[0])) return null;
  const nome = partes[0];
  return /^[\w.-]{2,80}$/.test(nome) ? nome : null;
}

export function createLogos({ clubes, pedir = fetch, agora = () => Date.now(), base = "https://graph.facebook.com/v23.0" } = {}) {
  const guardados = new Map(); // página → { ts, img: { tipo, buf } | null }
  const emCurso = new Map();
  const estado = { pedidos: 0, ok: 0, semLogo: 0, erros: 0, ultimoErro: null };
  const chaveApp = () => (process.env.FB_APP_ID && process.env.FB_APP_SECRET ? `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}` : null);

  // o clube do diretório para o nome de uma equipa (dentro da associação), com a página de Facebook
  function pagina(nome, org) {
    const c = clubes?.encontrar?.(String(nome || ""), org || null);
    return c?.facebook ? paginaDoFacebook(c.facebook) : null;
  }

  async function ler(pag) {
    estado.pedidos++;
    const chave = chaveApp();
    const r = await pedir(`${base}/${encodeURIComponent(pag)}/picture?type=large&redirect=false${chave ? `&access_token=${encodeURIComponent(chave)}` : ""}`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.data?.url) throw new Error(j?.error?.message || `a Meta respondeu ${r.status}`);
    if (j.data.is_silhouette) return null;
    const ri = await pedir(j.data.url, { signal: AbortSignal.timeout(10000) });
    if (!ri.ok) throw new Error(`a imagem respondeu ${ri.status}`);
    const buf = Buffer.from(await ri.arrayBuffer());
    if (!buf.length || buf.length > 400e3) return null;
    return { tipo: ri.headers.get("content-type") || "image/jpeg", buf };
  }

  // a imagem do logótipo de uma equipa (ou null)
  async function logo(nome, org) {
    const pag = pagina(nome, org);
    if (!pag) return null;
    const g = guardados.get(pag);
    if (g && agora() - g.ts < (g.img ? GUARDA_MS : SEM_LOGO_MS)) return g.img;
    if (emCurso.has(pag)) return emCurso.get(pag);
    const p = ler(pag).then((img) => {
      img ? estado.ok++ : estado.semLogo++;
      guardar(pag, img);
      return img;
    }).catch((e) => {
      estado.erros++;
      estado.ultimoErro = { pagina: pag, erro: e.message, ts: agora() };
      guardar(pag, null);
      return null;
    }).finally(() => emCurso.delete(pag));
    emCurso.set(pag, p);
    return p;
  }

  function guardar(pag, img) {
    if (guardados.size >= MAX) guardados.delete(guardados.keys().next().value);
    guardados.set(pag, { ts: agora(), img });
  }

  // o endereço do logótipo para pôr num jogo (só quando o clube tem página de Facebook)
  const endereco = (nome, org) => (pagina(nome, org) ? `/api/distritais/logo?nome=${encodeURIComponent(nome)}${org ? `&org=${encodeURIComponent(org)}` : ""}` : null);

  return { logo, endereco, pagina, estado: () => ({ ...estado, guardados: guardados.size }) };
}
