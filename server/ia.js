// Os modelos de linguagem que o site usa fora do «Neste dia» (Glossário › Declarações e as curiosidades dos jogos): o
// Groq e o Gemini (gratuitos) e o Claude, os que tiverem chave. Experimenta-se um de cada vez, pela ordem de
// IA_MOTORES (por omissão groq, gemini, claude); um que responda 429 (sem quota) fica de parte uma hora.
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
const CLAUDE_MODELO = () => process.env.IA_CLAUDE_MODEL || "claude-sonnet-5-5";
const PRAZO = (Number(process.env.IA_PRAZO_S) || 90) * 1000;
const PAUSA_429 = 3600e3;

const pausa = {}; // motor → até quando fica de parte (429)
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

async function groq({ sistema, pedido, pesquisa, temperatura, modelosGroq, esforco }) {
  const cab = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` };
  const candidatos = pesquisa ? GROQ_PESQUISA() : (modelosGroq || GROQ_TEXTO()).map((modelo) => ({ modelo }));
  let ultimo = null;
  for (const c of candidatos) {
    const res = await fetch(`${GROQ_API}/chat/completions`, {
      method: "POST", headers: cab, signal: AbortSignal.timeout(PRAZO),
      body: JSON.stringify({
        model: c.modelo, temperature: temperatura,
        messages: [{ role: "system", content: sistema }, { role: "user", content: pedido }],
        ...(c.ferramenta ? { tools: [{ type: "browser_search" }], tool_choice: "required" } : {}),
        // os gpt-oss pensam antes de responder, e o raciocínio conta para a quota: numa tarefa simples, pouco
        ...(esforco && /gpt-oss/.test(c.modelo) ? { reasoning_effort: esforco } : {}),
      }),
    });
    if (res.ok) {
      const j = await res.json();
      return { texto: j.choices?.[0]?.message?.content || "", modelo: c.modelo };
    }
    ultimo = await erro(`Groq (${c.modelo})`, res);
    // modelo que esta conta não tem, que não aceita a ferramenta ou sem quota: experimenta-se o seguinte
    if (res.status === 404 || res.status === 429 || (res.status === 400 && /model|tool|browser_search|parsing/i.test(ultimo.message))) continue;
    throw ultimo;
  }
  throw ultimo || new Error("nenhum modelo do Groq respondeu");
}

async function gemini({ sistema, pedido, pesquisa, temperatura }) {
  const res = await fetch(`${GEMINI_API}/models/${GEMINI_MODELO()}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(PRAZO),
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: pedido }] }],
      ...(pesquisa ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: temperatura },
    }),
  });
  if (!res.ok) throw await erro("Gemini", res);
  const j = await res.json();
  const texto = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!texto && j.promptFeedback?.blockReason) throw new Error(`pedido recusado pelo Gemini (${j.promptFeedback.blockReason})`);
  return { texto, modelo: GEMINI_MODELO() };
}

async function claude({ sistema, pedido, pesquisa }) {
  const res = await fetch(`${CLAUDE_API}/v1/messages`, {
    method: "POST", signal: AbortSignal.timeout(PRAZO * 2),
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: CLAUDE_MODELO(), max_tokens: 8000, system: sistema,
      messages: [{ role: "user", content: pedido }],
      ...(pesquisa ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] } : {}),
    }),
  });
  if (!res.ok) throw await erro("Claude", res);
  const j = await res.json();
  return { texto: (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""), modelo: CLAUDE_MODELO() };
}

const MOTOR = { groq, gemini, claude };

// pede a um motor de cada vez até um responder com JSON; devolve { json, motor, modelo }
// «motores» limita os motores (a tradução das notícias não usa o Claude, que é pago) e «modelosGroq» muda a ordem dos
// modelos do Groq (cada uso gasta de preferência a quota de um modelo diferente)
export async function pedirIA({ sistema, pedido, pesquisa = false, temperatura = 0.4, uso = "", motores: so = null, modelosGroq = null, esforco = null }) {
  // a pausa de um motor sem quota é por lista de modelos (a do Groq para a tradução não pára as Declarações)
  const chavePausa = (m) => (m === "groq" && modelosGroq ? `groq:${modelosGroq.join(",")}` : m);
  const motores = motoresIA().filter((m) => !(pausa[chavePausa(m)] > Date.now()) && (!so || so.includes(m)));
  if (!motoresIA().length) throw Object.assign(new Error("não há nenhuma chave de IA no servidor (GROQ_API_KEY, GEMINI_API_KEY ou ANTHROPIC_API_KEY)"), { status: 503 });
  if (!motores.length) throw Object.assign(new Error("os motores de IA estão sem quota por agora; tenta daqui a uma hora"), { status: 503 });
  const erros = [];
  for (const m of motores) {
    const t0 = Date.now();
    try {
      const r = await MOTOR[m]({ sistema, pedido, pesquisa, temperatura, modelosGroq, esforco });
      const json = lerJson(r.texto);
      registar({ uso, motor: m, modelo: r.modelo, ms: Date.now() - t0 });
      return { json, motor: NOME[m], modelo: r.modelo };
    } catch (e) {
      if (e.status === 429) pausa[chavePausa(m)] = Date.now() + PAUSA_429;
      const msg = `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`;
      registar({ uso, motor: m, erro: msg.slice(0, 200), ms: Date.now() - t0 });
      erros.push(`${NOME[m]}: ${msg.slice(0, 160)}`);
    }
  }
  throw Object.assign(new Error(`nenhum motor de IA respondeu (${erros.join(" · ")})`), { status: 502 });
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
  pausados: Object.fromEntries(Object.entries(pausa).filter(([, t]) => t > Date.now()).map(([m, t]) => [m, new Date(t).toISOString()])),
  ultimos,
});
