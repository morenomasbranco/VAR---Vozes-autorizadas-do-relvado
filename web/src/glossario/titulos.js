// Glossário › preparar um jogo: sugestões de títulos para o jogo escolhido. Partem do resultado (ou da antevisão, se o
// jogo ainda não começou, ou do resultado do momento, se está a decorrer), das alcunhas das equipas, da cidade do
// visitado e da competição; a margem que conta como goleada ou como vitória à justa depende da modalidade.
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

// a equipa como sujeito do título: o nome (como o glossário o escreve) e as alcunhas que servem num título
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
  return { nome: { t: nome, pl: ligaNA }, alcunhas, cidade: c?.cidade || null };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const v = (suj, sg, pl) => `${suj.t} ${suj.pl ? pl : sg}`;

// os títulos sugeridos para o jogo: ficha é a de fichaDoJogo; jogo traz o resultado (hs, as), vivo e ft
export function titulosDoJogo(ficha, jogo = {}) {
  if (!ficha?.casa || !ficha?.fora) return [];
  const H = equipa(ficha.casa), A = equipa(ficha.fora);
  const modo = MODOS[ficha.mod] || MODOS.futebol;
  const golos = DE_GOLOS.has(ficha.mod) || !MODOS[ficha.mod];
  const comp = tirar(jogo.comp || ficha.prova?.nome || "").replace(/^sele[cç][aã]o:\s*/i, "");
  const ondeCasa = emCidade(H.cidade);
  const derbi = ["dérbi", "clássico"].find((t) => ficha.termos?.[0] === t) || null;
  const Ha = H.alcunhas[0] || null, Aa = A.alcunhas[0] || null;
  const hs = jogo.hs == null || jogo.hs === "" ? null : Number(jogo.hs);
  const as = jogo.as == null || jogo.as === "" ? null : Number(jogo.as);
  const placar = `${jogo.hs}–${jogo.as}`;
  const linha = `${H.nome.t} ${placar} ${A.nome.t}`;
  const out = [];
  const pôr = (...ts) => { for (const t of ts) if (t) out.push(cap(t.replace(/\s+/g, " ").trim())); };

  // ainda não começou: antevisão
  if (hs == null || as == null || Number.isNaN(hs) || Number.isNaN(as)) {
    pôr(
      comp && `${comp}: ${v(H.nome, "recebe", "recebem")} ${A.nome.t}`,
      derbi && `${cap(derbi)} ${ondeCasa}: ${H.nome.t} e ${A.nome.t} frente a frente`,
      `${H.nome.t} e ${A.nome.t} medem forças${ondeCasa ? ` ${ondeCasa}` : ""}`,
      Ha && Aa && `${Ha.t} e ${Aa.t} frente a frente`,
      Aa && ondeCasa && `${v(Aa, "procura", "procuram")} a vitória ${ondeCasa}`,
      `Antevisão: ${H.nome.t} – ${A.nome.t}`,
      Ha && `${v(Ha, "quer", "querem")} fazer a festa em casa`,
    );
    return [...new Set(out)].slice(0, 8);
  }

  const vence = hs === as ? null : hs > as ? "casa" : "fora";
  const W = vence === "casa" ? H : A, L = vence === "casa" ? A : H;
  const Wa = W.alcunhas[0] || null, La = L.alcunhas[0] || null;
  const dif = Math.abs(hs - as), maior = Math.max(hs, as), menor = Math.min(hs, as);
  const pW = `${maior}–${menor}`;

  // a decorrer
  if (jogo.vivo) {
    if (!vence) {
      pôr(
        `Em direto: ${linha}`,
        hs === 0 && golos ? `${H.nome.t} e ${A.nome.t} ainda sem golos` : `Tudo empatado entre ${H.nome.t} e ${A.nome.t} (${placar})`,
        derbi && `${cap(derbi)} em aberto: ${linha}`,
        Ha && Aa && `${Ha.t} e ${Aa.t} anulam-se${ondeCasa ? ` ${ondeCasa}` : ""}`,
      );
    } else {
      pôr(
        `Em direto: ${linha}`,
        `${v(W.nome, "está", "estão")} a vencer ${L.nome.t} (${pW})`,
        Wa && `${Wa.t} na frente${ondeCasa ? ` ${ondeCasa}` : ""}`,
        dif >= modo.gole && `${v(W.nome, "dispara", "disparam")} no marcador frente a ${L.nome.t}`,
        dif <= modo.justa && `${v(L.nome, "procura", "procuram")} o empate (${placar})`,
        comp && `${comp}: ${v(W.nome, "lidera", "lideram")} ${vence === "casa" ? "em casa" : "fora de portas"}`,
      );
    }
    return [...new Set(out)].slice(0, 8);
  }

  // terminou: empate
  if (!vence) {
    if (hs === 0 && golos) {
      pôr(
        `Nulo entre ${H.nome.t} e ${A.nome.t}`,
        `${H.nome.t} e ${A.nome.t} não saem do nulo`,
        derbi && `${cap(derbi)} sem golos: ${linha}`,
        Ha && Aa && `${Ha.t} e ${Aa.t} sem golos${ondeCasa ? ` ${ondeCasa}` : ""}`,
        ondeCasa && `Empate a zero ${ondeCasa}`,
        comp && `${comp}: ${H.nome.t} e ${A.nome.t} sem golos`,
      );
    } else {
      pôr(
        `${H.nome.t} e ${A.nome.t} empatam a ${hs}`,
        derbi && `${cap(derbi)} sem vencedor: ${linha}`,
        golos && `${H.nome.t} e ${A.nome.t} dividem os pontos`,
        Ha && Aa && `${Ha.t} e ${Aa.t} anulam-se (${placar})`,
        ondeCasa && `Tudo igual ${ondeCasa}: ${linha}`,
        comp && `${comp}: empate entre ${H.nome.t} e ${A.nome.t}`,
      );
    }
    return [...new Set(out)].slice(0, 8);
  }

  // terminou: há um vencedor
  const ondeV = vence === "casa" ? "em casa" : ondeCasa || "fora de portas";
  if (derbi) pôr(`${v(W.nome, "vence", "vencem")} o ${derbi} (${pW})`, Wa && `${cap(derbi)} pintado com as cores ${vence === "casa" ? "da casa" : "dos visitantes"}: ${linha}`);
  if (dif >= modo.gole) {
    pôr(
      golos ? `${v(W.nome, "goleia", "goleiam")} ${L.nome.t} por ${pW}` : `${v(W.nome, "arrasa", "arrasam")} ${L.nome.t} (${pW})`,
      `${v(W.nome, "dá", "dão")} espetáculo e ${W.nome.pl ? "vencem" : "vence"} ${L.nome.t} ${ondeV}`,
      Wa && `${v(Wa, "esmaga", "esmagam")} ${La ? La.t : L.nome.t}`,
      `Noite para esquecer: ${v(L.nome, "sofre", "sofrem")} ${maior} ${modo.un} ${vence === "casa" ? ondeCasa || "fora" : "em casa"}`,
      comp && `${comp}: ${golos ? "goleada" : "vitória folgada"} ${vence === "casa" ? "em casa" : "fora"} — ${linha}`,
    );
  } else if (dif <= modo.justa) {
    pôr(
      golos ? `${v(W.nome, "vence", "vencem")} ${L.nome.t} pela margem mínima` : `${v(W.nome, "vence", "vencem")} ${L.nome.t} num final de cortar a respiração`,
      Wa && `${v(Wa, "sofre", "sofrem")}, mas ${Wa.pl ? "vencem" : "vence"} ${L.nome.t}`,
      `${v(W.nome, "segura", "seguram")} vitória ${golos ? "tangencial" : "renhida"} ${ondeV}`,
      !golos && `Até ao fim: ${v(W.nome, "bate", "batem")} ${L.nome.t} por ${pW}`,
      `Vitória à justa ${ondeV}: ${linha}`,
      La && `${v(La, "cai", "caem")} por um ${golos ? "golo" : "triz"}`,
    );
  } else {
    pôr(
      `${v(W.nome, "vence", "vencem")} ${L.nome.t} por ${pW}`,
      `${v(W.nome, "bate", "batem")} ${L.nome.t} ${ondeV}`,
      Wa && `${v(Wa, "supera", "superam")} ${La ? La.t : L.nome.t}`,
      vence === "fora" ? `${v(L.nome, "perde", "perdem")} em casa (${placar})` : `${v(L.nome, "sai", "saem")} derrotado${L.nome.pl ? "s" : ""} ${ondeCasa}`,
      comp && `${comp}: ${v(W.nome, "vence", "vencem")} ${L.nome.t}`,
      La && `${v(La, "tropeça", "tropeçam")} ${vence === "fora" ? "em casa" : ondeCasa || "fora"}`,
    );
  }
  return [...new Set(out)].slice(0, 8);
}
