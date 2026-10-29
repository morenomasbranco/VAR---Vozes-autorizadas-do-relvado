// Ferramentas › Sinónimos/Antónimos de frases. As palavras procuram-se no glossário e nos dicionários (server/glossario.js);
// as frases e expressões que o glossário não tem vão a um modelo de linguagem (server/ia.js), que dá outras formas de
// dizer o mesmo (sinónimos) ou de dizer o contrário (antónimos), em português de Portugal e com a linguagem da imprensa
// desportiva. Cada resposta fica guardada um dia, para a mesma frase não gastar a quota outra vez.
import { pedirIA } from "./ia.js";

const SISTEMA = `És revisor de textos de desporto do zerozero e ajudas os jornalistas a variar a forma de dizer as coisas, em português de Portugal (norma europeia, Acordo Ortográfico de 1990).
Recebes uma frase ou expressão e o que se procura:
- sinónimos: outras formas de dizer o mesmo, com o mesmo sentido e o mesmo registo (podes mudar a construção, nunca o significado);
- antónimos: formas de dizer o contrário, também como frases ou expressões completas.
Regras:
- Português de Portugal, nunca do Brasil (equipa, golo, guarda-redes, relvado, adeptos, treinador, plantel).
- Formulações naturais, como as da imprensa desportiva portuguesa; nada de traduções literais.
- Não acrescentas factos, nomes, números nem pormenores que a frase não tenha; os nomes e os números da frase mantêm-se.
Respondes APENAS com um objeto JSON: {"sentido": "o sentido da frase, em poucas palavras", "alternativas": [{"texto": "…", "nota": "o registo ou o uso, só se ajudar (ex.: mais informal; para títulos)"}]}, com seis a dez alternativas, das mais naturais para as menos.`;

export const fraseValida = (f) => { const t = String(f || "").trim(); return t.length >= 3 && t.length <= 160 && /\p{L}/u.test(t); };

// a resposta do modelo, com tolerância: sem repetidas, sem aspas à volta, no máximo doze
export function lerFrases(j) {
  const vistas = new Set();
  return {
    sentido: String(j?.sentido || "").trim().slice(0, 200),
    alternativas: (Array.isArray(j?.alternativas) ? j.alternativas : [])
      .map((a) => (typeof a === "string" ? { texto: a } : a))
      .filter((a) => a && typeof a.texto === "string" && a.texto.trim())
      .map((a) => ({ texto: a.texto.trim().replace(/^[«"“]+|[»"”]+$/g, "").trim().slice(0, 200), nota: String(a.nota || "").trim().slice(0, 120) || null }))
      .filter((a) => { const k = a.texto.toLowerCase(); if (!a.texto || vistas.has(k)) return false; vistas.add(k); return true; })
      .slice(0, 12),
  };
}

export function createFrases({ log = () => {} } = {}) {
  const guardadas = new Map(); // «tipo|frase» → { ts, dados }
  const aCaminho = new Map();
  const estado = { pedidos: 0, erros: 0, ultimoErro: null };

  function procurar(frase, tipo = "sinonimos") {
    const f = String(frase || "").replace(/\s+/g, " ").trim();
    if (!fraseValida(f)) return Promise.reject(Object.assign(new Error("escreve uma frase com 3 a 160 caracteres"), { status: 400 }));
    const t = tipo === "antonimos" ? "antonimos" : "sinonimos";
    const k = `${t}|${f.toLowerCase()}`;
    const g = guardadas.get(k);
    if (g && Date.now() - g.ts < 24 * 3600e3) return Promise.resolve(g.dados);
    if (aCaminho.has(k)) return aCaminho.get(k);
    const p = (async () => {
      estado.pedidos++;
      try {
        const pedido = `Frase: «${f}»\nProcuro: ${t === "sinonimos" ? "sinónimos (outras formas de dizer o mesmo)" : "antónimos (formas de dizer o contrário)"}.`;
        const r = await pedirIA({ sistema: SISTEMA, pedido, temperatura: 0.5, uso: "frases", esforco: "low" });
        const dados = { frase: f, tipo: t, ...lerFrases(r.json), motor: r.motor, modelo: r.modelo };
        guardadas.set(k, { ts: Date.now(), dados });
        if (guardadas.size > 500) guardadas.delete(guardadas.keys().next().value);
        return dados;
      } catch (e) {
        estado.erros++;
        estado.ultimoErro = { frase: f, erro: String(e.detalhe || e.message).slice(0, 200), ts: Date.now() };
        log(`[Frases] ${e.detalhe || e.message}`);
        throw e;
      }
    })().finally(() => aCaminho.delete(k));
    aCaminho.set(k, p);
    return p;
  }

  return { procurar, estado: () => ({ ...estado, guardadas: guardadas.size }) };
}
