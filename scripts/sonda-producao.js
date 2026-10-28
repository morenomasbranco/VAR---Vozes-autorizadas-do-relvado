// Sonda do site em produção: as fontes oficiais de Portugal (FPF e Liga), as notícias que estão na coluna «Portugal»
// e as transmissões do YouTube das Distritais, o Sen7ir e os sinónimos do Glossário. Também experimenta o Google News da FPF diretamente.
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

// Glossário: os sites de sinónimos e antónimos lidos daqui (com o leitor do servidor) e a resposta do site em produção
try {
  const { createGlossario } = await import("../server/glossario.js");
  const g = createGlossario();
  for (const [p, tipo] of [["vitória", "sinonimos"], ["vitória", "antonimos"], ["estádio", "sinonimos"], ["traquejo", "sinonimos"], ["xptoabc", "sinonimos"]]) {
    const r = await g.procurar(p, tipo).catch((e) => ({ erro: e.message }));
    linha(`== Glossário (${tipo} de ${p}) ==`, r.erro || `[${r.fonte}]`, r.erro ? "" : r.sentidos.map((s) => `${s.sentido || "—"}: ${s.palavras.slice(0, 8).join(", ")}`).join(" | ") || "(nada)");
  }
  const { lerWiki } = await import("../server/glossario.js");
  for (const p of ["vitória", "golo", "derrota"]) {
    const w = await fetch(`https://pt.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(p)}`, { headers: { "User-Agent": "Mozilla/5.0 (VAR glossário)" } }).then((r) => r.json()).catch((e) => ({ erro: e.message }));
    linha(`== Wikcionário (${p}) ==`, w.erro || `sinónimos: ${lerWiki(w.parse?.wikitext, "sinonimos").flatMap((x) => x.palavras).join(", ") || "—"} · antónimos: ${lerWiki(w.parse?.wikitext, "antonimos").flatMap((x) => x.palavras).join(", ") || "—"}`);
  }
  const prod = await fetch(`${SITE}/api/glossario/palavra?p=vit%C3%B3ria&tipo=sinonimos`, { signal: AbortSignal.timeout(30000) });
  linha("== Glossário em produção ==", prod.status, (await prod.text()).slice(0, 400));
} catch (e) { linha("Glossário: erro", e.message); }
try {
  linha("== Glossário: estado em produção ==", JSON.stringify(await j("/api/glossario/estado")));
} catch (e) { linha("Glossário: erro", e.message); }

// Instagram pela API oficial: o que a Meta responde (sem a chave)
try {
  linha("== Instagram (API oficial) ==", JSON.stringify(await j("/api/distritais/teste-instagram-api?conta=fcporto")).slice(0, 1500));
} catch (e) { linha("Instagram (API oficial): erro", e.message); }

