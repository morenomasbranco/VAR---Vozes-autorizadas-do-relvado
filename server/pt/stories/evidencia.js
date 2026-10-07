// Motor de evidência: cada story, post ou resultado oficial é uma prova sobre o estado de um jogo, não uma ordem.
// O motor junta a prova ao jogo e decide:
//   novo        — o resultado avançou (golo); cria o golo com minuto (escrito ou estimado) e marcador
//   confirmacao — diz o que já se sabia (tipicamente o story do outro clube): conta como confirmação
//   historico   — um resultado anterior ao atual (story publicado com atraso, repetição): não mexe no jogo
//   conflito    — não bate certo com o estado nem com a outra orientação: fica registado, à espera de mais provas
//   relogio     — só marca o momento do jogo (início, intervalo, recomeço, final)
//   ignorado    — não tem nada sobre o jogo (antevisão, onze inicial, bilhetes)
//
// Orientação do resultado: o clube visitante tanto pode escrever «casa-fora» como «nós primeiro». Decide-se por
// esta ordem: nomes das equipas no texto; convenção já aprendida desse clube; coerência com o estado do jogo
// (o resultado só anda para a frente, e quem publica um «GOLO» é normalmente quem marcou).
//
// Stories e posts valem o mesmo: o que chegar primeiro cria o golo (com o seu minuto e marcador) e o outro conta
// como confirmação, juntando só o que faltava (o nome do marcador, o minuto escrito). Um clube que só publica
// posts tem os golos pelos posts; o post de resumo no fim («⚽ Tiago Mendes 12', 80'») completa ou, se não houve
// nada durante o jogo, cria os golos desse clube com os minutos escritos.
import { lerTexto, posicaoNome } from "./parser.js";
import { minutoDoGolo, atrasoDe } from "./relogio.js";

const MAX_FONTES = 60;
const MESMO_GOLO_MS = 4 * 60000; // dois stories do mesmo clube com «GOLO» e sem resultado, tão perto, são o mesmo golo
const MESMO_GOLO_OUTRA_VIA_MS = 20 * 60000; // story e post do mesmo golo podem sair bem mais afastados
const MODO_PARTE = { futebol: [45, 47], futsal: [20, 38] };

export function novoJogoEstado(base) {
  return {
    estado: "agendado", hs: null, as: null, golos: [], relogio: {}, fontes: [], confirmado: { h: false, a: false },
    oficial: false, conflito: null, ...base,
  };
}

const ladoOposto = (l) => (l === "h" ? "a" : "h");

function orientar(jogo, ev, L) {
  const { a, b, idx } = L.placar;
  const A = { hs: a, as: b }, B = { hs: b, as: a };
  if (a === b) return { ...A, por: "igual", certo: true };
  // 1. nomes no texto
  const nomes = jogo.nomes || { h: [jogo.casa], a: [jogo.fora] };
  const pH = posicaoNome(L.texto, nomes.h || []), pA = posicaoNome(L.texto, nomes.a || []);
  if (pH >= 0 && pA >= 0 && pH !== pA) return { ...(pH < pA ? A : B), por: "nomes", certo: true };
  if (pH >= 0 && pA < 0) return { ...(pH < idx ? A : B), por: "nomes", certo: false };
  if (pA >= 0 && pH < 0) return { ...(pA < idx ? B : A), por: "nomes", certo: false };
  // 2. o clube da casa escreve sempre casa-fora (nas duas convenções dá o mesmo)
  if (ev.lado === "h") return { ...A, por: "casa", certo: true };
  // 3. convenção aprendida do clube visitante
  if (ev.convencao === "casa_fora") return { ...A, por: "convencao", certo: true };
  if (ev.convencao === "propria_primeiro") return { ...B, por: "convencao", certo: true };
  // 4. coerência com o estado: o resultado só avança, e quem publica «GOLO» marcou
  const cur = { hs: jogo.hs ?? 0, as: jogo.as ?? 0 };
  const nota = (c) => {
    let n = 0;
    if (c.hs >= cur.hs && c.as >= cur.as) n += 2;
    if (c.hs === cur.hs && c.as === cur.as) n += 3;
    const subiu = { h: c.hs > cur.hs, a: c.as > cur.as };
    const ev2 = new Set(L.eventos);
    if (ev.lado && ev2.has("golo") && subiu[ev.lado]) n += 1;
    if (ev.lado && ev2.has("golo_sofrido") && subiu[ladoOposto(ev.lado)]) n += 1;
    if ((c.hs - cur.hs) + (c.as - cur.as) === 1) n += 0.5;
    return n;
  };
  const nA = nota(A), nB = nota(B);
  if (nA !== nB) return { ...(nA > nB ? A : B), por: "coerencia", certo: Math.abs(nA - nB) >= 1 };
  // sem nada que desempate: a maior parte dos clubes escreve o próprio resultado primeiro
  return { ...(ev.lado === "a" ? B : A), por: "palpite", certo: false };
}

