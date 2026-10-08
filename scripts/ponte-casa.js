// Ponte de casa do VAR: corre num computador de casa e faz, pela ligação de casa, os pedidos que os sites
// recusam ao servidor (FPF, Sofascore, Instagram, Facebook…). Não precisa de mais nada além do Node.js.
//
//   node ponte-casa.js https://o-teu-site.code.run A-TUA-PT_TOKEN
//
// (ou VAR_URL e PT_TOKEN no ambiente). Para o Mac não adormecer enquanto corre:
//   caffeinate -i node ponte-casa.js https://o-teu-site.code.run A-TUA-PT_TOKEN
//
// O computador só faz pedidos aos sites da lista do servidor; o servidor diz o que pedir, este programa pede
// e devolve a resposta. Pode ficar a correr dias seguidos; se a ligação cair, volta a tentar sozinho.
const SITE = (process.argv[2] || process.env.VAR_URL || "").replace(/\/$/, "");
const TOKEN = process.argv[3] || process.env.PT_TOKEN || "";
if (!/^https?:\/\//.test(SITE) || !TOKEN) {
  console.log("Uso: node ponte-casa.js https://o-teu-site A-TUA-PT_TOKEN");
  process.exit(1);
}
const SITES = /(^|\.)(fpf\.pt|sofascore\.com|instagram\.com|facebook\.com|imginn\.com|picnob\.com|pixwox\.com|anonyig\.com|storiesig\.info|fastdl\.app)$/;
const auth = { Authorization: `Bearer ${TOKEN}` };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString("pt-PT");
let feitos = 0, falhas = 0, ultimoAviso = 0;

async function fazer(t) {
  let resposta;
  try {
    const host = new URL(t.url).hostname;
    if (!SITES.test(host)) throw new Error(`site não permitido: ${host}`);
    const r = await fetch(t.url, { method: t.metodo || "GET", headers: t.cabecalhos || {}, redirect: t.redirect === "manual" ? "manual" : "follow", signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 10e6) throw new Error("resposta grande demais");
    resposta = { id: t.id, status: r.status, cabecalhos: Object.fromEntries(r.headers), corpo: buf.toString("base64") };
    feitos++;
  } catch (e) {
    resposta = { id: t.id, erro: e.message };
    falhas++;
  }
  await fetch(`${SITE}/api/ponte/resposta`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(resposta) }).catch(() => {});
}

console.log(`[${hora()}] Ponte de casa ligada a ${SITE}. Deixa esta janela aberta.`);
for (;;) {
  try {
    const r = await fetch(`${SITE}/api/ponte/trabalho?n=4`, { headers: auth, signal: AbortSignal.timeout(35000) });
    if (r.status === 401) { console.log(`[${hora()}] O site recusou a chave: confirma que é a mesma PT_TOKEN que está no servidor.`); await espera(60e3); continue; }
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
    const lote = await r.json();
    await Promise.all(lote.map(fazer));
    if (Date.now() - ultimoAviso > 5 * 60e3) {
      ultimoAviso = Date.now();
      console.log(`[${hora()}] ${feitos} pedidos feitos${falhas ? `, ${falhas} falharam` : ""}.`);
    }
  } catch (e) {
    console.log(`[${hora()}] Sem ligação ao site (${e.message}); tento outra vez daqui a 15 s.`);
    await espera(15e3);
  }
}