// YouTube das associações, lido daqui: quantos vídeos tem a página «Diretos» de cada canal, quantos estão em direto ou
// agendados para o leitor do servidor, e os títulos e etiquetas dos três primeiros (para ver o que escapa ao leitor)
try {
  const { canaisBase, urlCanal, lerStreams } = await import("../server/pt/youtube.js");
  for (const c of canaisBase().filter((x) => x.canal)) {
    const r = await fetch(`${urlCanal(c.canal)}/streams`, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pt-PT,pt;q=0.9" }, signal: AbortSignal.timeout(20000) }).catch((e) => ({ erro: e.message }));
    if (r.erro) { linha(`YT ${c.id}: erro ${r.erro}`); continue; }
    const html = await r.text();
    const s = lerStreams(html);
    const primeiros = html.split('"lockupViewModel":').slice(1, 4).map((b) => {
      const bloco = b.slice(0, 7000);
      const titulo = bloco.match(/"lockupMetadataViewModel":\{"title":\{"content":"([^"]{0,80})/)?.[1] || "?";
      const etiquetas = [...new Set([...bloco.matchAll(/"(?:text|badgeStyle)":"([^"]{2,40})"/g)].map((m) => m[1]).filter((t) => !/^https?:/.test(t)))].slice(0, 6).join(" | ");
      return `${titulo} [${etiquetas}]`;
    });
    linha(`YT ${c.id.padEnd(18)} ${r.status} vídeos ${s?.vistos ?? "?"} · direto/agendados ${s ? s.lista.length : "?"}${s?.lista.length ? ` (${s.lista.map((v) => v.titulo.slice(0, 50)).join("; ")})` : ""}`);
    for (const p of primeiros) linha(`     ${p}`);
  }
} catch (e) { linha("YouTube: erro", e.message); }

// Logótipos dos clubes (fotografia da página de Facebook): alguns exemplos e o estado
try {
  for (const [nome, org] of [["Académico de Viseu", "af-viseu"], ["Lusitano FC Vildemoinhos", "af-viseu"], ["Oliveirense", "fpf"], ["CD Cinfães", "af-viseu"]]) {
    const r = await fetch(`${SITE}/api/distritais/logo?nome=${encodeURIComponent(nome)}&org=${org}`, { signal: AbortSignal.timeout(30000) }).catch((e) => ({ status: e.message, headers: new Headers() }));
    const n = r.arrayBuffer ? (await r.arrayBuffer()).byteLength : 0;
    linha(`== logótipo ${nome} == ${r.status} ${r.headers.get("content-type") || ""} ${n} bytes`);
  }
  linha("== logótipos: estado ==", JSON.stringify(await j("/api/distritais/logos/estado")));
} catch (e) { linha("logótipos: erro", e.message); }

// Jogos de hoje (a faixa das Distritais): quanto tempo demora a resposta, quantos jogos e quantos das distritais à Liga 3
try {
  const t0 = Date.now();
  const r = await fetch(`${SITE}/api/pt/aovivo`, { signal: AbortSignal.timeout(60000) });
  const l = await r.json();
  const NAC = /liga 3|campeonato de portugal|campeonato (de futebol )?dos a[cç]ores/i;
  const base = l.filter((j) => (j.mod || "futebol") === "futebol" && (String(j.org || "").startsWith("af-") || (j.org === "fpf" && NAC.test(j.compNome || ""))));
  const estados = {};
  for (const j of base) estados[j.estado] = (estados[j.estado] || 0) + 1;
  linha(`== /api/pt/aovivo == ${r.status} em ${Date.now() - t0} ms · ${l.length} jogos · das distritais à Liga 3: ${base.length} ${JSON.stringify(estados)} · com logótipo: ${base.filter((j) => j.logoCasa || j.logoFora).length}`);
  for (const j of base.slice(0, 6)) linha(`   ${j.compNome} | ${j.casa} ${j.hs ?? ""}-${j.as ?? ""} ${j.fora} | ${j.estado} | ${j.logoCasa || "-"}`);
  const t1 = Date.now();
  await fetch(`${SITE}/api/pt/aovivo`, { signal: AbortSignal.timeout(60000) }).then((x) => x.text());
  linha(`== /api/pt/aovivo (segunda vez) == ${Date.now() - t1} ms`);
} catch (e) { linha("aovivo: erro", e.message); }

// Resultados de Portugal: desde quando o servidor está ligado e o que tem carregado (competições e jogos)
try {
  const e = await j("/api/pt/estado");
  const p = e.pesquisa || {};
  linha(`== Portugal: arrancou ${new Date(e.arranque).toISOString()} · ${e.competicoes} competições · ${e.jogos} jogos · pesquisa ${p.ativo ? "ligada" : "desligada"}${p.pausaAte > Date.now() ? ` (em pausa até ${new Date(p.pausaAte).toISOString()})` : ""} · FPF: ${JSON.stringify(e.fpf?.ultimoErro || null).slice(0, 160)}`);
} catch (e) { linha("Portugal: erro", e.message); }
try { linha(`== cópia dos dados ao arrancar == ${JSON.stringify(await j("/api/copia/estado")).slice(0, 300)}`); } catch (e) { linha("cópia: erro", e.message); }

// Glossário: os jogos das distritais que o «Preparar um jogo» mostrava como em direto (o último acontecimento de cada
// jogo sem «final» há menos de 150 minutos) comparados com o estado do jogo no servidor
try {
  const ev = await j("/api/pt/eventos?limit=400");
  const est = new Map((await j("/api/pt/aovivo")).map((x) => [x.id, x]));
  const ult = new Map();
  for (const it of ev) {
    if (!it.score) continue;
    const k = `${it.score.comp}|${it.score.h}|${it.score.a}`;
    if (!ult.has(k) || (ult.get(k).upd || ult.get(k).ts) < (it.upd || it.ts)) ult.set(k, it);
  }
  const agora = Date.now();
  const antes = [...ult.values()].filter((it) => !it.score.ft && agora - (it.upd || it.ts) < 150 * 60000);
  linha(`== Glossário: jogos de Portugal que contavam como em direto == ${antes.length} (de ${ult.size})`);
  for (const it of antes.slice(0, 30)) {
    const e = est.get(it.pt?.jogo);
    linha(`   ${it.pt?.org || "?"} | ${it.score.comp} | ${it.score.h} ${it.score.hs}-${it.score.as} ${it.score.a} | último: ${it.id.split(":").slice(2, 3).join("") || "golo"} há ${Math.round((agora - (it.upd || it.ts)) / 60000)} min | estado no servidor: ${e ? e.estado : "fora da lista de hoje"}`);
  }
} catch (e) { linha("Glossário: erro", e.message); }

// Vídeos do Feed: de onde vêm, como se tocam (iframe, HLS ou MP4) e com que codec, para ver os que o Chrome e o Edge
// no Windows não conseguem tocar (o HEVC/H.265 dos iPhones, por exemplo, que o Safari toca e eles muitas vezes não)
try {
  const lista = await j("/api/videos/latest?limit=80");
  const tipos = {};
  for (const v of lista) { const k = `${v.source?.replace(/^t\.me\/.*/, "t.me") || "?"} · ${v.embed?.tipo || "sem leitor"}`; tipos[k] = (tipos[k] || 0) + 1; }
  linha(`== vídeos do Feed == ${lista.length}`, JSON.stringify(tipos));
  // os golos do u/Lazy_Banana_1636 no r/soccer (streamff), que vão sempre para os Destaques do Feed
  const lazy = lista.filter((v) => /^lazy_banana_1636$/i.test(v.author || ""));
  linha(`== vídeos do u/Lazy_Banana_1636 == ${lazy.length}`);
  for (const v of lazy.slice(0, 8)) linha(`   ${v.embed?.tipo || "sem leitor"} | ${v.video_url} | ${v.embed?.src || "-"} | ${v.title}`);
  // os que não têm leitor no site (abrem no site de origem): o endereço e o que a página de cada um oferece
  const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" };
  for (const v of lista.filter((x) => !x.embed).slice(0, 30)) {
    let extra = "";
    try {
      const tg = v.video_url.match(/^https:\/\/t\.me\/([^/]+)\/(\d+)/);
      const url = tg ? `https://t.me/${tg[1]}/${tg[2]}?embed=1&mode=tme` : v.video_url;
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) });
      const h = (await r.text()).slice(0, 2e6);
      extra = `${r.status} ${new URL(r.url).hostname} | video src: ${(h.match(/<video[^>]+src="([^"]+)"/)?.[1] || "-").slice(0, 60)} | og:video: ${(h.match(/og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)/i)?.[1] || "-").slice(0, 60)} | grande: ${/too big|VIEW IN TELEGRAM|message_media_not_supported/i.test(h) ? "sim" : "não"} | m3u8/mp4 no html: ${(h.match(/https?:[^"'\s]+\.(?:mp4|m3u8)[^"'\s]*/i)?.[0] || "-").slice(0, 70)}`;
    } catch (err) { extra = `erro ${err.message}`; }
    const min = (t) => (t ? `${Math.round((Date.now() - t) / 60000)} min` : "?");
    linha(`   SEM LEITOR ${v.source} | ${v.video_url} | publicado há ${min(v.created_time)} · no site há ${min(v.first_seen)} | ${extra}`);
  }
  // os vídeos grandes do Telegram, servidos pelo próprio site (precisam da conta do Telegram, TG_SESSION)
  for (const v of lista.filter((x) => x.embed?.servidor).slice(0, 3)) {
    const r = await fetch(SITE + v.embed.src, { headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(30000) }).catch((e) => ({ status: e.message, headers: new Headers() }));
    linha(`   TELEGRAM PELO SITE ${v.embed.src} | ${r.status} ${r.headers.get("content-type") || ""} ${r.headers.get("content-range") || ""}`);
  }
  try { const e = await j("/api/videos/estado"); const pr = e.procura; linha(`== vídeos: conta do Telegram ligada: ${e.contaTelegram} · encontrados depois: ${e.encontradosDepois || 0} · última procura: ${pr ? `começou há ${Math.round((Date.now() - pr.inicio) / 60000)} min, ${pr.fila} vídeo(s), ${pr.fim ? `acabou em ${Math.round((pr.fim - pr.inicio) / 1000)} s` : "AINDA A DECORRER"}` : "-"}`); } catch (e) { linha("estado dos vídeos: erro", e.message); }
  // Sport TV sem leitor: o manifesto que a página do vídeo usa e o que a Kaltura responde
  for (const v of lista.filter((x) => !x.embed && /sporttv/.test(x.video_url)).slice(0, 3)) {
    try {
      const h = (await (await fetch(v.video_url, { headers: UA, signal: AbortSignal.timeout(12000) })).text()).replace(/\\\//g, "/").replace(/&amp;/g, "&");
      const entry = v.video_url.match(/\/video\/(\d_[a-z0-9]{8})/i)?.[1];
      const us = h.match(/https:\/\/cdnapisec\.kaltura\.com\/p\/\d+\/[^"'\s<>]*playManifest[^"'\s<>]*/gi) || [];
      const u = us.find((x) => x.includes(entry)) || us[0];
      const r = u ? await fetch(u, { signal: AbortSignal.timeout(12000) }) : null;
      linha(`   KALTURA ${entry} | ${us.length} manifesto(s) na página | ${u || "-"} | ${r ? `${r.status} ${(await r.text()).slice(0, 60).replace(/\s+/g, " ")}` : ""}`);
    } catch (err) { linha(`   KALTURA erro ${err.message}`); }
  }
  const codecs = (b) => ["avc1", "hvc1", "hev1", "av01", "vp09", "mp4a", "Opus"].filter((c) => b.includes(c)).join(",") || "?";
  for (const v of lista.filter((x) => x.embed && x.embed.tipo !== "iframe" && !x.embed.servidor).slice(0, 40)) {
    const e = v.embed;
    try {
      if (e.tipo === "hls") {
        const t = await fetch(e.src, { signal: AbortSignal.timeout(15000) }).then((r) => r.text());
        linha(`   HLS ${v.source} | ${(t.match(/CODECS="([^"]+)"/g) || []).slice(0, 3).join(" ") || "sem CODECS"} | mp4 de reserva: ${e.mp4 ? "sim" : "não"} | ${String(v.title).slice(0, 50)}`);
      } else {
        const r = await fetch(e.src, { headers: { Range: "bytes=0-300000" }, signal: AbortSignal.timeout(15000) });
        const b = Buffer.from(await r.arrayBuffer()).toString("latin1");
        linha(`   MP4 ${v.source} | ${r.status} ${r.headers.get("content-type")} | codecs ${codecs(b)} | moov no início: ${b.includes("moov") ? "sim" : "não"} | ${new URL(e.src).hostname} | ${String(v.title).slice(0, 50)}`);
      }
    } catch (err) { linha(`   ${e.tipo} ${v.source} | erro ${err.message} | ${String(v.title).slice(0, 50)}`); }
  }
} catch (e) { linha("vídeos: erro", e.message); }

// «Nesta semana»: o estado das fontes (Wikipédia, Wikidata, ESPN, pesquisa na web) e o que o site recebe, por tipo e por dia
try {
  const e = await j("/api/efemerides/estado");
  linha(`== Nesta semana: estado == semana ${e.semana} · revisto ${e.at ? `há ${Math.round((Date.now() - e.at) / 60000)} min` : "nunca"}${e.emCurso ? ` · a construir há ${Math.round((Date.now() - e.emCurso) / 60000)} min` : ""} · contagem ${JSON.stringify(e.contagem)} · erros ${JSON.stringify(e.erros).slice(0, 1500)}`);
  linha(`   pesquisa na web: ${JSON.stringify(e.claude || null).slice(0, 3000)}`);
  linha(`   Wikipédia pelo GitHub: ${JSON.stringify(e.wikiGitHub || null)}`);
  const d = await j("/api/efemerides?lang=pt");
  const porTipo = {}, porDia = {};
  for (const x of d.itens || []) { porTipo[x.tipo] = (porTipo[x.tipo] || 0) + 1; porDia[x.dia] = (porDia[x.dia] || 0) + 1; }
  linha(`== Nesta semana (pt) == pronto ${d.pronto} · completo ${d.completo} · hoje ${d.hoje} · dias ${JSON.stringify(d.dias)} · ${d.itens?.length || 0} itens · por tipo ${JSON.stringify(porTipo)} · por dia ${JSON.stringify(porDia)}`);
  for (const t of Object.keys(porTipo)) {
    for (const x of d.itens.filter((y) => y.tipo === t).slice(0, 3)) linha(`   ${t} | ${x.dia} | há ${x.anos} anos | ${String(x.texto || x.nome || x.titulo || JSON.stringify(x)).slice(0, 120)}`);
  }
} catch (e) { linha("Nesta semana: erro", e.message); }
// as fontes do «Nesta semana» vistas daqui (GitHub), para separar uma fonte em baixo de um bloqueio ao servidor do site
try {
  const UA = { "User-Agent": "VAR-feed/1.0 (https://github.com/morenomasbranco/VAR---Vozes-autorizadas-do-relvado; agregador de notícias de desporto)", Accept: "application/json" };
  const hoje = new Date();
  const mm = String(hoje.getUTCMonth() + 1).padStart(2, "0"), dd = String(hoje.getUTCDate()).padStart(2, "0");
  for (const u of [`https://pt.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`, `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`, `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${mm}/${dd}`]) {
    const t0 = Date.now();
    try {
      const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
      const d = r.ok ? await r.json() : null;
      linha(`== Wikipédia daqui == ${r.status} em ${Date.now() - t0} ms | ${u} | ${d ? Object.entries(d).map(([k, v]) => `${k} ${Array.isArray(v) ? v.length : "?"}`).join(" · ") : (await r.text().catch(() => "")).slice(0, 200)}`);
    } catch (err) { linha(`== Wikipédia daqui == erro ${err.message} | ${u}`); }
  }
  const t0 = Date.now();
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent("SELECT ?e WHERE { ?e wdt:P31 wd:Q16466010 } LIMIT 3")}`, { headers: { ...UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(60000) });
  linha(`== Wikidata daqui == ${r.status} em ${Date.now() - t0} ms`);
} catch (e) { linha("fontes do Nesta semana: erro", e.message); }
// vídeos do Telegram servidos pelo site, pedidos como o Chrome os pede: «bytes=0-» (até 8 MB por resposta) e o fim do
// ficheiro (onde costuma estar o «moov» quando não está no início); quanto tempo até ao primeiro byte, se chega tudo
// o que o servidor promete (Content-Length) e com que codec (o HEVC/H.265 não toca no Chrome de muitos Windows)
try {
  const lista = await j("/api/videos/latest?limit=120");
  const tg = lista.filter((v) => v.embed?.servidor);
  const alvo = ["/api/videos/tg/twclipshdeuropa/6616", ...tg.map((v) => v.embed.src)].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
  linha(`== Telegram no leitor == ${tg.length} vídeos do Telegram servidos pelo site`);
  const codecs = (b) => ["avc1", "hvc1", "hev1", "av01", "vp09", "mp4a", "Opus"].filter((c) => b.includes(c)).join(",") || "?";
  for (const src of alvo) {
    for (const range of ["bytes=0-", "fim"]) {
      const t0 = Date.now();
      try {
        let pedido = range;
        if (range === "fim") {
          const h = await fetch(SITE + src, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(60000) });
          const total = Number((h.headers.get("content-range") || "").split("/")[1]);
          await h.arrayBuffer().catch(() => {});
          if (!total) { linha(`   ${src} | fim: sem tamanho (${h.status})`); continue; }
          pedido = `bytes=${Math.max(0, total - 2 * 1024 * 1024)}-${total - 1}`;
        }
        const r = await fetch(SITE + src, { headers: { Range: pedido }, signal: AbortSignal.timeout(120000) });
        const leitor = r.body.getReader();
        let recebidos = 0, primeiro = null;
        const pedacos = [];
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          if (primeiro === null) primeiro = Date.now() - t0;
          recebidos += value.length;
          if (pedacos.length < 40) pedacos.push(Buffer.from(value));
        }
        const b = Buffer.concat(pedacos).toString("latin1");
        linha(`   ${src} | ${pedido} → ${r.status} ${r.headers.get("content-type")} ${r.headers.get("content-range") || ""} | 1.º byte ${primeiro} ms · total ${Date.now() - t0} ms | recebidos ${recebidos} de ${r.headers.get("content-length")} | codecs ${codecs(b)} | moov: ${b.includes("moov") ? "sim" : "não"}`);
      } catch (err) { linha(`   ${src} | ${range} | erro ao fim de ${Date.now() - t0} ms: ${err.message}`); }
    }
  }
} catch (e) { linha("Telegram no leitor: erro", e.message); }

// Distritais e Feed: os acontecimentos de Portugal das últimas horas (de que organizador, nível e fonte) e os jogos de
// hoje que o site dá como em direto, para ver de onde vêm os resultados das associações que apareciam no Feed
try {
  const ev = await j("/api/pt/eventos?limit=120");
  const agora = Date.now();
  const recentes = ev.filter((e) => agora - e.ts < 6 * 3600e3);
  const porOrg = {};
  for (const e of recentes) { const k = `${e.pt?.org || "?"}/${e.pt?.nivel || "?"}`; porOrg[k] = (porOrg[k] || 0) + 1; }
  linha(`== Portugal: acontecimentos das últimas 6 horas == ${recentes.length}`, JSON.stringify(porOrg));
  for (const e of recentes.slice(0, 25)) linha(`   ${new Date(e.ts).toISOString().slice(11, 16)} | ${e.pt?.org} | ${e.pt?.nivel || "-"} | ${e.score?.comp} | ${String(e.t?.pt || "").replace(/==/g, "")} | fonte ${e.pt?.fonte || "-"}${e.pt?.conta ? ` @${e.pt.conta}` : ""}`);
  const vivo = await j("/api/pt/aovivo");
  const porEstado = {};
  for (const x of vivo) { const k = `${x.estado}${x.semInfo ? "+semInfo" : ""}${x.semHora ? "+semHora" : ""}`; porEstado[k] = (porEstado[k] || 0) + 1; }
  linha(`== Portugal: jogos de hoje == ${vivo.length}`, JSON.stringify(porEstado));
  for (const x of vivo.filter((x) => ["direto", "intervalo"].includes(x.estado) || x.semInfo).slice(0, 25)) {
    linha(`   ${x.org} | ${x.nivel} | ${x.compNome} | ${x.casa} ${x.hs ?? ""}-${x.as ?? ""} ${x.fora} | ${x.estado}${x.semInfo ? " (sem info)" : ""} | início ${x.inicio ? new Date(x.inicio).toISOString().slice(11, 16) : "?"}${x.semHora ? " (sem hora)" : ""} | via ${x.via || x.origem || "-"} | fontes ${JSON.stringify((x.fontes || []).map((f) => `${f.tipo}${f.conta ? `@${f.conta}` : ""}`))}`);
  }
} catch (e) { linha("Portugal (acontecimentos e jogos de hoje): erro", e.message); }

// Curiosidades dos jogos: o resumo da ESPN visto daqui (que campos traz) e a resposta do site para um jogo da ESPN
try {
  const sb = await (await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/scoreboard", { signal: AbortSignal.timeout(20000) })).json();
  const ev = (sb.events || [])[0];
  if (ev) {
    const r = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/summary?event=${ev.id}`, { signal: AbortSignal.timeout(20000) })).json();
    const h2h = (r.headToHeadGames || []).flatMap((g) => g.events || []);
    linha(`== ESPN resumo (${ev.name}) == campos: ${Object.keys(r).join(", ")}`);
    linha(`   headToHeadGames: ${h2h.length} jogos · exemplo ${JSON.stringify(h2h[0] || null).slice(0, 400)}`);
    linha(`   form: ${JSON.stringify((r.boxscore?.form || r.lastFiveGames || []).map((f) => ({ team: f.team?.id, r: (f.events || []).map((e) => e.gameResult).join("") })))}`);
    linha(`   standings: ${(r.standings?.groups || []).flatMap((g) => g.standings?.entries || []).length} linhas · exemplo ${JSON.stringify((r.standings?.groups || [])[0]?.standings?.entries?.[0] || null).slice(0, 300)}`);
    linha(`   gameInfo: ${JSON.stringify(r.gameInfo || null).slice(0, 400)}`);
    linha(`   seasonseries: ${(r.seasonseries || []).length} · exemplo ${JSON.stringify((r.seasonseries || [])[0]?.events?.[0] || null).slice(0, 500)}`);
    linha(`   lastFiveGames (um jogo): ${JSON.stringify((r.lastFiveGames || [])[0]?.events?.[0] || null).slice(0, 400)}`);
    const comps = r.header?.competitions?.[0]?.competitors || [];
    linha(`   equipas: ${comps.map((c) => `${c.homeAway}:${c.team?.id}:${c.team?.displayName}`).join(" | ")}`);
  }
  const itens = await j("/api/items?limit=1500");
  const jogo = (Array.isArray(itens) ? itens : itens.items || []).find((x) => x.score && String(x.id).startsWith("r:espn:"));
  if (jogo) {
    const c = await j(`/api/glossario/curiosidades?h=${encodeURIComponent(jogo.score.h)}&a=${encodeURIComponent(jogo.score.a)}&comp=${encodeURIComponent(jogo.score.comp || "")}`);
    linha(`== curiosidades no site (${jogo.score.h} x ${jogo.score.a}) ==`, JSON.stringify(c).slice(0, 1500));
  }
} catch (e) { linha("curiosidades: erro", e.message); }

