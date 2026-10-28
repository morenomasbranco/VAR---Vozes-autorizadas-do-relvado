// Glossário › Declarações: cola-se o que alguém disse (ou passa-se a fala de um vídeo a texto) e o VAR escreve a peça
// com as regras do zerozero, em português de Portugal (traduz do Brasil e de outras línguas). As regras mecânicas
// (aspas, pontuação, números) aplicam-se por cima do que o modelo escreveu, e os avisos dizem o que as regras pedem e
// ainda falta.
import { useMemo, useRef, useState } from "react";
import { arrumar, pareceBrasil, avisos } from "./glossario/declaracoes.js";

const TIPOS = [
  { id: "peca", nome: "Peça" },
  { id: "curta", nome: "Curta" },
  { id: "pr", nome: "Pergunta/resposta" },
  { id: "citacoes", nome: "Só as citações" },
];
const LINGUAS = { "pt-PT": "português de Portugal", "pt-BR": "português do Brasil", pt: "português", en: "inglês", english: "inglês", es: "espanhol", spanish: "espanhol", fr: "francês", french: "francês", it: "italiano", italian: "italiano", de: "alemão", german: "alemão", portuguese: "português", outra: "outra língua" };
const nomeLingua = (l) => (l ? LINGUAS[l] || LINGUAS[String(l).toLowerCase()] || l : null);
const ler = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } };

// o texto com o itálico e o negrito do zerozero (<i>, <b>) a aparecerem como tal (o resto fica escapado)
export const comEstilo = (t) => ({ __html: String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/&lt;(\/?)(i|b)&gt;/g, "<$1$2>") });
export const pedir = (url, opts) => fetch(url, opts).then((r) => r.json().catch(() => ({})).then((d) => (r.ok ? d : Promise.reject(new Error(d.erro || `erro ${r.status}`)))));

export function Copiar({ texto, rotulo = "Copiar" }) {
  const [feito, setFeito] = useState(false);
  return <button type="button" className="textbtn" onClick={() => navigator.clipboard?.writeText(texto).then(() => { setFeito(true); setTimeout(() => setFeito(false), 1500); }).catch(() => {})}>{feito ? "Copiado" : rotulo}</button>;
}

