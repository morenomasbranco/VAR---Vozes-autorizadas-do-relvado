// Glossário › Prosebot 2.0: a crónica de um jogo escrita a partir das notas de quem o viu, com as regras de escrita do
// zerozero. O site manda o jogo (equipas, resultado, competição, quando e onde), as notas (e os acontecimentos que o VAR
// registou, se a pessoa os juntou), a figura do jogo, o tamanho e o vocabulário do glossário para as duas equipas
// (alcunhas, estádio, cidade), e um modelo de linguagem (server/ia.js) escreve título, lead e corpo.
import { pedirIA } from "./ia.js";
import { lerPeca } from "./declaracoes.js";
import { REGRAS_TEXTO } from "../web/src/glossario/regras-zerozero.js";

const MAX_NOTAS = 15000;
// como se conta um jogo de cada modalidade: o tempo, o resultado e o vocabulário próprios (vai no pedido ao modelo,
// com as expressões do glossário dessa modalidade)
export const MODALIDADES_CRONICA = {
  futebol: { nome: "futebol", guia: "duas partes de 45 minutos, com descontos (e, nas eliminatórias, prolongamento e grandes penalidades); os golos contam-se com o minuto («aos 23 minutos», «(23')»); joga-se num relvado, num estádio." },
  futsal: { nome: "futsal", guia: "duas partes de 20 minutos de tempo útil, num pavilhão; cinco contra cinco, com substituições volantes; o minuto do golo é o do cronómetro do jogo («aos 12 minutos»); a partir da sexta falta acumulada em cada parte há livre dos dez metros, sem barreira; nos minutos finais é comum o guarda-redes avançado (5x4); posições: guarda-redes, fixo, alas e pivô. Nunca «relvado» nem «estádio»." },
  andebol: { nome: "andebol", guia: "duas partes de 30 minutos, num pavilhão; marcam-se muitos golos (resultados como 31-27) e conta o resultado ao intervalo («15-13 ao intervalo»); os parciais (um parcial de 5-0) e os momentos em superioridade ou inferioridade numérica decidem jogos; castigos: exclusão de dois minutos e desqualificação (cartão vermelho); livres de sete metros; posições: guarda-redes, central, laterais, pontas e pivô; defesas 6:0, 5:1 ou 3:2:1; as defesas do guarda-redes contam muito. Nunca «relvado» nem «estádio»." },
  basquetebol: { nome: "basquetebol", guia: "quatro períodos de 10 minutos (12 na NBA), com prolongamentos de 5 minutos; contam-se pontos, não golos (89-76), com o parcial de cada período («23-18 no primeiro período») e as corridas de pontos (um parcial de 10-0); triplos, lançamentos livres, ressaltos, assistências, roubos de bola, desarmes de lançamento e afundanços; destacam-se os pontos de cada jogador e os duplos-duplos; o tempo diz-se «a dois minutos do fim» ou «no terceiro período». Nunca «golo»." },
  hoquei_patins: { nome: "hóquei em patins", guia: "duas partes de 25 minutos de tempo útil, num rinque com tabela; golos com o minuto; cartão azul (dois minutos de exclusão, com livre direto para o adversário) e vermelho; livres diretos (também por acumulação de faltas de equipa) e penáltis decidem muitos jogos; power play (superioridade numérica); os guarda-redes defendem com as caneleiras; o taco é o stick." },
  voleibol: { nome: "voleibol", guia: "não há relógio: joga-se à melhor de cinco sets (25 pontos, com dois de vantagem; o quinto, o tie-break, até aos 15); o resultado é em sets (3-1) e dá-se o parcial de cada set (25-21, 23-25, 25-19, 25-22); ponto de set e ponto de jogo; serviço (e ás, o ponto direto de serviço), receção, distribuição, ataque, bloco e defesa; posições: distribuidor, oposto, centrais, recetores-atacantes e líbero. Nunca «golo» nem minutos." },
  praia: { nome: "futebol de praia", guia: "três períodos de 12 minutos, na areia; marcam-se muitos golos, muitos de pontapé de bicicleta ou de remate de primeira; os livres batem-se sem barreira; o guarda-redes repõe a bola com a mão e entra no ataque." },
};
// as modalidades como vêm do glossário (basquete, hoquei) e dos resultados (basquetebol, hoquei_patins)
export const modDaCronica = (m) => ({ basquete: "basquetebol", hoquei: "hoquei_patins" }[m] || (MODALIDADES_CRONICA[m] ? m : "futebol"));
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
- Contas o jogo com o tempo, o resultado e o vocabulário da modalidade indicada no pedido: cada modalidade tem as suas expressões (no andebol há sete metros e exclusões, no voleibol há sets e parciais, no basquetebol há períodos, pontos e triplos), e nunca usas as de outra (no futsal não há «relvado», no basquetebol não há «golos»).
- Nas modalidades com relógio, os minutos escrevem-se «aos 23 minutos» ou «(23')»; de zero a dez por extenso («aos nove minutos»).
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
const golos = (x) => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Math.max(0, Math.min(999, Math.round(Number(x)))));

// o pedido ao modelo, a partir do que o site mandou (validado aqui: o site é público)
export function pedidoDaCronica({ jogo = {}, notas = "", figura = "", contexto = "", tamanho = "normal", vocabulario = "", mod = "futebol", expressoes = "" } = {}) {
  const casa = limpa(jogo.casa, 80), fora = limpa(jogo.fora, 80);
  const n = String(notas || "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_NOTAS);
  if (!casa || !fora) throw Object.assign(new Error("faltam as equipas do jogo"), { status: 400 });
  if (n.length < 20) throw Object.assign(new Error("escreve primeiro as notas do jogo"), { status: 400 });
  const hs = golos(jogo.hs), as = golos(jogo.as);
  const resultado = hs != null && as != null ? `${casa} ${hs}–${as} ${fora}` : `${casa} – ${fora} (resultado não indicado: segue as notas)`;
  const m = MODALIDADES_CRONICA[modDaCronica(mod)];
  return [
    `Modalidade: ${m.nome}. Como se conta um jogo de ${m.nome}: ${m.guia}`,
    `Jogo: ${resultado}${m.nome === "voleibol" && hs != null ? " (em sets)" : ""}${jogo.comp ? ` · ${limpa(jogo.comp, 120)}` : ""}.`,
    jogo.quando && `Quando e onde: ${limpa(jogo.quando, 200)}.`,
    contexto && `Contexto: ${limpa(contexto, 1500)}.`,
    figura && `Figura do jogo, para quem escreveu as notas: ${limpa(figura, 120)}.`,
    `Tamanho: ${TAMANHOS[tamanho] || TAMANHOS.normal}.`,
    vocabulario && `Vocabulário do glossário que podes usar para variar: ${limpa(vocabulario, 1500)}.`,
    expressoes && `Expressões próprias do ${m.nome}, do glossário (usa as que se aplicarem ao que as notas contam): ${limpa(expressoes, 3000)}.`,
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
      estado.ultimoErro = { msg: String(e.detalhe || e.message).slice(0, 300), ts: Date.now() };
      log(`[Prosebot] ${e.detalhe || e.message}`);
      throw e;
    }
  }
  return { cronica, estado: () => estado };
}
