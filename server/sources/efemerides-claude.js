// «Nesta semana» pesquisado pelo Claude: para cada dia da semana, um pedido ao Claude (API da Anthropic) com a
// ferramenta de pesquisa na web, a perguntar que acontecimentos desportivos — portugueses e internacionais —
// marcaram esse dia em cada um dos anos da lista (há 1, 2, 3, 4, 5, 10, 15… 100 anos).
//
// Sete pedidos por semana, feitos quando a semana muda (e repetidos só para os dias que falharem). O resultado
// fica em data/efemerides-claude.json e junta-se ao que vem da Wikipédia, do Wikidata e da ESPN.
//
// Dois motores, à escolha (EFEMERIDES_MOTOR=gemini|claude; por omissão, o Claude se houver ANTHROPIC_API_KEY,
// senão o Gemini se houver GEMINI_API_KEY):
//  - Gemini, gratuito: a mesma GEMINI_API_KEY do resto do site, com a pesquisa Google («grounding») que o plano
//    gratuito inclui. Sete pedidos por semana ficam muito abaixo dos limites diários.
//  - Claude, pago: cada dia é um pedido ao Claude Opus 5.5 com pesquisas na web (o preço por pesquisa e por token
//    está na página de preços da Anthropic), limitado por EFEMERIDES_CLAUDE_PESQUISAS.
//
// Os pedidos são feitos por HTTP direto (fetch), sem o SDK @anthropic-ai/sdk: o projeto instala as dependências
// com «npm ci» a partir do package-lock.json, e acrescentar o SDK obriga a regenerar esse ficheiro.
import fs from "node:fs";
import { sleep } from "../util.js";

const KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODELO = () => process.env.EFEMERIDES_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// motores com chave, por ordem: o escolhido no .env primeiro (EFEMERIDES_MOTOR), depois os outros. Quando um esgota a
// quota (429) ou recusa a chave, o mesmo dia passa ao seguinte. O Claude (pago) só entra se for o escolhido ou se não
// houver escolha: com EFEMERIDES_MOTOR=gemini ou groq, a reserva é só o outro gratuito
const CHAVES = { claude: () => KEY, gemini: () => process.env.GEMINI_API_KEY, groq: () => process.env.GROQ_API_KEY };
export const motoresDisponiveis = () => {
  const m = String(process.env.EFEMERIDES_MOTOR || "").toLowerCase();
  if (m === "0" || m === "nenhum") return [];
  const ordem = m === "gemini" || m === "groq" ? [m, "gemini", "groq"] : ["claude", "gemini", "groq"];
  return [...new Set(ordem)].filter((x) => CHAVES[x]?.());
};
const GROQ_API = (process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const GROQ_MODELO = () => process.env.EFEMERIDES_GROQ_MODEL || "groq/compound";
const NOME = { claude: "Claude", gemini: "Gemini (gratuito)", groq: "Groq (gratuito)" };
const BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const MODELO = process.env.EFEMERIDES_CLAUDE_MODEL || "claude-opus-5-5";
const ESFORCO = process.env.EFEMERIDES_CLAUDE_ESFORCO || "medium"; // low | medium | high | xhigh | max
const PESQUISAS = Math.max(1, Number(process.env.EFEMERIDES_CLAUDE_PESQUISAS) || 15); // pesquisas na web por dia
const FICHEIRO = new URL("../../data/efemerides-claude.json", import.meta.url);
const PAUSA_429 = (Number(process.env.EFEMERIDES_PAUSA_429_MIN) || 60) * 60e3;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// instruções fixas (iguais em todos os pedidos, para a cache de prompts)
const SISTEMA = `És um investigador de história do desporto que escreve em português de Portugal para a secção «Nesta semana» de um site de notícias desportivas.

Para a data e os anos indicados, encontra os acontecimentos desportivos que marcaram esse dia exato nesses anos: finais e títulos, jogos e resultados históricos, recordes, estreias e despedidas marcantes, transferências e contratações que fizeram história, fundações de clubes e competições, tragédias e momentos que mudaram uma modalidade. Inclui tanto o desporto português (seleções, clubes como Benfica, FC Porto, Sporting, Sp. Braga e Vitória SC, atletas e treinadores portugueses no estrangeiro, futsal, hóquei em patins, atletismo, ciclismo, ténis, automobilismo, modalidades olímpicas) como o internacional. O futebol e o futsal têm prioridade, sem excluir as outras modalidades.

Regras:
- Usa a pesquisa na web para confirmar cada acontecimento. Só entram acontecimentos que aconteceram nesse dia exato (dia e mês) desse ano; se a data não estiver confirmada, deixa-o de fora.
- Para cada ano, até 3 acontecimentos, os mais marcantes; pelo menos um português quando houver. Se não encontrares nada fiável para um ano, não inventes: omite o ano.
- Título curto (até 90 caracteres) e descrição de uma a duas frases, factual, com nomes, resultados e números confirmados.
- Indica a fonte (o endereço da página onde confirmaste o facto).
- Quando terminares, chama a ferramenta guardar_efemerides uma única vez com todos os acontecimentos.`;

const FERRAMENTA = {
  name: "guardar_efemerides",
  description: "Guarda os acontecimentos desportivos encontrados para a data pedida. Chamar uma vez, no fim, com a lista completa.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["acontecimentos"],
    properties: {
      acontecimentos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["ano", "ambito", "modalidade", "titulo", "descricao", "fonte", "importancia"],
          properties: {
            ano: { type: "integer", description: "Ano em que aconteceu" },
            ambito: { type: "string", enum: ["portugal", "internacional"], description: "portugal se envolve atletas, clubes, seleções ou competições portuguesas" },
            modalidade: { type: "string", description: "futebol, futsal, hoquei em patins, basquetebol, andebol, atletismo, ciclismo, tenis, automobilismo…" },
            titulo: { type: "string" },
            descricao: { type: "string" },
            fonte: { type: "string", description: "URL da página onde o facto foi confirmado" },
            importancia: { type: "string", enum: ["alta", "media"] },
          },
        },
      },
    },
  },
};

