// Glossário › preparar um jogo: sugestões de títulos para o jogo escolhido. Partem do resultado (ou da antevisão, se o
// jogo ainda não começou, ou do resultado do momento, se está a decorrer), das alcunhas das equipas, da cidade e do
// estádio do visitado e da competição; a margem que conta como goleada ou como vitória à justa depende da modalidade.
// Primeiro vêm os títulos com mais rasgo (expressões da imprensa desportiva, jogos com as alcunhas, o estádio, a
// cidade), escolhidos à vez de um conjunto maior («outras ideias» traz outros); no fim, dois ou três clássicos.
import { norm } from "./pesquisa.js";

// por modalidade (as do glossário): a partir de quantos golos/pontos é goleada, até quantos é à justa, e a unidade
const MODOS = {
  futebol: { gole: 3, justa: 1, un: "golos" },
  futsal: { gole: 4, justa: 1, un: "golos" },
  hoquei: { gole: 4, justa: 1, un: "golos" },
  hoquei_gelo: { gole: 3, justa: 1, un: "golos" },
  basquete: { gole: 15, justa: 3, un: "pontos" },
  futebol_americano: { gole: 17, justa: 3, un: "pontos" },
};
// modalidades em que se fala de «golos» e de «nulo» (e em que um empate é normal)
const DE_GOLOS = new Set(["futebol", "futsal", "hoquei", "hoquei_gelo"]);

// cidades que pedem «no»/«na» («no Porto», «na Amadora»); as outras levam «em»
const CIDADE_NO = new Set(["porto", "rio de janeiro", "cairo", "pireu", "funchal", "recife", "seixal", "barreiro", "montijo", "entroncamento", "estoril", "cartaxo", "fundao", "monaco", "dubai"]);
const CIDADE_NA = new Set(["amadora", "maia", "trofa", "guarda", "covilha", "figueira da foz", "povoa de varzim", "corunha", "haia", "reboleira"]);
const tirar = (t) => String(t || "").replace(/\s*\([^)]*\)/g, "").trim();
const emCidade = (cidade) => {
  const c = tirar(cidade);
  if (!c || c === "—") return "";
  const n = norm(c);
  return CIDADE_NO.has(n) ? `no ${c}` : CIDADE_NA.has(n) ? `na ${c}` : `em ${c}`;
};
// ir para a cidade («ao Porto», «à Amadora», «a Barcelos») e sair dela («do Porto», «da Amadora», «de Barcelos»)
const aCidade = (onde) => onde.replace(/^no /, "ao ").replace(/^na /, "à ").replace(/^em /, "a ");
const deCidade = (onde) => onde.replace(/^no /, "do ").replace(/^na /, "da ").replace(/^em /, "de ");
// o estádio com o artigo certo: «no Estádio da Luz», «na Arena Petrol», «em Anfield» (e «do»/«o» e «da»/«a»)
function oEstadio(nome) {
  const e = tirar(nome);
  if (!e || e === "—") return null;
  const n = norm(e);
  const g = /\barena\b|^(cidade|catedral|bombonera)\b/.test(n) ? "a"
    : /^(estadio|campo|parque|pavilhao|complexo|recinto|velodromo)\b|\b(stadium|stadion|stadio|stade|park|bernabeu|camp nou|metropolitano|maracana|monumental|olimpico|dragao|alvalade|bessa|jamor)\b/.test(n) ? "o" : "";
  return { t: e, no: g === "o" ? `no ${e}` : g === "a" ? `na ${e}` : `em ${e}`, o: g ? `${g} ${e}` : e, do: g === "o" ? `do ${e}` : g === "a" ? `da ${e}` : `de ${e}` };
}
const EXTENSO = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
// baralhar sempre da mesma maneira para o mesmo jogo (e de outra maneira a cada «outras ideias»)
function baralhar(lista, chave) {
  let h = 2166136261;
  for (const ch of chave) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...lista];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// uma alcunha no plural pede o verbo no plural («Dragões vencem»); o nome de um clube fica no singular
// («Rangers vence»), menos nas ligas norte-americanas, em que se diz «os Lakers»
const SINGULARES = new Set(["thrylos", "dikefalos", "fradi", "klubi", "trifylli", "atleti", "bayern", "leverkusen", "bremen", "pauli", "napoli"]);
export function plural(alcunha) {
  const ps = norm(alcunha).split(/\s+/);
  if (/^(os|as|los|las|les|die)$/.test(ps[0])) return true;
  if (/^(o|a|el|la|le|the|il|lo)$/.test(ps[0])) return false;
  const p = ps[0].replace(/[^a-z0-9]/g, "");
  if (SINGULARES.has(p)) return false;
  return p.length > 3 && /(s|i|en)$/.test(p);
}

