// Ponte de casa do VAR: corre num computador de casa (Mac ou Windows) e faz, pela ligação de casa, os pedidos que os
// sites recusam ao servidor (FPF, Sofascore, Instagram, Facebook…). Só precisa do Node.js (nodejs.org).
//
//   node ponte-casa.js                                     (na primeira vez pergunta o endereço do site e a chave)
//   node ponte-casa.js https://o-teu-site.code.run A-TUA-PT_TOKEN
//
// No Windows também se pode arrancar com duplo clique no ponte-casa.bat (na mesma pasta).
// O endereço e a chave ficam guardados no ponte-casa.json, ao lado deste ficheiro. Enquanto a ponte corre, o
// computador não adormece (no Mac pelo «caffeinate», no Windows pelo próprio sistema); se a ligação cair, volta a
// tentar sozinha. O computador só faz pedidos aos sites da lista abaixo.
//
// (Escrito sem «import» no topo de propósito: assim funciona sozinho, descarregado fora do projeto.)
(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");
  const readline = await import("node:readline");

  const pasta = path.dirname(path.resolve(process.argv[1] || "."));
  const FICHEIRO = path.join(pasta, "ponte-casa.json");
  const hora = () => new Date().toLocaleTimeString("pt-PT");
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  // endereço do site e chave: argumentos, ambiente, ficheiro guardado ou pergunta
  let guardado = {};
  try { guardado = JSON.parse(fs.readFileSync(FICHEIRO, "utf8")); } catch { /* primeira vez */ }
  let SITE = process.argv[2] || process.env.VAR_URL || guardado.site || "";
  let TOKEN = process.argv[3] || process.env.PT_TOKEN || guardado.token || "";
  if (!SITE || !TOKEN) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const pergunta = (q) => new Promise((r) => rl.question(q, (x) => r(x.trim())));
    console.log("Primeira vez: preciso do endereço do teu site e da chave PT_TOKEN (a mesma que está no Northflank).");
    if (!SITE) SITE = await pergunta("Endereço do site (ex.: https://o-teu-site.code.run): ");
    if (!TOKEN) TOKEN = await pergunta("Chave PT_TOKEN: ");
    rl.close();
  }
  SITE = SITE.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(SITE) || !TOKEN) {
    console.log("Falta o endereço do site (a começar por https://) ou a chave. Volta a correr a ponte.");
    process.exit(1);
  }
  try { fs.writeFileSync(FICHEIRO, JSON.stringify({ site: SITE, token: TOKEN }, null, 2)); } catch { /* sem escrita: pergunta outra vez da próxima */ }

  // não deixar o computador adormecer enquanto a ponte corre
  try {
    if (process.platform === "darwin") {
      spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" }).on("error", () => {});
    } else if (process.platform === "win32") {
      const ps = `$p=${process.pid}; Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint e);'; while (Get-Process -Id $p -ErrorAction SilentlyContinue) { [W.P]::SetThreadExecutionState(0x80000001) | Out-Null; Start-Sleep -Seconds 30 }`;
      spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], { stdio: "ignore", windowsHide: true }).on("error", () => {});
    }
  } catch { /* fica sem esta proteção */ }

  const SITES = /(^|\.)(fpf\.pt|sofascore\.com|instagram\.com|facebook\.com|imginn\.com|picnob\.com|pixwox\.com|anonyig\.com|storiesig\.info|fastdl\.app)$/;
  const auth = { Authorization: `Bearer ${TOKEN}` };
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

  console.log(`[${hora()}] Ponte de casa ligada a ${SITE}. Deixa esta janela aberta (para parar: Ctrl + C).`);
  for (;;) {
    try {
      const r = await fetch(`${SITE}/api/ponte/trabalho?n=4`, { headers: auth, signal: AbortSignal.timeout(35000) });
      if (r.status === 401) {
        console.log(`[${hora()}] O site recusou a chave: tem de ser igual à PT_TOKEN do Northflank. Apaga o ficheiro ponte-casa.json e volta a correr a ponte para a escrever de novo.`);
        await espera(60e3);
        continue;
      }
      if (r.status === 404) { console.log(`[${hora()}] O site ainda não tem a ponte de casa (falta publicar a versão nova). Tento outra vez daqui a 1 min.`); await espera(60e3); continue; }
      if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
      const lote = await r.json();
      await Promise.all(lote.map(fazer));
      if (Date.now() - ultimoAviso > 5 * 60e3) {
        ultimoAviso = Date.now();
        console.log(`[${hora()}] A funcionar: ${feitos} pedidos feitos${falhas ? `, ${falhas} falharam` : ""}.`);
      }
    } catch (e) {
      console.log(`[${hora()}] Sem ligação ao site (${e.message}); tento outra vez daqui a 15 s.`);
      await espera(15e3);
    }
  }
})();