const MOD = { futebol: "futebol", futsal: "futsal", "hoquei em patins": "hoquei", hóquei: "hoquei", basquetebol: "basquetebol", andebol: "andebol", voleibol: "voleibol" };
const modDe = (m) => {
  const k = String(m || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return Object.entries(MOD).find(([n]) => k.includes(n.normalize("NFD").replace(/[̀-ͯ]/g, "")))?.[1] || (k ? k : null);
};

async function pedir(corpo) {
  const res = await fetch(`${BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      // se o pedido for recusado pelas salvaguardas, a API repete-o noutro modelo (fallbacks: "default")
      "anthropic-beta": "server-side-fallback-2026-07-01",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10 * 60e3),
  });
  if (!res.ok) {
    const e = new Error(`Claude respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// um dia: a data e os anos; devolve a lista de acontecimentos
export async function pesquisarDia({ ano, mes, dia }, anos) {
  const lista = anos.map((a) => `${a} (há ${ano - a} ${ano - a === 1 ? "ano" : "anos"})`).join(", ");
  const messages = [{
    role: "user",
    content: `Data: ${dia} de ${MESES[mes - 1]}.\nAnos: ${lista}.\n\nQue acontecimentos desportivos, portugueses e internacionais, marcaram o dia ${dia} de ${MESES[mes - 1]} em cada um destes anos?`,
  }];
  for (let volta = 0; volta < 6; volta++) {
    const r = await pedir({
      model: MODELO,
      max_tokens: 16000,
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: ESFORCO },
      cache_control: { type: "ephemeral" }, // as voltas de «pause_turn» reenviam a conversa toda: fica em cache
      system: SISTEMA,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: PESQUISAS }, FERRAMENTA],
      tool_choice: { type: "auto" },
      messages,
    });
    if (r.stop_reason === "refusal") throw new Error(`pedido recusado (${r.stop_details?.category || "sem categoria"})`);
    const chamada = (r.content || []).find((b) => b.type === "tool_use" && b.name === FERRAMENTA.name);
    if (chamada) return Array.isArray(chamada.input?.acontecimentos) ? chamada.input.acontecimentos : [];
    // a pesquisa na web corre do lado da Anthropic em ciclos; «pause_turn» quer dizer que ainda não acabou
    if (r.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: r.content }); continue; }
    // acabou sem chamar a ferramenta: pede-se que guarde o que encontrou
    if (r.stop_reason === "end_turn" && volta < 5) {
      messages.push({ role: "assistant", content: r.content });
      messages.push({ role: "user", content: "Guarda agora os acontecimentos que confirmaste, com a ferramenta guardar_efemerides." });
      continue;
    }
    throw new Error(`o Claude parou sem guardar a lista (${r.stop_reason})`);
  }
  throw new Error("demasiadas voltas sem resposta final");
}

