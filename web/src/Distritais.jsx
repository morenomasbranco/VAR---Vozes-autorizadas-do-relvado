// Secção «Distritais»: os posts mais recentes dos clubes de cada associação de futebol, uma coluna por associação,
// à maneira da «Ronda pela atualidade». Os dados vêm de /api/distritais; os posts novos chegam pelo evento
// «distrital» (o App passa-os como evento da janela «distrital»). As imagens passam pelo servidor.
import { useEffect, useMemo, useState } from "react";

// o mesmo post no Instagram e no Facebook do clube (a mesma regra do servidor, em server/pt/distritais.js)
const palavrasDe = (t) => new Set(String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/https?:\/\/\S+|#\S+|@\S+/g, " ").match(/[a-z0-9]{2,}/g) || []);
function mesmoPost(a, b) {
  if (a.rede === b.rede || a.clube !== b.clube || Math.abs(a.ts - b.ts) > 6 * 3600e3) return false;
  const pa = palavrasDe(a.legenda), pb = palavrasDe(b.legenda);
  if (pa.size < 3 || pb.size < 3) return false;
  let comuns = 0;
  for (const w of pa) if (pb.has(w)) comuns++;
  return comuns / Math.min(pa.size, pb.size) >= 0.8;
}
const semAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function quando(ts, agora) {
  const d = agora - ts;
  if (d < 60e3) return "agora";
  if (d < 3600e3) return `há ${Math.floor(d / 60e3)} min`;
  if (d < 24 * 3600e3) return `há ${Math.floor(d / 3600e3)} h`;
  if (d < 48 * 3600e3) return "ontem";
  return new Date(ts).toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: "Europe/Lisbon" });
}

function Post({ p, API, agora }) {
  const [semImagem, setSemImagem] = useState(false);
  const texto = p.legenda || p.alt || "";
  return (
    <li className={`citem dpost ${agora - (p.vistoEm || 0) < 4000 ? "fresh" : ""}`}>
      <div className="cmeta">
        <span className="src">{p.clube}</span>
        <span className={`drede ${p.rede === "facebook" ? "fb" : "ig"}`} aria-label={p.rede === "facebook" ? "Facebook" : "Instagram"}>{p.rede === "facebook" ? "Facebook" : "Instagram"}</span>
        <span className="muted ctime" title={new Date(p.ts).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}>{quando(p.ts, agora)}</span>
      </div>
      <a href={p.url} target="_blank" rel="noreferrer" className="dlink" title={p.rede === "facebook" ? "Ver no Facebook" : "Ver no Instagram"}>
        {p.img && !semImagem && (
          <span className="dimg">
            <img src={`${API}/api/distritais/img?u=${encodeURIComponent(p.img)}`} alt={p.alt || ""} loading="lazy" onError={() => setSemImagem(true)} />
            {p.video && <span className="dvid" aria-label="vídeo">▶</span>}
          </span>
        )}
        {texto && <span className="dtxt">{texto}</span>}
      </a>
      {p.tambem?.length > 0 && (
        <p className="dtambem muted">também no {p.tambem.map((x, i) => <span key={i}>{i ? " e " : ""}<a href={x.url} target="_blank" rel="noreferrer">{x.rede === "facebook" ? "Facebook" : "Instagram"}</a></span>)}</p>
      )}
    </li>
  );
}

