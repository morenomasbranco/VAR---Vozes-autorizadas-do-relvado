// Glossário › Prosebot 2.0: a crónica de um jogo escrita a partir das notas de quem o viu, com as regras de escrita do
// zerozero. O site manda o jogo (equipas, resultado, competição, quando e onde), as notas (e os acontecimentos que o VAR
// registou, se a pessoa os juntou), a figura do jogo, o tamanho e o vocabulário do glossário para as duas equipas
// (alcunhas, estádio, cidade), e um modelo de linguagem (server/ia.js) escreve título, lead e corpo.
import { pedirIA } from "./ia.js";
import { lerPeca } from "./declaracoes.js";
import { REGRAS_TEXTO } from "../web/src/glossario/regras-zerozero.js";

const MAX_NOTAS = 15000;
export const TAMANHOS = {
  curta: "cerca de 250 palavras: lead e três ou quatro parágrafos",
  normal: "cerca de 450 palavras: lead e cinco a sete parágrafos",
  longa: "cerca de 700 palavras: lead e oito a dez parágrafos, com espaço para a análise",
};

const SISTEMA = `És jornalista do zerozero e escreves a crónica de um jogo a partir das notas de quem o viu, em português de Portugal (norma europeia, Acordo Ortográfico de 1990).

Como é uma boa crónica do zerozero:
- Não é um relato minuto a minuto. Escolhe o fio condutor (o momento que decidiu o jogo, a figura, a ideia tática, a reviravolta, o que estava em jogo) e conta o jogo à volta dele, com análise, interpretação e opinião — sempre apoiadas no que as notas dizem.
- O título diz o essencial com força (até 90 caracteres, sem ponto final); o lead acrescenta o resultado, quem ganhou, a competição e o que o resultado significa, sem repetir o título; o corpo é a versão completa do título.
- Presente narrativo, sempre com o mesmo tempo verbal (ex.: «O avançado isola-se após um erro tremendo da linha defensiva. Diogo Costa reduz o ângulo, espera até ao último segundo e faz uma mancha monumental.»).
- Criatividade com coerência: imagens fortes, ritmo, frases curtas nos momentos decisivos; nada de banalidades nem de lugares-comuns («um jogo de duas partes distintas», «o futebol é isto»).
- Varia os nomes das equipas com as alcunhas e o vocabulário que te forem dados, sem exagerar.
- Os minutos escrevem-se «aos 23 minutos» ou «(23')»; de zero a dez por extenso («aos nove minutos»).
- Os rescaldos falam do jogo, nunca de um jogador (só grandes golos ou hat-tricks merecem destaque próprio).
- Declarações que venham nas notas entram em discurso direto, com «» e o verbo declarativo depois («…», atirou o treinador.).

Segues também todas as regras de escrita do zerozero:
${REGRAS_TEXTO}

Regras que nunca quebras:
- Nunca inventas lances, minutos, marcadores, assistências, substituições, cartões, números, declarações, a classificação nem o contexto que não estejam nas notas ou no pedido. Se faltar algo importante (o marcador de um golo, o dia, o estádio), escreves sem isso e dizes o que falta em «notas».
- O resultado final é o que vem no pedido; se as notas o contradisserem, segue o pedido e assinala a diferença em «notas».
- Itálico com <i></i> e negrito com <b></b> (sem markdown). Escreves na terceira pessoa.

Respondes APENAS com um objeto JSON, sem mais texto:
{"titulo_site": "…", "titulo_liveticker": "…", "microtitulo": "…", "lead": "…", "corpo": ["parágrafo", "…"], "figura": {"nome": "…", "texto": "uma ou duas frases a justificar"}, "notas": ["o que falta confirmar ou pode melhorar", "…"]}`;

const limpa = (x, max) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const golos = (x) => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Math.max(0, Math.min(99, Math.round(Number(x)))));

// o pedido ao modelo, a partir do que o site mandou (validado aqui: o site é público)
export function pedidoDaCronica({ jogo = {}, notas = "", figura = "", contexto = "", tamanho = "normal", vocabulario = "" } = {}) {
  const casa = limpa(jogo.casa, 80), fora = limpa(jogo.fora, 80);
  const n = String(notas || "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_NOTAS);
  if (!casa || !fora) throw Object.assign(new Error("faltam as equipas do jogo"), { status: 400 });
  if (n.length < 20) throw Object.assign(new Error("escreve primeiro as notas do jogo"), { status: 400 });
  const hs = golos(jogo.hs), as = golos(jogo.as);
  const resultado = hs != null && as != null ? `${casa} ${hs}–${as} ${fora}` : `${casa} – ${fora} (resultado não indicado: segue as notas)`;
  return [
    `Jogo: ${resultado}${jogo.comp ? ` · ${limpa(jogo.comp, 120)}` : ""}.`,
    jogo.quando && `Quando e onde: ${limpa(jogo.quando, 200)}.`,
    contexto && `Contexto: ${limpa(contexto, 1500)}.`,
    figura && `Figura do jogo, para quem escreveu as notas: ${limpa(figura, 120)}.`,
    `Tamanho: ${TAMANHOS[tamanho] || TAMANHOS.normal}.`,
    vocabulario && `Vocabulário do glossário que podes usar para variar: ${limpa(vocabulario, 1500)}.`,
    `Notas de quem viu o jogo:\n"""\n${n}\n"""`,
  ].filter(Boolean).join("\n\n");
}

export function lerCronica(j) {
  const p = lerPeca(j || {});
  const f = j?.figura;
  const figura = f && typeof f === "object" && String(f.nome || "").trim()
    ? { nome: limpa(f.nome, 120), texto: limpa(f.texto, 600) }
    : typeof f === "string" && f.trim() ? { nome: limpa(f, 120), texto: "" } : null;
  return { tituloSite: p.tituloSite, tituloLiveticker: p.tituloLiveticker, microtitulo: p.microtitulo, lead: p.lead, corpo: p.corpo, citacoes: [], notas: p.notas, figura };
}

export function createProsebot({ log = () => {} } = {}) {
  const estado = { cronicas: 0, erros: 0, ultimoErro: null };
  async function cronica(pedidoSite = {}) {
    const pedido = pedidoDaCronica(pedidoSite);
    try {
      const r = await pedirIA({ sistema: SISTEMA, pedido, temperatura: 0.6, uso: "prosebot" });
      const c = lerCronica(r.json);
      if (!c.corpo.length && !c.lead) throw Object.assign(new Error("o modelo não devolveu a crónica; tenta outra vez"), { status: 502 });
      estado.cronicas++;
      return { ...c, motor: r.motor, modelo: r.modelo };
    } catch (e) {
      estado.erros++;
      estado.ultimoErro = { msg: String(e.message).slice(0, 300), ts: Date.now() };
      log(`[Prosebot] ${e.message}`);
      throw e;
    }
  }
  return { cronica, estado: () => estado };
}