// IA: os modelos sem quota, o gasto da tradução e os últimos pedidos
try {
  const d = await j("/api/declaracoes/estado");
  linha("== IA ==", JSON.stringify({ motores: d.ia?.motores, semQuota: d.ia?.modelosSemQuota, pausados: d.ia?.pausados }));
  for (const u of (d.ia?.ultimos || []).slice(0, 12)) linha(`   ${new Date(u.ts).toISOString().slice(11, 19)} | ${u.uso} | ${u.motor} ${u.modelo || ""} | ${u.erro ? `erro: ${u.erro.slice(0, 160)}` : `ok ${u.ms} ms${u.tokens ? ` · ${u.tokens} tokens` : ""}`}`);
  const t = await j("/api/tradutor/estado");
  linha("== tradutor ==", JSON.stringify({ pedidas: t.pedidas, feitas: t.feitas, semQuota: t.semQuota, viaIA: t.viaIA, viaGoogle: t.viaGoogle, viaGemini: t.viaGemini, fila: t.fila, ia: t.ia }));
  linha("   Google Tradutor:", JSON.stringify(t.googleTradutor), "· Gemini em pausa até", t.pausadoAte ? new Date(t.pausadoAte).toISOString() : "-");
} catch (e) { linha("IA: erro", e.message); }

