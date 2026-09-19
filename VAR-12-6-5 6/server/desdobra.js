// Desdobramento de uma notícia em pista de trabalho: o fio da história, o que pode acontecer a
// seguir e as consequências. Tudo tem de sair do material que o site já tem — a notícia, as
// fontes que a confirmaram e as notícias relacionadas que já passaram pelo feed. O modelo não
// pode acrescentar factos; as possibilidades são escritas como hipóteses e dizem de que dependem.
import { sleep } from "./util.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_HISTORIAS_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MIN_GAP = Number(process.env.HISTORIAS_GEMINI_INTERVALO_MS) || 30000; // um pedido de cada vez, bem espaçado
const POR_HORA = Number(process.env.HISTORIAS_POR_HORA) || 40; // travão para não esgotar o plano gratuito
const FILA_MAX = 40;

export const ativo = !!KEY;

const CRITERIOS = ["notoriedade", "proximidade", "surpresa", "impacto", "raridade", "emocao", "continuidade", "magnitude"];
const TIPOS = ["desportiva", "contratual", "financeira", "competitiva", "institucional", "disciplinar"];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    vale: { type: "BOOLEAN" },
    narrativa_pt: { type: "STRING" },
    narrativa_en: { type: "STRING" },
    angulo_pt: { type: "STRING" },
    angulo_en: { type: "STRING" },
    possibilidades: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { pt: { type: "STRING" }, en: { type: "STRING" }, se_pt: { type: "STRING" }, se_en: { type: "STRING" } },
        required: ["pt", "en", "se_pt", "se_en"],
      },
    },
    consequencias: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { pt: { type: "STRING" }, en: { type: "STRING" }, tipo: { type: "STRING", enum: TIPOS } },
        required: ["pt", "en", "tipo"],
      },
    },
    verificar_pt: { type: "ARRAY", items: { type: "STRING" } },
    verificar_en: { type: "ARRAY", items: { type: "STRING" } },
    criterios: { type: "ARRAY", items: { type: "STRING", enum: CRITERIOS } },
    tom: { type: "STRING", enum: ["positiva", "negativa", "neutra"] },
  },
  required: ["vale"],
};

const SYSTEM = `És editor de desporto do VAR e preparas o trabalho que vem depois da notícia. Recebes uma notícia já publicada, as fontes que a deram e as notícias relacionadas que já passaram pelo feed. Devolves uma pista de trabalho: o fio da história, o que pode acontecer a seguir e as consequências.

Rigor — isto é o mais importante
- Só podes usar factos que estejam no material que recebes. Não acrescentas números, nomes, datas, valores, cláusulas, declarações nem histórico que lá não estejam.
- Não usas conhecimento teu sobre o clube, o jogador ou a competição para afirmar factos. Se precisares de um facto que não tens, transforma-o numa linha de «a verificar», não o afirmes.
- Cada possibilidade é uma hipótese e tem de dizer de que depende (campo se_pt/se_en). Nunca escrevas uma hipótese como se fosse decidida.
- As consequências têm de decorrer do facto que a notícia dá, sem factos novos. Uma consequência que precise de um dado que não tens é «a verificar».
- Se a notícia for vaga (rumor sem nada de concreto, nota de duas linhas, antevisão de rotina, resultado sem contexto), devolves vale=false e mais nada. Vale mais não dar pista do que dar uma pista inventada.
- Português de Portugal (golo, equipa, guarda-redes, treinador, plantel, contratação). Inglês britânico.

Fio da história (narrativa_pt/en)
- Duas a quatro frases que ligam esta notícia ao que já se sabe pelas notícias relacionadas: o que vinha antes, o que mudou agora, em que ponto está o caso.
- Se não houver notícias relacionadas, situa apenas o que esta notícia estabelece, sem inventar antecedentes.

Ângulo (angulo_pt/en)
- Uma frase com o trabalho jornalístico que falta fazer: a pergunta que ainda não tem resposta.

Possibilidades (possibilidades)
- Uma a quatro. Cenários concretos do que pode seguir-se, cada um com a condição de que depende.
- A condição escreve-se sem o «se» à cabeça, porque o site já o acrescenta. Exemplo da forma certa: pt «O clube pode ter de recorrer ao mercado de empréstimos», se_pt «a lesão confirmar a ausência até janeiro».
- Não repitas a mesma ideia com outras palavras. Não previsões de resultados desportivos.

Consequências (consequencias)
- Uma a quatro, cada uma com o tipo: desportiva, contratual, financeira, competitiva, institucional ou disciplinar.
- Efeitos que decorrem do facto já dado, não do que pode vir a acontecer.

A verificar (verificar_pt/en)
- Duas a cinco linhas: o que confirmar, com quem, e que documento ou dado procurar. É aqui que entra tudo o que não tens.

Critérios de noticiabilidade (criterios)
- Os que esta pista cumpre, entre: notoriedade, proximidade, surpresa, impacto, raridade, emocao, continuidade, magnitude. Proximidade só quando toca Portugal ou portugueses.

Tom (tom)
- positiva, negativa ou neutra, do ponto de vista do protagonista da notícia.`;