// a equipa como sujeito do título: o nome (como o glossário o escreve), as alcunhas que servem num título, a cidade e o estádio
const sigla = (t) => /^[A-Z0-9.&'’-]{2,6}$/.test(t);
function equipa(l) {
  if (!l) return null;
  const c = l.clube, s = l.selecao;
  const ligaNA = !!c?.mod;
  const nome = c ? (ligaNA ? l.nome : c.nome) : s ? s.n : l.nome;
  const brutas = c ? c.alcunhas : s ? String(s.s || "").split(/\s*·\s*/).filter((x) => x && x !== "—") : [];
  const vistas = new Set([norm(nome), norm(c?.nome || ""), norm(l.nome)]);
  const alcunhas = [];
  for (const a of brutas) {
    if (/\(/.test(a) || sigla(a)) continue; // as que precisam de explicação e as siglas não dão um bom título
    const k = norm(a);
    if (vistas.has(k)) continue;
    vistas.add(k);
    alcunhas.push({ t: a, pl: plural(a) });
  }
  return { nome: { t: nome, pl: ligaNA }, alcunhas, cidade: c?.cidade || null, estadio: oEstadio(c?.estadio) };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const v = (suj, sg, pl) => `${suj.t} ${suj.pl ? pl : sg}`;
const limpo = (t) => cap(t.replace(/\s+/g, " ").replace(/\s+([,:?!])/g, "$1").trim());

// todas as sugestões para o jogo, separadas em criativas e clássicas (sem baralhar)
export function todosOsTitulos(ficha, jogo = {}) {
  if (!ficha?.casa || !ficha?.fora) return { criativos: [], classicos: [] };
  const H = equipa(ficha.casa), A = equipa(ficha.fora);
  const modo = MODOS[ficha.mod] || MODOS.futebol;
  const golos = DE_GOLOS.has(ficha.mod) || !MODOS[ficha.mod];
  const futebol = !ficha.mod || ficha.mod === "futebol";
  const comp = tirar(jogo.comp || ficha.prova?.nome || "").replace(/^sele[cç][aã]o:\s*/i, "");
  const cidade = tirar(H.cidade) === "—" ? "" : tirar(H.cidade);
  const ondeCasa = emCidade(H.cidade);
  const est = H.estadio;
  const derbi = ["dérbi", "clássico"].find((t) => ficha.termos?.[0] === t) || null;
  // as duas equipas da mesma cidade: o visitante não «chega a Lisboa» nem «sai de Lisboa»
  const fora = ondeCasa && norm(tirar(H.cidade)) !== norm(tirar(A.cidade)) ? ondeCasa : "";
  const Ha = H.alcunhas[0] || null, Aa = A.alcunhas[0] || null;
  const Ha2 = H.alcunhas[1] || Ha, Aa2 = A.alcunhas[1] || Aa;
  const hs = jogo.hs == null || jogo.hs === "" ? null : Number(jogo.hs);
  const as = jogo.as == null || jogo.as === "" ? null : Number(jogo.as);
  const placar = `${jogo.hs}–${jogo.as}`;
  const linha = `${H.nome.t} ${placar} ${A.nome.t}`;
  const criativos = [], classicos = [];
  const cri = (...ts) => { for (const t of ts) if (t) criativos.push(limpo(t)); };
  const cla = (...ts) => { for (const t of ts) if (t) classicos.push(limpo(t)); };
  const fim = () => ({ criativos: [...new Set(criativos)], classicos: [...new Set(classicos)].filter((t) => !criativos.includes(t)) });

  // ainda não começou: antevisão
  if (hs == null || as == null || Number.isNaN(hs) || Number.isNaN(as)) {
    cri(
      Ha && Aa && `${Ha.t} contra ${Aa.t}: quem pisca primeiro?`,
      Ha && Aa && `${Ha2.t} e ${Aa2.t} em rota de colisão`,
      derbi && `Cheira a ${derbi}: ${H.nome.t} e ${A.nome.t} com contas para acertar`,
      derbi && ondeCasa && `É dia de ${derbi} ${ondeCasa}: a cidade para`,
      est && `${v(H.nome, "quer", "querem")} fazer ${est.do} uma fortaleza`,
      est && `${cap(est.no)}, ${v(H.nome, "joga", "jogam")} com o 12.º jogador`,
      `${v(A.nome, "entra", "entram")} em terreno hostil${est ? ` ${est.no}` : fora ? ` ${fora}` : ""}`,
      Aa && fora && `${v(Aa, "chega", "chegam")} ${aCidade(fora)} de faca nos dentes`,
      ondeCasa && `Noite grande ${ondeCasa}: ${H.nome.t} e ${A.nome.t} sem margem para errar`,
      futebol && `Noventa minutos para decidir: ${H.nome.t} ou ${A.nome.t}?`,
      comp && `${comp}: ${H.nome.t} e ${A.nome.t} com tudo em jogo`,
      `Tudo a postos para ${H.nome.t}–${A.nome.t}`,
      Ha && `${v(Ha, "afia", "afiam")} as garras para receber ${A.nome.t}`,
    );
    cla(
      comp && `${comp}: ${v(H.nome, "recebe", "recebem")} ${A.nome.t}`,
      `${H.nome.t} e ${A.nome.t} medem forças${ondeCasa ? ` ${ondeCasa}` : ""}`,
      `Antevisão: ${H.nome.t} – ${A.nome.t}`,
    );
    return fim();
  }

  const vence = hs === as ? null : hs > as ? "casa" : "fora";
  const W = vence === "casa" ? H : A, L = vence === "casa" ? A : H;
  const Wa = W.alcunhas[0] || null, La = L.alcunhas[0] || null;
  const dif = Math.abs(hs - as), maior = Math.max(hs, as), menor = Math.min(hs, as);
  const pW = `${maior}–${menor}`;
  const adj = (suj, sg, pl) => (suj.pl ? pl : sg);

  // a decorrer
  if (jogo.vivo) {
    if (!vence) {
      cri(
        `Braço de ferro ${ondeCasa || "em campo"}: ${linha}`,
        golos && hs === 0 && `Cadeado fechado: ${H.nome.t} e ${A.nome.t} ainda a zeros`,
        Ha && Aa && hs === 0 && `Xadrez entre ${Ha.t} e ${Aa.t}`,
        hs >= 1 && `Parada e resposta: ${linha}`,
        hs >= 2 && `Loucura ${ondeCasa || "em campo"}: ${linha} e ainda há jogo`,
        derbi && `${cap(derbi)} ao rubro: ${linha}`,
      );
      cla(`Em direto: ${linha}`, `Tudo empatado entre ${H.nome.t} e ${A.nome.t} (${placar})`);
    } else {
      cri(
        Wa && golos && maior === 1 && menor === 0 && `${v(Wa, "morde", "mordem")} primeiro`,
        dif >= 2 && `${v(W.nome, "põe", "põem")} a mão na vitória (${pW})`,
        dif >= 2 && `${v(L.nome, "está", "estão")} ${adj(L.nome, "encostado", "encostados")} às cordas`,
        dif >= modo.gole && Wa && `${v(Wa, "está", "estão")} ${adj(Wa, "imparável", "imparáveis")}`,
        dif >= modo.gole && golos && `Festival ${ondeCasa || "em campo"}: ${linha}`,
        dif <= modo.justa && `Tudo por decidir: ${linha}`,
        dif <= modo.justa && La && `${v(La, "carrega", "carregam")} em busca do empate`,
        vence === "fora" && est && `Silêncio ${est.no}: ${linha}`,
        vence === "casa" && est && `${cap(est.o)} em festa: ${linha}`,
      );
      cla(`Em direto: ${linha}`, `${v(W.nome, "está", "estão")} a vencer ${L.nome.t} (${pW})`);
    }
    return fim();
  }

  // terminou: empate
  if (!vence) {
    if (hs === 0 && golos) {
      cri(
        `Muita luta, zero golos: ${linha}`,
        `Tudo trancado ${ondeCasa || "em campo"}: ${linha}`,
        Ha && Aa && `${Ha.t} e ${Aa.t} de pólvora seca`,
        `Os guarda-redes levam a melhor: ${linha}`,
        derbi && `${cap(derbi)} sem dono e sem golos`,
        est && `Nem um golo ${est.no}: ${linha}`,
      );
      cla(`Nulo entre ${H.nome.t} e ${A.nome.t}`, comp && `${comp}: ${H.nome.t} e ${A.nome.t} sem golos`);
    } else {
      cri(
        hs >= 3 && `Loucura ${ondeCasa || "em campo"}: ${linha}`,
        hs >= 3 && golos && `Festival de golos sem vencedor: ${linha}`,
        `Ninguém quis perder: ${linha}`,
        `${v(H.nome, "deixa", "deixam")} pontos em casa (${placar})`,
        `${v(A.nome, "arranca", "arrancam")} empate ${est ? est.no : ondeCasa || "fora"}`,
        Ha && Aa && `${Ha.t} e ${Aa.t} anulam-se (${placar})`,
        `Pontos repartidos ${est ? est.no : ondeCasa || "em campo"}: ${linha}`,
        golos && hs === 1 && `Um golo para cada lado${ondeCasa ? ` ${ondeCasa}` : ""}: ${linha}`,
        `Contas por fechar entre ${H.nome.t} e ${A.nome.t} (${placar})`,
        derbi && `${cap(derbi)} sem dono: ${linha}`,
      );
      cla(`${H.nome.t} e ${A.nome.t} empatam a ${hs}`, golos && `${H.nome.t} e ${A.nome.t} dividem os pontos`);
    }
    return fim();
  }

  // terminou: há um vencedor
  const ondeV = vence === "casa" ? "em casa" : ondeCasa || "fora de portas";
  if (derbi) cri(`${cap(derbi)} com dono: ${W.nome.t}`, `${v(W.nome, "manda", "mandam")} no ${derbi} (${pW})`);
  if (vence === "fora") {
    cri(
      fora && `${v(W.nome, "assalta", "assaltam")} ${cidade}`,
      est && `${v(W.nome, "cala", "calam")} ${est.o} (${pW})`,
      Wa && `${v(Wa, "faz", "fazem")} a festa em casa alheia`,
      `${v(L.nome, "tropeça", "tropeçam")} em casa (${placar})`,
    );
  } else {
    cri(
      est && `${cap(est.o)} em festa: ${linha}`,
      est && `${v(W.nome, "impõe", "impõem")} a lei ${est.no}`,
    );
  }
  if (dif >= modo.gole) {
    cri(
      golos && maior <= 10 && `${v(W.nome, "aplica", "aplicam")} chapa ${EXTENSO[maior]}${vence === "casa" && est ? ` ${est.no}` : fora ? ` ${fora}` : ""}`,
      `${v(W.nome, "cilindra", "cilindram")} ${L.nome.t} (${pW})`,
      Wa && `${v(Wa, "atropela", "atropelam")} ${La ? La.t : L.nome.t}`,
      Wa && La && `${v(Wa, "esmaga", "esmagam")} ${La.t}`,
      Wa && `${Wa.t} em noite de gala`,
      golos && hs + as >= 4 && `Chuva de golos ${ondeCasa || "em campo"}: ${linha}`,
      vence === "casa" && est && `${v(W.nome, "dá", "dão")} recital ${est.no}`,
      `${v(L.nome, "afunda-se", "afundam-se")} ${vence === "fora" ? "em casa" : est ? est.no : fora || "fora de casa"}`,
      La && `${La.t} sem resposta (${placar})`,
      `Sem apelo nem agravo: ${linha}`,
    );
    cla(golos ? `${v(W.nome, "goleia", "goleiam")} ${L.nome.t} por ${pW}` : `${v(W.nome, "arrasa", "arrasam")} ${L.nome.t} (${pW})`,
      comp && `${comp}: ${golos ? "goleada" : "vitória folgada"} ${vence === "casa" ? "em casa" : "fora"} — ${linha}`);
  } else if (dif <= modo.justa) {
    cri(
      `Por uma unha negra: ${linha}`,
      `Vitória a ferros: ${linha}`,
      `${v(W.nome, "sofre, mas sorri", "sofrem, mas sorriem")} (${pW})`,
      golos && `Um golo vale ouro: ${linha}`,
      !golos && `Decidido no último suspiro: ${linha}`,
      La && `${v(La, "cai", "caem")} de pé (${placar})`,
      Wa && `${v(Wa, "segura", "seguram")} o triunfo com unhas e dentes`,
      `Coração nas mãos até ao fim: ${linha}`,
    );
    cla(golos ? `${v(W.nome, "vence", "vencem")} ${L.nome.t} pela margem mínima` : `${v(W.nome, "vence", "vencem")} ${L.nome.t} num final de cortar a respiração`,
      `Vitória à justa ${ondeV}: ${linha}`);
  } else {
    cri(
      `${W.nome.t} ${W.nome.pl ? "vencem e convencem" : "vence e convence"} (${pW})`,
      `Missão cumprida: ${linha}`,
      La && `${La.t} de mãos a abanar`,
      Wa && `${v(Wa, "supera", "superam")} ${La ? La.t : L.nome.t}`,
      vence === "fora" && fora && `${v(W.nome, "conquista", "conquistam")} ${cidade}`,
      `${v(W.nome, "dá", "dão")} um passo em frente`,
      `${v(L.nome, "sai", "saem")}${vence === "casa" && fora ? ` ${deCidade(fora)}` : ""} de cabeça baixa`,
    );
    cla(`${v(W.nome, "vence", "vencem")} ${L.nome.t} por ${pW}`, `${v(W.nome, "bate", "batem")} ${L.nome.t} ${ondeV}`);
  }
  return fim();
}

// as sugestões a mostrar: até sete com mais rasgo (escolhidas à vez; «volta» troca a escolha) e três clássicas
export function titulosDoJogo(ficha, jogo = {}, volta = 0) {
  const { criativos, classicos } = todosOsTitulos(ficha, jogo);
  const chave = `${ficha?.casa?.nome}|${ficha?.fora?.nome}|${jogo.hs}|${jogo.as}|${volta}`;
  return [...baralhar(criativos, chave).slice(0, 7), ...classicos.slice(0, 3)];
}
