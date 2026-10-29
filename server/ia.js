// Os modelos de linguagem que o site usa fora do «Neste dia» (Ferramentas: Declarações, Prosebot, sinónimos de frases e
// as curiosidades dos jogos): o Groq e o Gemini (gratuitos) e o Claude (pago), os que tiverem chave. Experimenta-se um de
// cada vez, pela ordem de IA_MOTORES (por omissão groq, gemini, claude) ou pela que cada uso pedir (as crónicas começam
// pelo Gemini). O Claude sem quota (429) fica de parte uma hora; no Groq e no Gemini, cada modelo fica de parte o tempo
// que o próprio motor indicar (no Gemini, a quota do dia volta à meia-noite da Califórnia).
// O JSON vem no texto da resposta (nem todos os modelos gratuitos o dão de outra maneira), e lê-se com tolerância.
const GROQ_API = (process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const GEMINI_API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const CLAUDE_API = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const CHAVES = { groq: () => process.env.GROQ_API_KEY, gemini: () => process.env.GEMINI_API_KEY, claude: () => process.env.ANTHROPIC_API_KEY };
const NOME = { groq: "Groq", gemini: "Gemini", claude: "Claude" };
// os modelos do Groq, do preferido para o seguinte (um que a conta não tenha, ou que já gastou a quota do dia, passa ao
// próximo). A quota é por modelo e o «Neste dia» gasta a do gpt-oss-120b, por isso aqui começa-se pelos outros. Com
// pesquisa na web, os «compound» pesquisam sozinhos e os gpt-oss usam a ferramenta browser_search
const GROQ_TEXTO = () => [process.env.IA_GROQ_MODEL, "qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"].filter(Boolean);
const GROQ_PESQUISA = () => [
  ...[process.env.IA_GROQ_MODEL_PESQUISA, "groq/compound", "groq/compound-mini"].filter(Boolean).map((modelo) => ({ modelo })),
  { modelo: "openai/gpt-oss-120b", ferramenta: true }, { modelo: "openai/gpt-oss-20b", ferramenta: true },
];
const GEMINI_MODELO = () => process.env.IA_GEMINI_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const CLAUDE_MODELO = () => process.env.IA_CLAUDE_MODEL || "claude-opus-5-5";
// o esforço do Claude (quanto pensa antes de responder): «medium» chega para escrever e é mais rápido
const CLAUDE_ESFORCO = () => process.env.IA_CLAUDE_ESFORCO || "medium";
const PRAZO = (Number(process.env.IA_PRAZO_S) || 90) * 1000;
const PAUSA_429 = 3600e3;

const pausa = {}; // motor → até quando fica de parte (429)
// modelo do Groq → até quando está sem quota (o Groq diz quanto falta: «Please try again in 10m5.2s»)
const pausaModelo = {};
export function esperaDoGroq(texto) {
  const m = String(texto || "").match(/try again in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i);
  if (!m || !(m[1] || m[2] || m[3])) return 15 * 60e3;
  return Math.min(24 * 3600e3, ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000 + 30e3);
}
// A quota gratuita do Gemini volta à meia-noite da Califórnia (8 ou 9 da manhã em Lisboa)
export function proximaMeiaNoitePacifico(agora = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(agora)).map((x) => [x.type, x.value]));
  const passou = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000;
  return agora - passou + 86400e3 + 60e3; // e um minuto de margem
}
// o que diz um 429 do Gemini: quanto esperar (RetryInfo) e se foi a quota do dia que acabou
export function lerRecusa(texto, agora = Date.now()) {
  let j = null;
  try { j = JSON.parse(texto); } catch { /* texto simples */ }
  const det = j?.error?.details || [];
  const espera = det.map((d) => String(d.retryDelay || "").match(/^([\d.]+)s$/)?.[1]).find(Boolean);
  const quotas = det.flatMap((d) => d.violations || []).map((v) => `${v.quotaId || ""} ${v.quotaMetric || ""}`).join(" ");
  const diaria = /PerDay|per_day|daily/i.test(quotas) || (/quota/i.test(texto) && !espera && !/PerMinute/i.test(quotas));
  // «limit: 0»: este modelo não tem quota gratuita nenhuma (por exemplo, a pesquisa Google nos 3.x)
  const semQuota = /limit:\s*0\b/i.test(texto) || det.flatMap((d) => d.violations || []).some((v) => String(v.quotaValue ?? "") === "0");
  return { diaria: diaria || semQuota, semQuota, ate: semQuota ? agora + 86400e3 : diaria ? proximaMeiaNoitePacifico(agora) : agora + Math.max(60e3, (Number(espera) || 60) * 1000) };
}
const ultimos = []; // os últimos pedidos, para /api/ia/estado
const registar = (x) => { ultimos.unshift({ ts: Date.now(), ...x }); ultimos.length = Math.min(ultimos.length, 15); };

