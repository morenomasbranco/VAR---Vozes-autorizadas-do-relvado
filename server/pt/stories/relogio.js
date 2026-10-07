// Relógio de um jogo sem transmissão: o minuto de cada golo e o minuto a que vai o jogo, a partir das âncoras
// que os stories vão dando (início, intervalo, recomeço) ou, sem nenhuma, da hora marcada no calendário.
// Uma estimativa nunca passa por minuto exato: cada minuto leva a fonte («explicito» quando vem escrito no story,
// «estimado» quando é calculado) e a confiança da âncora usada.

// duração real de cada parte (com descontos), do intervalo e o atraso médio entre o lance e o story
const MODOS = {
  futebol: { parte: 45, real: 47, intervalo: 15, atrasoInicio: 2 },
  // no futsal o cronómetro para: 20 minutos de jogo levam perto de 40 minutos reais
  futsal: { parte: 20, real: 38, intervalo: 10, atrasoInicio: 3 },
};
export const ATRASO_STORY_MS = (Number(process.env.STORY_ATRASO_SEGUNDOS) || 60) * 1000;

const minutoDe = (ms, modo) => Math.max(0, ms) / 60000 * (modo.parte / modo.real);

// minuto do jogo no instante t; devolve { min, extra, parte, fonte, confianca } ou null antes do início
export function minutoEm(jogo, t, mod = "futebol") {
  const modo = MODOS[mod] || MODOS.futebol;
  const r = jogo.relogio || {};
  const parte2 = (desde, conf) => {
    const m = minutoDe(t - desde, modo);
    const min = Math.floor(m) + 1;
    return min > modo.parte
      ? { min: modo.parte * 2, extra: min - modo.parte, parte: 2, fonte: "estimado", confianca: conf }
      : { min: modo.parte + min, extra: 0, parte: 2, fonte: "estimado", confianca: conf };
  };
  if (r.fim && t >= r.fim) return { min: modo.parte * 2, extra: 0, parte: 2, fonte: "estimado", confianca: "alta", terminado: true };
  if (r.recomeco && t >= r.recomeco) return parte2(r.recomeco, "alta");
  if (r.intervalo && t >= r.intervalo) return { min: modo.parte, extra: 0, parte: 1, fonte: "estimado", confianca: "alta", intervalo: true };
  const inicio = r.inicio || (jogo.inicio ? jogo.inicio + modo.atrasoInicio * 60000 : null);
  if (!inicio || t < inicio - 60000) return null;
  const conf = r.inicio ? "alta" : "baixa";
  const m = minutoDe(t - inicio, modo);
  const min1 = Math.floor(m) + 1;
  if (min1 <= modo.parte) return { min: min1, extra: 0, parte: 1, fonte: "estimado", confianca: conf };
  // passou a duração da 1.ª parte e não houve story de intervalo: conta com descontos e intervalo médios
  const fimParte1 = inicio + modo.real * 60000;
  if (t < fimParte1 + 60000) return { min: modo.parte, extra: Math.min(5, min1 - modo.parte), parte: 1, fonte: "estimado", confianca: conf === "alta" ? "media" : "baixa" };
  const recomeco = fimParte1 + modo.intervalo * 60000;
  if (t < recomeco) return { min: modo.parte, extra: 0, parte: 1, fonte: "estimado", confianca: "baixa", intervalo: true };
  return parte2(recomeco, conf === "alta" ? "media" : "baixa");
}

// minuto de um golo publicado num story sem minuto: o instante do story menos o atraso habitual de publicação
export function minutoDoGolo(jogo, tsStory, mod = "futebol") {
  const m = minutoEm(jogo, tsStory - ATRASO_STORY_MS, mod);
  if (!m) return null;
  // um story publicado durante o intervalo fala de um golo da 1.ª parte, perto do fim
  if (m.intervalo) return { ...m, min: (MODOS[mod] || MODOS.futebol).parte, extra: 0, intervalo: false, confianca: "baixa" };
  return m;
}

// «23'», «45'+2'», «~67'» (com ~ quando é estimado)
export function textoMinuto(m) {
  if (!m) return "";
  const base = m.extra ? `${m.min}'+${m.extra}'` : `${m.min}'`;
  return m.fonte === "estimado" ? `~${base}` : base;
}