// a peça escrita (Declarações e Prosebot): títulos, micro-título, lead, corpo, o que vier a mais (a figura do jogo),
// as citações, os avisos das regras do zerozero que ainda faltam e as notas do modelo
export function Peca({ peca, extra = null, rodape = "", rotulo = "Copiar a peça" }) {
  const lista = avisos(peca.corpo.join("\n"), { titulo: peca.tituloSite, microtitulo: peca.microtitulo, lead: peca.lead });
  const tudo = [peca.tituloSite, peca.microtitulo, peca.lead, ...peca.corpo].filter(Boolean).join("\n\n");
  return (
    <div className="gdpeca">
      {(peca.tituloSite || peca.tituloLiveticker) && (
        <div className="gdbloco">
          {peca.tituloSite && <p className="gdcampo"><span className="gmod">Título (site) · {peca.tituloSite.replace(/<\/?[ib]>/g, "").length}/90</span><span className="gdtit" dangerouslySetInnerHTML={comEstilo(peca.tituloSite)} /><Copiar texto={peca.tituloSite} /></p>}
          {peca.tituloLiveticker && <p className="gdcampo"><span className="gmod">Título (Liveticker SIC)</span><span className="gdtit" dangerouslySetInnerHTML={comEstilo(peca.tituloLiveticker)} /><Copiar texto={peca.tituloLiveticker} /></p>}
          {peca.microtitulo && <p className="gdcampo"><span className="gmod">Micro-título</span><span dangerouslySetInnerHTML={comEstilo(peca.microtitulo)} /><Copiar texto={peca.microtitulo} /></p>}
        </div>
      )}
      {peca.lead && <p className="gdlead" dangerouslySetInnerHTML={comEstilo(peca.lead)} />}
      {peca.corpo.map((p, i) => <p key={i} className="gdpar" dangerouslySetInnerHTML={comEstilo(p)} />)}
      {extra}
      {peca.citacoes?.length > 0 && (
        <div className="gdbloco">
          <p className="gmod">Citações</p>
          <ul className="gdcits">{peca.citacoes.map((c, i) => <li key={i}><span dangerouslySetInnerHTML={comEstilo(c)} /> <Copiar texto={c} /></li>)}</ul>
        </div>
      )}
      {lista.length > 0 && (
        <div className="gdbloco gdavisos">
          <p className="gmod">A rever (regras do zerozero)</p>
          <ul>{lista.map((x, i) => <li key={i}><b>{x.regra}:</b> {x.msg}</li>)}</ul>
        </div>
      )}
      {peca.notas?.length > 0 && (
        <div className="gdbloco">
          <p className="gmod">Notas</p>
          <ul>{peca.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      <div className="gjogo-acoes">
        {tudo && <Copiar texto={tudo} rotulo={rotulo} />}
        {rodape && <span className="muted gdmotor">{rodape}</span>}
      </div>
    </div>
  );
}

export default function Declaracoes({ API = "" }) {
  const [texto, setTexto] = useState(() => ler("decl-texto", ""));
  const [quem, setQuem] = useState(() => ler("decl-quem", ""));
  const [contexto, setContexto] = useState(() => ler("decl-contexto", ""));
  const [tipo, setTipo] = useState(() => ler("decl-tipo", "peca"));
  const [origem, setOrigem] = useState("texto");
  const [url, setUrl] = useState("");
  const [estado, setEstado] = useState(null); // { a: "a escrever" | …, erro }
  const [peca, setPeca] = useState(null);
  const [aviso, setAviso] = useState(null); // nota sobre o texto (língua do vídeo, tradução feita…)
  const ficheiro = useRef(null);
  const ocupado = !!estado?.a;
  const mudarTexto = (t) => { setTexto(t); gravar("decl-texto", t); };
  const brasil = useMemo(() => pareceBrasil(texto), [texto]);

  const correr = async (a, fn) => {
    setEstado({ a });
    try { await fn(); setEstado(null); } catch (e) { setEstado({ erro: e.message }); }
  };
  const escrever = () => correr("A escrever a peça…", async () => {
    const d = await pedir(`${API}/api/declaracoes/escrever`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, quem, contexto, tipo }) });
    // as regras mecânicas por cima do que o modelo escreveu (aspas, pontuação, números)
    const a = (x) => arrumar(x, { perguntaResposta: tipo === "pr" });
    setPeca({ ...d, tituloSite: a(d.tituloSite), tituloLiveticker: a(d.tituloLiveticker), microtitulo: a(d.microtitulo), lead: a(d.lead), corpo: d.corpo.map(a), citacoes: d.citacoes.map(a) });
  });
  const transcrever = () => correr("A passar o vídeo a texto… (pode levar um minuto)", async () => {
    const f = ficheiro.current?.files?.[0];
    if (!f && !url.trim()) throw new Error("escolhe um vídeo ou cola o endereço dele");
    const d = f
      ? await pedir(`${API}/api/declaracoes/transcrever?nome=${encodeURIComponent(f.name)}`, { method: "POST", body: f })
      : await pedir(`${API}/api/declaracoes/transcrever?url=${encodeURIComponent(url.trim())}`, { method: "POST" });
    mudarTexto(d.texto);
    setOrigem("texto");
    const l = nomeLingua(d.lingua);
    setAviso(`Passado a texto${l ? ` (em ${l})` : ""}${d.duracao ? `, ${Math.round(d.duracao / 60) || 1} min de som` : ""}. A transcrição automática pode trocar nomes: revê antes de escrever a peça${l && !/portugu/.test(l) ? ", que sai já traduzida" : ""}.`);
  });


  return (
    <section className="gdecl" aria-label="Declarações">
      <div className="gjogo-cab">
        <h2 className="gh2">Declarações</h2>
        <p className="muted">Cola as declarações (ou passa um vídeo a texto) e o VAR escreve a peça com as regras do zerozero, em português de Portugal.</p>
      </div>
      <div className="seg gfiltro" role="group" aria-label="Origem">
        <button aria-pressed={origem === "texto"} onClick={() => setOrigem("texto")}>Colar o texto</button>
        <button aria-pressed={origem === "video"} onClick={() => setOrigem("video")}>De um vídeo</button>
      </div>
      {origem === "video" && (
        <div className="gdvideo">
          <input className="gdin" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Endereço do vídeo (t.me, streamff, streamin, .mp4…)" aria-label="Endereço do vídeo" />
          <span className="muted">ou</span>
          <input ref={ficheiro} type="file" accept="video/*,audio/*" aria-label="Ficheiro de vídeo ou de som" />
          <button className="gir" disabled={ocupado} onClick={transcrever}>Passar a texto</button>
          <p className="muted gdnota">O som vai ao Whisper (Groq) e o texto volta para a caixa abaixo, na língua original. Do YouTube, descarrega o vídeo e envia o ficheiro.</p>
        </div>
      )}
      <textarea className="gdtexto" value={texto} onChange={(e) => mudarTexto(e.target.value)} rows={9} placeholder={"Cola aqui as declarações.\nEx.: «Foi um jogo muito difícil, mas a equipa esteve à altura…»"} aria-label="Declarações" />
      {brasil && <p className="gdaviso">Parece português do Brasil: a peça sai já em português de Portugal.</p>}
      {aviso && <p className="muted gdnota">{aviso}</p>}
      <div className="gform gdcampos">
        <input value={quem} onChange={(e) => { setQuem(e.target.value); gravar("decl-quem", e.target.value); }} placeholder="Quem fala (ex.: Francesco Farioli, treinador do FC Porto)" aria-label="Quem fala" />
        <input value={contexto} onChange={(e) => { setContexto(e.target.value); gravar("decl-contexto", e.target.value); }} placeholder="Contexto (ex.: antevisão do jogo com o Benfica, desta sexta-feira)" aria-label="Contexto" />
      </div>
      <div className="seg gfiltro" role="group" aria-label="O que escrever">
        {TIPOS.map((t) => <button key={t.id} aria-pressed={tipo === t.id} onClick={() => { setTipo(t.id); gravar("decl-tipo", t.id); }}>{t.nome}</button>)}
      </div>
      <div className="gjogo-acoes gdacoes">
        <button className="gir" disabled={ocupado || texto.trim().length < 10} onClick={escrever}>Escrever {tipo === "citacoes" ? "as citações" : "a peça"}</button>
        {texto && <button className="textbtn" disabled={ocupado} onClick={() => { mudarTexto(""); setPeca(null); setAviso(null); }}>Limpar</button>}
      </div>
      {estado?.a && <p className="muted gdnota" aria-live="polite">{estado.a}</p>}
      {estado?.erro && <p className="gdaviso" role="alert">Não foi possível: {estado.erro}</p>}

      {peca && <Peca peca={peca} rodape={`${nomeLingua(peca.lingua) && peca.lingua !== "pt-PT" ? `Traduzido do ${nomeLingua(peca.lingua)} · ` : ""}escrito por ${peca.motor} (${peca.modelo})`} />}
    </section>
  );
}