async function chamar(payload) {
  const res = await fetch(`${API}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: payload }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}");
}

// material que vai para o modelo: só o que o site tem mesmo
function material(item, relacionadas) {
  const quando = (ts) => new Date(ts).toISOString().slice(0, 16).replace("T", " ");
  const fontes = [item.name || item.src, ...(item.also || []).map((a) => a.name || a.src)];
  const pontos = (item.b?.pt || []).map((b) => `- ${b.replace(/==/g, "")}`).join("\n");
  const rel = relacionadas.length
    ? relacionadas.map((r) => `- ${quando(r.ts)} (${r.name || r.src}): ${(r.t?.pt || "").replace(/==/g, "")}`).join("\n")
    : "(nenhuma)";
  return `NOTÍCIA
Título: ${(item.t?.pt || "").replace(/==/g, "")}
${pontos ? `Pontos:\n${pontos}\n` : ""}Texto original da fonte:
"""
${(item.text || "").slice(0, 1200)}
"""
Hora: ${quando(item.ts)}
Fontes que a deram (${fontes.length}): ${fontes.join(", ")}
Importância atribuída: ${item.imp || "?"}/5
${item.paisTema ? `País do tema: ${item.paisTema}` : ""}
${item.equipas?.length ? `Clubes ou seleções: ${item.equipas.map((e) => `${e.nome}${e.papel && e.papel !== "envolvido" ? ` (${e.papel})` : ""}`).join(", ")}` : ""}

NOTÍCIAS RELACIONADAS JÁ PUBLICADAS NO SITE
${rel}`;
}

export function createDesdobrar({ log = () => {} } = {}) {
  const fila = [];
  let aCorrer = false;
  let ultima = 0;
  let pausaAte = 0;
  let janela = []; // horas dos últimos pedidos, para o travão por hora

  async function bombear() {
    if (aCorrer) return;
    aCorrer = true;
    try {
      while (fila.length) {
        const { item, relacionadas, resolve } = fila.shift();
        janela = janela.filter((t) => Date.now() - t < 3600e3);
        if (Date.now() < pausaAte || janela.length >= POR_HORA) { resolve(null); continue; }
        const espera = ultima + MIN_GAP - Date.now();
        if (espera > 0) await sleep(espera);
        ultima = Date.now();
        janela.push(ultima);
        try {
          const out = await chamar(material(item, relacionadas));
          resolve(out?.vale ? out : null);
        } catch (e) {
          if (e.status === 429) {
            pausaAte = Date.now() + 15 * 60000;
            log("[Histórias] limite do Gemini atingido; volto a desdobrar notícias dentro de 15 min");
          } else log(`[Histórias] ${e.message}`);
          resolve(null);
        }
      }
    } finally {
      aCorrer = false;
    }
  }

  // devolve a pista, ou null quando não há matéria, não há chave ou o travão está acionado
  return (item, relacionadas = []) => new Promise((resolve) => {
    if (!KEY || fila.length >= FILA_MAX) return resolve(null);
    fila.push({ item, relacionadas, resolve });
    bombear();
  });
}
