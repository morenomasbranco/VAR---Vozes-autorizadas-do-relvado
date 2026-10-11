// Secção «Glossário»: expressões e vocabulário por modalidade (futebol, futsal, hóquei em patins, basquetebol), alcunhas
// e cidades dos clubes, sinónimos das competições e dos países, citações e ideias, e uma pesquisa de sinónimos e antónimos.
// «Preparar um jogo»: escolhe-se um jogo (dos que estão a decorrer, que o App passa em «jogos») ou escrevem-se as
// equipas, e o glossário destaca as palavras que fazem sentido; cada palavra pode ir para «a minha lista».
// A pesquisa procura primeiro no próprio glossário (web/src/glossario) e, quando é preciso, na internet
// (/api/glossario/palavra: sinonimos.com.br e antonimos.com.br, e o Wikcionário). Os dados só se carregam ao abrir a secção.
import { useEffect, useMemo, useRef, useState } from "react";
import { MODS, TERMOS } from "./glossario/termos.js";
import { PAISES } from "./glossario/clubes.js";
import { GRUPOS_COMP } from "./glossario/competicoes.js";
import { norm, lista, unicos, indice, procurarLocal } from "./glossario/pesquisa.js";
import { CITACOES, IDEIAS } from "./glossario/notas.js";
import { PAISES_GLOS } from "./glossario/paises.js";
import { fichaDoJogo, nomesParaEscolher } from "./glossario/jogo.js";

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
              <p className="gorig muted">Na internet · {net.dados.fonte === "pt.wiktionary.org" ? "Wikcionário" : `${net.dados.fonte} (português do Brasil)`}{s.sentido && <span> — {s.sentido}</span>}</p>
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
  { id: "paises", nome: "Países" },
  { id: "notas", nome: "Notas e citações" },
];
const ler = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };
const lerJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const MOD_NOME = Object.fromEntries(MODS.map((m) => [m.id, m.nome]));
const TERMO = new Map(TERMOS.map((x) => [x.t, x]));

// uma palavra que se junta à «minha lista» (ou sai dela) com um toque
function Palavra({ p, lista: minha, alternar, titulo }) {
  const tem = minha.includes(p);
  return <button type="button" className={`chip gchip${tem ? " on" : ""}`} aria-pressed={tem} title={titulo || (tem ? "Tirar da minha lista" : "Juntar à minha lista")} onClick={() => alternar(p)}>{p}</button>;
}