// O mesmo pedido ao Gemini, com a pesquisa Google. A pesquisa e o JSON estruturado nem sempre andam juntos nos
// modelos do plano gratuito, por isso pede-se o JSON no texto e lê-se com tolerância.
const SISTEMA_GEMINI = SISTEMA.replace(/- Quando terminares, chama a ferramenta guardar_efemerides[^\n]*/, `- No fim, responde APENAS com um objeto JSON, sem mais texto: {"acontecimentos": [{"ano": 2016, "ambito": "portugal" ou "internacional", "modalidade": "futebol", "titulo": "…", "descricao": "…", "fonte": "https://…", "importancia": "alta" ou "media"}]}. Se não houver nada confirmado, {"acontecimentos": []}.`);

export function lerJsonGemini(texto) {
  const t = String(texto || "").replace(/```(?:json)?/gi, "");
  const i = t.indexOf("{");
  const f = t.lastIndexOf("}");
  if (i < 0 || f < i) throw new Error("o Gemini não devolveu a lista em JSON");
  const j = JSON.parse(t.slice(i, f + 1));
  return (Array.isArray(j.acontecimentos) ? j.acontecimentos : [])
    .filter((x) => x && Number.isInteger(+x.ano) && typeof x.titulo === "string" && x.titulo.trim())
    .map((x) => ({
      ano: +x.ano, ambito: x.ambito === "portugal" ? "portugal" : "internacional", modalidade: String(x.modalidade || ""),
      titulo: x.titulo.trim().slice(0, 140), descricao: String(x.descricao || "").trim().slice(0, 500),
      fonte: String(x.fonte || ""), importancia: x.importancia === "alta" ? "alta" : "media",
    }));
}

export async function pesquisarDiaGemini({ ano, mes, dia }, anos) {
  const lista = anos.map((a) => `${a} (há ${ano - a} ${ano - a === 1 ? "ano" : "anos"})`).join(", ");
  const res = await fetch(`${GEMINI_API}/models/${GEMINI_MODELO()}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA_GEMINI }] },
      contents: [{ role: "user", parts: [{ text: `Data: ${dia} de ${MESES[mes - 1]}.\nAnos: ${lista}.\n\nQue acontecimentos desportivos, portugueses e internacionais, marcaram o dia ${dia} de ${MESES[mes - 1]} em cada um destes anos? Pesquisa no Google para confirmar cada um.` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(5 * 60e3),
  });
  if (!res.ok) {
    const e = new Error(`Gemini respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  const texto = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!texto && j.promptFeedback?.blockReason) throw new Error(`pedido recusado pelo Gemini (${j.promptFeedback.blockReason})`);
  return lerJsonGemini(texto);
}

// O mesmo pedido ao Groq (plano gratuito, com chave GROQ_API_KEY). Os modelos que cada conta tem variam (a do site
// respondeu «groq/compound does not exist or you do not have access to it»), por isso pergunta-se ao Groq que modelos
// há e usa-se o primeiro com pesquisa na web: os «compound» (pesquisam sozinhos) e os gpt-oss com a ferramenta
// browser_search. O que funcionar fica escolhido. API compatível com a da OpenAI; o JSON vem no texto, como no Gemini
const GROQ_CANDIDATOS = () => [
  ...[process.env.EFEMERIDES_GROQ_MODEL, "groq/compound", "groq/compound-mini", "compound-beta", "compound-beta-mini"].filter(Boolean).map((modelo) => ({ modelo })),
  { modelo: "openai/gpt-oss-120b", pesquisa: true },
  { modelo: "openai/gpt-oss-20b", pesquisa: true },
].filter((c, i, a) => a.findIndex((x) => x.modelo === c.modelo) === i);
let groqEscolhido = null;
let groqModelos = { ts: 0, ids: null };
// o que se sabe do Groq, para /api/efemerides/estado: os modelos da conta e as últimas tentativas (modelo, resposta, tempo)
const estadoGroq = { modelos: null, escolhido: null, tentativas: [] };
const tentativaGroq = (x) => { estadoGroq.tentativas.unshift({ ts: Date.now(), ...x }); estadoGroq.tentativas.length = Math.min(estadoGroq.tentativas.length, 12); };
const PRAZO_GROQ = (Number(process.env.EFEMERIDES_GROQ_PRAZO_S) || 120) * 1000;
const cabGroq = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` });
async function modelosGroq() {
  if (Date.now() - groqModelos.ts < 3600e3) return groqModelos.ids;
  let ids = null;
  try {
    const r = await fetch(`${GROQ_API}/models`, { headers: cabGroq(), signal: AbortSignal.timeout(20000) });
    if (r.ok) ids = new Set(((await r.json()).data || []).map((m) => m.id));
  } catch { /* fica por saber: experimentam-se todos */ }
  groqModelos = { ts: Date.now(), ids };
  estadoGroq.modelos = ids ? [...ids].slice(0, 40) : null;
  return ids;
}
export async function pesquisarDiaGroq({ ano, mes, dia }, anos) {
  const lista = anos.map((a) => `${a} (há ${ano - a} ${ano - a === 1 ? "ano" : "anos"})`).join(", ");
  const ids = await modelosGroq();
  const candidatos = groqEscolhido ? [groqEscolhido] : GROQ_CANDIDATOS().filter((c) => !ids || ids.has(c.modelo));
  if (!candidatos.length) throw new Error(`nenhum modelo do Groq com pesquisa na web nesta conta (há: ${[...(ids || [])].slice(0, 12).join(", ")})`);
  let ultimo = null;
  for (const c of candidatos) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(`${GROQ_API}/chat/completions`, {
        method: "POST",
        headers: cabGroq(),
        body: JSON.stringify({
          model: c.modelo,
          messages: [
            { role: "system", content: SISTEMA_GEMINI },
            { role: "user", content: `Data: ${dia} de ${MESES[mes - 1]}.\nAnos: ${lista}.\n\nQue acontecimentos desportivos, portugueses e internacionais, marcaram o dia ${dia} de ${MESES[mes - 1]} em cada um destes anos? Pesquisa na web para confirmar cada um.` },
          ],
          temperature: 0.3,
          ...(c.pesquisa ? { tools: [{ type: "browser_search" }], tool_choice: "required" } : {}),
        }),
        signal: AbortSignal.timeout(PRAZO_GROQ),
      });
    } catch (e) {
      // sem resposta dentro do prazo (ou ligação falhada): experimenta-se o modelo seguinte
      tentativaGroq({ modelo: c.modelo, erro: e.message, ms: Date.now() - t0 });
      ultimo = e;
      groqEscolhido = null;
      continue;
    }
    if (res.ok) {
      tentativaGroq({ modelo: c.modelo, status: res.status, ms: Date.now() - t0 });
      groqEscolhido = c;
      estadoGroq.escolhido = c.modelo;
      const j = await res.json();
      return lerJsonGemini(j.choices?.[0]?.message?.content || "");
    }
    const texto = (await res.text()).slice(0, 300);
    tentativaGroq({ modelo: c.modelo, status: res.status, ms: Date.now() - t0, erro: texto.slice(0, 200) });
    const e = new Error(`Groq (${c.modelo}) respondeu ${res.status}: ${texto}`);
    e.status = res.status;
    // modelo que esta conta não tem, ou que não aceita a ferramenta de pesquisa: experimenta-se o seguinte
    if (res.status === 404 || (res.status === 400 && /model|tool|browser_search/i.test(e.message))) { ultimo = e; groqEscolhido = null; continue; }
    throw e;
  }
  throw ultimo || new Error("nenhum modelo do Groq respondeu");
}
const PESQUISAR = { claude: (d, anos) => pesquisarDia(d, anos), gemini: (d, anos) => pesquisarDiaGemini(d, anos), groq: (d, anos) => pesquisarDiaGroq(d, anos) };
const MODELO_DE = { claude: () => MODELO, gemini: () => GEMINI_MODELO(), groq: () => groqEscolhido?.modelo || GROQ_MODELO() };

