import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, RotateCcw } from "lucide-react";

// Resultados de Portugal: todos os campeonatos seniores (Liga, FPF e as 22 associações), com a jornada da semana,
// a classificação ao vivo, os jogos de hoje e todas as tabelas. Os dados vêm de /api/pt/* e as mudanças chegam
// pelo stream do site (evento «pt-jogo», reemitido pela App como evento da janela).

const ler = (k, alt) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? alt; } catch { return alt; } };
const grava = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const semAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const LISBOA = { timeZone: "Europe/Lisbon" };
const hora = (ts) => new Date(ts).toLocaleTimeString("pt-PT", { ...LISBOA, hour: "2-digit", minute: "2-digit" });
const dia = (ts) => new Date(ts).toLocaleDateString("pt-PT", { ...LISBOA, weekday: "short", day: "numeric", month: "short" });
const diaKey = (ts) => new Intl.DateTimeFormat("en-CA", LISBOA).format(new Date(ts));
const intervaloDatas = (de, ate) => {
  if (!de) return "";
  const a = new Date(de).toLocaleDateString("pt-PT", { ...LISBOA, day: "numeric", month: "short" });
  if (!ate || diaKey(de) === diaKey(ate)) return a;
  return `${new Date(de).toLocaleDateString("pt-PT", { ...LISBOA, day: "numeric" })}–${new Date(ate).toLocaleDateString("pt-PT", { ...LISBOA, day: "numeric", month: "short" })}`;
};

const ESTADO = { intervalo: "Intervalo", adiado: "Adiado", suspenso: "Suspenso", cancelado: "Cancelado", falta: "Falta de comparência" };
const vivo = (j) => j.estado === "direto" || j.estado === "intervalo";

function minutoGolo(g) {
  if (g.min == null) return "";
  const t = g.extra ? `${g.min}'+${g.extra}'` : `${g.min}'`;
  return g.minFonte === "estimado" ? `~${t}` : t;
}

function Estado({ j, agora }) {
  if (j.estado === "direto") {
    return <span className="pulse" title={j.min?.fonte === "estimado" ? `Minuto estimado (${j.min.confianca === "alta" ? "a partir dos stories de início/intervalo" : "a partir da hora marcada"})` : "Minuto"}><i />{j.min?.texto || "Em direto"}</span>;
  }
  if (j.estado === "intervalo") return <span className="pulse pausa"><i />Intervalo</span>;
  if (j.estado === "final") return <span className="muted" title={j.oficial ? "Resultado oficial" : "Resultado dado pelos clubes, à espera do oficial"}>Final{j.oficial ? "" : "*"}</span>;
  if (ESTADO[j.estado]) return <span className="ptwarn">{ESTADO[j.estado]}</span>;
  if (j.semInfo) return <span className="muted" title="Já devia ter começado, mas nenhum dos clubes publicou nada">a decorrer?</span>;
  if (j.porConfirmar) return <span className="muted" title="O jogo já devia ter acabado; o resultado entra quando um dos clubes o publicar ou quando sair na FPF">à espera do resultado</span>;
  if (!j.inicio) return <span className="muted">—</span>;
  return <span className="muted">{diaKey(j.inicio) === diaKey(agora) ? (j.semHora ? "hoje" : hora(j.inicio)) : `${dia(j.inicio)}${j.semHora ? "" : ` ${hora(j.inicio)}`}`}</span>;
}

function Fonte({ j }) {
  if (j.oficial) return <span className="ptsrc of" title="Resultado oficial (FPF, Liga ou transmissão)">oficial</span>;
  if (j.confirmado?.h && j.confirmado?.a) return <span className="ptsrc ok" title="Os dois clubes publicaram o mesmo resultado">✓✓ confirmado pelos 2 clubes</span>;
  const f = [...(j.fontes || [])].reverse().find((x) => x.tipo === "story" || x.tipo === "post");
  if (f) return <a className="ptsrc" href={f.url || `https://www.instagram.com/${f.conta}/`} target="_blank" rel="noreferrer" title="Fonte do último resultado">{f.tipo === "post" ? "post" : "story"} @{f.conta}</a>;
  if (j.origem === "sofa" || j.origem === "externo") return <span className="ptsrc">em direto</span>;
  return null;
}