// «Preparar um jogo»: escolher um jogo (dos que estão a decorrer ou dos de hoje) ou escrever as equipas e a prova
function PrepararJogo({ jogos, jogo, setJogo }) {
  const [aMao, setAMao] = useState(false);
  const [forma, setForma] = useState({ h: "", a: "", comp: "", mod: "futebol" });
  const nomes = useMemo(nomesParaEscolher, []);
  const igual = (j) => jogo && j.h === jogo.h && j.a === jogo.a && (j.comp || "") === (jogo.comp || "");
  return (
    <section className="gjogo" aria-label="Preparar um jogo">
      <div className="gjogo-cab">
        <h2 className="gh2">Preparar um jogo</h2>
        <p className="muted">Escolhe um jogo e o glossário destaca as palavras que fazem sentido para ele.</p>
      </div>
      {jogos.length > 0 ? (
        <div className="gjogos">
          {jogos.slice(0, 16).map((j) => (
            <button key={j.id} className={`gjg${j.vivo ? " vivo" : ""}`} aria-pressed={!!igual(j)} onClick={() => setJogo(igual(j) ? null : { h: j.h, a: j.a, comp: j.comp, mod: j.mod })}>
              {j.vivo && <i className="gpulso" aria-label="em direto" />}
              <b>{j.h}</b> <span translate="no">{j.hs ?? ""}{j.hs != null ? "–" : "x"}{j.as ?? ""}</span> <b>{j.a}</b>
              {j.comp && <span className="muted"> · {j.comp}</span>}
            </button>
          ))}
        </div>
      ) : <p className="muted gsem">Não há jogos a decorrer agora: escolhe à mão.</p>}
      <div className="gjogo-acoes">
        <button className="textbtn" onClick={() => setAMao((v) => !v)} aria-expanded={aMao}>{aMao ? "Fechar" : "Escolher à mão"}</button>
        {jogo && <button className="textbtn" onClick={() => setJogo(null)}>Limpar o jogo</button>}
      </div>
      {aMao && (
        <form className="gform gmao" onSubmit={(e) => { e.preventDefault(); if (forma.h || forma.a) setJogo({ ...forma }); }}>
          <datalist id="glos-equipas">{nomes.equipas.map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="glos-provas">{nomes.provas.map((n) => <option key={n} value={n} />)}</datalist>
          <input list="glos-equipas" value={forma.h} onChange={(e) => setForma({ ...forma, h: e.target.value })} placeholder="Equipa da casa (ex.: Milan)" aria-label="Equipa da casa" />
          <input list="glos-equipas" value={forma.a} onChange={(e) => setForma({ ...forma, a: e.target.value })} placeholder="Equipa de fora (ex.: Juventus)" aria-label="Equipa de fora" />
          <input list="glos-provas" value={forma.comp} onChange={(e) => setForma({ ...forma, comp: e.target.value })} placeholder="Competição (ex.: Serie A)" aria-label="Competição" />
          <select value={forma.mod} onChange={(e) => setForma({ ...forma, mod: e.target.value })} aria-label="Modalidade">
            {MODS.filter((m) => ["futebol", "futsal", "hoquei", "basquete"].includes(m.id)).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <button type="submit" className="gir">Preparar</button>
        </form>
      )}
    </section>
  );
}

// a ficha do jogo escolhido: as palavras de cada equipa, da prova, dos países e as expressões que dão jeito
function FichaDoJogo({ ficha, minha, alternar }) {
  const P = (p) => <Palavra key={p} p={p} lista={minha} alternar={alternar} />;
  const lado = (l, papel) => {
    if (!l) return null;
    const c = l.clube, s = l.selecao;
    return (
      <div className="gfcard">
        <p className="gmod">{papel}</p>
        {c ? (
          <>
            <h3>{c.pais && <img className="flag" src={bandeira(c.pais.b)} alt="" width="16" height="12" />} {P(c.nome)}</h3>
            <p className="muted gcid">{P(c.cidade.replace(/\s*\(.*$/, ""))}{c.estadio && <> · 🏟 {P(c.estadio)}</>}</p>
            <div className="galc">{c.alcunhas.map(P)}</div>
            {c.nota && <p className="gnota">{c.nota}</p>}
          </>
        ) : s ? (
          <>
            <h3><img className="flag" src={bandeira(s.b)} alt="" width="16" height="12" /> {P(s.n)}</h3>
            <div className="galc">{lista(s.s).filter((x) => x !== "—").map(P)}</div>
            <p className="muted gcid">{lista(s.g).map(P)}</p>
          </>
        ) : (
          <><h3>{l.nome}</h3><p className="muted">Ainda não está no glossário.</p></>
        )}
      </div>
    );
  };
  return (
    <section className="gficha" aria-label="Palavras para este jogo">
      <div className="gfcards">
        {lado(ficha.casa, "Casa · visitado")}
        {lado(ficha.fora, "Fora · visitante")}
        {ficha.prova && (
          <div className="gfcard">
            <p className="gmod">Competição</p>
            <h3><img className="flag" src={bandeira(ficha.prova.bandeira)} alt="" width="16" height="12" /> {P(ficha.prova.nome)}</h3>
            <div className="galc">{ficha.prova.sinonimos.map(P)}</div>
          </div>
        )}
        {ficha.paises.map((p) => (
          <div key={p.n} className="gfcard">
            <p className="gmod">País</p>
            <h3><img className="flag" src={bandeira(p.b)} alt="" width="16" height="12" /> {P(p.n)}</h3>
            <div className="galc">{lista(p.p).map(P)}</div>
            <p className="muted gcid">{lista(p.g).map(P)}{p.c && p.c !== "—" && <> · capital: {P(p.c)}</>}</p>
          </div>
        ))}
        <div className="gfcard gflarga">
          <p className="gmod">Expressões que dão jeito ({MOD_NOME[ficha.mod] || "Futebol"})</p>
          <ul className="gftermos">
            {ficha.termos.map((t) => TERMO.get(t)).filter(Boolean).map((x) => (
              <li key={x.t}>{P(x.t)} {x.s?.length > 0 && <span className="muted">{unicos(x.s).slice(0, 6).join(", ")}</span>}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function Glossario({ API = "", query = "", jogos = [] }) {
  const [aba, setAba] = useState(() => ler("glos-aba", "expressoes"));
  const [mod, setMod] = useState(() => ler("glos-mod", "todas"));
  const [pais, setPais] = useState(() => ler("glos-pais", "pt"));
  const [jogo, setJogo] = useState(() => lerJson("glos-jogo", null));
  const [minha, setMinha] = useState(() => lerJson("glos-lista", []));
  const [copiado, setCopiado] = useState(false);
  const grupos = useMemo(indice, []);
  const q = norm(query);
  const tem = (...partes) => !q || norm(partes.join(" ")).includes(q);
  useEffect(() => { gravar("glos-aba", aba); }, [aba]);
  useEffect(() => { gravar("glos-mod", mod); }, [mod]);
  useEffect(() => { gravar("glos-pais", pais); }, [pais]);
  useEffect(() => { gravar("glos-jogo", JSON.stringify(jogo)); }, [jogo]);
  useEffect(() => { gravar("glos-lista", JSON.stringify(minha)); }, [minha]);
  const alternar = (p) => setMinha((m) => (m.includes(p) ? m.filter((x) => x !== p) : [...m, p]));
  const copiar = () => {
    navigator.clipboard?.writeText(minha.join(", ")).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {});
  };

  // o jogo escolhido e o que se destaca em cada parte do glossário
  const ficha = useMemo(() => (jogo ? fichaDoJogo(jogo) : null), [jogo]);
  const dest = useMemo(() => ({
    clubes: new Set([ficha?.casa?.clube?.nome, ficha?.fora?.clube?.nome].filter(Boolean)),
    prova: ficha?.prova?.nome || null,
    paises: new Set((ficha?.paises || []).map((p) => p.n)),
    termos: new Set(ficha?.termos || []),
  }), [ficha]);
  const primeiro = (a, b) => (b ? 1 : 0) - (a ? 1 : 0);

  const termos = TERMOS.filter((x) => (mod === "todas" || x.m === mod) && tem(x.t, x.d, ...(x.s || []), ...(x.a || []), x.e || ""))
    .sort((a, b) => primeiro(dest.termos.has(a.t), dest.termos.has(b.t)) || a.t.localeCompare(b.t, "pt"));
  // com uma pesquisa, os clubes procuram-se em todos os países
  const paises = PAISES.filter((p) => q || p.id === pais)
    .map((p) => ({ ...p, clubes: p.clubes.filter((c) => tem(...c)) })).filter((p) => p.clubes.length);
  const clubesDoJogo = PAISES.flatMap((p) => p.clubes.filter((c) => dest.clubes.has(c[0])).map((c) => ({ c, p })));
  const comps = GRUPOS_COMP.map((g) => ({ ...g, provas: g.provas.filter((c) => tem(g.nome, ...c)) })).filter((g) => g.provas.length)
    .sort((a, b) => primeiro(a.provas.some((c) => c[0] === dest.prova), b.provas.some((c) => c[0] === dest.prova)));
  const listaPaises = PAISES_GLOS.filter((p) => tem(p.n, p.g, p.p, p.s, p.c)).sort((a, b) => primeiro(dest.paises.has(a.n), dest.paises.has(b.n)));
  const citas = CITACOES.filter((c) => tem(c.t, c.a || "", c.o || "", c.n || ""));
  const ideias = IDEIAS.filter((c) => tem(c.tema, c.t));
  const vazio = <p className="empty">Nada no glossário com «{query}».</p>;
  const P = (p) => <Palavra key={p} p={p} lista={minha} alternar={alternar} />;
  const cartaoClube = ([nome, cidade, alc, estadio, nota], destacado) => (
    <li key={nome} className={`gclube${destacado ? " gdest" : ""}`}>
      <h3>{nome}</h3>
      <p className="muted gcid">{cidade}{estadio && <> · <span title="Estádio (o reduto)">🏟 {estadio}</span></>}</p>
      <div className="galc">{lista(alc).map(P)}</div>
      {nota && <p className="gnota">{nota}</p>}
    </li>
  );

  return (
    <div className="glos">
      <style>{GLOS_CSS}</style>
      <Pesquisa API={API} grupos={grupos} />
      <PrepararJogo jogos={jogos} jogo={jogo} setJogo={setJogo} />
      {ficha && <FichaDoJogo ficha={ficha} minha={minha} alternar={alternar} />}
      {minha.length > 0 && (
        <section className="gminha" aria-label="A minha lista">
          <p className="gmod">A minha lista ({minha.length})</p>
          <div className="galc">{minha.map((p) => <button key={p} className="chip gchip on" onClick={() => alternar(p)} title="Tirar da minha lista">{p} ×</button>)}</div>
          <div className="gjogo-acoes">
            <button className="textbtn" onClick={copiar}>{copiado ? "Copiado" : "Copiar"}</button>
            <button className="textbtn" onClick={() => setMinha([])}>Limpar a lista</button>
          </div>
        </section>
      )}
      <div className="seg gabas" role="group" aria-label="Partes do glossário">
        {ABAS.map((a) => <button key={a.id} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>{a.nome}</button>)}
      </div>

      {aba === "expressoes" && (
        <>
          <div className="seg lvls mods gmods" role="group" aria-label="Modalidade">
            <button aria-pressed={mod === "todas"} onClick={() => setMod("todas")}>Todas</button>
            {MODS.map((m) => <button key={m.id} aria-pressed={mod === m.id} onClick={() => setMod(m.id)}>{m.nome}</button>)}
          </div>
          {termos.length === 0 ? vazio : (
            <dl className="gtermos">
              {termos.map((x) => (
                <div key={`${x.m}|${x.t}`} className={`gtermo${dest.termos.has(x.t) ? " gdest" : ""}`}>
                  <dt>{P(x.t)}{mod === "todas" && <span className="gmod">{MOD_NOME[x.m]}</span>}</dt>
                  <dd>
                    <p>{x.d}</p>
                    {x.s?.length > 0 && <p className="gsin"><b>Sinónimos:</b> {unicos(x.s).map(P)}</p>}
                    {x.a?.length > 0 && <p className="gant"><b>Antónimos:</b> {unicos(x.a).map(P)}</p>}
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
          {clubesDoJogo.length > 0 && !q && (
            <section className="gpais">
              <h2 className="gh2">Deste jogo</h2>
              <ul className="gclubes">{clubesDoJogo.map(({ c }) => cartaoClube(c, true))}</ul>
            </section>
          )}
          {!q && (
            <div className="seg lvls mods gmods" role="group" aria-label="País">
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
              <ul className="gclubes">{p.clubes.map((c) => cartaoClube(c, dest.clubes.has(c[0])))}</ul>
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
                {[...g.provas].sort((a, b) => primeiro(a[0] === dest.prova, b[0] === dest.prova)).map(([nome, sin, nota]) => (
                  <li key={nome} className={nome === dest.prova ? "gdest" : undefined}>
                    <b>{nome}</b>
                    <div className="galc">{lista(sin).map(P)}</div>
                    {nota && <p className="gnota">{nota}</p>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ))}

      {aba === "paises" && (listaPaises.length === 0 ? vazio : (
        <ul className="gclubes">
          {listaPaises.map((p) => (
            <li key={p.n} className={`gclube${dest.paises.has(p.n) ? " gdest" : ""}`}>
              <h3><img className="flag" src={bandeira(p.b)} alt="" width="18" height="13" loading="lazy" /> {p.n}</h3>
              <p className="muted gcid">{p.g}{p.c && p.c !== "—" && <> · capital: {p.c}</>}</p>
              <p className="gmod gsub">O país</p>
              <div className="galc">{lista(p.p).map(P)}</div>
              {p.s && p.s !== "—" && <><p className="gmod gsub">A seleção</p><div className="galc">{lista(p.s).map(P)}</div></>}
            </li>
          ))}
        </ul>
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
.apito .glos{max-width:1200px;margin:0 auto;padding-bottom:40px}
.apito .gbusca,.apito .gjogo,.apito .gminha{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px;background:var(--raise);padding:12px 14px;margin:0 0 16px}
.apito .gjogo{border-left-color:var(--hist)}
.apito .gminha{border-left-color:var(--ink)}
.apito .gjogo-cab{text-align:center}
.apito .gjogo-cab .gh2{justify-content:center;margin:0 0 2px}
.apito .gjogo-cab p{margin:0 0 10px;font-size:13px}
.apito .gjogos{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.apito .gjg{font-size:13px;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--bg);display:inline-flex;align-items:center;gap:4px}
.apito .gjg[aria-pressed="true"]{border-color:var(--hist);box-shadow:0 0 0 1px var(--hist)}
.apito .gpulso{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--live);margin-right:2px}
.apito .gsem{text-align:center;font-size:13px;margin:0}
.apito .gjogo-acoes{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px}
.apito .gmao{margin-top:8px;justify-content:center}
.apito .gmao input{flex:1 1 180px}
.apito .gmao select{font:inherit;font-size:14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:6px 10px}
.apito .gficha{margin:0 0 16px}
.apito .gfcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.apito .gfcard{border:1px solid var(--hist);border-radius:8px;padding:10px 12px;background:var(--raise)}
.apito .gfcard h3{margin:2px 0;font-size:15px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.apito .gflarga{grid-column:1/-1}
.apito .gftermos{list-style:none;margin:4px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:4px 16px;font-size:13px}
.apito .gchip{cursor:pointer;font-weight:500;color:var(--ink);background:var(--bg)}
.apito .gchip:hover{border-color:var(--ink)}
.apito .gchip.on{background:var(--hist);border-color:var(--hist);color:#fff}
.apito .gtermo dt .gchip{font-size:15px;font-weight:700;border:0;background:none;padding:0;line-height:1.3}
.apito .gtermo dt .gchip.on{color:var(--hist);background:none}
.apito .gsin .gchip,.apito .gant .gchip{margin:0 3px 3px 0;line-height:18px;font-size:12.5px}
.apito .gdest{border-color:var(--hist) !important;box-shadow:0 0 0 1px var(--hist);background:color-mix(in srgb,var(--hist) 7%,var(--raise))}
.apito .gcomp li.gdest{padding:8px 10px;border-radius:8px}
.apito .gsub{margin:8px 0 0}
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
.apito .glos .gabas,.apito .glos .gmods{display:flex;width:fit-content;max-width:100%;margin:0 auto 12px;justify-content:center;flex-wrap:wrap}
.apito .glos .gmods{border:0;background:none;gap:4px}
.apito .glos .gmods button{border:1px solid var(--line);background:var(--raise)}
.apito .gtermos{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin:0}
.apito .gtermo{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--raise)}
.apito .gtermo dt{font-weight:700;font-size:16px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.apito .gtermo dd{margin:4px 0 0;font-size:14px}
.apito .gtermo dd p{margin:0 0 4px}
.apito .gmod{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0}
.apito .gsin b,.apito .gant b{font-weight:600}
.apito .gant{color:var(--muted)}
.apito .gex{font-style:italic;color:var(--muted)}
.apito .gh2{font-family:var(--display);font-size:17px;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:8px}
.apito .gclubes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.apito .gclube{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:var(--raise)}
.apito .gclube h3{margin:0;font-size:15px;display:flex;align-items:center;gap:6px}
.apito .gcid{font-size:12.5px;margin:2px 0 6px}
.apito .gcid .gchip{font-size:12px;line-height:18px}
.apito .galc{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
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
  .apito .gtermos,.apito .gclubes,.apito .gcomps,.apito .gnotas,.apito .gfcards,.apito .gftermos{grid-template-columns:minmax(0,1fr)}
}
`;
