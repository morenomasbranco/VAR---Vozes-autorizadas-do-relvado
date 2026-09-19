// Contas do Bluesky, recebidas em tempo real pelo Jetstream (stream público e gratuito do Bluesky).
import WebSocket from "ws";
import { BACKFILL_MS } from "../util.js";

const API = process.env.BSKY_API || "https://public.api.bsky.app/xrpc";
const JETSTREAM = process.env.BSKY_JETSTREAM || "wss://jetstream2.us-east.bsky.network/subscribe";

export async function resolveHandle(handle) {
  const res = await fetch(`${API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  const body = await res.json();
  if (!body.did) throw new Error(`não encontrei a conta ${handle}`);
  return body.did;
}

export async function recentPosts(did, limit = 10) {
  const res = await fetch(`${API}/app.bsky.feed.getAuthorFeed?actor=${did}&limit=${limit}&filter=posts_no_replies`);
  const body = await res.json();
  return (body.feed || []).filter((f) => !f.reason).map((f) => ({ rkey: f.post.uri.split("/").pop(), record: f.post.record }));
}

export async function startBluesky(sources, onPost, log) {
  if (!sources.length) return;
  const byDid = new Map();

  const emit = (s, did, rkey, rec) => {
    if (!rec?.text || rec.reply) return; // respostas ficam de fora
    const ts = Date.parse(rec.createdAt) || Date.now();
    if (Date.now() - ts > BACKFILL_MS) return;
    onPost({
      postId: `bsky:${did}:${rkey}`,
      src: s.id,
      name: s.nome,
      via: "Bluesky",
      url: `https://bsky.app/profile/${s.handle}/post/${rkey}`,
      text: rec.text.slice(0, 1500),
      lang: rec.langs?.[0] || s.lang,
      ts,
    });
  };

  for (const s of sources) {
    try {
      const did = await resolveHandle(s.handle);
      byDid.set(did, s);
      (await recentPosts(did)).reverse().forEach((p) => emit(s, did, p.rkey, p.record));
    } catch (e) {
      log(`[Bluesky] ${s.handle}: ${e.message}`);
    }
  }
  if (!byDid.size) return;

  let cursor = null; // retoma do ponto onde parou depois de uma quebra de ligação
  const connect = () => {
    const q = new URLSearchParams([["wantedCollections", "app.bsky.feed.post"], ...[...byDid.keys()].map((d) => ["wantedDids", d])]);
    if (cursor) q.set("cursor", String(cursor));
    const ws = new WebSocket(`${JETSTREAM}?${q}`);
    ws.on("open", () => log(`[Bluesky] a ouvir ${byDid.size} conta(s)`));
    ws.on("message", (buf) => {
      try {
        const ev = JSON.parse(buf);
        if (ev.time_us) cursor = ev.time_us;
        const c = ev.commit;
        if (ev.kind !== "commit" || c?.operation !== "create" || c.collection !== "app.bsky.feed.post") return;
        const s = byDid.get(ev.did);
        if (s) emit(s, ev.did, c.rkey, c.record);
      } catch { /* mensagem inválida */ }
    });
    ws.on("error", (e) => log(`[Bluesky] ${e.message}`));
    ws.on("close", () => setTimeout(connect, 3000));
  };
  connect();
}
