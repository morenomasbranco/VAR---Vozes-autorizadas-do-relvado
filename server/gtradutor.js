// Tradução gratuita e sem chave, pelo serviço público do Google Tradutor (o mesmo que o browser usa).
// Serve de base à tradução do site: não gasta a quota do Gemini, responde em menos de um segundo e
// traduz várias frases num só pedido (uma por linha). Se o Google recusar (429), abranda e experimenta
// o segundo endereço; se ambos falharem, devolve null e quem chamou decide (o Gemini ou o texto original).
import { sleep } from "./util.js";

const ENDERECOS = [
  (tl) => `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t`,
  (tl) => `https://clients5.google.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${tl}&dt=t`,
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const INTERVALO = Number(process.env.GTRADUTOR_INTERVALO_MS) || 700; // espaço entre pedidos
const MAX_CHARS = 3500; // caracteres por pedido

let ultimo = 0;
let pausaAte = 0;
const estado = { pedidos: 0, falhas: 0, ultimoErro: null, pausadoAte: null };
export const estadoGoogle = () => ({ ...estado, pausadoAte: pausaAte > Date.now() ? pausaAte : null });

// um pedido com várias linhas; devolve { linhas, origem } ou null
async function pedido(texto, tl) {
  if (Date.now() < pausaAte) return null;
  for (const url of ENDERECOS) {
    const espera = ultimo + INTERVALO - Date.now();
    if (espera > 0) await sleep(espera);
    ultimo = Date.now();
    estado.pedidos++;
    try {
      const r = await fetch(url(tl), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": UA },
        body: `q=${encodeURIComponent(texto)}`,
        signal: AbortSignal.timeout(12000),
      });
      if (r.status === 429) { estado.ultimoErro = "Google 429"; continue; }
      if (!r.ok) { estado.ultimoErro = `Google ${r.status}`; continue; }
      const d = await r.json();
      const out = (d?.[0] || []).map((s) => s?.[0] || "").join("");
      if (!out) continue;
      return { linhas: out.split("\n"), origem: d?.[2] || null };
    } catch (e) { estado.ultimoErro = e.message; }
  }
  estado.falhas++;
  pausaAte = Date.now() + 60000; // os dois endereços falharam: um minuto de descanso
  return null;
}

// os nomes entre ==…== não passam pelo tradutor: saem os sinais e voltam depois à volta do mesmo nome
const tirarMarcas = (t) => {
  const nomes = [...String(t).matchAll(/==(.+?)==/g)].map((m) => m[1]);
  return { limpo: String(t).replace(/==(.+?)==/g, "$1"), nomes };
};
const porMarcas = (t, nomes) => nomes.reduce((acc, n) => (acc.includes(`==${n}==`) || !acc.includes(n) ? acc : acc.replace(n, `==${n}==`)), t);

// Traduz uma lista de textos (uma linha cada) para tl. Devolve { textos, origem } com a mesma ordem
// e tamanho, ou null se não conseguir. «origem» é a língua que o Google detetou no conjunto.
export async function traduzirGoogle(textos, tl) {
  const prep = textos.map((t) => tirarMarcas(String(t || "").replace(/\s*\n+\s*/g, " ").trim()));
  const out = new Array(textos.length).fill(null);
  let origem = null;
  // junta em pedidos até MAX_CHARS
  let i = 0;
  while (i < prep.length) {
    const grupo = [];
    let tam = 0;
    while (i < prep.length && (grupo.length === 0 || tam + prep[i].limpo.length + 1 < MAX_CHARS)) {
      grupo.push(i); tam += prep[i].limpo.length + 1; i++;
    }
    const r = await pedido(grupo.map((k) => prep[k].limpo || "-").join("\n"), tl);
    if (!r) return null;
    origem = origem || r.origem;
    if (r.linhas.length === grupo.length) {
      grupo.forEach((k, j) => { out[k] = prep[k].limpo ? porMarcas(r.linhas[j].trim(), prep[k].nomes) : ""; });
    } else {
      // o Google juntou ou partiu linhas: traduz uma a uma
      for (const k of grupo) {
        if (!prep[k].limpo) { out[k] = ""; continue; }
        const s = await pedido(prep[k].limpo, tl);
        if (!s) return null;
        out[k] = porMarcas(s.linhas.join(" ").trim(), prep[k].nomes);
      }
    }
  }
  return { textos: out, origem };
}