export const DECL_CSS = `
.apito .gdecl{border:1px solid var(--line);border-left:4px solid var(--hist);border-radius:10px;background:var(--raise);padding:12px 14px;margin:0 0 16px}
.apito .gdvideo{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;margin:0 0 10px}
.apito .gdvideo .gdin{flex:1 1 280px;min-width:0;font:inherit;font-size:14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:7px 14px}
.apito .gdvideo input[type=file]{font-size:13px;max-width:100%}
.apito .gdtexto{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:15px;line-height:1.45;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;resize:vertical;min-height:140px}
.apito .gdtexto:focus{outline:2px solid var(--hist);outline-offset:1px}
.apito .gdcampos{margin:10px 0 8px}
.apito .gdcampos input{font-size:14px}
.apito .gdacoes{margin:4px 0 8px}
.apito .gdacoes button:disabled{opacity:.5;cursor:default}
.apito .gdnota{font-size:12.5px;text-align:center;margin:6px 0;flex-basis:100%}
.apito .gdaviso{font-size:13px;text-align:center;margin:6px 0;color:var(--live)}
.apito .gdpeca{border-top:1px solid var(--line);margin-top:10px;padding-top:10px;max-width:820px;margin-left:auto;margin-right:auto}
.apito .gdbloco{margin:0 0 12px}
.apito .gdcampo{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 8px}
.apito .gdcampo .gmod{flex-basis:100%}
.apito .gdcampo > span:not(.gmod){flex:1;min-width:0}
.apito .gdtit{font-family:var(--display);font-weight:700;font-size:19px;line-height:1.25}
.apito .gdlead{font-weight:600;font-size:15.5px;line-height:1.5;margin:0 0 10px}
.apito .gdpar{font-size:15px;line-height:1.55;margin:0 0 10px}
.apito .gdcits{margin:4px 0 0;padding-left:18px;font-size:14.5px}
.apito .gdcits li{margin:0 0 4px}
.apito .gdavisos{border:1px dashed var(--live);border-radius:8px;padding:8px 12px}
.apito .gdavisos ul,.apito .gdbloco > ul{margin:4px 0 0;padding-left:18px;font-size:13.5px}
.apito .gdmotor{font-size:12px}
`;
