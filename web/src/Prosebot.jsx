// Glossário › Prosebot 2.0: a crónica de um jogo a partir das notas de quem o viu, com as regras de escrita do zerozero.
// Escolhe-se o jogo (da lista dos que acabaram nas últimas horas ou estão a decorrer, ou à mão), escrevem-se as notas
// (podem levar os acontecimentos que o VAR registou: golos, marcadores, cartões, penáltis) e o servidor
// (/api/prosebot/cronica) escreve título, lead, corpo e a figura do jogo. As alcunhas, o estádio e a cidade das equipas,
// tirados do glossário, seguem com o pedido para a crónica variar os nomes.
import { useEffect, useMemo, useState } from "react";
import { fichaDoJogo } from "./glossario/jogo.js";
import { lista } from "./glossario/pesquisa.js";
import { arrumar } from "./glossario/declaracoes.js";
import { Peca, pedir } from "./Declaracoes.jsx";

const TAMANHOS = [
  { id: "curta", nome: "Curta" },
  { id: "normal", nome: "Normal" },
  { id: "longa", nome: "Longa" },
];
const VAZIO = { jogoId: "", casa: "", fora: "", res: "", comp: "", quando: "", notas: "", figura: "", contexto: "", tamanho: "normal", mod: "futebol" };
const lerForma = () => { try { return { ...VAZIO, ...JSON.parse(localStorage.getItem("prose-forma") || "{}") }; } catch { return VAZIO; } };
const gravarForma = (f) => { try { localStorage.setItem("prose-forma", JSON.stringify(f)); } catch { /* */ } };
const placar = (j) => (j.hs != null && j.as != null ? `${j.hs}–${j.as}` : "x");