export default function Distritais({ API = "", now, query = "" }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [n, setN] = useState({});
  const agora = now || Date.now();
  const ler = () => fetch(`${API}/api/distritais`).then((r) => r.json()).then((x) => { setD(x); setErro(null); }).catch(() => setErro("Sem ligação ao servidor"));
  // enquanto ainda há clubes por ler, relê de 20 em 20 s (as colunas vão enchendo); depois, de 2 em 2 min
  const aLer = !d || (d.estado?.lidosTotal || 0) < (d.estado?.perfis || d.estado?.clubes || 0);
  useEffect(() => { ler(); const t = setInterval(ler, aLer ? 20e3 : 2 * 60e3); return () => clearInterval(t); }, [aLer]); // eslint-disable-line react-hooks/exhaustive-deps
  // post novo em tempo real: entra no topo da coluna da associação
  useEffect(() => {
    const on = (e) => {
      const p = e.detail;
      if (!p?.org) return;
      setD((x) => {
        if (!x) return x;
        const lista = (x.posts[p.org] || []).filter((y) => y.id !== p.id);
        // o mesmo post que já veio pela outra rede: fica o que já lá estava, com a ligação deste
        const igual = lista.find((q) => mesmoPost(q, p));
        if (igual) return { ...x, posts: { ...x.posts, [p.org]: lista.map((q) => (q === igual ? { ...q, tambem: [...(q.tambem || []), { rede: p.rede, url: p.url }] } : q)) } };
        return { ...x, posts: { ...x.posts, [p.org]: [{ ...p, vistoEm: Date.now() }, ...lista].slice(0, 80) } };
      });
    };
    window.addEventListener("distrital", on);
    return () => window.removeEventListener("distrital", on);
  }, []);

  const q = semAcentos(query.trim());
  const colunas = useMemo(() => (d?.orgs || []).map((o) => ({
    ...o, posts: (d.posts[o.key] || []).filter((p) => !q || semAcentos(`${p.clube} ${p.legenda || ""}`).includes(q)),
  })), [d, q]);

  if (!d) return <p className="empty">{erro || "A carregar os posts dos clubes…"}</p>;
  const e = d.estado || {};
  const vias = e.vias || {};
  const hora = (t) => new Date(t).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
  const ig = vias.instagram || {};
  const fb = vias.facebook || null;
  const igPausa = agora < (ig.pausaAte || 0);
  const anonFalha = vias.anonimo && vias.anonimo.erros > 0 && !vias.anonimo.ok;
  const relayVivo = vias.retransmissor?.ultimo && agora - vias.retransmissor.ultimo < 10 * 60e3;
  const fbPausa = fb && agora < (fb.pausaAte || 0);
  const fbFalha = fb && fb.erros > 0 && !fb.ok;
  // nada está a chegar: o Instagram recusa, os visualizadores falham, o Facebook também (ou não há) e não há retransmissor
  const bloqueado = igPausa && anonFalha && !relayVivo && (!fb || fbPausa || fbFalha);
  const total = Object.values(d.posts || {}).reduce((t, l) => t + l.length, 0);
  const porLer = (e.lidosTotal || 0) < (e.perfis || e.clubes || 0);
  return (
    <div className="dist">
      <p className="muted dnota">
        Os posts mais recentes do Instagram e do Facebook dos clubes de cada associação.{" "}
        {porLer ? `A ler as páginas dos clubes: ${e.lidosTotal || 0} de ${e.perfis || e.clubes} já lidas, ${total} posts.` : `${e.perfis || e.clubes} páginas de clubes, relidas ao longo do dia.`}
      </p>
      <ul className="muted dvias">
        <li>
          Instagram{ig.comSessao ? " (com sessão)" : " (sem sessão)"}: {e.lidosInstagram ?? 0} de {e.paginasInstagram ?? "?"} lidos
          {igPausa ? ` · o Instagram está a limitar os pedidos deste servidor (${ig.ultimoErro || "recusa"}); volta a tentar às ${hora(ig.pausaAte)}, mais devagar` : ig.ultimoOk ? " · a ler" : ""}
        </li>
        {fb && <li>Facebook: {e.lidosFacebook ?? 0} de {e.paginasFacebook ?? fb.paginas} páginas lidas{fbPausa ? ` · o Facebook está a recusar os pedidos (${fb.ultimoErro || "recusa"}); volta a tentar às ${hora(fb.pausaAte)}` : fbFalha ? ` · ainda sem leituras certas (${fb.ultimoErro || "erro"})` : fb.ok ? " · a ler" : ""}</li>}
        {relayVivo && <li>Retransmissor de casa: {vias.retransmissor.ok} perfis recebidos</li>}
      </ul>
      {bloqueado && (
        <p className="ptwarn dnota">
          Neste momento nenhuma das vias está a trazer posts.{" "}
          {ig.comSessao
            ? "O Instagram está a limitar este servidor mesmo com a sessão: costuma acontecer com servidores de alojamento e passa ao fim de algum tempo, mas a forma mais fiável é a ponte de casa num computador de casa (o guia está em deploy/GUIA-PONTE-CASA.md)."
            : "Junta ao servidor a variável IG_SESSIONID (a sessão de uma conta de Instagram qualquer, sem seguir ninguém) ou liga a ponte de casa num computador de casa (o guia está em deploy/GUIA-PONTE-CASA.md)."}
        </p>
      )}
      <div className="cols dcols">
        {colunas.map((c) => {
          const k = n[c.key] || 12;
          return (
            <section key={c.key} className="col">
              <h2 className="colh">{c.nome} <span className="muted small">{c.clubes} clubes</span></h2>
              {c.posts.length === 0 ? <p className="cempty">{q ? "Nada com esta pesquisa." : "Ainda sem posts lidos desta associação."}</p> : (
                <ul className="clist" aria-live="polite">
                  {c.posts.slice(0, k).map((p) => <Post key={p.id} p={p} API={API} agora={agora} />)}
                </ul>
              )}
              {c.posts.length > k && <button className="textbtn vmais" onClick={() => setN((x) => ({ ...x, [c.key]: k + 12 }))}>Ver mais ({c.posts.length - k})</button>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export const DIST_CSS = `
.apito .dist .dnota{font-size:12.5px;margin:0 0 12px}
.apito .dist .dvias{font-size:12px;margin:-6px 0 12px;padding-left:18px}
.apito .dpost .drede{font-size:10.5px;font-weight:700;border-radius:4px;padding:0 5px;line-height:16px;color:#fff;flex:none}
.apito .dpost .drede.ig{background:#C13584} .apito .dpost .drede.fb{background:#1877F2}
.apito .dpost .dtambem{font-size:11.5px;margin:4px 0 0} .apito .dpost .dtambem a{color:inherit}
.apito .dcols{grid-auto-columns:minmax(260px,1fr)}
.apito .dpost .dlink{display:block;color:inherit;text-decoration:none;margin-top:6px}
.apito .dpost .dlink:hover .dtxt{text-decoration:underline}
.apito .dpost .dimg{position:relative;display:block;aspect-ratio:1/1;max-height:240px;overflow:hidden;border-radius:8px;background:var(--raise);margin-bottom:6px}
.apito .dpost .dimg img{width:100%;height:100%;object-fit:cover;display:block}
.apito .dpost .dvid{position:absolute;right:8px;bottom:8px;font-size:12px;color:#fff;background:rgba(0,0,0,.55);border-radius:999px;padding:2px 8px}
.apito .dpost .dtxt{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;font-size:13.5px;line-height:1.35;white-space:pre-line}
`;
