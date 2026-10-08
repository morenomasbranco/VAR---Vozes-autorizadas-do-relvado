// Que competições entram: futebol sénior e futsal sénior (masculino e feminino) de todo o país, nacionais e
// distritais, e o campeonato nacional de sub-23. Ficam de fora a formação (juniores, juvenis, iniciados…),
// os sub-22/sub-23/esperanças distritais, os veteranos, o futebol de praia, o futebol de 7/9 e o INATEL.
import { norm, slug } from "../util.js";

export const EPOCA_FPF = Number(process.env.FPF_EPOCA) || 106; // 106 = 2026/27 no resultados.fpf.pt

// associações distritais e regionais (id do resultados.fpf.pt), pela ordem em que o utilizador as deu
export const ASSOCIACOES = [
  { id: 224, key: "af-algarve", nome: "AF Algarve", longo: "Associação de Futebol do Algarve" },
  { id: 216, key: "af-angra", nome: "AF Angra do Heroísmo", longo: "Associação de Futebol de Angra do Heroísmo" },
  { id: 217, key: "af-aveiro", nome: "AF Aveiro", longo: "Associação de Futebol de Aveiro" },
  { id: 218, key: "af-beja", nome: "AF Beja", longo: "Associação de Futebol de Beja" },
  { id: 219, key: "af-braga", nome: "AF Braga", longo: "Associação de Futebol de Braga" },
  { id: 220, key: "af-braganca", nome: "AF Bragança", longo: "Associação de Futebol de Bragança" },
  { id: 221, key: "af-castelo-branco", nome: "AF Castelo Branco", longo: "Associação de Futebol de Castelo Branco" },
  { id: 222, key: "af-coimbra", nome: "AF Coimbra", longo: "Associação de Futebol de Coimbra" },
  { id: 223, key: "af-evora", nome: "AF Évora", longo: "Associação de Futebol de Évora" },
  { id: 226, key: "af-guarda", nome: "AF Guarda", longo: "Associação de Futebol da Guarda" },
  { id: 227, key: "af-horta", nome: "AF Horta", longo: "Associação de Futebol da Horta" },
  { id: 228, key: "af-leiria", nome: "AF Leiria", longo: "Associação de Futebol de Leiria" },
  { id: 229, key: "af-lisboa", nome: "AF Lisboa", longo: "Associação de Futebol de Lisboa" },
  { id: 225, key: "af-madeira", nome: "AF Madeira", longo: "Associação de Futebol da Madeira" },
  { id: 230, key: "af-ponta-delgada", nome: "AF Ponta Delgada", longo: "Associação de Futebol de Ponta Delgada" },
  { id: 231, key: "af-portalegre", nome: "AF Portalegre", longo: "Associação de Futebol de Portalegre" },
  { id: 232, key: "af-porto", nome: "AF Porto", longo: "Associação de Futebol do Porto" },
  { id: 233, key: "af-santarem", nome: "AF Santarém", longo: "Associação de Futebol de Santarém" },
  { id: 234, key: "af-setubal", nome: "AF Setúbal", longo: "Associação de Futebol de Setúbal" },
  { id: 235, key: "af-viana", nome: "AF Viana do Castelo", longo: "Associação de Futebol de Viana do Castelo" },
  { id: 236, key: "af-vila-real", nome: "AF Vila Real", longo: "Associação de Futebol de Vila Real" },
  { id: 237, key: "af-viseu", nome: "AF Viseu", longo: "Associação de Futebol de Viseu" },
];
// a associação de que um texto fala: «AF Braga», «A.F. Lisboa», «AFPorto», «Associação de Futebol do Algarve»,
// «distrital de Leiria». Serve para tirar as notícias das associações das colunas da FPF e da Liga.
const ALCUNHAS = { "af-angra": ["angra"], "af-viana": ["viana"], "af-ponta-delgada": ["p\\.? ?delgada"] };
const LUGARES = ASSOCIACOES.map((a) => [a.key, [norm(a.nome.replace(/^AF /, "")).replace(/ /g, "\\s+"), ...(ALCUNHAS[a.key] || [])].join("|")]);
const RE_ASSOC = LUGARES.map(([key, l]) => [key, new RegExp(`(?:^|[^a-z0-9])(?:a\\.?\\s?f\\.?\\s?(?:(?:de|do|da)\\s+)?|associacao\\s+de\\s+futebol\\s+(?:de|do|da)\\s+|distrita(?:l|is)\\s+(?:de|do|da)\\s+)(?:${l})(?![a-z])`)]);
export function associacaoDoTexto(t) {
  const s = norm(t);
  return RE_ASSOC.find(([, re]) => re.test(s))?.[0] || null;
}
export const FPF = { key: "fpf", nome: "FPF", longo: "Federação Portuguesa de Futebol" };
export const LIGA = { key: "liga", nome: "Liga Portugal", longo: "Liga Portugal" };
export const ORGS = [LIGA, FPF, ...ASSOCIACOES];
export const ORG = Object.fromEntries(ORGS.map((o) => [o.key, o]));
// o nome que o Excel usa para cada organizador («AF Viana do Castelo», «FPF», «Liga Portugal»)
export const orgPorNome = (n) => {
  const k = norm(n);
  return ORGS.find((o) => norm(o.nome) === k || norm(o.longo) === k)
    || ORGS.find((o) => k && (norm(o.nome).includes(k) || k.includes(norm(o.nome).replace(/^af /, ""))))
    || null;
};