export const motoresIA = () => String(process.env.IA_MOTORES || "groq,gemini,claude").split(",").map((m) => m.trim())
  .filter((m) => CHAVES[m]?.());

// o primeiro objeto JSON do texto (com ou sem ```json à volta)
export function lerJson(texto) {
  // (os modelos que pensam alto, como o Qwen, põem o raciocínio entre <think></think> antes da resposta)
  const t = String(texto || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const i = t.indexOf("{");
  const f = t.lastIndexOf("}");
  if (i < 0 || f < i) throw new Error("a resposta não trouxe JSON");
  return JSON.parse(t.slice(i, f + 1));
}

const erro = async (quem, res) => {
  const e = new Error(`${quem} respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  e.status = res.status;
  return e;
};

// O raciocínio antes da resposta conta para a quota e demora: numa tarefa simples (a tradução), o mínimo. Nos
// gpt-oss, reasoning_effort «low»; no qwen, «none» desliga-o (o qwen pensava 20 a 50 segundos em cada lote de títulos)
const semRaciocinio = new Set(); // modelos que recusaram a opção
function raciocinio(modelo, esforco) {
  if (!esforco || semRaciocinio.has(modelo)) return {};
  if (/gpt-oss/.test(modelo)) return { reasoning_effort: esforco === "none" ? "low" : esforco };
  if (/qwen/.test(modelo) && (esforco === "low" || esforco === "none")) return { reasoning_effort: "none" };
  return {};
}

async function groq({ sistema, pedido, pesquisa, temperatura, modelosGroq, esforco }) {
  const cab = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` };
  const candidatos = pesquisa ? GROQ_PESQUISA() : (modelosGroq || GROQ_TEXTO()).map((modelo) => ({ modelo }));
  let ultimo = null;
  for (let i = 0; i < candidatos.length; i++) {
    const c = candidatos[i];
    if (pausaModelo[c.modelo] > Date.now()) { ultimo ||= Object.assign(new Error(`Groq (${c.modelo}) sem quota até ${new Date(pausaModelo[c.modelo]).toISOString()}`), { status: 429 }); continue; }
    const pensar = raciocinio(c.modelo, esforco);
    const res = await fetch(`${GROQ_API}/chat/completions`, {
      method: "POST", headers: cab, signal: AbortSignal.timeout(PRAZO),
      body: JSON.stringify({
        model: c.modelo, temperature: temperatura,
        messages: [{ role: "system", content: sistema }, { role: "user", content: pedido }],
        ...(c.ferramenta ? { tools: [{ type: "browser_search" }], tool_choice: "required" } : {}),
        ...pensar,
      }),
    });
    // um modelo que não aceita a opção do raciocínio: fica a saber-se e repete-se o pedido sem ela
    if (res.status === 400 && Object.keys(pensar).length) {
      const t = await res.clone().text().catch(() => "");
      if (/reasoning/i.test(t)) { semRaciocinio.add(c.modelo); i--; continue; }
    }
    if (res.ok) {
      const j = await res.json();
      const texto = j.choices?.[0]?.message?.content || "";
      // uma resposta cortada (o modelo gastou os tokens a pensar ou o texto não coube) ou sem o JSON pedido: o modelo
      // seguinte pode conseguir
      const fim = j.choices?.[0]?.finish_reason;
      try { lerJson(texto); } catch {
        ultimo = new Error(`Groq (${c.modelo}) ${fim === "length" ? "cortou a resposta no limite de tokens" : "respondeu sem o JSON pedido"} (${j.usage?.completion_tokens ?? "?"} tokens)`);
        continue;
      }
      return { texto, modelo: c.modelo, tokens: j.usage?.total_tokens ?? null };
    }
    ultimo = await erro(`Groq (${c.modelo})`, res);
    if (res.status === 429) pausaModelo[c.modelo] = Date.now() + esperaDoGroq(ultimo.message);
    // modelo que esta conta não tem, que não aceita a ferramenta, sem quota ou com um limite por minuto mais pequeno do
    // que o pedido (413): experimenta-se o seguinte
    if (res.status === 404 || res.status === 413 || res.status === 429 || (res.status === 400 && /model|tool|browser_search|parsing/i.test(ultimo.message))) continue;
    throw ultimo;
  }
  throw ultimo || new Error("nenhum modelo do Groq respondeu");
}

// No Gemini, cada modelo tem a sua quota gratuita (por minuto e por dia), e a do GEMINI_MODEL gasta-se com as notícias:
// quem pede uma lista de modelos («modelosGemini») passa ao seguinte quando um fica sem quota (429: o tempo que o Gemini
// disser, ou até a quota do dia voltar), não existe (404) ou responde sem o JSON pedido. Sem pesquisa na web, a resposta
// vem em modo JSON.
async function gemini({ sistema, pedido, pesquisa, temperatura, modelosGemini }) {
  let ultimo = null;
  for (const modelo of modelosGemini?.length ? modelosGemini : [GEMINI_MODELO()]) {
    const k = `gemini:${modelo}`;
    if (pausaModelo[k] > Date.now()) { ultimo ||= Object.assign(new Error(`Gemini (${modelo}) sem quota até ${new Date(pausaModelo[k]).toISOString()}`), { status: 429 }); continue; }
    const res = await fetch(`${GEMINI_API}/models/${modelo}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(PRAZO),
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: "user", parts: [{ text: pedido }] }],
        ...(pesquisa ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { temperature: temperatura, ...(pesquisa ? {} : { responseMimeType: "application/json" }) },
      }),
    });
    if (res.ok) {
      const j = await res.json();
      const texto = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
      if (!texto && j.promptFeedback?.blockReason) throw new Error(`pedido recusado pelo Gemini (${j.promptFeedback.blockReason})`);
      try { lerJson(texto); } catch {
        ultimo = new Error(`Gemini (${modelo}) respondeu sem o JSON pedido (${j.candidates?.[0]?.finishReason || "?"})`);
        continue;
      }
      return { texto, modelo };
    }
    const txt = await res.text().catch(() => "");
    ultimo = Object.assign(new Error(`Gemini (${modelo}) respondeu ${res.status}: ${txt.slice(0, 300)}`), { status: res.status });
    if (res.status === 429) { pausaModelo[k] = lerRecusa(txt).ate; continue; }
    if (res.status === 404 || (res.status === 400 && /model/i.test(txt))) { pausaModelo[k] = Date.now() + 86400e3; continue; }
    throw ultimo;
  }
  throw ultimo || new Error("nenhum modelo do Gemini respondeu");
}

// O Claude pensa antes de responder (o esforço diz quanto) e, se recusar um pedido, a própria API passa-o ao modelo
// que a Anthropic recomenda para esse caso («fallbacks: "default"»)
async function claude({ sistema, pedido, pesquisa, maxTokens }) {
  const res = await fetch(`${CLAUDE_API}/v1/messages`, {
    method: "POST", signal: AbortSignal.timeout(PRAZO * 2),
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: JSON.stringify({
      model: CLAUDE_MODELO(), max_tokens: Math.max(maxTokens || 0, 16000), system: sistema,
      messages: [{ role: "user", content: pedido }],
      output_config: { effort: CLAUDE_ESFORCO() },
      fallbacks: "default",
      ...(pesquisa ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] } : {}),
    }),
  });
  if (!res.ok) throw await erro("Claude", res);
  const j = await res.json();
  if (j.stop_reason === "refusal") throw new Error(`o Claude recusou o pedido${j.stop_details?.category ? ` (${j.stop_details.category})` : ""}`);
  if (j.stop_reason === "max_tokens") throw new Error("o Claude cortou a resposta no limite de tokens");
  return { texto: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), modelo: j.model || CLAUDE_MODELO(), tokens: j.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : null };
}

const MOTOR = { groq, gemini, claude };

const MSG_QUOTA = "a IA gratuita chegou ao limite de hoje; volta a tentar mais tarde";

// pede a um motor de cada vez até um responder com JSON; devolve { json, motor, modelo, tokens }
// «motores» limita os motores (a tradução das notícias e as crónicas não usam o Claude, que é pago), «ordem» muda a ordem
// em que se experimentam (as crónicas começam pelo Gemini), «modelosGroq» e «modelosGemini» dizem os modelos de cada um,
// pela ordem (cada uso gasta de preferência a quota de um modelo diferente) e «maxTokens» é o tamanho máximo da resposta
// do Claude (com o que pensa; no Groq não se indica, porque o limite por minuto do plano gratuito conta-o como gasto)
export async function pedirIA({ sistema, pedido, pesquisa = false, temperatura = 0.4, uso = "", motores: so = null, ordem = null, modelosGroq = null, modelosGemini = null, esforco = null, maxTokens = null }) {
  // a pausa de um motor sem quota é por lista de modelos (a do Groq para a tradução não pára as Declarações)
  const chavePausa = (m) => (m === "groq" && modelosGroq ? `groq:${modelosGroq.join(",")}` : m);
  const comChave = motoresIA();
  const ordenados = ordem ? [...ordem.filter((m) => comChave.includes(m)), ...comChave.filter((m) => !ordem.includes(m))] : comChave;
  const motores = ordenados.filter((m) => !(pausa[chavePausa(m)] > Date.now()) && (!so || so.includes(m)));
  if (!motoresIA().length) throw Object.assign(new Error("a IA não está configurada no servidor"), { status: 503, codigo: "sem-chave", detalhe: "não há nenhuma chave de IA no servidor (GROQ_API_KEY, GEMINI_API_KEY ou ANTHROPIC_API_KEY)" });
  if (!motores.length) throw Object.assign(new Error(MSG_QUOTA), { status: 503, codigo: "quota", detalhe: "todos os motores em pausa por falta de quota" });
  const erros = [];
  for (const m of motores) {
    const t0 = Date.now();
    try {
      const r = await MOTOR[m]({ sistema, pedido, pesquisa, temperatura, modelosGroq, modelosGemini, esforco, maxTokens });
      const json = lerJson(r.texto);
      registar({ uso, motor: m, modelo: r.modelo, ms: Date.now() - t0, tokens: r.tokens ?? undefined });
      return { json, motor: NOME[m], modelo: r.modelo, tokens: r.tokens ?? null };
    } catch (e) {
      // (no Groq e no Gemini, cada modelo fica de parte o tempo que o motor disser — às vezes são segundos, um limite por
      // minuto; o Claude fica de parte uma hora)
      if (e.status === 429 && m === "claude") pausa[chavePausa(m)] = Date.now() + PAUSA_429;
      const msg = `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`;
      registar({ uso, motor: m, erro: msg.slice(0, 200), ms: Date.now() - t0 });
      erros.push({ quota: e.status === 429, texto: `${NOME[m]}: ${msg.slice(0, 160)}` });
    }
  }
  // para quem usa o site, a explicação em português; o erro técnico fica em «detalhe» (e no estado da IA)
  const quota = erros.some((x) => x.quota) && erros.every((x) => x.quota || /UND_ERR|fetch failed|timeout|aborted/i.test(x.texto));
  throw Object.assign(new Error(quota ? MSG_QUOTA : "a IA não respondeu agora; tenta daqui a pouco"), { status: quota ? 503 : 502, codigo: quota ? "quota" : "falhou", detalhe: `nenhum motor de IA respondeu (${erros.map((x) => x.texto).join(" · ")})` });
}

// Passar a fala de um vídeo a texto: o Whisper do Groq (gratuito, até 25 MB por ficheiro; o servidor manda só o som,
// em mp3 mono, por isso cabem uns 40 minutos)
export async function transcrever(audio, { nome = "audio.mp3", tipo = "audio/mpeg", lingua } = {}) {
  if (!process.env.GROQ_API_KEY) throw Object.assign(new Error("para passar vídeos a texto o servidor precisa da chave do Groq (GROQ_API_KEY)"), { status: 503 });
  const form = new FormData();
  form.append("file", new Blob([audio], { type: tipo }), nome);
  form.append("model", process.env.IA_WHISPER_MODEL || "whisper-large-v3");
  form.append("response_format", "verbose_json");
  if (lingua) form.append("language", lingua);
  const t0 = Date.now();
  const res = await fetch(`${GROQ_API}/audio/transcriptions`, {
    method: "POST", body: form, signal: AbortSignal.timeout(5 * 60e3),
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) {
    const e = await erro("Groq (Whisper)", res);
    registar({ uso: "transcrever", motor: "groq", erro: e.message.slice(0, 200), ms: Date.now() - t0 });
    throw e;
  }
  const j = await res.json();
  registar({ uso: "transcrever", motor: "groq", modelo: "whisper", ms: Date.now() - t0 });
  return { texto: String(j.text || "").trim(), lingua: j.language || null, duracao: j.duration || null };
}

export const estadoIA = () => ({
  motores: motoresIA(),
  modelosSemQuota: Object.fromEntries(Object.entries(pausaModelo).filter(([, t]) => t > Date.now()).map(([m, t]) => [m, new Date(t).toISOString()])),
  pausados: Object.fromEntries(Object.entries(pausa).filter(([, t]) => t > Date.now()).map(([m, t]) => [m, new Date(t).toISOString()])),
  ultimos,
});

export const _iaTeste = { limpar: () => { for (const k of Object.keys(pausa)) delete pausa[k]; for (const k of Object.keys(pausaModelo)) delete pausaModelo[k]; semRaciocinio.clear(); } };
