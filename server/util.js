export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
// janela da recolha inicial: no arranque só entram posts das últimas horas
export const BACKFILL_MS = (Number(process.env.RECOLHA_INICIAL_HORAS) || 12) * 3600e3;
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
