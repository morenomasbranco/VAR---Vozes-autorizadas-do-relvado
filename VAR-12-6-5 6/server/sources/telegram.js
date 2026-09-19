// Canais públicos do Telegram, recebidos em tempo real através de uma conta Telegram normal (API gratuita).
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { BACKFILL_MS } from "../util.js";

const X_STATUS = /^https?:\/\/(www\.)?(x|twitter)\.com\/\w+\/status\/\d+/i;

// quando o canal republica um post do X, o link vai para o post original
function originalUrl(m, text) {
  const urls = [...(m.entities || []).map((e) => e.url).filter(Boolean), ...(text.match(/https?:\/\/\S+/g) || [])];
  return urls.find((u) => X_STATUS.test(u)) || null;
}

export async function startTelegram(sources, onPost, log) {
  if (!sources.length) return;
  const { TG_API_ID, TG_API_HASH, TG_SESSION } = process.env;
  if (!TG_API_ID || !TG_API_HASH || !TG_SESSION) {
    log("[Telegram] faltam TG_API_ID, TG_API_HASH ou TG_SESSION no .env; corre npm run telegram-login");
    return;
  }
  const client = new TelegramClient(new StringSession(TG_SESSION), Number(TG_API_ID), TG_API_HASH, { connectionRetries: 1000, autoReconnect: true });
  client.setLogLevel("error");
  await client.connect();

  const emit = (s, m) => {
    const text = (m.message || "").trim();
    if (!text || /^RT @/i.test(text)) return; // partilhas de posts de outras contas
    const ts = (m.date || 0) * 1000;
    if (Date.now() - ts > BACKFILL_MS) return;
    onPost({
      postId: `tg:${s.canal}:${m.id}`,
      src: s.id,
      name: s.nome,
      via: "Telegram",
      url: originalUrl(m, text) || `https://t.me/${s.canal}/${m.id}`,
      text: text.slice(0, 1500),
      lang: s.lang,
      ts,
    });
  };

  const byChannel = new Map();
  for (const s of sources) {
    try {
      const entity = await client.getEntity(s.canal);
      // só chegam atualizações de canais onde a conta está inscrita
      try { await client.invoke(new Api.channels.JoinChannel({ channel: entity })); } catch { /* já inscrita */ }
      byChannel.set(entity.id.toString(), s);
      const recent = await client.getMessages(entity, { limit: 10 });
      [...recent].reverse().forEach((m) => emit(s, m));
    } catch (e) {
      log(`[Telegram] ${s.canal}: ${e.message}`);
    }
  }

  client.addEventHandler((event) => {
    const m = event.message;
    const s = byChannel.get(m?.peerId?.channelId?.toString());
    if (s) emit(s, m);
  }, new NewMessage({}));
  log(`[Telegram] a ouvir ${byChannel.size} canal(is)`);
}