function minutoDaProva(jogo, ev, L) {
  // com uma lista de vários golos, o primeiro minuto do texto não é o do último golo: a lista trata disso
  if ((L.listaGolos || []).length > 1) return { min: null, extra: 0, fonte: "desconhecido", confianca: "baixa" };
  if (L.minuto) return { min: L.minuto.min, extra: L.minuto.extra, fonte: "explicito", confianca: "alta" };
  // uma publicação de fim de jogo («Resultado final 3-1») não diz quando foram os golos que ainda faltavam
  if (L.eventos.includes("final")) return { min: null, extra: 0, fonte: "desconhecido", confianca: "baixa" };
  const m = minutoDoGolo(jogo, ev.ts, jogo.mod, atrasoDe(ev.tipo));
  return m ? { min: m.min, extra: m.extra, fonte: "estimado", confianca: m.confianca } : { min: null, extra: 0, fonte: "desconhecido", confianca: "baixa" };
}

// um minuto escrito num story serve de âncora ao relógio quando ainda não há início nem recomeço
function ancorarRelogio(jogo, ev, L) {
  if (!L.minuto) return;
  const [parte, real] = MODO_PARTE[jogo.mod] || MODO_PARTE.futebol;
  const r = (jogo.relogio ||= {});
  const msPorMin = (real / parte) * 60000;
  const t = ev.ts - atrasoDe(ev.tipo);
  if (L.minuto.min <= parte && !r.inicio && !L.minuto.extra) r.inicio = Math.round(t - (L.minuto.min - 1) * msPorMin), r.inicioInferido = true;
  else if (L.minuto.min > parte && L.minuto.min <= parte * 2 && !r.recomeco) r.recomeco = Math.round(t - (L.minuto.min - parte - 1) * msPorMin), r.recomecoInferido = true;
}

function criaGolo(jogo, lado, ev, L, { ultimo }) {
  const n = jogo.golos.length + 1;
  const mesmoLado = !ev.lado || (ev.lado === lado) !== L.eventos.includes("golo_sofrido");
  const min = ultimo ? minutoDaProva(jogo, ev, L) : { min: null, extra: 0, fonte: "desconhecido", confianca: "baixa" };
  return {
    id: `${jogo.id}:g${n}`,
    lado,
    marcador: ultimo && mesmoLado && (L.listaGolos || []).length <= 1 ? L.marcadores[0] || null : null,
    min: min.min, extra: min.extra, minFonte: min.fonte, minConfianca: min.confianca,
    penalti: ultimo && L.eventos.includes("penalti") ? true : undefined,
    autogolo: ultimo && L.eventos.includes("autogolo") ? true : undefined,
    ts: ev.ts,
    via: ev.tipo || null, // story ou post: o que chegou primeiro e criou o golo
    fontes: [ev.conta || ev.tipo],
  };
}

// lista de golos com minuto (post de resumo): completa os golos do clube que publica, pela ordem; se o clube
// ainda não tinha golos registados e a lista bate com o resultado, cria-os com os minutos escritos
function aplicarLista(jogo, ev, L) {
  const lista = L.listaGolos || [];
  if (!lista.length || !ev.lado) return { mudou: false, criados: [] };
  const lado = ev.lado;
  const doLado = jogo.golos.filter((g) => g.lado === lado);
  const marcados = lado === "h" ? jogo.hs : jogo.as;
  const quem = ev.conta || ev.tipo;
  let mudou = false;
  const criados = [];
  if (doLado.length === 0 && lista.length === marcados) {
    lista.forEach((x, i) => {
      const g = {
        id: `${jogo.id}:g${jogo.golos.length + 1}`, lado, marcador: x.nome, min: x.min, extra: x.extra, minFonte: "explicito", minConfianca: "alta",
        ts: ev.ts + i, via: ev.tipo || null, fontes: [quem],
      };
      jogo.golos.push(g);
      criados.push(g);
    });
    mudou = true;
  } else if (doLado.length === lista.length) {
    doLado.forEach((g, i) => {
      const x = lista[i];
      if (!g.marcador) { g.marcador = x.nome; mudou = true; }
      if (g.minFonte !== "explicito") { g.min = x.min; g.extra = x.extra; g.minFonte = "explicito"; g.minConfianca = "alta"; mudou = true; }
      if (!g.fontes.includes(quem)) g.fontes.push(quem);
    });
  }
  if (mudou) {
    const n = (l) => jogo.golos.filter((g) => g.lado === l).length;
    if (jogo.oficial) jogo.golosIncompletos = n("h") !== jogo.hs || n("a") !== jogo.as;
  }
  return { mudou, criados };
}