// formulário para quem está no campo: resultado, minuto, marcador e/ou captura do story do clube
const lerFicheiro = (f) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = erro; r.readAsDataURL(f); });
function EnviarResultado({ j, envio, onEnviar, onFechar }) {
  const submeter = async (e) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const f = d.get("imagem");
    if (f && f.size > 2.5e6) return onEnviar(j, null, "A imagem é grande demais (máximo 2,5 MB).");
    const imagem = f && f.size ? await lerFicheiro(f).catch(() => null) : null;
    onEnviar(j, { jogoId: j.id, hs: d.get("hs"), as: d.get("as"), min: d.get("min"), marcador: d.get("marcador"), imagem });
  };
  return (
    <form className="ptenv" onSubmit={submeter}>
      <span className="ptenvt">Estás no jogo? Envia o resultado</span>
      <label className="ptenvr"><span>{j.casa}</span><input name="hs" type="number" min="0" max="39" inputMode="numeric" defaultValue={j.hs ?? ""} aria-label={`Golos do ${j.casa}`} /></label>
      <label className="ptenvr"><span>{j.fora}</span><input name="as" type="number" min="0" max="39" inputMode="numeric" defaultValue={j.as ?? ""} aria-label={`Golos do ${j.fora}`} /></label>
      <input name="min" placeholder="minuto (opcional)" inputMode="numeric" maxLength={6} />
      <input name="marcador" placeholder="quem marcou (opcional)" maxLength={60} />
      <label className="ptenvf">ou uma captura do story <input name="imagem" type="file" accept="image/*" /></label>
      <span className="ptenva">
        <button type="submit" className="textbtn" disabled={envio?.aEnviar}>{envio?.aEnviar ? "A enviar…" : "Enviar"}</button>
        <button type="button" className="textbtn" onClick={onFechar}>Fechar</button>
      </span>
      {envio?.msg && <span className={`ptenvm ${envio.ok ? "ok" : ""}`}>{envio.msg}</span>}
    </form>
  );
}

function Jogo({ j, agora, mostrarComp = false, onComp, form }) {
  const temRes = j.hs != null && j.as != null && j.estado !== "agendado";
  const golos = [...(j.golos || [])].sort((a, b) => ((a.min ?? 999) * 100 + (a.extra || 0)) - ((b.min ?? 999) * 100 + (b.extra || 0)));
  return (
    <li className={`ptj ${vivo(j) ? "on" : ""} ${j.estado === "final" ? "ft" : ""}`}>
      {mostrarComp && <button className="ptcomp" onClick={() => onComp?.(j)}>{j.compNome}{j.serieNome ? ` · ${j.serieNome}` : ""}{j.jornada ? ` · ${j.jornada}.ª j.` : ""}</button>}
      <span className="pth">{j.logoCasa && <img src={j.logoCasa} alt="" loading="lazy" />}{j.casa}</span>
      <span className={`ptr ${temRes ? "" : "vs"}`} translate="no">{temRes ? `${j.hs}–${j.as}` : "–"}</span>
      <span className="pta">{j.logoFora && <img src={j.logoFora} alt="" loading="lazy" />}{j.fora}</span>
      <span className="ptst" translate="no"><Estado j={j} agora={agora} /></span>
      {(golos.length > 0 || j.conflito || j.local) && (
        <span className="ptg">
          {golos.map((g, i) => (
            <span key={i} className={`gl ${g.lado}`} title={[g.via === "post" ? "Golo dado por uma publicação do clube" : g.via === "story" ? "Golo dado por um story do clube" : null, g.minFonte === "estimado" ? `Minuto estimado pela hora ${g.via === "post" ? "da publicação" : "do story"}` : g.minFonte === "desconhecido" ? "Minuto desconhecido" : null].filter(Boolean).join(" · ") || undefined}>
              ⚽ {minutoGolo(g)} {g.marcador || (g.lado === "h" ? j.casa : j.fora)}{g.penalti ? " (g.p.)" : ""}{g.autogolo ? " (p.b.)" : ""}
            </span>
          ))}
          {j.conflito && <span className="ptwarn" title="Um story deu um resultado que não bate certo; fica-se pelo anterior até haver confirmação">a confirmar: {j.conflito}</span>}
          {!golos.length && j.local && <span className="muted">{j.local}</span>}
        </span>
      )}
      <span className="ptf"><Fonte j={j} />{j.ig?.h || j.ig?.a ? (
        <span className="ptig">
          {j.ig.h && <a href={`https://www.instagram.com/${j.ig.h}/`} target="_blank" rel="noreferrer" title={`Instagram do ${j.casa}`}>@{j.ig.h}</a>}
          {j.ig.a && <a href={`https://www.instagram.com/${j.ig.a}/`} target="_blank" rel="noreferrer" title={`Instagram do ${j.fora}`}>@{j.ig.a}</a>}
        </span>) : null}
        {form && !(j.oficial && j.estado === "final") && (vivo(j) || j.semInfo || j.porConfirmar || j.estado === "final") && form.aberto !== j.id && (
          <button className="textbtn ptenvb" onClick={() => form.setAberto(j.id)}>Enviar resultado</button>
        )}
      </span>
      {form && form.aberto === j.id && <EnviarResultado j={j} envio={form.envio[j.id]} onEnviar={form.enviar} onFechar={() => form.setAberto(null)} />}
    </li>
  );
}

