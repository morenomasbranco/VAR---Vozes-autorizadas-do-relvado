// Secção «Distritais»: os posts mais recentes dos clubes de cada associação de futebol, uma coluna por associação,
// à maneira da «Ronda pela atualidade». Os dados vêm de /api/distritais; os posts novos chegam pelo evento
// «distrital» (o App passa-os como evento da janela «distrital»). As imagens passam pelo servidor.
import { useEffect, useMemo, useState } from "react";

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
        <span className="muted ctime" title={new Date(p.ts).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}>{quando(p.ts, agora)}</span>
      </div>
      <a href={p.url} target="_blank" rel="noreferrer" className="dlink">
        {p.img && !semImagem && (
          <span className="dimg">
            <img src={`${API}/api/distritais/img?u=${encodeURIComponent(p.img)}`} alt={p.alt || ""} loading="lazy" onError={() => setSemImagem(true)} />
            {p.video && <span className="dvid" aria-label="vídeo">▶</span>}
          </span>
        )}
        {texto && <span className="dtxt">{texto}</span>}
      </a>
    </li>
  );
}

export default function Distritais({ API = "", now, query = "" }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [n, setN] = useState({});
  const agora = now || Date.now();
  const ler = () => fetch(`${API}/api/distritais`).then((r) => r.json()).then((x) => { setD(x); setErro(null); }).catch(() => setErro("Sem ligação ao servidor"));
  useEffect(() => { ler(); const t = setInterval(ler, 2 * 60e3); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // post novo em tempo real: entra no topo da coluna da associação
  useEffect(() => {
    const on = (e) => {
      const p = e.detail;
      if (!p?.org) return;
      setD((x) => (x ? { ...x, posts: { ...x.posts, [p.org]: [{ ...p, vistoEm: Date.now() }, ...(x.posts[p.org] || []).filter((y) => y.id !== p.id)].slice(0, 80) } } : x));
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
  return (
    <div className="dist">
      <p className="muted dnota">
        Os posts mais recentes do Instagram dos clubes de cada associação. {e.lidosTotal < e.clubes ? `A ler os perfis dos clubes: ${e.lidosTotal} de ${e.clubes} já lidos (um a cada poucos segundos).` : `${e.clubes} clubes, relidos ao longo do dia.`}
        {e.ultimoErro && agora - e.ultimoErro.ts < 15 * 60e3 && e.via?.includes("pausa") ? " O Instagram pediu uma pausa: a leitura continua mais devagar." : ""}
      </p>
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
.apito .dcols{grid-auto-columns:minmax(260px,1fr)}
.apito .dpost .dlink{display:block;color:inherit;text-decoration:none;margin-top:6px}
.apito .dpost .dlink:hover .dtxt{text-decoration:underline}
.apito .dpost .dimg{position:relative;display:block;aspect-ratio:1/1;max-height:240px;overflow:hidden;border-radius:8px;background:var(--raise);margin-bottom:6px}
.apito .dpost .dimg img{width:100%;height:100%;object-fit:cover;display:block}
.apito .dpost .dvid{position:absolute;right:8px;bottom:8px;font-size:12px;color:#fff;background:rgba(0,0,0,.55);border-radius:999px;padding:2px 8px}
.apito .dpost .dtxt{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;font-size:13.5px;line-height:1.35;white-space:pre-line}
`;