// junta o nome do marcador ou o minuto escrito a um golo que já existia (o segundo story do mesmo golo)
function completarGolo(jogo, lado, ev, L) {
  const g = [...jogo.golos].reverse().find((x) => x.lado === lado && Math.abs(ev.ts - x.ts) < 15 * 60000);
  if (!g) return false;
  let mudou = false;
  if (!g.marcador && L.marcadores[0] && (ev.lado === lado || !ev.lado)) { g.marcador = L.marcadores[0]; mudou = true; }
  if (L.minuto && (L.listaGolos || []).length <= 1 && g.minFonte !== "explicito") { g.min = L.minuto.min; g.extra = L.minuto.extra; g.minFonte = "explicito"; g.minConfianca = "alta"; mudou = true; }
  const quem = ev.conta || ev.tipo;
  if (!g.fontes.includes(quem)) { g.fontes.push(quem); mudou = true; }
  return mudou;
}

export function aplicar(jogo, ev) {
  if (jogo.fontes.some((f) => f.id === ev.id)) return { decisao: "repetido", feed: [] };
  const L = ev.lido || lerTexto(ev.texto);
  const eventos = new Set(L.eventos);
  const feed = [];
  const reg = { id: ev.id, tipo: ev.tipo, conta: ev.conta || null, lado: ev.lado || null, ts: ev.ts, url: ev.url || null, texto: String(ev.texto || "").slice(0, 280) };
  const regista = (decisao, extra = {}) => {
    Object.assign(reg, { decisao }, extra);
    jogo.fontes.push(reg);
    if (jogo.fontes.length > MAX_FONTES) jogo.fontes.splice(0, jogo.fontes.length - MAX_FONTES);
    return { decisao, feed, orientacao: extra.orientacao || null };
  };

  // depois do resultado oficial, os stories e posts só ficam como registo (e o post de resumo dá os marcadores)
  if (jogo.oficial && jogo.estado === "final") {
    const ok = L.placar && (orientar(jogo, ev, L).hs === jogo.hs);
    if (ok) aplicarLista(jogo, ev, L);
    return regista(ok ? "confirmacao" : "historico");
  }
  if (eventos.has("agenda") && !L.placar && !eventos.has("golo") && !eventos.has("final") && !eventos.has("intervalo")) return regista("ignorado");
  if (eventos.has("onze") && !L.placar) return regista("ignorado");
  if (L.confianca < 0.35 && !L.placar) return regista("ignorado");

  const r = (jogo.relogio ||= {});
  let mexeuRelogio = false;
  if (eventos.has("adiado") && !L.placar) {
    jogo.estado = /suspens|interromp/i.test(L.texto) ? "suspenso" : "adiado";
    feed.push({ tipo: jogo.estado });
    return regista("relogio");
  }
  if (eventos.has("inicio") && !eventos.has("final")) {
    if (!r.inicio || r.inicioInferido || ev.ts - atrasoDe(ev.tipo) < r.inicio) { r.inicio = ev.ts - atrasoDe(ev.tipo); delete r.inicioInferido; mexeuRelogio = true; }
    if (jogo.estado === "agendado") { jogo.estado = "direto"; feed.push({ tipo: "inicio" }); if (jogo.hs == null) { jogo.hs = 0; jogo.as = 0; } }
  }
  if (eventos.has("intervalo") && !eventos.has("final")) {
    if (!r.intervalo) { r.intervalo = ev.ts - 30000; mexeuRelogio = true; }
    if (jogo.estado !== "intervalo" && jogo.estado !== "final") { jogo.estado = "intervalo"; feed.push({ tipo: "intervalo" }); }
  }
  if (eventos.has("recomeco")) {
    if (!r.recomeco || r.recomecoInferido) { r.recomeco = ev.ts - atrasoDe(ev.tipo); delete r.recomecoInferido; mexeuRelogio = true; }
    if (jogo.estado === "intervalo" || jogo.estado === "agendado") jogo.estado = "direto";
  }
  if (!eventos.has("intervalo") && !eventos.has("final")) ancorarRelogio(jogo, ev, L);

  const fim = () => {
    if (!eventos.has("final")) return;
    if (!r.fim) r.fim = ev.ts;
    if (jogo.estado !== "final") { jogo.estado = "final"; feed.push({ tipo: "final" }); }
  };

  // ── golo sem resultado escrito: +1 para quem publica (ou para o adversário, se é golo sofrido)
  if (!L.placar) {
    if ((eventos.has("golo") || eventos.has("golo_sofrido")) && ev.lado && !eventos.has("anulado")) {
      const lado = eventos.has("golo_sofrido") ? ladoOposto(ev.lado) : ev.lado;
      const recente = [...jogo.golos].reverse().find((g) => g.lado === lado);
      // o mesmo golo: muito perto, pela mesma via; ou o post de um golo que já veio por story (e vice-versa),
      // do mesmo clube e sem um marcador diferente
      const outraVia = recente && recente.via && ev.tipo && recente.via !== ev.tipo && recente.fontes.includes(ev.conta || ev.tipo)
        && !(L.marcadores[0] && recente.marcador && L.marcadores[0] !== recente.marcador);
      if (recente && Math.abs(ev.ts - recente.ts) < (outraVia ? MESMO_GOLO_OUTRA_VIA_MS : MESMO_GOLO_MS)) {
        completarGolo(jogo, lado, ev, L);
        fim();
        return regista("confirmacao");
      }
      if (jogo.hs == null) { jogo.hs = 0; jogo.as = 0; }
      const g = criaGolo(jogo, lado, ev, L, { ultimo: true });
      jogo.golos.push(g);
      if (lado === "h") jogo.hs++; else jogo.as++;
      if (jogo.estado === "agendado" || jogo.estado === "intervalo" && !eventos.has("intervalo")) jogo.estado = "direto";
      feed.push({ tipo: "golo", golo: g });
      fim();
      return regista("novo", { semPlacar: true });
    }
    fim();
    return regista(mexeuRelogio || feed.length ? "relogio" : "ignorado");
  }

  // ── com resultado
  const o = orientar(jogo, ev, L);
  const cur = { hs: jogo.hs ?? 0, as: jogo.as ?? 0 };
  const novo = { hs: o.hs, as: o.as };
  const orientacao = ev.lado === "a" && o.hs !== o.as ? (o.hs === L.placar.a ? "casa_fora" : "propria_primeiro") : null;
  const apr = (dec) => ({ orientacao: o.certo ? orientacao : null, por: o.por, decisaoPor: dec });

  if (novo.hs === cur.hs && novo.as === cur.as && jogo.hs != null) {
    if (ev.lado) jogo.confirmado[ev.lado] = true;
    const ladoGolo = ev.lado ? (eventos.has("golo_sofrido") ? ladoOposto(ev.lado) : ev.lado) : jogo.golos.at(-1)?.lado;
    if ((eventos.has("golo") || eventos.has("golo_sofrido") || L.marcadores.length || L.minuto) && ladoGolo) completarGolo(jogo, ladoGolo, ev, L);
    else if (jogo.golos.length) { const g = jogo.golos.at(-1); const q = ev.conta || ev.tipo; if (!g.fontes.includes(q)) g.fontes.push(q); }
    const ls = aplicarLista(jogo, ev, L);
    for (const g of ls.criados) feed.push({ tipo: "golo", golo: g });
    fim();
    return regista("confirmacao", apr("igual"));
  }
  const avanca = (c) => c.hs >= cur.hs && c.as >= cur.as;
  let alvo = novo;
  let dec = "novo";
  if (!avanca(novo)) {
    const troca = { hs: novo.as, as: novo.hs };
    if (!o.certo && troca.hs === cur.hs && troca.as === cur.as) {
      // afinal é o mesmo resultado escrito ao contrário: confirmação, e fica a saber-se a convenção do clube
      if (ev.lado) jogo.confirmado[ev.lado] = true;
      fim();
      return regista("confirmacao", { orientacao: ev.lado === "a" ? (troca.hs === L.placar.a ? "casa_fora" : "propria_primeiro") : null, por: "estado" });
    }
    if (!o.certo && avanca(troca)) alvo = troca;
    else if (novo.hs <= cur.hs && novo.as <= cur.as) {
      if (eventos.has("anulado")) {
        // golo anulado: sai o último golo do lado que desceu
        for (const lado of ["h", "a"]) {
          const desce = lado === "h" ? cur.hs - novo.hs : cur.as - novo.as;
          for (let i = 0; i < desce; i++) {
            const k = jogo.golos.map((g) => g.lado).lastIndexOf(lado);
            if (k >= 0) jogo.golos.splice(k, 1);
          }
        }
        jogo.hs = novo.hs; jogo.as = novo.as;
        feed.push({ tipo: "anulado" });
        return regista("novo", { correcao: true });
      }
      fim();
      return regista("historico", apr("anterior"));
    } else {
      jogo.conflito = { ts: ev.ts, conta: ev.conta, placar: `${novo.hs}-${novo.as}`, atual: `${cur.hs}-${cur.as}` };
      return regista("conflito", apr("conflito"));
    }
  }
  // avança: um ou mais golos novos (vários quando se perderam stories pelo caminho)
  if (jogo.hs == null) { jogo.hs = 0; jogo.as = 0; }
  const dh = alvo.hs - cur.hs, da = alvo.as - cur.as;
  // o último golo é o de quem publica «GOLO» (ou do adversário, se é golo sofrido); sem isso, o do lado que subiu
  let ladoUltimo = dh > 0 && da === 0 ? "h" : da > 0 && dh === 0 ? "a" : null;
  if (!ladoUltimo && ev.lado) ladoUltimo = eventos.has("golo_sofrido") ? ladoOposto(ev.lado) : ev.lado;
  const novos = [];
  for (const [lado, n] of [["h", dh], ["a", da]]) for (let i = 0; i < n; i++) novos.push(lado);
  if (ladoUltimo && novos.includes(ladoUltimo)) { novos.splice(novos.lastIndexOf(ladoUltimo), 1); novos.push(ladoUltimo); }
  novos.forEach((lado, i) => {
    const g = criaGolo(jogo, lado, ev, L, { ultimo: i === novos.length - 1 });
    jogo.golos.push(g);
    feed.push({ tipo: "golo", golo: g });
  });
  jogo.hs = alvo.hs; jogo.as = alvo.as;
  aplicarLista(jogo, ev, L); // o post de resumo dá o marcador e o minuto de cada golo
  jogo.conflito = null;
  if (ev.lado) jogo.confirmado = { h: false, a: false, [ev.lado]: true };
  if (jogo.estado === "agendado") jogo.estado = "direto";
  if (eventos.has("intervalo")) jogo.estado = "intervalo";
  else if (jogo.estado === "intervalo" && !eventos.has("final") && ev.ts - (r.intervalo || 0) > 3 * 60000) jogo.estado = "direto";
  fim();
  return regista(dec, apr(alvo === novo ? "avanca" : "trocado"));
}

