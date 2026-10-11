// Secção «Glossário»: expressões e vocabulário por modalidade (futebol, futsal, hóquei em patins, basquetebol), alcunhas
// e cidades dos clubes, sinónimos das competições, citações e ideias, e uma pesquisa de sinónimos e antónimos.
// A pesquisa procura primeiro no próprio glossário (web/src/glossario) e, quando é preciso, na internet
// (/api/glossario/palavra, que lê o sinonimos.com.br e o antonimos.com.br). Os dados só se carregam ao abrir a secção.
import { useEffect, useMemo, useRef, useState } from "react";
import { MODS, TERMOS } from "./glossario/termos.js";
import { PAISES } from "./glossario/clubes.js";
import { GRUPOS_COMP } from "./glossario/competicoes.js";
import { norm, lista, unicos, indice, procurarLocal } from "./glossario/pesquisa.js";
import { CITACOES, IDEIAS } from "./glossario/notas.js";

const bandeira = (code) => `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3/${code}.svg`;

function Pesquisa({ API, grupos }) {
  const [palavra, setPalavra] = useState("");
  const [tipo, setTipo] = useState("sinonimos");
  const [pedida, setPedida] = useState(null); // { palavra, tipo }
  const [net, setNet] = useState(null); // { estado: "a procurar" | "ok" | "erro", dados }
  const campo = useRef(null);
  const local = useMemo(() => (pedida ? procurarLocal(grupos, pedida.palavra, pedida.tipo) : []), [grupos, pedida]);

  const naInternet = (p, t) => {
    setNet({ estado: "a procurar" });
    fetch(`${API}/api/glossario/palavra?p=${encodeURIComponent(p)}&tipo=${t}`)
      .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(new Error(d.erro || r.status)))))
      .then((d) => setNet({ estado: "ok", dados: d }))
      .catch(() => setNet({ estado: "erro" }));
  };
  const procurar = (p = palavra, t = tipo) => {
    const limpa = String(p).trim();
    if (!limpa) return;
    setPalavra(limpa);
    setPedida({ palavra: limpa, tipo: t });
    setNet(null);
    // sem nada no glossário, vai logo à internet
    if (!procurarLocal(grupos, limpa, t).length) naInternet(limpa, t);
  };
  const mudarTipo = (t) => { setTipo(t); if (pedida) procurar(pedida.palavra, t); };
  const Palavra = ({ p }) => <button className="gpal" onClick={() => { procurar(p.replace(/\s*\([^)]*\)/g, ""), tipo); campo.current?.focus(); }}>{p}</button>;
  const nome = tipo === "sinonimos" ? "sinónimos" : "antónimos";

  return (
    <section className="gbusca" aria-label="Sinónimos e antónimos">
      <form className="gform" onSubmit={(e) => { e.preventDefault(); procurar(); }}>
        <input ref={campo} value={palavra} onChange={(e) => setPalavra(e.target.value)} placeholder="Escreve uma palavra (ex.: vitória, estádio, Dragões)" aria-label="Palavra" maxLength={40} />
        <div className="seg" role="group" aria-label="Tipo">
          <button type="button" aria-pressed={tipo === "sinonimos"} onClick={() => mudarTipo("sinonimos")}>Sinónimos</button>
          <button type="button" aria-pressed={tipo === "antonimos"} onClick={() => mudarTipo("antonimos")}>Antónimos</button>
        </div>
        <button type="submit" className="gir">Procurar</button>
      </form>
      {pedida && (
        <div className="gres" aria-live="polite">
          {local.map((r, i) => (
            <div key={i} className="gbloco">
              <p className="gorig muted">{r.origem ? `No glossário · ${r.origem}` : "No glossário"}{r.def && <span> — {r.def}</span>}</p>
              <div className="gpals">{r.palavras.map((p) => <Palavra key={p} p={p} />)}</div>
            </div>
          ))}
          {net?.estado === "a procurar" && <p className="muted">A procurar {nome} de «{pedida.palavra}» na internet…</p>}
          {net?.estado === "erro" && <p className="muted">Não foi possível procurar na internet agora.{!local.length && ` O glossário não tem ${nome} de «${pedida.palavra}».`}</p>}
          {net?.estado === "ok" && (net.dados.sentidos.length ? net.dados.sentidos.map((s, i) => (
            <div key={i} className="gbloco">
              <p className="gorig muted">Na internet · {net.dados.fonte} (português do Brasil){s.sentido && <span> — {s.sentido}</span>}</p>
              <div className="gpals">{s.palavras.map((p) => <Palavra key={p} p={p} />)}</div>
            </div>
          )) : <p className="muted">Não há {nome} de «{pedida.palavra}» {local.length ? "na internet." : "nem no glossário nem na internet."}</p>)}
          {!net && local.length > 0 && (
            <button className="textbtn gmais" onClick={() => naInternet(pedida.palavra, pedida.tipo)}>Procurar mais {nome} na internet</button>
          )}
        </div>
      )}
    </section>
  );
}