// marcas de escalões de formação e de provas que não interessam
const FORMACAO = /\b(junior|juniores|jun\.?|juvenis|juvenil|juv\.?|iniciad\w*|inic\.?|infanti\w*|inf\.?|benjami\w*|traquin\w*|petiz\w*|escolas?|formacao|desenvolvimento|encontros?|festival|convivio|minis?|bambis?)\b|\b(sub|u|under)[ -]?(7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)\b|"[a-g]"|\b[a-g] - (benjamins|infantis|iniciados|juvenis|juniores)/;
const EXCLUIR = /\bveteran\w*|\bvet\.|\bmasters?\b|futebol de praia|\bpraia\b|beach|\bfut\.? ?[79]\b|futebol (de )?[79]\b|\binatel\b|walking|inclusiv\w*|adaptad\w*|\bcpcd\b|\bdesporto escolar\b|\bcorporativ\w*|\bempresas?\b|\bpopular(es)?\b|\bamador(es)? de\b/;
const SUB23 = /\b(sub|u|under)[ -]?2[23]\b|esperan[cç]as|\brevela[cç][aã]o\b|next ?gen/;

export function classificar({ nome, org, contexto = "" }) {
  const n = norm(`${nome}`);
  const ctx = norm(contexto);
  const tudo = `${n} ${ctx}`;
  const nacional = org === "fpf" || org === "liga";
  if (EXCLUIR.test(tudo)) return null;
  const sub23 = SUB23.test(n);
  // sub-23 só o campeonato nacional; os sub-22/sub-23/esperanças distritais ficam de fora
  if (sub23 && !nacional) return null;
  if (!sub23 && FORMACAO.test(n)) return null;
  if (!sub23 && FORMACAO.test(ctx) && !/senior/.test(n)) return null;
  const futsal = /futsal|fut\.? ?sal|futebol de sal[aã]o/.test(tudo);
  const fem = /femin|\bfem\.?\b|women|senhoras|\bliga bpi\b/.test(n);
  const taca = /\b(super)?ta[cç]a\b|\bsupertaca\b|\bcup\b|\bcopa\b|\btrofeu\b|\btorneio\b/.test(n);
  // torneios sem «sénior» no nome costumam ser de formação ou de verão
  if (/\btorneio\b/.test(n) && !/senior/.test(n) && !nacional) return null;
  return {
    mod: futsal ? "futsal" : "futebol",
    fem,
    sub23,
    tipo: taca ? "taca" : "liga",
    nivel: nacional ? "nacional" : "distrital",
  };
}

// nome legível a partir do nome em maiúsculas da FPF («CAMPEONATO DISTRITAL 1ª DIVISÃO SENIORES» →
// «Campeonato Distrital 1ª Divisão Seniores»), com as siglas em maiúsculas
const SIGLAS = new Set(["af", "fpf", "ii", "iii", "iv", "bpi", "sabseg", "mka", "ud", "ac", "sc", "fc", "cd", "gd", "ad", "sub-23", "u23", "fpf.", "ass."]);
export function bonito(nome) {
  const s = String(nome || "").replace(/\s+/g, " ").trim();
  if (!s || s !== s.toUpperCase()) return s; // já vem com maiúsculas e minúsculas
  return s.toLowerCase().split(" ").map((w, i) => {
    if (SIGLAS.has(w) || /^[ivx]+$/.test(w)) return w.toUpperCase();
    if (i > 0 && /^(de|da|do|das|dos|e|a|o)$/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ").replace(/\b(\d)ª/g, "$1ª");
}

export const compKey = (org, nome, fonteId) => `${org}-${slug(nome).slice(0, 48)}${fonteId ? `-${fonteId}` : ""}`;

// ordem das competições no site: nacionais primeiro (pelo nível), depois associações, futebol antes de futsal
const NIVEL_NAC = [
  [/liga portugal (betclic)?$|^liga portugal betclic|primeira liga|^liga betclic/, 1],
  [/liga portugal 2|liga 2|segunda liga/, 2],
  [/liga 3/, 3],
  [/campeonato de portugal/, 4],
  [/campeonato (de futebol )?dos acores/, 5],
  [/sub[ -]?23|revela|next ?gen/, 6],
  [/liga bpi|primeira divisao feminina|i divisao feminin/, 7],
  [/ii divisao.*femin|campeonato nacional ii/, 8],
  [/liga placard|i divisao.*futsal|^futsal.*1/, 10],
  [/ii divisao.*futsal|futsal.*ii divisao/, 11],
  [/iii divisao.*futsal|futsal.*iii divisao/, 12],
  [/ta[cç]a de portugal/, 20],
  [/ta[cç]a da liga/, 21],
  [/supert/, 22],
];
export function ordem(c) {
  const n = norm(c.nome);
  const base = c.org === "liga" ? 0 : c.org === "fpf" ? 100 : 1000 + ASSOCIACOES.findIndex((a) => a.key === c.org) * 1000;
  let nivel = 50;
  if (c.nivel === "nacional") nivel = NIVEL_NAC.find(([re]) => re.test(n))?.[1] ?? 50;
  else {
    // divisões distritais: elite/honra/pró-nacional acima da 1ª, a 1ª acima da 2ª…
    if (/elite|pro[ -]?nacional|honra|sabseg|super ?liga|primeira|^1|\b1[aª]?\b/.test(n)) nivel = /honra|elite|pro|sabseg|super/.test(n) ? 1 : 2;
    else if (/\b2[aª]?\b|segunda/.test(n)) nivel = 3;
    else if (/\b3[aª]?\b|terceira/.test(n)) nivel = 4;
    else if (/\b4[aª]?\b|quarta/.test(n)) nivel = 5;
  }
  return base + (c.mod === "futsal" ? 400 : 0) + (c.fem ? 200 : 0) + (c.tipo === "taca" ? 100 : 0) + nivel;
}
