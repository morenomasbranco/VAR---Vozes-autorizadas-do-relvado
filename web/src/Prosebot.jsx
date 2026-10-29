// Glossário › Prosebot 2.0: a crónica de um jogo a partir das notas de quem o viu, com as regras de escrita do zerozero.
// Cada crónica tem o seu separador (várias ao mesmo tempo, guardadas neste browser): escolhe-se o jogo (da lista dos que
// acabaram nas últimas horas ou estão a decorrer, ou à mão) e a modalidade, escrevem-se as notas (podem levar os
// acontecimentos que o VAR registou: golos, marcadores, cartões, penáltis) e o servidor (/api/prosebot/cronica) escreve
// título, lead, corpo e a figura do jogo. Seguem com o pedido as alcunhas, o estádio e a cidade das equipas e as
// expressões próprias da modalidade, tirados do glossário, para a crónica variar os nomes e falar a língua de cada
// modalidade (sete metros no andebol, sets no voleibol, triplos no basquetebol…).
import { useEffect, useMemo, useState } from "react";
import { fichaDoJogo, modDoGlossario } from "./glossario/jogo.js";
import { lista } from "./glossario/pesquisa.js";
import { arrumar } from "./glossario/declaracoes.js";
import { Peca, pedir } from "./Declaracoes.jsx";

const TAMANHOS = [
  { id: "curta", nome: "Curta" },
  { id: "normal", nome: "Normal" },
  { id: "longa", nome: "Longa" },
];
// as modalidades da crónica (os ids dos resultados do site)
export const MODS_CRONICA = [
  { id: "futebol", nome: "Futebol" }, { id: "futsal", nome: "Futsal" }, { id: "andebol", nome: "Andebol" },
  { id: "basquetebol", nome: "Basquetebol" }, { id: "hoquei_patins", nome: "Hóquei em patins" }, { id: "voleibol", nome: "Voleibol" },
  { id: "praia", nome: "Futebol de praia" },
];
const NOME_MOD = Object.fromEntries(MODS_CRONICA.map((m) => [m.id, m.nome]));
// a modalidade de um jogo, como a crónica a conhece (o glossário diz «basquete» e «hoquei»)
export const modCronica = (m) => ({ basquete: "basquetebol", hoquei: "hoquei_patins" }[m] || (NOME_MOD[m] ? m : "futebol"));
// um exemplo de notas por modalidade, para o campo vazio
const EXEMPLO = {
  futebol: "5' Pepê remata ao poste, o Porto entra a mandar\n23' golo de Samu, de cabeça, após canto de Fábio Vieira\n38' Otamendi trava o contra-ataque e vê amarelo\nIntervalo: Porto melhor, o Benfica sem remates enquadrados\n67' Pavlidis empata num remate de primeira\n88' Rodrigo Mora decide com um livre direto\nDeclarações: «Foi uma vitória de caráter», disse o treinador",
  futsal: "3' Zicky abre o marcador num remate de pivô\n14' sexta falta do Benfica; o livre dos dez metros sai ao poste\n18' empate ao segundo poste\n36' o Benfica arrisca o guarda-redes avançado\n39' Tomás Paçó decide de meia distância",
  andebol: "Intervalo: 15-13 para o FC Porto, com seis defesas de Diogo Rêma\n38' parcial de 5-0 do Sporting depois de duas exclusões seguidas\n52' Martim Costa empata a 26 de sete metros\n59' kempa de Salvador Salvador dá a vitória",
  basquetebol: "1.º período: 24-18, quatro triplos de Betinho Gomes\n2.º período: o Sporting reage com um parcial de 12-0\n3.º período: 61-60, jogo de parada e resposta\nÚltimo minuto: dois lançamentos livres decidem; Travante Williams acaba com 22 pontos e 11 ressaltos",
  hoquei_patins: "7' Hélder Nunes abre o marcador de meia distância\n19' cartão azul a João Rodrigues; Gonçalo Alves falha o livre direto\n34' penálti convertido, 2-1\n48' power play final sem golos, o guarda-redes segura a vitória",
  voleibol: "1.º set: 25-21, dois ases seguidos no fim\n2.º set: 23-25, o Benfica salva três pontos de set\n3.º set: 25-19, o bloco do Sporting fecha a rede\n4.º set: 25-22, o oposto acaba com 24 pontos",
  praia: "1.º período: 3-2, dois golos de bicicleta\n2.º período: o Sporting vira o jogo com três golos em quatro minutos\n3.º período: 7-5, o guarda-redes marca de baliza a baliza",
};
const VAZIO = { jogoId: "", casa: "", fora: "", res: "", comp: "", quando: "", notas: "", figura: "", contexto: "", tamanho: "normal", mod: "futebol", peca: null };
const MAX_ABAS = 12;
const novaAba = () => ({ ...VAZIO, id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });
// as crónicas guardadas neste browser; a que estava guardada antes dos separadores passa a ser o primeiro
function lerAbas() {
  try {
    const a = JSON.parse(localStorage.getItem("prose-abas") || "null");
    if (Array.isArray(a) && a.length) return a.slice(0, MAX_ABAS).map((x) => ({ ...novaAba(), ...x, mod: modCronica(x.mod) }));
  } catch { /* sem acesso ao armazenamento: começa vazio */ }
  try {
    const antiga = JSON.parse(localStorage.getItem("prose-forma") || "null");
    if (antiga && typeof antiga === "object") return [{ ...novaAba(), ...antiga, mod: modCronica(antiga.mod), peca: null }];
  } catch { /* */ }
  return [novaAba()];
}
const gravarAbas = (a) => { try { localStorage.setItem("prose-abas", JSON.stringify(a)); } catch { /* */ } };
const lerAtual = () => { try { return localStorage.getItem("prose-atual") || ""; } catch { return ""; } };
const gravarAtual = (id) => { try { localStorage.setItem("prose-atual", id); } catch { /* */ } };
const placar = (j) => (j.hs != null && j.as != null ? `${j.hs}–${j.as}` : "x");
const rotulo = (x, i) => (x.casa.trim() && x.fora.trim() ? `${x.casa.trim()} – ${x.fora.trim()}` : x.casa.trim() || x.fora.trim() || `Crónica ${i + 1}`);
// o nome do termo sem a modalidade entre parênteses («pivô (andebol)» → «pivô»)
const semModalidade = (t) => t.replace(/\s*\((futsal|hóquei|andebol|voleibol|basquetebol)\)$/i, "");