// resultado oficial (FPF, Liga, Sofascore no fim): passa por cima de tudo, mas guarda os golos dos stories
export function aplicarOficial(jogo, { hs, as, estado = "final", fonte = "fpf", ts = Date.now() }) {
  const antes = `${jogo.hs}-${jogo.as}|${jogo.estado}|${jogo.oficial}`;
  if (estado === "final" && hs != null) {
    const soma = (l) => jogo.golos.filter((g) => g.lado === l).length;
    jogo.golosIncompletos = soma("h") !== hs || soma("a") !== as;
    jogo.hs = hs; jogo.as = as; jogo.estado = "final"; jogo.oficial = true; jogo.conflito = null;
    jogo.relogio ||= {};
    jogo.relogio.fim ||= ts;
  } else if (["adiado", "suspenso", "cancelado", "falta"].includes(estado)) {
    jogo.estado = estado; jogo.oficial = true;
    if (estado === "falta" && hs != null) { jogo.hs = hs; jogo.as = as; }
  }
  const depois = `${jogo.hs}-${jogo.as}|${jogo.estado}|${jogo.oficial}`;
  if (antes !== depois) jogo.fontes.push({ id: `${fonte}:${ts}`, tipo: fonte, ts, decisao: "oficial", texto: `${hs ?? "-"}-${as ?? "-"} ${estado}` });
  return antes !== depois;
}