const ABAS = [
  { id: "expressoes", nome: "Expressões" },
  { id: "clubes", nome: "Clubes" },
  { id: "competicoes", nome: "Competições" },
  { id: "notas", nome: "Notas e citações" },
];
const ler = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };

export default function Glossario({ API = "", query = "" }) {
  const [aba, setAba] = useState(() => ler("glos-aba", "expressoes"));
  const [mod, setMod] = useState(() => ler("glos-mod", "todas"));
  const [pais, setPais] = useState(() => ler("glos-pais", "pt"));
  const grupos = useMemo(indice, []);
  const q = norm(query);
  const tem = (...partes) => !q || norm(partes.join(" ")).includes(q);
  useEffect(() => { gravar("glos-aba", aba); }, [aba]);
  useEffect(() => { gravar("glos-mod", mod); }, [mod]);
  useEffect(() => { gravar("glos-pais", pais); }, [pais]);

  const termos = TERMOS.filter((x) => (mod === "todas" || x.m === mod) && tem(x.t, x.d, ...(x.s || []), ...(x.a || []), x.e || ""))
    .sort((a, b) => a.t.localeCompare(b.t, "pt"));
  // com uma pesquisa, os clubes procuram-se em todos os países
  const paises = PAISES.filter((p) => q || p.id === pais)
    .map((p) => ({ ...p, clubes: p.clubes.filter((c) => tem(...c)) })).filter((p) => p.clubes.length);
  const comps = GRUPOS_COMP.map((g) => ({ ...g, provas: g.provas.filter((c) => tem(g.nome, ...c)) })).filter((g) => g.provas.length);
  const citas = CITACOES.filter((c) => tem(c.t, c.a || "", c.o || "", c.n || ""));
  const ideias = IDEIAS.filter((c) => tem(c.tema, c.t));
  const vazio = <p className="empty">Nada no glossário com «{query}».</p>;

  return (
    <div className="glos">
      <style>{GLOS_CSS}</style>
      <Pesquisa API={API} grupos={grupos} />
      <div className="seg gabas" role="group" aria-label="Partes do glossário">
        {ABAS.map((a) => <button key={a.id} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>{a.nome}</button>)}
      </div>

      {aba === "expressoes" && (
        <>
          <div className="seg lvls mods" role="group" aria-label="Modalidade">
            <button aria-pressed={mod === "todas"} onClick={() => setMod("todas")}>Todas</button>
            {MODS.map((m) => <button key={m.id} aria-pressed={mod === m.id} onClick={() => setMod(m.id)}>{m.nome}</button>)}
          </div>
          {termos.length === 0 ? vazio : (
            <dl className="gtermos">
              {termos.map((x) => (
                <div key={`${x.m}|${x.t}`} className="gtermo">
                  <dt>{x.t}{mod === "todas" && <span className="gmod">{MODS.find((m) => m.id === x.m)?.nome}</span>}</dt>
                  <dd>
                    <p>{x.d}</p>
                    {x.s?.length > 0 && <p className="gsin"><b>Sinónimos:</b> {unicos(x.s).join(", ")}</p>}
                    {x.a?.length > 0 && <p className="gant"><b>Antónimos:</b> {unicos(x.a).join(", ")}</p>}
                    {x.e && <p className="gex">{x.e}</p>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      {aba === "clubes" && (
        <>
          {!q && (
            <div className="seg lvls mods" role="group" aria-label="País">
              {PAISES.map((p) => (
                <button key={p.id} aria-pressed={pais === p.id} onClick={() => setPais(p.id)}>
                  <img className="flag" src={bandeira(p.bandeira)} alt="" width="16" height="12" loading="lazy" /> {p.nome}
                </button>
              ))}
            </div>
          )}
          {paises.length === 0 ? vazio : paises.map((p) => (
            <section key={p.id} className="gpais">
              {q && <h2 className="gh2"><img className="flag" src={bandeira(p.bandeira)} alt="" width="18" height="13" loading="lazy" /> {p.nome}</h2>}
              <ul className="gclubes">
                {p.clubes.map(([nome, cidade, alc, estadio, nota]) => (
                  <li key={nome} className="gclube">
                    <h3>{nome}</h3>
                    <p className="muted gcid">{cidade}{estadio && <> · <span title="Estádio (o reduto)">🏟 {estadio}</span></>}</p>
                    <div className="galc">{lista(alc).map((a) => <span key={a} className="chip">{a}</span>)}</div>
                    {nota && <p className="gnota">{nota}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {aba === "competicoes" && (comps.length === 0 ? vazio : (
        <div className="gcomps">
          {comps.map((g) => (
            <section key={g.id} className="gcomp">
              <h2 className="gh2"><img className="flag" src={bandeira(g.bandeira)} alt="" width="18" height="13" loading="lazy" /> {g.nome}</h2>
              <ul>
                {g.provas.map(([nome, sin, nota]) => (
                  <li key={nome}>
                    <b>{nome}</b>
                    <div className="galc">{lista(sin).map((a) => <span key={a} className="chip">{a}</span>)}</div>
                    {nota && <p className="gnota">{nota}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}

      {aba === "notas" && (citas.length + ideias.length === 0 ? vazio : (
        <div className="gnotas">
          {citas.length > 0 && (
            <section>
              <h2 className="gh2">Citações</h2>
              {citas.map((c) => (
                <figure key={c.t} className="gcita">
                  <blockquote>«{c.t}»</blockquote>
                  {(c.a || c.o) && <figcaption>{c.a && <b>{c.a}</b>}{c.a && c.o && ", "}{c.o}</figcaption>}
                  {c.n && <p className="gnota">{c.n}</p>}
                </figure>
              ))}
            </section>
          )}
          {ideias.length > 0 && (
            <section>
              <h2 className="gh2">Ideias e curiosidades</h2>
              <ul className="gideias">
                {ideias.map((c) => <li key={c.t}><span className="gmod">{c.tema}</span> {c.t}</li>)}
              </ul>
            </section>
          )}
        </div>
      ))}
    </div>
  );
}

const GLOS_CSS = `
.apito .glos{max-width:1200px;padding-bottom:40px}
.apito .gbusca{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;background:var(--raise);padding:12px 14px;margin:0 0 16px}
.apito .gform{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.apito .gform input{flex:1 1 220px;min-width:0;font:inherit;font-size:15px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:7px 14px}
.apito .gform input:focus{outline:2px solid var(--accent);outline-offset:1px}
.apito .gir{font-weight:600;font-size:14px;padding:6px 14px;border-radius:999px;background:var(--ink);color:var(--bg)}
.apito .gres{margin-top:10px}
.apito .gbloco{margin:8px 0 0}
.apito .gorig{font-size:12px;margin:0 0 4px}
.apito .gpals{display:flex;flex-wrap:wrap;gap:6px}
.apito .gpal{font-size:14px;padding:2px 10px;border:1px solid var(--line);border-radius:999px;background:var(--bg)}
.apito .gpal:hover{border-color:var(--ink)}
.apito .gmais{margin-top:8px;font-size:13px}
.apito .gabas{margin:0 0 12px;flex-wrap:wrap}
.apito .gtermos{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin:0}
.apito .gtermo{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--raise)}
.apito .gtermo dt{font-weight:700;font-size:16px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.apito .gtermo dd{margin:4px 0 0;font-size:14px}
.apito .gtermo dd p{margin:0 0 4px}
.apito .gmod{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.apito .gsin b,.apito .gant b{font-weight:600}
.apito .gant{color:var(--muted)}
.apito .gex{font-style:italic;color:var(--muted)}
.apito .gh2{font-family:var(--display);font-size:17px;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:8px}
.apito .gclubes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.apito .gclube{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--raise)}
.apito .gclube h3{margin:0;font-size:15px}
.apito .gcid{font-size:12.5px;margin:2px 0 6px}
.apito .galc{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.apito .galc .chip{font-weight:500;color:var(--ink);background:var(--bg)}
.apito .gnota{font-size:12.5px;color:var(--muted);margin:6px 0 0}
.apito .gcomps{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:4px 24px}
.apito .gcomp ul{list-style:none;margin:0;padding:0}
.apito .gcomp li{padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
.apito .gnotas{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:8px 32px}
.apito .gcita{margin:0 0 14px;padding:0 0 0 12px;border-left:3px solid var(--accent)}
.apito .gcita blockquote{margin:0;font-size:15px}
.apito .gcita figcaption{font-size:13px;color:var(--muted);margin-top:2px}
.apito .gideias{list-style:none;margin:0;padding:0}
.apito .gideias li{padding:8px 0;border-bottom:1px solid var(--line);font-size:14.5px}
@media (max-width:640px){
  .apito .gtermos,.apito .gclubes,.apito .gcomps,.apito .gnotas{grid-template-columns:minmax(0,1fr)}
}
`;
