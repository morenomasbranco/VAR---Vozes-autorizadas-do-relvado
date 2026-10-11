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

try { const r = await j("/api/retransmissor"); linha("== pontes ==", JSON.stringify(r.encaminhamento?.pontes), "porSite", JSON.stringify(r.encaminhamento?.porSite).slice(0, 600)); } catch (e) { linha("pontes: erro", e.message); }
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

// o YouTube visto por pontes que não precisam de nada configurado (para quando o servidor não chega ao YouTube)
const { lerStreams } = await import("../server/pt/youtube.js").catch(() => ({}));
for (const [nome, fazer] of [
  ["Jina (POST, html)", (u) => fetch("https://r.jina.ai/", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Return-Format": "html", "X-No-Cache": "true" }, body: JSON.stringify({ url: u }) }).then(async (r) => { const t = await r.text(); try { const j = JSON.parse(t); return j.data?.html || j.data?.content || ""; } catch { return t; } })],
  ["YouTube RSS direto", (u) => fetch("https://www.youtube.com/feeds/videos.xml?channel_id=UCXSPgjw-KXn86J_upO98LWg").then((r) => r.text())],
]) {
  try {
    const t0 = Date.now();
    const html = await fazer("https://www.youtube.com/@AFViseuTV/streams");
    const st = lerStreams ? lerStreams(html) : null;
    linha(`== ${nome} ==`, html.length, "bytes em", Date.now() - t0, "ms ·", st ? `${st.vistos} vídeos lidos, ${st.lista.length} diretos/agendados ${JSON.stringify(st.lista.map((d) => d.titulo))}` : "sem ytInitialData", "· ytInitialData:", /ytInitialData/.test(html));
  } catch (e) { linha(nome, "erro", e.message); }
}

// os títulos da Sport TV, tal como o servidor os lê (sem a etiqueta «Novo» nem a duração)
try {
  const { lerPagina } = await import("../server/sources/sporttv.js");
  const r = await fetch("https://www.sporttv.pt/videos/1/mais-recentes", { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" } });
  const lista = lerPagina(await r.text());
  linha("== Sport TV ==", r.status, lista.length, "vídeos");
  for (const v of lista.slice(0, 10)) linha("   ", v.title);
} catch (e) { linha("Sport TV: erro", e.message); }

// Sen7ir: as últimas notícias de desporto e a coluna para onde cada uma vai (AF Viseu, Modalidades ou nenhuma)
try {
  const fs = await import("node:fs");
  const { dePosts2, passaFiltro } = await import("../server/sources/rss.js");
  const ofic = JSON.parse(fs.readFileSync(new URL("../oficiais.json", import.meta.url))).fontes.find((s) => s.id === "sen7ir-futebol");
  const mod = JSON.parse(fs.readFileSync(new URL("../fontes.json", import.meta.url))).rss.find((s) => s.id === "sen7ir-modalidades");
  if (ofic) {
    const r = await fetch(ofic.url);
    const f = dePosts2(await r.json(), ofic.artigo);
    linha("== Sen7ir ==", r.status, f.items.length, "notícias");
    for (const it of f.items) {
      const t = `${it.title} ${it.contentSnippet}`;
      const porque = !passaFiltro(ofic, t) && new RegExp(ofic.filtro, "i").test(t) ? `  [excluída por «${t.match(new RegExp(ofic.exclui, "i"))[0]}»]` : "";
      linha("  ", (passaFiltro(ofic, t) ? "AF VISEU   " : passaFiltro(mod, t) ? "MODALIDADES" : "nenhuma    "), "|", it.isoDate?.slice(0, 10), "|", it.title.slice(0, 90) + porque);
    }
  }
} catch (e) { linha("Sen7ir: erro", e.message); }