export default function Prosebot({ API = "", jogos = [], jogoEscolhido = null, dados = null }) {
  const [abas, setAbas] = useState(lerAbas);
  const [atual, setAtual] = useState(lerAtual);
  const [estados, setEstados] = useState({}); // id da crónica → { a: "A escrever…" } ou { erro }
  useEffect(() => { gravarAbas(abas); }, [abas]);
  useEffect(() => { gravarAtual(atual); }, [atual]);
  const f = abas.find((x) => x.id === atual) || abas[0];
  const muda = (campos, id = f.id) => setAbas((l) => l.map((x) => (x.id === id ? { ...x, ...campos } : x)));
  const estado = estados[f.id];
  const ocupado = !!estado?.a;

  // a primeira vez, sem jogo nenhum: o que estiver escolhido em «Preparar jogo»
  useEffect(() => {
    if (!f.casa && !f.fora && !f.notas && jogoEscolhido?.h && jogoEscolhido?.a) {
      muda({ casa: jogoEscolhido.h, fora: jogoEscolhido.a, comp: jogoEscolhido.comp || "", mod: modCronica(jogoEscolhido.mod), res: jogoEscolhido.hs != null ? `${jogoEscolhido.hs}-${jogoEscolhido.as}` : "" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nova = () => {
    if (abas.length >= MAX_ABAS) return;
    const n = novaAba();
    setAbas((l) => [...l, n]);
    setAtual(n.id);
  };
  const fechar = (x) => {
    if ((x.notas.trim() || x.peca) && !window.confirm(`Fechar «${rotulo(x, abas.indexOf(x))}»? As notas e a crónica escrita perdem-se.`)) return;
    const resto = abas.filter((y) => y.id !== x.id);
    const seguinte = resto[Math.min(abas.indexOf(x), resto.length - 1)];
    if (resto.length) { setAbas(resto); if (x.id === f.id) setAtual(seguinte.id); }
    else { const n = novaAba(); setAbas([n]); setAtual(n.id); }
  };

  const escolhido = jogos.find((j) => j.id === f.jogoId) || null;
  const escolher = (id) => {
    const j = jogos.find((x) => x.id === id);
    if (!j) return muda({ jogoId: "" });
    muda({ jogoId: j.id, casa: j.h, fora: j.a, comp: j.comp || "", mod: modCronica(j.mod), res: j.hs != null && j.as != null ? `${j.hs}-${j.as}` : "" });
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
  // as expressões do glossário próprias da modalidade (com dois sinónimos cada), para a crónica falar a língua dela
  const expressoes = useMemo(() => {
    if (!dados) return [];
    const m = modDoGlossario(f.mod);
    return dados.TERMOS.filter((x) => x.m === m).map((x) => ({ t: semModalidade(x.t), s: (x.s || []).filter((y) => !/\((BR|es\.)\)/.test(y)).slice(0, 2) }));
  }, [dados, f.mod]);

  const r = String(f.res).match(/^\s*(\d{1,3})\s*[-–x:]\s*(\d{1,3})\s*$/i);
  const pronto = f.casa.trim() && f.fora.trim() && f.notas.trim().length >= 20;
  const escrever = async () => {
    const id = f.id;
    setEstados((e) => ({ ...e, [id]: { a: "A escrever a crónica… (pode levar um minuto)" } }));
    try {
      const d = await pedir(`${API}/api/prosebot/cronica`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jogo: { casa: f.casa, fora: f.fora, hs: r ? Number(r[1]) : null, as: r ? Number(r[2]) : null, comp: f.comp, quando: f.quando },
          notas: f.notas, figura: f.figura, contexto: f.contexto, tamanho: f.tamanho, mod: f.mod,
          vocabulario: vocab.map((v) => `${v.quem}: ${v.palavras.join(", ")}`).join("; "),
          expressoes: expressoes.map((x) => (x.s.length ? `${x.t} (${x.s.join(", ")})` : x.t)).join("; "),
        }),
      });
      // as regras mecânicas do zerozero por cima do que o modelo escreveu (aspas, pontuação, números)
      muda({ peca: { ...d, tituloSite: arrumar(d.tituloSite), tituloLiveticker: arrumar(d.tituloLiveticker), microtitulo: arrumar(d.microtitulo), lead: arrumar(d.lead), corpo: d.corpo.map((p) => arrumar(p)) } }, id);
      setEstados((e) => ({ ...e, [id]: null }));
    } catch (e) { setEstados((x) => ({ ...x, [id]: { erro: e.message } })); }
  };
  const peca = f.peca;
  const modsLista = NOME_MOD[f.mod] ? MODS_CRONICA : [...MODS_CRONICA, { id: f.mod, nome: f.mod }];

  return (
    <section className="gdecl gprose" aria-label="Prosebot 2.0">
      <div className="gjogo-cab">
        <h2 className="gh2">Prosebot 2.0</h2>
        <p className="muted">Escreve as notas do jogo e o Prosebot faz a crónica com as regras do zerozero: o jogo contado com análise, não só minuto a minuto. Cada crónica tem o seu separador.</p>
      </div>
      <div className="gpabas" role="tablist" aria-label="Crónicas">
        {abas.map((x, k) => (
          <div key={x.id} className={`gpaba${x.id === f.id ? " on" : ""}`}>
            <button role="tab" aria-selected={x.id === f.id} className="gpaba-t" title={rotulo(x, k)} onClick={() => setAtual(x.id)}>
              {estados[x.id]?.a && <i className="gpaba-a" aria-label="a escrever" />}
              <span className="gpaba-nome">{rotulo(x, k)}</span>
              {x.mod !== "futebol" && <span className="gpaba-mod">{NOME_MOD[x.mod] || x.mod}</span>}
              {x.peca && <span className="gpaba-ok" aria-label="crónica escrita">✓</span>}
            </button>
            <button className="gpaba-x" aria-label={`Fechar ${rotulo(x, k)}`} title="Fechar esta crónica" onClick={() => fechar(x)}>×</button>
          </div>
        ))}
        {abas.length < MAX_ABAS && <button className="gpaba-nova" onClick={nova}>+ Nova crónica</button>}
      </div>
      {jogos.length > 0 && (
        <select className="gpsel" value={f.jogoId} onChange={(e) => escolher(e.target.value)} aria-label="Jogo">
          <option value="">Escolher um jogo da lista (ou escrever à mão em baixo)</option>
          {jogos.map((j) => <option key={j.id} value={j.id}>{j.vivo ? "● " : ""}{j.h} {placar(j)} {j.a} · {j.comp}{j.mod && j.mod !== "futebol" && NOME_MOD[modCronica(j.mod)] ? ` (${NOME_MOD[modCronica(j.mod)]})` : ""}{j.vivo ? " (a decorrer)" : ""}</option>)}
        </select>
      )}
      <div className="gform gpjogo">
        <input value={f.casa} onChange={(e) => muda({ casa: e.target.value, jogoId: "" })} placeholder="Equipa da casa" aria-label="Equipa da casa" />
        <input className="gres-in" value={f.res} onChange={(e) => muda({ res: e.target.value })} placeholder={f.mod === "voleibol" ? "Sets (3-1)" : "Resultado (2-1)"} aria-label="Resultado" inputMode="numeric" maxLength={9} />
        <input value={f.fora} onChange={(e) => muda({ fora: e.target.value, jogoId: "" })} placeholder="Equipa de fora" aria-label="Equipa de fora" />
        <select className="gpmod" value={f.mod} onChange={(e) => muda({ mod: e.target.value })} aria-label="Modalidade">
          {modsLista.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <input value={f.comp} onChange={(e) => muda({ comp: e.target.value })} placeholder="Competição (ex.: Liga Portugal, 8.ª jornada)" aria-label="Competição" />
        <input value={f.quando} onChange={(e) => muda({ quando: e.target.value })} placeholder={f.mod === "futebol" ? "Quando e onde (ex.: sábado, no Estádio do Dragão)" : "Quando e onde (ex.: sábado, no Pavilhão João Rocha)"} aria-label="Quando e onde" />
      </div>
      {vocab.length > 0 && (
        <p className="muted gpvocab">Do glossário: {vocab.map((v, k) => <span key={v.quem}>{k > 0 && " · "}<b>{v.quem}</b> — {v.palavras.slice(0, 6).join(", ")}</span>)}</p>
      )}
      {expressoes.length > 0 && (
        <p className="muted gpvocab">Expressões de {(NOME_MOD[f.mod] || f.mod).toLowerCase()} que a crónica pode usar: {expressoes.slice(0, 12).map((x) => x.t).join(", ")}{expressoes.length > 12 ? ` e mais ${expressoes.length - 12}` : ""}</p>
      )}
      <textarea className="gdtexto" value={f.notas} onChange={(e) => muda({ notas: e.target.value })} rows={11} aria-label="Notas do jogo"
        placeholder={`As notas do jogo, uma por linha, com o minuto (ou o período, ou o set) quando houver. Ex.:\n${EXEMPLO[f.mod] || EXEMPLO.futebol}`} />
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
        <button className="gir" disabled={ocupado || !pronto} onClick={escrever}>{peca ? "Escrever outra vez" : "Escrever a crónica"}</button>
        {(f.notas || f.casa || f.fora) && <button className="textbtn" disabled={ocupado} onClick={() => { muda({ ...VAZIO }); setEstados((e) => ({ ...e, [f.id]: null })); }}>Limpar</button>}
      </div>
      {!pronto && !peca && <p className="muted gdnota">Faltam {!f.casa.trim() || !f.fora.trim() ? "as equipas" : "as notas do jogo"} para escrever a crónica.</p>}
      {estado?.a && <p className="muted gdnota" aria-live="polite">{estado.a}</p>}
      {estado?.erro && <p className="gdaviso" role="alert">Não foi possível: {estado.erro}</p>}
      {peca && (
        <Peca key={f.id} peca={peca} rotulo="Copiar a crónica" rodape={`escrita por ${peca.motor} (${peca.modelo})`}
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
.apito .gpabas{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:900px;margin:0 auto 12px}
.apito .gpaba{display:flex;align-items:stretch;max-width:240px;border:1px solid var(--line);border-radius:999px;background:var(--bg);overflow:hidden}
.apito .gpaba.on{border-color:var(--ink);box-shadow:0 0 0 1px var(--ink);background:var(--raise)}
.apito .gpaba-t{display:flex;align-items:center;gap:6px;min-width:0;padding:5px 4px 5px 12px;font:inherit;font-size:13px;font-weight:600;color:var(--ink);background:none;border:0;cursor:pointer}
.apito .gpaba-nome{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apito .gpaba-mod{flex:none;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
.apito .gpaba-ok{flex:none;font-size:12px;color:var(--hist)}
.apito .gpaba-a{flex:none;width:7px;height:7px;border-radius:50%;background:var(--live);animation:apl 1.2s ease-out infinite}
.apito .gpaba-x{flex:none;padding:0 10px 0 6px;font-size:16px;line-height:1;color:var(--muted);background:none;border:0;cursor:pointer}
.apito .gpaba-x:hover{color:var(--ink)}
.apito .gpaba-nova{padding:5px 14px;font:inherit;font-size:13px;font-weight:600;color:var(--ink);background:none;border:1px dashed var(--line);border-radius:999px;cursor:pointer}
.apito .gpaba-nova:hover{border-color:var(--ink)}
.apito .gpsel{display:block;width:100%;max-width:720px;margin:0 auto 10px;font:inherit;font-size:14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:7px 12px}
.apito .gpjogo{justify-content:center;margin:0 0 8px}
.apito .gpjogo input{flex:1 1 200px}
.apito .gpjogo .gres-in{flex:0 1 120px;text-align:center}
.apito .gpjogo .gpmod{flex:0 1 170px;font:inherit;font-size:14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:7px 10px}
.apito .gpvocab{font-size:12.5px;text-align:center;margin:0 0 8px}
.apito .gpeventos{display:block;margin:6px auto 0;font-size:13px;font-weight:600;color:var(--hist)}
.apito .gfigura{border:1px solid var(--hist);border-radius:8px;padding:8px 12px;background:color-mix(in srgb,var(--hist) 6%,var(--raise))}
.apito .gfigura p:last-child{margin:4px 0 0;font-size:14.5px}
`;