export default function Prosebot({ API = "", jogos = [], jogoEscolhido = null, dados = null }) {
  const [f, setF] = useState(lerForma);
  const [estado, setEstado] = useState(null); // { a: "A escrever…" } ou { erro }
  const [peca, setPeca] = useState(null);
  const muda = (campos) => setF((x) => { const n = { ...x, ...campos }; gravarForma(n); return n; });
  const ocupado = !!estado?.a;

  // a primeira vez, sem jogo nenhum: o que estiver escolhido em «Preparar jogo»
  useEffect(() => {
    if (!f.casa && !f.fora && jogoEscolhido?.h && jogoEscolhido?.a) {
      muda({ casa: jogoEscolhido.h, fora: jogoEscolhido.a, comp: jogoEscolhido.comp || "", mod: jogoEscolhido.mod || "futebol", res: jogoEscolhido.hs != null ? `${jogoEscolhido.hs}-${jogoEscolhido.as}` : "" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const escolhido = jogos.find((j) => j.id === f.jogoId) || null;
  const escolher = (id) => {
    const j = jogos.find((x) => x.id === id);
    if (!j) return muda({ jogoId: "" });
    muda({ jogoId: j.id, casa: j.h, fora: j.a, comp: j.comp || "", mod: j.mod || "futebol", res: j.hs != null && j.as != null ? `${j.hs}-${j.as}` : "" });
  };
  // os acontecimentos registados que ainda não estão nas notas
  const eventos = (escolhido?.eventos || []).filter((e) => !f.notas.includes(e));
  const juntarEventos = () => muda({ notas: [f.notas.trim(), "Registado pelo VAR:", ...eventos].filter(Boolean).join("\n") });

  // o vocabulário do glossário para as duas equipas e a competição
  const vocab = useMemo(() => {
    if (!dados || (!f.casa.trim() && !f.fora.trim())) return [];
    const ficha = fichaDoJogo({ h: f.casa.trim(), a: f.fora.trim(), comp: f.comp.trim(), mod: f.mod }, dados);
    const out = [];
    for (const l of [ficha.casa, ficha.fora]) {
      if (l?.clube) {
        const c = l.clube;
        out.push({ quem: c.nome, palavras: [...(c.alcunhas || []), c.estadio, String(c.cidade || "").replace(/\s*\(.*$/, "")].filter(Boolean) });
      } else if (l?.selecao) out.push({ quem: l.selecao.n, palavras: lista(l.selecao.s).filter((x) => x && x !== "—") });
    }
    if (ficha.prova) out.push({ quem: ficha.prova.nome, palavras: ficha.prova.sinonimos || [] });
    return out.filter((x) => x.palavras.length);
  }, [dados, f.casa, f.fora, f.comp, f.mod]);

  const r = String(f.res).match(/^\s*(\d{1,2})\s*[-–x:]\s*(\d{1,2})\s*$/i);
  const pronto = f.casa.trim() && f.fora.trim() && f.notas.trim().length >= 20;
  const escrever = async () => {
    setEstado({ a: "A escrever a crónica… (pode levar um minuto)" });
    try {
      const d = await pedir(`${API}/api/prosebot/cronica`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jogo: { casa: f.casa, fora: f.fora, hs: r ? Number(r[1]) : null, as: r ? Number(r[2]) : null, comp: f.comp, quando: f.quando },
          notas: f.notas, figura: f.figura, contexto: f.contexto, tamanho: f.tamanho,
          vocabulario: vocab.map((v) => `${v.quem}: ${v.palavras.join(", ")}`).join("; "),
        }),
      });
      // as regras mecânicas do zerozero por cima do que o modelo escreveu (aspas, pontuação, números)
      setPeca({ ...d, tituloSite: arrumar(d.tituloSite), tituloLiveticker: arrumar(d.tituloLiveticker), microtitulo: arrumar(d.microtitulo), lead: arrumar(d.lead), corpo: d.corpo.map((p) => arrumar(p)) });
      setEstado(null);
    } catch (e) { setEstado({ erro: e.message }); }
  };

  return (
    <section className="gdecl gprose" aria-label="Prosebot 2.0">
      <div className="gjogo-cab">
        <h2 className="gh2">Prosebot 2.0</h2>
        <p className="muted">Escreve as notas do jogo e o Prosebot faz a crónica com as regras do zerozero: o jogo contado com análise, não só minuto a minuto.</p>
      </div>
      {jogos.length > 0 && (
        <select className="gpsel" value={f.jogoId} onChange={(e) => escolher(e.target.value)} aria-label="Jogo">
          <option value="">Escolher um jogo da lista (ou escrever à mão em baixo)</option>
          {jogos.map((j) => <option key={j.id} value={j.id}>{j.vivo ? "● " : ""}{j.h} {placar(j)} {j.a} · {j.comp}{j.vivo ? " (a decorrer)" : ""}</option>)}
        </select>
      )}
      <div className="gform gpjogo">
        <input value={f.casa} onChange={(e) => muda({ casa: e.target.value, jogoId: "" })} placeholder="Equipa da casa" aria-label="Equipa da casa" />
        <input className="gres-in" value={f.res} onChange={(e) => muda({ res: e.target.value })} placeholder="Resultado (2-1)" aria-label="Resultado" inputMode="numeric" maxLength={7} />
        <input value={f.fora} onChange={(e) => muda({ fora: e.target.value, jogoId: "" })} placeholder="Equipa de fora" aria-label="Equipa de fora" />
        <input value={f.comp} onChange={(e) => muda({ comp: e.target.value })} placeholder="Competição (ex.: Liga Portugal, 8.ª jornada)" aria-label="Competição" />
        <input value={f.quando} onChange={(e) => muda({ quando: e.target.value })} placeholder="Quando e onde (ex.: sábado, no Estádio do Dragão)" aria-label="Quando e onde" />
      </div>
      {vocab.length > 0 && (
        <p className="muted gpvocab">Do glossário: {vocab.map((v, i) => <span key={v.quem}>{i > 0 && " · "}<b>{v.quem}</b> — {v.palavras.slice(0, 6).join(", ")}</span>)}</p>
      )}
      <textarea className="gdtexto" value={f.notas} onChange={(e) => muda({ notas: e.target.value })} rows={11} aria-label="Notas do jogo"
        placeholder={"As notas do jogo, uma por linha, com o minuto quando houver. Ex.:\n5' Pepê remata ao poste, o Porto entra a mandar\n23' golo de Samu, de cabeça, após canto de Fábio Vieira\n38' Otamendi trava o contra-ataque e vê amarelo\nIntervalo: Porto melhor, o Benfica sem remates enquadrados\n67' Pavlidis empata num remate de primeira\n88' Rodrigo Mora decide com um livre direto\nDeclarações: «Foi uma vitória de caráter», disse o treinador"} />
      {eventos.length > 0 && (
        <button className="textbtn gpeventos" onClick={juntarEventos}>Juntar às notas os {eventos.length} acontecimentos registados pelo VAR (golos, cartões, penáltis…)</button>
      )}
      <div className="gform gdcampos">
        <input value={f.figura} onChange={(e) => muda({ figura: e.target.value })} placeholder="Figura do jogo (opcional)" aria-label="Figura do jogo" />
        <input value={f.contexto} onChange={(e) => muda({ contexto: e.target.value })} placeholder="Contexto (opcional): o que estava em jogo, a classificação, a série…" aria-label="Contexto" />
      </div>
      <div className="seg gfiltro" role="group" aria-label="Tamanho">
        {TAMANHOS.map((t) => <button key={t.id} aria-pressed={f.tamanho === t.id} onClick={() => muda({ tamanho: t.id })}>{t.nome}</button>)}
      </div>
      <div className="gjogo-acoes gdacoes">
        <button className="gir" disabled={ocupado || !pronto} onClick={escrever}>Escrever a crónica</button>
        {(f.notas || f.casa || f.fora) && <button className="textbtn" disabled={ocupado} onClick={() => { muda(VAZIO); setPeca(null); setEstado(null); }}>Limpar</button>}
      </div>
      {!pronto && !peca && <p className="muted gdnota">Faltam {!f.casa.trim() || !f.fora.trim() ? "as equipas" : "as notas do jogo"} para escrever a crónica.</p>}
      {estado?.a && <p className="muted gdnota" aria-live="polite">{estado.a}</p>}
      {estado?.erro && <p className="gdaviso" role="alert">Não foi possível: {estado.erro}</p>}
      {peca && (
        <Peca peca={peca} rotulo="Copiar a crónica" rodape={`escrita por ${peca.motor} (${peca.modelo})`}
          extra={peca.figura && (
            <div className="gdbloco gfigura">
              <p className="gmod">Figura do jogo</p>
              <p><b>{peca.figura.nome}</b>{peca.figura.texto && <> — {arrumar(peca.figura.texto)}</>}</p>
            </div>
          )} />
      )}
    </section>
  );
}

export const PROSE_CSS = `
.apito .gpsel{display:block;width:100%;max-width:720px;margin:0 auto 10px;font:inherit;font-size:14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:7px 12px}
.apito .gpjogo{justify-content:center;margin:0 0 8px}
.apito .gpjogo input{flex:1 1 200px}
.apito .gpjogo .gres-in{flex:0 1 120px;text-align:center}
.apito .gpvocab{font-size:12.5px;text-align:center;margin:0 0 8px}
.apito .gpeventos{display:block;margin:6px auto 0;font-size:13px;font-weight:600;color:var(--hist)}
.apito .gfigura{border:1px solid var(--hist);border-radius:8px;padding:8px 12px;background:color-mix(in srgb,var(--hist) 6%,var(--raise))}
.apito .gfigura p:last-child{margin:4px 0 0;font-size:14.5px}
`;
