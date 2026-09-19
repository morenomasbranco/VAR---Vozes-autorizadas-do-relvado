// Lista as ligas da GOAL API (id, nome, país). Uso: npm run ligas -- portugal
import "dotenv/config";

const q = (process.argv[2] || "").toLowerCase();
const BASE = process.env.GOAL_API_BASE || "https://api.goal-api.com/v1";
if (!process.env.GOAL_API_KEY) { console.error("Falta GOAL_API_KEY no .env"); process.exit(1); }
let offset = 0;
for (let page = 0; page < 30; page++) {
  const res = await fetch(`${BASE}/leagues?limit=100&offset=${offset}`, { headers: { Authorization: `Bearer ${process.env.GOAL_API_KEY}` } });
  const body = await res.json();
  if (!res.ok) { console.error(res.status, JSON.stringify(body).slice(0, 300)); process.exit(1); }
  for (const l of body.data || []) {
    const name = l.name || l.league_name || "";
    const country = l.country?.name || l.country || l.countryName || l.country_name || "";
    const line = `${String(l.id ?? l.league_id).padEnd(8)} ${name}  (${typeof country === "string" ? country : JSON.stringify(country)})`;
    if (!q || line.toLowerCase().includes(q)) console.log(line);
  }
  if (!body.pagination?.hasMore) break;
  offset += 100;
}
console.log("\nPara fixar uma liga pelo id, junta \"id\": \"...\" à entrada correspondente no ligas.json.");
