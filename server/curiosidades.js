// Glossário › Preparar jogo: curiosidades do jogo escolhido.
// - Primeiro as que vêm de dados (server/curiosidades-dados.js): os últimos confrontos, a forma, a classificação, o
//   estádio e o árbitro (ESPN) ou a classificação, a forma e os jogos desta época (Portugal). Não gastam quota e não
//   inventam; ficam guardadas 10 minutos.
// - Só quando se pede (?web=1), as pesquisadas na web por um modelo de linguagem (server/ia.js), guardadas um dia para
//   o mesmo jogo não gastar a quota outra vez. Sem quota, diz-se isso em português, sem o erro técnico.
import { pedirIA } from "./ia.js";
import { curiosidadesEspn, curiosidadesPt, resumoEspn } from "./curiosidades-dados.js";

const SISTEMA = `És jornalista de desporto do zerozero e preparas jogos: procuras curiosidades verificadas sobre um jogo, para usar na antevisão, no direto e na crónica.
Pesquisa na web antes de responder. Procura, por esta ordem de interesse:
- o historial entre as duas equipas (jogos, vitórias de cada uma, empates, o último resultado, a maior goleada);
- séries atuais (jogos sem perder, sem ganhar, sem sofrer golos) e a posição na tabela;
- jogadores ou treinadores que passaram pelos dois clubes, reencontros, estreias;
- recordes e marcos que podem acontecer neste jogo (centésimo jogo, golos de um marcador, etc.);
- o estádio, a história do encontro, dérbis e rivalidades.
Regras: português de Portugal; frases curtas e concretas, com números; de zero a dez por extenso; nunca inventes — se não confirmaste uma curiosidade numa fonte, não a escrevas; prefere fontes como o zerozero, a Wikipédia, os sites dos clubes e das ligas.
Respondes APENAS com um objeto JSON: {"curiosidades": [{"texto": "…", "fonte": "https://…"}]} com cinco a oito curiosidades (ou menos, se não houver confirmadas).`;

const PRAZO_WEB = 24 * 3600e3;
const PRAZO_DADOS = 10 * 60e3;
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function lerCuriosidades(j) {
  return (Array.isArray(j?.curiosidades) ? j.curiosidades : [])
    .map((c) => (typeof c === "string" ? { texto: c } : c))
    .filter((c) => c && typeof c.texto === "string" && c.texto.trim().length > 10)
    .slice(0, 10)
    .map((c) => ({ texto: c.texto.trim().slice(0, 400), fonte: /^https?:\/\//.test(String(c.fonte || "")) ? String(c.fonte).slice(0, 400) : null }));
}

// o erro da IA em português, para quem usa o site (o técnico fica no registo do servidor)
export function mensagemIA(e) {
  const t = String(e?.message || "");
  if (e?.codigo === "quota" || /\b429\b|sem quota|rate limit/i.test(t)) return "A pesquisa na web chegou ao limite gratuito de hoje. As curiosidades acima vêm dos dados e continuam disponíveis; a pesquisa volta amanhã.";
  if (e?.codigo === "sem-chave" || /chave de IA/i.test(t)) return "A pesquisa na web não está configurada no servidor.";
  return "A pesquisa na web não respondeu agora. Tenta daqui a pouco.";
}

// «dadosDoJogo({ h, a, comp, mod })» devolve { espn: { slug, id } | null, pt: info | null } (vem do server/index.js)
export function createCuriosidades({ log = () => {}, dadosDoJogo = () => ({}), espn = resumoEspn } = {}) {
  const web = new Map(); // chave → { ts, dados } ou { promessa }
  const dados = new Map(); // chave → { ts, lista }

  async function curiosidadesDosDados(q, k) {
    const c = dados.get(k);
    if (c && Date.now() - c.ts < PRAZO_DADOS) return c.lista;
    const onde = dadosDoJogo(q) || {};
    let lista = [];
    if (onde.espn) {
      try { lista = curiosidadesEspn(await espn(onde.espn.slug, onde.espn.id), { casa: q.h, fora: q.a }); } catch (e) { log(`[Glossário] curiosidades ESPN ${q.h} x ${q.a}: ${e.message}`); }
    }
    if (!lista.length && onde.pt) lista = curiosidadesPt(onde.pt);
    dados.set(k, { ts: Date.now(), lista });
    if (dados.size > 300) dados.delete(dados.keys().next().value);
    return lista;
  }

  function curiosidadesDaWeb(q, k) {
    const c = web.get(k);
    if (c?.dados && Date.now() - c.ts < PRAZO_WEB) return Promise.resolve(c.dados);
    if (c?.promessa) return c.promessa;
    const pedido = `Jogo: ${q.h || "?"} x ${q.a || "?"}${q.comp ? `, ${q.comp}` : ""}${q.mod && q.mod !== "futebol" ? ` (${q.mod})` : ""}. Época atual: ${new Date().getFullYear()}.\nQue curiosidades verificadas há sobre este jogo?`;
    const promessa = pedirIA({ sistema: SISTEMA, pedido, pesquisa: true, temperatura: 0.3, uso: "curiosidades" })
      .then((r) => {
        const d = { curiosidades: lerCuriosidades(r.json), motor: r.motor, modelo: r.modelo };
        web.set(k, { ts: Date.now(), dados: d });
        if (web.size > 300) web.delete(web.keys().next().value);
        return d;
      })
      .catch((e) => { web.delete(k); log(`[Glossário] curiosidades na web ${q.h} x ${q.a}: ${e.detalhe || e.message}`); throw e; });
    web.set(k, { promessa });
    return promessa;
  }

  return async function curiosidades({ h = "", a = "", comp = "", mod = "", naWeb = false } = {}) {
    const q = { h: String(h).trim().slice(0, 80), a: String(a).trim().slice(0, 80), comp: String(comp).trim().slice(0, 100), mod: String(mod).trim().slice(0, 40) };
    if (!q.h && !q.a) throw Object.assign(new Error("falta o jogo"), { status: 400 });
    const k = [q.h, q.a, q.comp, q.mod].map(norm).join("|");
    const lista = await curiosidadesDosDados(q, k);
    const out = { dados: lista, web: null, webErro: null };
    if (naWeb) {
      try {
        const d = await curiosidadesDaWeb(q, k);
        Object.assign(out, { web: d.curiosidades, motor: d.motor, modelo: d.modelo });
      } catch (e) { out.webErro = mensagemIA(e); }
    }
    return out;
  };
}