function Tabela({ linhas, compacta = false, destaque = null }) {
  if (!linhas?.length) return <p className="muted">Sem classificação (ainda não há jogos ou é uma taça).</p>;
  const vivos = linhas.some((l) => l.aoVivo);
  return (
    <table className={`pttab ${compacta ? "mini" : ""}`}>
      <thead>
        <tr><th>#</th><th className="eq">Equipa</th><th>J</th>{!compacta && <><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th></>}<th>DG</th><th>P</th>{!compacta && <th className="fm">Forma</th>}</tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.equipa} className={`${l.aoVivo ? `vivo ${l.aoVivo.r}` : ""} ${destaque && semAcentos(l.equipa).includes(destaque) ? "dest" : ""}`}>
            <td>{l.pos}{vivos && l.mov ? <i className={l.mov > 0 ? "up" : "dn"}>{l.mov > 0 ? "▲" : "▼"}</i> : null}</td>
            <td className="eq" title={l.acerto ? `Acerto da tabela oficial: ${Object.entries(l.acerto).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ")}` : undefined}>
              {l.equipa}{l.aoVivo && <span className="lv" title="Jogo a decorrer">{l.aoVivo.gm}–{l.aoVivo.gs}</span>}
            </td>
            <td>{l.j}</td>
            {!compacta && <><td>{l.v}</td><td>{l.e}</td><td>{l.d}</td><td>{l.gm}</td><td>{l.gs}</td></>}
            <td>{l.dg > 0 ? `+${l.dg}` : l.dg}</td>
            <td className="p">{l.pts}</td>
            {!compacta && <td className="fm">{(l.forma || []).map((f, i) => <i key={i} className={`f ${f}`}>{f.toUpperCase()}</i>)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Portugal({ API = "", now }) {
  const [modo, setModo] = useState(() => ler("var-pt-modo", "jornada"));
  const [cat, setCat] = useState({ orgs: [], competicoes: [] });
  const [f, setF] = useState(() => ler("var-pt", { nivel: "todos", mod: "futebol", org: "", comp: "", serie: "" }));
  const [jornada, setJornada] = useState(null); // null = a da semana
  const [dados, setDados] = useState(null);
  const [hoje, setHoje] = useState([]);
  const [tabelas, setTabelas] = useState([]);
  const [jornadas, setJornadas] = useState(null); // jornada atual (ou próxima) de todas as competições
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState(null);
  const [aberto, setAberto] = useState(null); // jogo com o formulário «Enviar resultado» aberto
  const [envios, setEnvios] = useState({});
  const enviar = async (j, corpo, msgErro) => {
    if (!corpo) return setEnvios((e) => ({ ...e, [j.id]: { msg: msgErro } }));
    setEnvios((e) => ({ ...e, [j.id]: { aEnviar: true } }));
    try {
      const r = await fetch(`${API}/api/pt/leitor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const d = await r.json().catch(() => ({}));
      setEnvios((e) => ({ ...e, [j.id]: { ok: !!d.ok, msg: d.ok ? (d.aceite ? "Obrigado! Resultado atualizado." : d.mensagem) : d.erro || "Não foi possível enviar." } }));
    } catch {
      setEnvios((e) => ({ ...e, [j.id]: { msg: "Sem ligação ao servidor." } }));
    }
  };
  const form = { aberto, setAberto, envio: envios, enviar };
  const agora = now || Date.now();
  useEffect(() => grava("var-pt", f), [f]);
  useEffect(() => grava("var-pt-modo", modo), [modo]);

  const lerCatalogo = () => fetch(`${API}/api/pt/competicoes`).then((r) => r.json()).then((d) => d?.competicoes && setCat(d)).catch(() => setErro("Sem ligação ao servidor"));
  useEffect(() => { lerCatalogo(); const t = setInterval(lerCatalogo, 5 * 60e3); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const comps = useMemo(() => cat.competicoes.filter((c) => (f.nivel === "todos" || c.nivel === f.nivel) && (!f.mod || c.mod === f.mod) && (!f.org || c.org === f.org)), [cat, f.nivel, f.mod, f.org]);
  const orgsComComps = useMemo(() => {
    const tem = new Set(cat.competicoes.filter((c) => (f.nivel === "todos" || c.nivel === f.nivel) && (!f.mod || c.mod === f.mod)).map((c) => c.org));
    return cat.orgs.filter((o) => tem.has(o.key));
  }, [cat, f.nivel, f.mod]);
  // competição escolhida (ou a primeira com jogos a decorrer, ou a primeira da lista)
  const comp = comps.find((c) => c.id === f.comp) || comps.find((c) => c.aoVivo) || comps[0] || null;
  const serie = comp?.series?.find((s) => s.id === f.serie) || comp?.series?.[0] || null;

  const pedidoRef = useRef(0);
  const lerJornada = () => {
    if (!comp) return;
    const n = ++pedidoRef.current;
    const q = new URLSearchParams({ ...(serie ? { serie: serie.id } : {}), ...(jornada != null ? { jornada } : {}) });
    fetch(`${API}/api/pt/competicao/${encodeURIComponent(comp.id)}?${q}`).then((r) => r.json()).then((d) => { if (n === pedidoRef.current) setDados(d); }).catch(() => {});
  };
  const lerHoje = () => fetch(`${API}/api/pt/aovivo${f.org ? `?org=${f.org}` : ""}`).then((r) => r.json()).then((l) => Array.isArray(l) && setHoje(l)).catch(() => {});
  const lerTabelas = () => fetch(`${API}/api/pt/tabelas?${new URLSearchParams({ ...(f.org ? { org: f.org } : {}), ...(f.mod ? { mod: f.mod } : {}) })}`).then((r) => r.json()).then((l) => Array.isArray(l) && setTabelas(l)).catch(() => {});

  useEffect(() => { if (modo === "jornada") lerJornada(); }, [modo, comp?.id, serie?.id, jornada]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (modo === "hoje") lerHoje(); }, [modo, f.org]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (modo === "tabelas") lerTabelas(); }, [modo, f.org, f.mod]); // eslint-disable-line react-hooks/exhaustive-deps
  const lerJornadas = () => fetch(`${API}/api/pt/jornadas?${new URLSearchParams({ ...(f.org ? { org: f.org } : {}), ...(f.mod ? { mod: f.mod } : {}), nivel: f.nivel })}`).then((r) => r.json()).then((l) => Array.isArray(l) && setJornadas(l)).catch(() => {});
  useEffect(() => { if (modo === "semana") { setJornadas(null); lerJornadas(); } }, [modo, f.org, f.mod, f.nivel]); // eslint-disable-line react-hooks/exhaustive-deps

  // mudanças em tempo real: o jogo que mudou entra logo na lista; a tabela relê-se (com calma) a seguir
  const atraso = useRef(null);
  const atual = useRef({});
  atual.current = { modo, comp, lerJornada };
  useEffect(() => {
    const on = (e) => {
      const j = e.detail;
      if (!j) return;
      setHoje((l) => (l.some((x) => x.id === j.id) ? l.map((x) => (x.id === j.id ? j : x)) : diaKey(j.inicio || 0) === diaKey(Date.now()) ? [...l, j] : l));
      setDados((d) => (d && d.jogos?.some((x) => x.id === j.id) ? { ...d, jogos: d.jogos.map((x) => (x.id === j.id ? j : x)) } : d));
      setJornadas((l) => (l && l.some((g) => g.jogos.some((x) => x.id === j.id)) ? l.map((g) => ({ ...g, jogos: g.jogos.map((x) => (x.id === j.id ? j : x)) })) : l));
      const { modo: m, comp: c } = atual.current;
      if (m === "jornada" && c && j.comp === c.id && !atraso.current) {
        atraso.current = setTimeout(() => { atraso.current = null; atual.current.lerJornada(); }, 2500);
      }
    };
    window.addEventListener("pt-jogo", on);
    return () => { window.removeEventListener("pt-jogo", on); clearTimeout(atraso.current); atraso.current = null; };
  }, []);
  // o minuto dos jogos a decorrer anda sozinho: relê de 30 em 30 s enquanto houver jogos em direto
  const haVivos = (modo === "jornada" ? dados?.jogos || [] : hoje).some(vivo);
  useEffect(() => {
    if (!haVivos) return undefined;
    const t = setInterval(() => (modo === "jornada" ? lerJornada() : modo === "hoje" ? lerHoje() : null), 30e3);
    return () => clearInterval(t);
  }, [haVivos, modo, comp?.id, serie?.id, jornada]); // eslint-disable-line react-hooks/exhaustive-deps

  const muda = (p) => { setF((x) => ({ ...x, ...p })); setJornada(null); };
  const irPara = (j) => { setModo("jornada"); setF((x) => ({ ...x, org: j.org || x.org, comp: j.comp, serie: j.serie, mod: j.mod || x.mod, nivel: "todos" })); setJornada(j.jornada ?? null); };

  const q = semAcentos(busca.trim());
  const filtroJogo = (j) => !q || semAcentos(`${j.casa} ${j.fora} ${j.compNome}`).includes(q);

  const filtros = (
    <div className="ptfil">
      <div className="seg" role="group" aria-label="Vista">
        {[["jornada", "Competição"], ["semana", "Jornadas da semana"], ["hoje", "Jogos de hoje"], ["tabelas", "Todas as tabelas"]].map(([k, n]) => <button key={k} aria-pressed={modo === k} onClick={() => setModo(k)}>{n}</button>)}
      </div>
      <div className="seg" role="group" aria-label="Modalidade">
        {[["futebol", "Futebol"], ["futsal", "Futsal"]].map(([k, n]) => <button key={k} aria-pressed={f.mod === k} onClick={() => muda({ mod: k, comp: "", serie: "" })}>{n}</button>)}
      </div>
      <div className="seg" role="group" aria-label="Nível">
        {[["todos", "Todos"], ["nacional", "Nacionais"], ["distrital", "Distritais"]].map(([k, n]) => <button key={k} aria-pressed={f.nivel === k} onClick={() => muda({ nivel: k, comp: "", serie: "" })}>{n}</button>)}
      </div>
      <select className="ptsel" value={f.org} onChange={(e) => muda({ org: e.target.value, comp: "", serie: "" })} aria-label="Organizador">
        <option value="">Todas as associações</option>
        {orgsComComps.map((o) => <option key={o.key} value={o.key}>{o.nome}</option>)}
      </select>
      {modo !== "jornada" && (
        <label className="search ptbusca"><Search size={14} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar equipa" /></label>
      )}
    </div>
  );

  if (!cat.competicoes.length) {
    return <div className="ptv">{filtros}<p className="empty">{erro || "A carregar os campeonatos… (na primeira vez o servidor demora a ler as competições de todas as associações)"}</p></div>;
  }

  return (
    <div className="ptv">
      {filtros}
      {modo === "jornada" && (
        <>
          <div className="ptcsel">
            <select className="ptsel grande" value={comp?.id || ""} onChange={(e) => muda({ comp: e.target.value, serie: "" })} aria-label="Competição">
              {comps.map((c) => <option key={c.id} value={c.id}>{f.org ? "" : `${c.orgNome} · `}{c.nome}{c.fem ? " (fem.)" : ""}{c.aoVivo ? ` · ${c.aoVivo} em direto` : ""}</option>)}
            </select>
            {comp?.series?.length > 1 && (
              <div className="seg series" role="group" aria-label="Série">
                {comp.series.map((s) => <button key={s.id} aria-pressed={serie?.id === s.id} onClick={() => { setF((x) => ({ ...x, serie: s.id })); setJornada(null); }}>{s.nome || s.id}</button>)}
              </div>
            )}
          </div>
          {dados && dados.comp?.id === comp?.id ? (
            <div className="ptgrid">
              <section>
                <div className="ptjhead">
                  <button className="icon-btn" aria-label="Jornada anterior" disabled={!dados.jornadas.length || dados.jornada === dados.jornadas[0]?.n} onClick={() => { const i = dados.jornadas.findIndex((x) => x.n === dados.jornada); if (i > 0) setJornada(dados.jornadas[i - 1].n); }}><ChevronLeft size={16} /></button>
                  <div className="ptjt">
                    <b>{dados.jornada != null ? `${dados.jornada}.ª jornada` : "Jogos"}</b>
                    {(() => { const jr = dados.jornadas.find((x) => x.n === dados.jornada); return jr?.de ? <span className="muted"> · {intervaloDatas(jr.de, jr.ate)}</span> : null; })()}
                    {dados.jornada === dados.atual ? <span className="chip new">jornada atual</span> : dados.atual != null && <button className="textbtn" onClick={() => setJornada(null)}><RotateCcw size={13} />ir para a atual ({dados.atual}.ª)</button>}
                  </div>
                  <button className="icon-btn" aria-label="Jornada seguinte" disabled={!dados.jornadas.length || dados.jornada === dados.jornadas.at(-1)?.n} onClick={() => { const i = dados.jornadas.findIndex((x) => x.n === dados.jornada); if (i >= 0 && i < dados.jornadas.length - 1) setJornada(dados.jornadas[i + 1].n); }}><ChevronRight size={16} /></button>
                </div>
                {dados.jogos.length === 0 ? <p className="muted">Ainda não há jogos desta jornada.</p> : (
                  <ul className="ptlist" aria-live="polite">{dados.jogos.map((j) => <Jogo key={j.id} j={j} agora={agora} form={form} />)}</ul>
                )}
                <p className="ptnota muted">~ minuto estimado pela hora do story (início, intervalo ou hora marcada) · * resultado dado pelos clubes, à espera do oficial</p>
              </section>
              <aside>
                <h3 className="ptth">Classificação {dados.tabela?.some((l) => l.aoVivo) ? <span className="pulse"><i />ao vivo</span> : null}</h3>
                <Tabela linhas={dados.tabela} />
                {dados.oficialTs && <p className="ptnota muted">Acertada com a tabela oficial de {new Date(dados.oficialTs).toLocaleString("pt-PT", { ...LISBOA, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
              </aside>
            </div>
          ) : <p className="muted">A carregar…</p>}
        </>
      )}
      {modo === "semana" && (() => {
        if (!jornadas) return <p className="muted">A carregar…</p>;
        const lista = jornadas.filter((g) => !q || semAcentos(`${g.compNome} ${g.serieNome}`).includes(q) || g.jogos.some(filtroJogo));
        return lista.length === 0 ? <p className="empty">Sem jornadas com estes filtros.</p> : (
          <>
            <p className="muted ptres">Jornada desta semana de cada competição (ou a próxima, numa semana de pausa) · {lista.length} competições/séries</p>
            {lista.map((g) => (
              <section key={`${g.comp}|${g.serie}`} className="ptgrupo">
                <button className="ptgh" onClick={() => irPara({ comp: g.comp, serie: g.serie, org: g.org, mod: g.mod, jornada: g.jornada })}>
                  {g.compNome}{g.serieNome ? ` · ${g.serieNome}` : ""} · {g.jornada}.ª jornada{g.de ? ` · ${intervaloDatas(g.de, g.ate)}` : ""} <ChevronRight size={14} />
                </button>
                <ul className="ptlist">{g.jogos.filter((j) => !q || filtroJogo(j) || semAcentos(g.compNome).includes(q)).map((j) => <Jogo key={j.id} j={j} agora={agora} form={form} />)}</ul>
              </section>
            ))}
          </>
        );
      })()}
      {modo === "hoje" && (() => {
        const lista = hoje.filter((j) => (!f.mod || j.mod === f.mod) && (f.nivel === "todos" || j.nivel === f.nivel)).filter(filtroJogo);
        const grupos = new Map();
        for (const j of [...lista].sort((a, b) => vivo(b) - vivo(a) || (a.inicio || 0) - (b.inicio || 0))) {
          const k = `${j.comp}|${j.serie}`;
          if (!grupos.has(k)) grupos.set(k, []);
          grupos.get(k).push(j);
        }
        const nVivos = lista.filter(vivo).length;
        return lista.length === 0 ? <p className="empty">Não há jogos hoje com estes filtros. <button className="textbtn" onClick={() => setModo("semana")}>Ver as jornadas da semana</button></p> : (
          <>
            <p className="muted ptres">{lista.length} jogos hoje{nVivos ? <> · <span className="pulse"><i />{nVivos} a decorrer</span></> : null}</p>
            {[...grupos.values()].map((js) => (
              <section key={`${js[0].comp}|${js[0].serie}`} className="ptgrupo">
                <button className="ptgh" onClick={() => irPara(js[0])}>{js[0].compNome}{js[0].serieNome ? ` · ${js[0].serieNome}` : ""}{js[0].jornada ? ` · ${js[0].jornada}.ª jornada` : ""} <ChevronRight size={14} /></button>
                <ul className="ptlist">{js.map((j) => <Jogo key={j.id} j={j} agora={agora} form={form} />)}</ul>
              </section>
            ))}
          </>
        );
      })()}
      {modo === "tabelas" && (() => {
        const lista = tabelas.filter((t) => f.nivel === "todos" || t.nivel === f.nivel)
          .filter((t) => !q || semAcentos(`${t.compNome} ${t.serieNome}`).includes(q) || t.linhas.some((l) => semAcentos(l.equipa).includes(q)));
        if (lista.length === 0) return <p className="empty">Sem tabelas com estes filtros.</p>;
        // agrupadas pelo organizador: primeiro as nacionais (FPF e Liga), depois cada associação distrital
        const ordemOrg = new Map(cat.orgs.map((o, i) => [o.key, i]));
        const nomeOrg = new Map(cat.orgs.map((o) => [o.key, o.nome]));
        const grupos = [];
        for (const t of lista) {
          let g = grupos.find((x) => x.org === t.org);
          if (!g) grupos.push((g = { org: t.org, nome: nomeOrg.get(t.org) || t.org, tabs: [] }));
          g.tabs.push(t);
        }
        grupos.sort((a, b) => (ordemOrg.get(a.org) ?? 999) - (ordemOrg.get(b.org) ?? 999));
        const nDist = lista.filter((t) => t.nivel === "distrital").length;
        return (
          <>
            <p className="muted ptres">{lista.length} tabelas · {lista.length - nDist} nacionais · {nDist} distritais ({grupos.filter((g) => g.tabs.some((t) => t.nivel === "distrital")).length} associações)</p>
            {grupos.length > 1 && (
              <nav className="ptsalta" aria-label="Ir para o organizador">
                {grupos.map((g) => <button key={g.org} onClick={() => document.getElementById(`pt-org-${g.org}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{g.nome} <span className="muted">{g.tabs.length}</span></button>)}
              </nav>
            )}
            {grupos.map((g) => (
              <section key={g.org} id={`pt-org-${g.org}`} className="ptorg">
                <h3 className="ptth">{g.nome} <span className="muted small">{g.tabs.length} {g.tabs.length === 1 ? "tabela" : "tabelas"}</span></h3>
                <div className="pttabs">
                  {g.tabs.map((t) => (
                    <section key={`${t.comp}|${t.serie}`} className="ptcard">
                      <button className="ptgh" onClick={() => irPara({ comp: t.comp, serie: t.serie, org: t.org, mod: t.mod, jornada: null })}>
                        {t.compNome}{t.serieNome ? ` · ${t.serieNome}` : ""} {t.linhas.some((l) => l.aoVivo) && <span className="pulse"><i /></span>}<ChevronRight size={14} />
                      </button>
                      {t.linhas.every((l) => l.semJogos) && <p className="muted ptnota">Ainda sem resultados: as equipas aparecem a zero até ao primeiro jogo.</p>}
                      <Tabela linhas={t.linhas} compacta destaque={q || null} />
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </>
        );
      })()}
    </div>
  );
}

export const PT_CSS = `
.apito .ptv{max-width:1180px}
.apito .ptfil{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 14px}
.apito .ptsel{font:inherit;font-size:13px;font-weight:600;color:var(--ink);background:var(--raise);border:1px solid var(--line);border-radius:999px;padding:5px 10px;max-width:100%}
.apito .ptsel.grande{font-size:15px;padding:7px 12px;border-radius:8px;min-width:min(420px,100%)}
.apito .ptbusca{width:200px}
.apito .ptcsel{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.apito .ptcsel .series{flex-wrap:wrap;border-radius:12px}
.apito .ptgrid{display:grid;grid-template-columns:minmax(0,1fr);gap:20px}
@media(min-width:1000px){.apito .ptgrid{grid-template-columns:minmax(0,1fr) 440px}}
.apito .ptjhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.apito .ptjhead .icon-btn[disabled]{opacity:.35;cursor:default}
.apito .ptjt{display:flex;flex-wrap:wrap;align-items:center;gap:6px;justify-content:center;text-align:center;font-family:var(--display);font-size:18px}
.apito .ptjt .chip{font-family:var(--ui)}
.apito .ptlist{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.apito .ptj{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 92px;align-items:center;gap:2px 12px;padding:10px 4px;border-bottom:1px solid var(--line)}
.apito .ptj.on{background:color-mix(in srgb,var(--live) 6%,transparent)}
.apito .ptj .ptcomp{grid-column:1/-1;font-size:12px;font-weight:600;color:var(--muted);text-align:left}
.apito .ptj .pth,.apito .ptj .pta{font-family:var(--display);font-size:16px;font-weight:600;line-height:1.15;display:flex;align-items:center;gap:6px;min-width:0}
.apito .ptj .pth{justify-content:flex-end;text-align:right}
.apito .ptj img{width:22px;height:22px;object-fit:contain;flex:none}
.apito .ptj .ptr{font-family:var(--display);font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;min-width:58px;text-align:center;padding:1px 8px;border:1px solid var(--line);border-radius:6px;background:var(--raise)}
.apito .ptj.on .ptr{border-color:var(--live);color:var(--live)}
.apito .ptj .ptr.vs{color:var(--muted);font-weight:500}
.apito .ptj .ptst{font-size:13px;font-weight:700;text-align:right;white-space:nowrap}
.apito .ptj .ptg{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12.5px;color:var(--muted);padding:0 4px}
.apito .ptj .ptg .gl.h{order:0} .apito .ptj .ptg .gl.a{order:0}
.apito .ptj .ptf{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:11.5px;padding:0 4px}
.apito .ptsrc{color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 7px;line-height:18px;text-decoration:none}
.apito .ptsrc.ok{color:var(--sporting);border-color:currentColor}
.apito .ptsrc.of{color:var(--ink);border-color:var(--ink)}
.apito .ptig{display:inline-flex;gap:8px} .apito .ptig a{color:var(--muted);text-decoration:none} .apito .ptig a:hover{text-decoration:underline}
.apito .ptwarn{color:var(--accent);font-weight:700}
.apito .pulse.pausa{color:var(--accent)} .apito .pulse.pausa i{background:var(--accent)}
.apito .ptnota{font-size:12px;margin:8px 0 0}
.apito .ptenvb{font-size:11.5px;padding:0 6px;border:1px solid var(--line);border-radius:999px;margin-left:auto}
.apito .ptenv{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:6px 4px 2px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--raise);font-size:13px}
.apito .ptenv input{font:inherit;font-size:13px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:3px 6px;max-width:170px}
.apito .ptenv input[type=number]{width:52px}
.apito .ptenv input[type=file]{border:0;background:none;padding:0;max-width:220px}
.apito .ptenvt{font-weight:700;width:100%}
.apito .ptenvr{display:inline-flex;align-items:center;gap:6px} .apito .ptenvr span{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .ptenvf{display:inline-flex;align-items:center;gap:6px;color:var(--muted)}
.apito .ptenva{display:inline-flex;gap:4px}
.apito .ptenvm{width:100%;color:var(--accent);font-weight:600} .apito .ptenvm.ok{color:var(--sporting)}
.apito .ptth{font-family:var(--display);font-size:18px;margin:6px 0 8px;display:flex;align-items:center;gap:10px}
.apito .pttab{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
.apito .pttab th{font-size:11.5px;font-weight:700;color:var(--muted);text-align:center;padding:4px 3px;border-bottom:1px solid var(--line)}
.apito .pttab td{text-align:center;padding:5px 3px;border-bottom:1px solid var(--line)}
.apito .pttab .eq{text-align:left;font-weight:600;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .pttab .p{font-weight:800}
.apito .pttab tr.vivo td{background:color-mix(in srgb,var(--live) 7%,transparent)}
.apito .pttab tr.vivo.v td.p{color:var(--sporting)} .apito .pttab tr.vivo.d td.p{color:var(--live)}
.apito .pttab tr.dest td{background:color-mix(in srgb,var(--accent) 18%,transparent)}
.apito .pttab .lv{margin-left:6px;font-size:11px;font-weight:700;color:var(--live);border:1px solid currentColor;border-radius:4px;padding:0 4px}
.apito .pttab i.up,.apito .pttab i.dn{font-style:normal;font-size:9px;margin-left:2px} .apito .pttab i.up{color:var(--sporting)} .apito .pttab i.dn{color:var(--live)}
.apito .pttab .fm{white-space:nowrap} .apito .pttab .f{display:inline-block;width:15px;line-height:15px;font-size:9.5px;font-style:normal;font-weight:800;border-radius:3px;margin:0 1px;color:#fff}
.apito .pttab .f.v{background:#1E8E57} .apito .pttab .f.e{background:#8A949B} .apito .pttab .f.d{background:#C8392B}
.apito .pttab.mini{font-size:12.5px} .apito .pttab.mini .eq{max-width:160px}
.apito .pttabs{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.apito .ptcard,.apito .ptgrupo{min-width:0}
.apito .ptorg{margin:0 0 26px;scroll-margin-top:80px}
.apito .ptorg>.ptth{border-bottom:1px solid var(--line);padding-bottom:6px}
.apito .ptsalta{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
.apito .ptsalta button{font-size:12px;font-weight:600;color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:2px 9px;background:var(--raise)}
.apito .ptgrupo{margin-bottom:16px}
.apito .ptgh{font-size:13px;font-weight:700;color:var(--ink);display:inline-flex;align-items:center;gap:4px;margin:0 0 6px;text-align:left}
.apito .ptres{font-size:13px;margin:0 0 10px}
@media(max-width:620px){
  .apito .ptj{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:2px 8px}
  .apito .ptj .ptst{grid-column:1/-1;text-align:center;order:-1;font-size:12px}
  .apito .ptj .pth,.apito .ptj .pta{font-size:14px} .apito .ptj .ptr{font-size:17px;min-width:48px}
  .apito .pttab .fm{display:none} .apito .ptbusca{width:100%}
}
`;