// «Hoje no VAR»: a imagem das notícias mais fortes das últimas horas (de onde vem e quanto demora)
try {
  const itens = await j("/api/items?limit=800");
  const agora = Date.now();
  const fortes = (Array.isArray(itens) ? itens : []).filter((x) => !x.score && !x.board && x.src !== "resultados" && agora - x.ts < 18 * 3600e3)
    .sort((a, b) => ((b.imp || 0) * 3 + (b.also?.length || 0) * 2) - ((a.imp || 0) * 3 + (a.also?.length || 0) * 2)).slice(0, 8);
  linha(`== imagens das manchetes == ${fortes.length} notícias`);
  for (const x of fortes) {
    const t0 = Date.now();
    const r = await fetch(`${SITE}/api/noticias/imagem/${encodeURIComponent(x.id)}`, { signal: AbortSignal.timeout(40000) }).catch((e) => ({ status: `erro ${e.message}`, headers: { get: () => "" } }));
    const tam = r.arrayBuffer ? (await r.arrayBuffer()).byteLength : 0;
    linha(`   ${r.status} ${r.headers.get("content-type") || ""} ${Math.round(tam / 1024)} KB · ${Date.now() - t0} ms | ${(x.url || "").slice(0, 90)} | ${String(x.t?.pt || "").replace(/==/g, "").slice(0, 70)}`);
  }
  linha("   estado:", JSON.stringify(await j("/api/noticias/imagens/estado")));
} catch (e) { linha("imagens das manchetes: erro", e.message); }
