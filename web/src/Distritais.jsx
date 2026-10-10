// Secção «Distritais»: uma coluna por associação de futebol, à maneira da «Ronda pela atualidade», com as notícias e
// os comunicados da própria associação, a imprensa que fala dela e os posts mais recentes dos clubes (Instagram e
// Facebook). Os dados vêm de /api/distritais; o que é novo chega pelos eventos «distrital» (posts) e «oficial»
// (notícias, que o App passa como evento da janela «distrital-noticia»). As imagens passam pelo servidor.
// Por cima das colunas, duas faixas à maneira do Feed: os jogos de hoje, das distritais à Liga 3 (/api/pt/aovivo), e
// as transmissões em direto nos canais de YouTube das associações, do Canal 11 e da FPF (/api/distritais/diretos).
import { useEffect, useMemo, useRef, useState } from "react";

// das distritais à Liga 3: as provas das associações e, da FPF, a Liga 3, o Campeonato de Portugal e o dos Açores
const NACIONAIS_BAIXO = /liga 3|campeonato de portugal|campeonato (de futebol )?dos a[cç]ores/i;
export const daBase = (j) => (j.mod || "futebol") === "futebol" && (String(j.org || "").startsWith("af-") || (j.org === "fpf" && NACIONAIS_BAIXO.test(j.compNome || "")));
const AO_VIVO = (j) => ["direto", "intervalo"].includes(j.estado) || j.semInfo;
const hhmm = (t) => new Date(t).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
const diaDe = (t) => new Date(t).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });

// faixa 1: jogos a decorrer (primeiro), depois os que ainda vão começar e os que já acabaram hoje
function JogosDaBase({ API, agora }) {
  const [jogos, setJogos] = useState(null);
  useEffect(() => {
    const ler = () => fetch(`${API}/api/pt/aovivo`).then((r) => r.json()).then((l) => setJogos(Array.isArray(l) ? l.filter(daBase) : [])).catch(() => {});
    ler();
    const t = setInterval(ler, 30e3);
    return () => clearInterval(t);
  }, [API]);
  if (!jogos) return null;
  const vivos = jogos.filter(AO_VIVO);
  const fase = (j) => (AO_VIVO(j) ? 0 : j.estado === "agendado" && !j.porConfirmar ? 1 : 2);
  const lista = [...jogos].sort((a, b) => fase(a) - fase(b) || (fase(a) === 2 ? (b.inicio || 0) - (a.inicio || 0) : (a.inicio || 0) - (b.inicio || 0))).slice(0, 60);
  return (
    <section className="livebar jv dbase" aria-label="Jogos de hoje, das distritais à Liga 3">
      <div className="livehead">
        <span className={`pulse ${vivos.length ? "" : "off"}`}><i />{vivos.length ? `Em direto · ${vivos.length}` : "Jogos de hoje"}</span>
        <span className="muted small">Das distritais à Liga 3</span>
      </div>
      {lista.length === 0 ? <p className="cempty jvhint">Hoje não há jogos das distritais nem da Liga 3 e do Campeonato de Portugal.</p> : (
        <ul className="livelist jvstrip">
          {lista.map((j) => {
            const f = fase(j);
            const placar = j.hs != null && j.as != null && f !== 1;
            return (
              <li key={j.id}>
                <div className={`lcard ${f === 0 ? "" : f === 1 ? "next" : "done"}`}>
                  <span className="lcomp" title={[j.compNome, j.serieNome].filter(Boolean).join(" · ")}>{j.compNome}{j.serieNome ? ` · ${j.serieNome}` : ""}</span>
                  <span className="lrow"><span className="lteam">{j.logoCasa && <img className="dlogo" src={j.logoCasa} alt="" loading="lazy" />}{j.casa}</span>{placar && <b translate="no">{j.hs}</b>}</span>
                  <span className="lrow"><span className="lteam">{j.logoFora && <img className="dlogo" src={j.logoFora} alt="" loading="lazy" />}{j.fora}</span>{placar && <b translate="no">{j.as}</b>}</span>
                  <span className="lfoot">
                    {f === 0 ? <span className={`lmin ${j.estado === "intervalo" ? "pausa" : ""}`} translate="no">{j.estado === "intervalo" ? "Intervalo" : j.min?.texto || (j.semInfo ? "A decorrer (sem info)" : "Em direto")}</span>
                      : f === 1 ? <span className="muted small" translate="no">{j.inicio && !j.semHora ? hhmm(j.inicio) : "Hoje"}</span>
                        : <span className="muted small">{j.porConfirmar ? "Resultado por confirmar" : j.oficial ? "Final (oficial)" : "Final"}</span>}
                    {f === 0 && j.golos?.length > 0 && <span className="lult" title={j.golos.at(-1).marcador || ""}>{j.golos.at(-1).marcador ? `⚽ ${j.golos.at(-1).marcador}` : ""}</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// faixa 2: transmissões no YouTube (em direto primeiro, depois as marcadas); toca no próprio cartão
function DiretosYoutube({ API, agora }) {
  const [d, setD] = useState(null);
  const [aTocar, setATocar] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    const ler = () => fetch(`${API}/api/distritais/diretos`).then((r) => r.json()).then(setD).catch(() => {});
    ler();
    const t = setInterval(ler, 30e3);
    return () => clearInterval(t);
  }, [API]);
  if (!d) return null;
  const lista = [...(d.aoVivo || []), ...(d.aSeguir || [])];
  // agendado: a hora, e o dia quando não é hoje
  const quandoComeca = (t) => (diaDe(t) === diaDe(agora) ? `Hoje, ${hhmm(t)}` : new Date(t).toLocaleString("pt-PT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }));
  const rola = (dir) => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <section className="vbar vdest dyt" aria-label="Jogos em direto no YouTube">
      <div className="livehead">
        <h2 className="vdesth">Em direto no YouTube</h2>
        <span className="muted small">{d.aoVivo?.length ? `${d.aoVivo.length} em direto · ` : ""}{d.aSeguir?.length ? `${d.aSeguir.length} agendados · ` : ""}Canais das associações, do Canal 11 e da FPF</span>
        <div className="varrows">
          <button className="icon-btn" onClick={() => rola(-1)} aria-label="←">‹</button>
          <button className="icon-btn" onClick={() => rola(1)} aria-label="→">›</button>
        </div>
      </div>
      {lista.length === 0 && <p className="cempty jvhint">Neste momento não há jogos em direto nem agendados nos canais de YouTube das associações, do Canal 11 e da FPF.</p>}
      <ul className="vlist vrow" ref={ref}>
        {lista.map((v) => (
          <li key={v.videoId} className={`vcard mini ${v.aoVivo ? "cat-red" : ""}`}>
            <div className="vthumb">
              {aTocar === v.videoId ? (
                <iframe src={`https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1`} title={v.titulo} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
              ) : (
                <button className="vplay" onClick={() => setATocar(v.videoId)} aria-label="Ver">
                  <img src={v.imagem} alt="" loading="lazy" />
                  <span className="vbtn">▶</span>
                  <span className={`vcat ${v.aoVivo ? "dao" : ""}`}>{v.aoVivo ? "AO VIVO" : v.inicio ? quandoComeca(v.inicio) : "Agendado"}</span>
                </button>
              )}
            </div>
            <h3 className="vtitle">{v.titulo}</h3>
            <div className="vmeta">
              <span className="muted">{v.nomeOrg}{v.canal && v.canal !== v.nomeOrg ? ` · ${v.canal}` : ""}</span>
              {v.aoVivo && v.espetadores ? <span className="muted"> · {v.espetadores} a ver</span> : null}
            </div>
            <div className="vacts">
              {aTocar === v.videoId ? <button className="textbtn" onClick={() => setATocar(null)}>Fechar</button> : <button className="textbtn vwatch" onClick={() => setATocar(v.videoId)}>Ver</button>}
              <a className="textbtn" href={v.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>YouTube ↗</a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

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

const TIPO = { noticia: "Notícia", comunicado: "Comunicado", imprensa: "Imprensa" };
// notícia ou comunicado da associação, ou notícia da imprensa sobre ela
function Noticia({ x, agora }) {
  return (
    <li className={`citem dnot ${agora - (x.vistoEm || 0) < 4000 ? "fresh" : ""}`}>
      <div className="cmeta">
        <span className="src">{x.tipo === "imprensa" ? x.meio || "Imprensa" : x.org}</span>
        <span className={`chip otipo ${x.tipo}`}>{TIPO[x.tipo] || "Notícia"}</span>
        {x.pdf && <span className="chip opdf" translate="no">PDF</span>}
        <span className="muted ctime" title={new Date(x.ts).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}>{quando(x.ts, agora)}</span>
      </div>
      <h3 className="ctitle"><a href={x.url} target="_blank" rel="noreferrer">{x.titulo}</a></h3>
    </li>
  );
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

const VER = [["tudo", "Tudo"], ["associacao", "Associação"], ["imprensa", "Imprensa"], ["clubes", "Clubes"]];

export default function Distritais({ API = "", now, query = "" }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);
  const [n, setN] = useState({});
  const [ver, setVer] = useState("tudo");
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
    // notícia ou comunicado novo da associação (ou da imprensa): entra no topo da coluna
    const onNoticia = (e) => {
      const x = e.detail;
      if (!x?.assoc) return;
      setD((y) => {
        if (!y) return y;
        const antes = y.noticias?.[x.assoc] || [];
        const ja = antes.find((z) => z.id === x.id);
        const nova = ja ? antes.map((z) => (z.id === x.id ? { ...z, ...x, vistoEm: z.vistoEm } : z)) : [{ ...x, vistoEm: x.corrigido ? 0 : Date.now() }, ...antes];
        return { ...y, noticias: { ...(y.noticias || {}), [x.assoc]: nova.sort((a, b) => b.ts - a.ts).slice(0, 80) } };
      });
    };
    window.addEventListener("distrital", on);
    window.addEventListener("distrital-noticia", onNoticia);
    return () => { window.removeEventListener("distrital", on); window.removeEventListener("distrital-noticia", onNoticia); };
  }, []);

  const q = semAcentos(query.trim());
  // cada coluna: notícias da associação, imprensa e posts dos clubes, do mais recente para o mais antigo
  const colunas = useMemo(() => (d?.orgs || []).map((o) => {
    const posts = ver === "tudo" || ver === "clubes" ? (d.posts?.[o.key] || []).filter((p) => !q || semAcentos(`${p.clube} ${p.legenda || ""}`).includes(q)).map((p) => ({ k: `p:${p.id}`, ts: p.ts, p })) : [];
    const noticias = ver === "clubes" ? [] : (d.noticias?.[o.key] || [])
      .filter((x) => (ver === "tudo" || (ver === "imprensa" ? x.tipo === "imprensa" : x.tipo !== "imprensa")) && (!q || semAcentos(`${x.org} ${x.meio || ""} ${x.titulo}`).includes(q)))
      .map((x) => ({ k: `n:${x.id}`, ts: x.ts, x }));
    return { ...o, entradas: [...noticias, ...posts].sort((a, b) => b.ts - a.ts) };
  }), [d, q, ver]);

  if (!d) return <p className="empty">{erro || "A carregar as associações e os clubes…"}</p>;
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
  const api = e.instagramApi || null; // Instagram pela API oficial da Meta
  const apiPausa = api && agora < (api.pausaAte || 0);
  const bloqueado = !api && igPausa && anonFalha && !relayVivo && !e.casa && (!fb || fbPausa || fbFalha);
  const total = Object.values(d.posts || {}).reduce((t, l) => t + l.length, 0);
  const totalNoticias = Object.values(d.noticias || {}).reduce((t, l) => t + l.length, 0);
  const porLer = (e.lidosTotal || 0) < (e.perfis || e.clubes || 0);
  return (
    <div className="dist">
      <JogosDaBase API={API} agora={agora} />
      <DiretosYoutube API={API} agora={agora} />
      <div className="livehead dhead">
        <div className="seg lvls" role="group" aria-label="O que mostrar">
          {VER.map(([k, t]) => <button key={k} aria-pressed={ver === k} onClick={() => setVer(k)}>{t}</button>)}
        </div>
      </div>
      <p className="muted dnota">
        Notícias e comunicados de cada associação, a imprensa que fala dela e os posts do Instagram e do Facebook dos clubes ({totalNoticias} notícias e comunicados).{" "}
        {porLer ? `A ler as páginas dos clubes: ${e.lidosTotal || 0} de ${e.perfis || e.clubes} já lidas, ${total} posts.` : `${e.perfis || e.clubes} páginas de clubes, relidas ao longo do dia.`}
      </p>
      <ul className="muted dvias">
        {api ? (
          <li>
            Instagram (API oficial da Meta): {e.lidosInstagram ?? 0} de {e.paginasInstagram ?? "?"} clubes lidos
            {api.naoProfissionais ? ` · ${api.naoProfissionais} contas pessoais (a API só lê contas profissionais)` : ""}
            {apiPausa ? ` · em pausa até às ${hora(api.pausaAte)} (${api.ultimoErro?.erro || api.ultimoErro || "limite"})` : api.ok ? " · a ler" : ""}
          </li>
        ) : (
          <li>
            Instagram{ig.comSessao ? " (com sessão)" : " (sem sessão)"}: {e.lidosInstagram ?? 0} de {e.paginasInstagram ?? "?"} lidos
            {igPausa ? ` · o Instagram está a limitar os pedidos deste servidor (${ig.ultimoErro || "recusa"}); volta a tentar às ${hora(ig.pausaAte)}, mais devagar` : ig.ultimoOk ? " · a ler" : ""}
          </li>
        )}
        {fb && <li>Facebook: {e.lidosFacebook ?? 0} de {e.paginasFacebook ?? fb.paginas} páginas lidas{fbPausa ? ` · o Facebook está a recusar os pedidos (${fb.ultimoErro || "recusa"}); volta a tentar às ${hora(fb.pausaAte)}` : fbFalha ? ` · ainda sem leituras certas (${fb.ultimoErro || "erro"})` : fb.ok ? " · a ler" : ""}</li>}
        {e.casa && <li>Retransmissor de casa ligado: o Instagram e o Facebook dos clubes são lidos pela ligação de casa, em tempo real</li>}
        {relayVivo && <li>Retransmissor dos stories: {vias.retransmissor.ok} perfis recebidos</li>}
      </ul>
      {bloqueado && (
        <p className="ptwarn dnota">
          Neste momento nenhuma das vias está a trazer posts dos clubes (as notícias das associações e da imprensa continuam a chegar).{" "}
          O Instagram e o Facebook recusam os servidores de alojamento. O servidor experimenta sozinho as pontes gratuitas configuradas (Google, Cloudflare, Netlify); se nenhuma passar, a via que nunca falha é um telemóvel antigo ligado ao carregador com o retransmissor (npm run retransmissor).
          {ig.comSessao ? "" : " Também ajuda juntar ao servidor a variável IG_SESSIONID (a sessão de uma conta de Instagram qualquer, sem seguir ninguém)."}
        </p>
      )}
      <div className="cols dcols">
        {colunas.map((c) => {
          const k = n[c.key] || 12;
          return (
            <section key={c.key} className="col">
              <h2 className="colh">{c.nome} {c.clubes > 0 && <span className="muted small">{c.clubes} clubes</span>}</h2>
              {c.entradas.length === 0 ? <p className="cempty">{q ? "Nada com esta pesquisa." : "Ainda sem notícias nem posts desta associação."}</p> : (
                <ul className="clist" aria-live="polite">
                  {c.entradas.slice(0, k).map((y) => (y.p ? <Post key={y.k} p={y.p} API={API} agora={agora} /> : <Noticia key={y.k} x={y.x} agora={agora} />))}
                </ul>
              )}
              {c.entradas.length > k && <button className="textbtn vmais" onClick={() => setN((x) => ({ ...x, [c.key]: k + 12 }))}>Ver mais ({c.entradas.length - k})</button>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export const DIST_CSS = `
.apito .dist .dnota{font-size:12.5px;margin:0 0 12px}
.apito .dbase .dlogo{width:18px;height:18px;object-fit:contain;flex:none}
.apito .dbase .lcard{cursor:default}
.apito .dyt .vcat.dao{background:#D7263D}
.apito .dyt .vtitle{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.apito .dist .dhead{margin:0 0 10px} .apito .dist .dhead .seg{margin:0}
.apito .dnot .ctitle a{color:inherit;text-decoration:none} .apito .dnot .ctitle a:hover{text-decoration:underline}
.apito .otipo.imprensa{background:var(--raise)}
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