export function createEfemeridesClaude({ log = () => {} } = {}) {
  let dados = {};
  try { dados = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { dados = {}; }
  const motores = motoresDisponiveis();
  const estado = { ativo: motores.length > 0, motor: motores[0] || null, motores, modelo: motores[0] ? MODELO_DE[motores[0]]() : null, dias: {}, erros: {}, pausas: {} };
  if (motores.includes("groq")) estado.groq = estadoGroq;
  if (!motores.length) log("[Nesta semana] sem GEMINI_API_KEY, GROQ_API_KEY nem ANTHROPIC_API_KEY: a pesquisa na web de cada dia está desligada");
  else log(`[Nesta semana] pesquisa na web de cada dia: ${motores.map((m) => `${NOME[m]} (${MODELO_DE[m]()})`).join(", depois ")}`);
  let aCorrer = false;
  const pausas = {}; // motor → até quando fica parado (quota esgotada ou chave recusada)
  const livres = () => motores.filter((m) => !(Date.now() < (pausas[m] || 0)));
  const pausar = (m, ms) => {
    pausas[m] = Date.now() + ms;
    estado.pausas[m] = pausas[m];
    estado.pausaAte = Math.max(...Object.values(pausas));
  };
  const gravar = () => { try { fs.mkdirSync(new URL("../../data", import.meta.url), { recursive: true }); fs.writeFileSync(FICHEIRO, JSON.stringify(dados)); } catch { /* */ } };

  // o resultado de cada motor para um dia: { gemini: { ok, at, modelo, itens }, groq: … } (os dias gravados antes,
  // com um só motor, ficam no mesmo formato)
  const doDia = (iso) => {
    const x = dados[iso];
    if (!x) return {};
    if (x.porMotor) return x.porMotor;
    return x.ok ? { [x.motor || "claude"]: x } : {};
  };

  // pesquisa os dias da semana (hoje primeiro) com todos os motores livres ao mesmo tempo: cada um faz os dias que ainda
  // não tem; os acontecimentos dos vários motores juntam-se em itens(). Chama aoChegar a cada resultado novo
  async function semana(sem, anosDoDia, aoChegar = () => {}) {
    if (!livres().length || aCorrer) return;
    aCorrer = true;
    try {
      // guarda só a semana atual
      for (const k of Object.keys(dados)) if (!sem.dias.some((d) => d.iso === k)) delete dados[k];
      const iHoje = Math.max(0, sem.dias.findIndex((d) => d.iso === sem.hoje));
      for (const d of [...sem.dias.slice(iHoje), ...sem.dias.slice(0, iHoje)]) {
        const faltam = livres().filter((m) => !doDia(d.iso)[m]?.ok);
        if (!faltam.length) continue;
        const anos = anosDoDia(d);
        if (!anos.length) continue;
        const validos = new Set(anos);
        const feitos = await Promise.all(faltam.map(async (m) => {
          try {
            const lista = await PESQUISAR[m](d, anos);
            const r = { ok: true, at: Date.now(), modelo: MODELO_DE[m](), itens: lista.filter((x) => validos.has(x.ano) && x.titulo) };
            dados[d.iso] = { porMotor: { ...doDia(d.iso), [m]: r } };
            log(`[Nesta semana] ${m}: ${r.itens.length} acontecimentos para ${d.iso}`);
            return true;
          } catch (e) {
            estado.erros[d.iso] = `${m}: ${e.message}`;
            log(`[Nesta semana] ${m} (${d.iso}): ${e.message}`);
            // chave errada: o motor fica parado um dia; quota esgotada: uma hora (os outros dias também levavam 429 e
            // gastavam o que a quota ainda deixasse); os outros motores continuam
            if (e.status === 401 || e.status === 403) pausar(m, 24 * 3600e3);
            else if (e.status === 429) pausar(m, PAUSA_429);
            return false;
          }
        }));
        if (feitos.some(Boolean)) {
          estado.dias[d.iso] = Object.fromEntries(Object.entries(doDia(d.iso)).map(([m, r]) => [m, r.itens.length]));
          if (Object.keys(doDia(d.iso)).length >= motores.length) delete estado.erros[d.iso];
          gravar();
          aoChegar();
        }
        if (!livres().length) break;
        if (!feitos.some(Boolean)) await sleep(5e3);
      }
    } finally { aCorrer = false; }
  }

  // itens no formato do «Nesta semana»: os de todos os motores, com os repetidos (mesmo ano e título parecido) juntos num
  // só, que diz quem o encontrou (motores)
  const palavras = (t) => new Set(String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3));
  const parecidos = (a, b) => {
    const A = palavras(a), B = palavras(b);
    if (!A.size || !B.size) return false;
    let comuns = 0;
    for (const w of A) if (B.has(w)) comuns++;
    return comuns / Math.min(A.size, B.size) >= 0.6;
  };
  function itens(sem) {
    const anoDe = new Map(sem.dias.map((d) => [d.iso, d.ano]));
    const ordem = (m) => { const i = motores.indexOf(m); return i < 0 ? 99 : i; };
    const out = [];
    for (const d of sem.dias) {
      const juntos = [];
      for (const [m, r] of Object.entries(doDia(d.iso)).sort(([a], [b]) => ordem(a) - ordem(b))) {
        for (const x of r.itens || []) {
          const igual = juntos.find((y) => y.x.ano === x.ano && parecidos(y.x.titulo, x.titulo));
          if (igual) { if (!igual.motores.includes(m)) igual.motores.push(m); if (x.importancia === "alta") igual.alta = true; }
          else juntos.push({ x, motores: [m], alta: x.importancia === "alta" });
        }
      }
      for (const [i, { x, motores: quem, alta }] of juntos.entries()) {
        const pt = x.ambito === "portugal";
        out.push({
          id: `cl:${d.iso}:${x.ano}:${i}`, tipo: "acontecimento", ano: x.ano, dia: d.iso, anos: anoDe.get(d.iso) - x.ano,
          texto: `${x.titulo}${x.descricao ? ` — ${x.descricao}` : ""}`, mod: modDe(x.modalidade) || undefined,
          portugues: pt, link: /^https?:\/\//.test(x.fonte || "") ? x.fonte : null, claude: true, motor: quem[0], motores: quem,
          // confirmado por mais de um motor: sobe na lista
          peso: 120 + (pt ? 40 : 0) + (alta ? 20 : 0) + (quem.length > 1 ? 15 : 0),
        });
      }
    }
    return out;
  }

  return { semana, itens, estado: () => estado };
}

export const _groqTeste = { limpar: () => { groqEscolhido = null; groqModelos = { ts: 0, ids: null }; estadoGroq.tentativas.length = 0; }, estado: () => estadoGroq };
