// Glossário › Preparar jogo: curiosidades do jogo escolhido (historial entre as equipas, recordes, jogadores que
// passaram pelos dois clubes…), pesquisadas na web por um modelo de linguagem (server/ia.js) e guardadas um dia, para
// o mesmo jogo não gastar a quota outra vez.
import { pedirIA } from "./ia.js";

const SISTEMA = `És jornalista de desporto do zerozero e preparas jogos: procuras curiosidades verificadas sobre um jogo, para usar na antevisão, no direto e na crónica.
Pesquisa na web antes de responder. Procura, por esta ordem de interesse:
- o historial entre as duas equipas (jogos, vitórias de cada uma, empates, o último resultado, a maior goleada);
- séries atuais (jogos sem perder, sem ganhar, sem sofrer golos) e a posição na tabela;
- jogadores ou treinadores que passaram pelos dois clubes, reencontros, estreias;
- recordes e marcos que podem acontecer neste jogo (centésimo jogo, golos de um marcador, etc.);
- o estádio, a história do encontro, dérbis e rivalidades.
Regras: português de Portugal; frases curtas e concretas, com números; de zero a dez por extenso; nunca inventes — se não confirmaste uma curiosidade numa fonte, não a escrevas; prefere fontes como o zerozero, a Wikipédia, os sites dos clubes e das ligas.
Respondes APENAS com um objeto JSON: {"curiosidades": [{"texto": "…", "fonte": "https://…"}]} com cinco a oito curiosidades (ou menos, se não houver confirmadas).`;

const PRAZO_CACHE = 24 * 3600e3;
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function lerCuriosidades(j) {
  return (Array.isArray(j?.curiosidades) ? j.curiosidades : [])
    .map((c) => (typeof c === "string" ? { texto: c } : c))
    .filter((c) => c && typeof c.texto === "string" && c.texto.trim().length > 10)
    .slice(0, 10)
    .map((c) => ({ texto: c.texto.trim().slice(0, 400), fonte: /^https?:\/\//.test(String(c.fonte || "")) ? String(c.fonte).slice(0, 400) : null }));
}

export function createCuriosidades({ log = () => {} } = {}) {
  const cache = new Map(); // chave → { ts, dados } ou { promessa }
  return async function curiosidades({ h = "", a = "", comp = "", mod = "" } = {}) {
    const casa = String(h).trim().slice(0, 80), fora = String(a).trim().slice(0, 80);
    if (!casa && !fora) throw Object.assign(new Error("falta o jogo"), { status: 400 });
    const k = [casa, fora, comp, mod].map(norm).join("|");
    const c = cache.get(k);
    if (c?.dados && Date.now() - c.ts < PRAZO_CACHE) return c.dados;
    if (c?.promessa) return c.promessa;
    const pedido = `Jogo: ${casa || "?"} x ${fora || "?"}${comp ? `, ${String(comp).slice(0, 100)}` : ""}${mod && mod !== "futebol" ? ` (${String(mod).slice(0, 40)})` : ""}. Época atual: ${new Date().getFullYear()}.\nQue curiosidades verificadas há sobre este jogo?`;
    const promessa = pedirIA({ sistema: SISTEMA, pedido, pesquisa: true, temperatura: 0.3, uso: "curiosidades" })
      .then((r) => {
        const dados = { curiosidades: lerCuriosidades(r.json), motor: r.motor, modelo: r.modelo, ts: Date.now() };
        cache.set(k, { ts: Date.now(), dados });
        if (cache.size > 300) cache.delete(cache.keys().next().value);
        return dados;
      })
      .catch((e) => { cache.delete(k); log(`[Glossário] curiosidades ${casa} x ${fora}: ${e.message}`); throw e; });
    cache.set(k, { promessa });
    return promessa;
  };
}
