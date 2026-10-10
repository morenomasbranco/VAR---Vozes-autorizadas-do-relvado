// Sonda do site em produção: as fontes oficiais de Portugal (FPF e Liga), as notícias que estão na coluna «Portugal»
// e as transmissões do YouTube das Distritais. Também experimenta o Google News da FPF diretamente.
// Uso: SITE=https://o-teu-site node scripts/sonda-producao.js
const SITE = (process.env.SITE || "http://localhost:3001").replace(/\/$/, "");
const j = async (p) => { const r = await fetch(SITE + p, { signal: AbortSignal.timeout(30000) }); return r.json(); };
const linha = (...x) => console.log(...x);

try {
  const est = await j("/api/oficiais/estado");
  const fontes = (est.fontes || est || []).filter?.((f) => /^(fpf|ligaportugal)/.test(f.id)) || est;
  linha("== estado das fontes de Portugal ==");
  for (const f of Array.isArray(fontes) ? fontes : []) linha(JSON.stringify(f).slice(0, 600));
  if (!Array.isArray(fontes)) linha(JSON.stringify(est).slice(0, 3000));
} catch (e) { linha("estado: erro", e.message); }

try {
  const o = await j("/api/oficiais?limit=2500");
  const pt = (o.itens || []).filter((x) => x.grupo === "pt");
  const porOrg = {};
  for (const x of pt) porOrg[x.org] = (porOrg[x.org] || 0) + 1;
  linha("== coluna Portugal ==", pt.length, "itens", JSON.stringify(porOrg));
  for (const x of pt.slice(0, 8)) linha(new Date(x.ts).toISOString(), x.org, x.tipo, x.fonte, "|", x.titulo, "|", x.via || "", x.meio || "");
  linha("-- só FPF --");
  for (const x of pt.filter((x) => x.org === "FPF").slice(0, 25)) linha(new Date(x.ts).toISOString(), x.tipo, x.fonte, "|", x.titulo, "|", x.via || "", x.meio || "", x.site || "");
  const af = (o.itens || []).filter((x) => x.grupo === "af");
  linha("== associações ==", af.length, "itens");
} catch (e) { linha("oficiais: erro", e.message); }

try { const d = await j("/api/diagnostico"); linha("== diagnóstico ==", JSON.stringify(d).slice(0, 800)); } catch (e) { linha("diagnóstico: erro", e.message); }
try {
  const y = await j("/api/distritais/youtube");
  linha("== YouTube ==", "pedidos", y.pedidos, "erros", y.erros, JSON.stringify(y.ultimoErro));
  for (const c of y.canais || []) linha(c.id.padEnd(20), String(c.via).padEnd(16), "direto", c.emDireto, "agendados", c.agendados, "|", c.ultimaLeitura, "|", c.erro || "");
  const d = await j("/api/distritais/diretos");
  linha("diretos:", JSON.stringify(d).slice(0, 2500));
} catch (e) { linha("youtube: erro", e.message); }

// o Google News da FPF visto daqui
for (const q of ["site:www.fpf.pt", "site:fpf.pt", "fpf.pt", "\"Federação Portuguesa de Futebol\""]) {
  try {
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=pt-PT&gl=PT&ceid=PT:pt-150`);
    const x = await r.text();
    const itens = [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => ({ t: m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1], s: m[1].match(/<source url="([^"]*)">([^<]*)</)?.slice(1).join(" ") , d: m[1].match(/<pubDate>([^<]*)/)?.[1] }));
    linha(`== Google News «${q}» ==`, r.status, itens.length, "itens");
    for (const i of itens.slice(0, 8)) linha("  ", i.d, "|", i.s, "|", i.t);
  } catch (e) { linha(q, "erro", e.message); }
}
// a FPF vista daqui (o GitHub também é um centro de dados)
for (const u of ["https://www.fpf.pt/noticias", "https://www.fpf.pt/pt/News/Todas-as-notícias", "https://www.ligaportugal.pt/noticias"]) {
  try { const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" } }); const t = await r.text(); linha(u, r.status, t.length, /news\/\d+/.test(t) ? "tem notícias" : "sem notícias"); } catch (e) { linha(u, "erro", e.message); }
}
