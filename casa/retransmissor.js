// Retransmissor de casa do VAR, com um browser verdadeiro (Chrome, Edge ou Chromium), para Mac e Windows.
//
// A FPF só deixa passar browsers verdadeiros (o anti-robôs do Cloudflare), e o Instagram e o Facebook só mostram os
// posts a quem tem sessão iniciada. Este programa abre um browser próprio, com as contas secundárias de Instagram e
// de Facebook iniciadas uma vez, e faz por ele os pedidos que o servidor do VAR lhe manda, pela ligação de casa:
//   - os pedidos de dados (listas da FPF, perfis do Instagram) são feitos dentro de um separador do próprio site,
//     com os cookies e o «carimbo» de browser verdadeiro;
//   - as páginas montadas no browser (o plugin de página do Facebook) são abertas e lidas depois de montadas.
// Liga-se ao servidor por WebSocket (sem abrir portas no router) e volta a ligar-se sozinho se a internet falhar.
//
// Primeira vez:      node retransmissor.js --configurar    (pede o endereço do site e a chave, e abre o browser para
//                                                          entrares no Instagram e no Facebook com as contas secundárias)
// Depois:            node retransmissor.js                  (os instaladores põem-no a arrancar com o computador)
// Ver o browser:     VISIVEL=1 node retransmissor.js
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const PASTA = process.env.VAR_CASA_PASTA || path.join(os.homedir(), ".var-retransmissor");
const CONFIG = path.join(PASTA, "config.json");
const PERFIL = path.join(PASTA, "browser");
fs.mkdirSync(PASTA, { recursive: true });
const lerConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { return {}; } };
const gravarConfig = (c) => fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));
// só pode haver um retransmissor a correr (o browser dele usa um perfil próprio): um ficheiro com o número do processo
const TRANCA = path.join(PASTA, "a-correr.pid");
function trancar() {
  try {
    const pid = Number(fs.readFileSync(TRANCA, "utf8"));
    if (pid && pid !== process.pid) { try { process.kill(pid, 0); return false; } catch { /* o processo já não existe */ } }
  } catch { /* não havia */ }
  fs.writeFileSync(TRANCA, String(process.pid));
  const soltar = () => { try { if (Number(fs.readFileSync(TRANCA, "utf8")) === process.pid) fs.unlinkSync(TRANCA); } catch { /* */ } };
  process.on("exit", soltar);
  for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sinal, () => process.exit(0));
  return true;
}
const hora = () => new Date().toLocaleString("pt-PT");
// o que o programa vai fazendo: no ecrã e no ficheiro registo.log (quando corre sozinho, sem janela, só lá)
const REGISTO = path.join(PASTA, "registo.log");
const log = (...a) => {
  const linha = `[${hora()}] ${a.join(" ")}`;
  console.log(linha);
  try {
    if (fs.existsSync(REGISTO) && fs.statSync(REGISTO).size > 2e6) fs.renameSync(REGISTO, `${REGISTO}.antigo`);
    fs.appendFileSync(REGISTO, `${linha}\n`);
  } catch { /* */ }
};

const SO_CONFIGURAR = process.argv.includes("--so-configurar"); // (o instalador: configura e sai)
const CONFIGURAR = process.argv.includes("--configurar") || SO_CONFIGURAR;
const VISIVEL = process.env.VISIVEL === "1";
// sites que este retransmissor aceita fazer (só os que bloqueiam o servidor); localhost só para testes
const HOSTS = (process.env.RETRANSMISSOR_HOSTS || "*.fpf.pt,www.instagram.com,i.instagram.com,www.facebook.com,m.facebook.com,api.sofascore.com,www.sofascore.com,www.ligaportugal.pt,www.zerozero.pt")
  .split(/[\s,]+/).filter(Boolean);
const bate = (h, p) => { p = p.toLowerCase().replace(/^\*\./, "."); h = h.toLowerCase(); return p.startsWith(".") ? h === p.slice(1) || h.endsWith(p) : h === p; };
const aceita = (u) => (u.protocol === "https:" && HOSTS.some((p) => bate(u.hostname, p))) || (process.env.VAR_CASA_TESTE === "1" && /^(127\.0\.0\.1|localhost)$/.test(u.hostname));
const PARALELO = Math.max(1, Number(process.env.RETRANSMISSOR_PARALELO) || 3);

/* ───────── configuração ───────── */
// perguntas no terminal, uma de cada vez (as respostas que chegam juntas ficam guardadas pela ordem)
function leitor() {
  const rl = readline.createInterface({ input: process.stdin });
  const linhas = [], espera = [];
  let fechado = false;
  rl.on("line", (l) => { const w = espera.shift(); if (w) w(l); else linhas.push(l); });
  rl.on("close", () => { fechado = true; while (espera.length) espera.shift()(""); });
  return {
    question: (t) => { process.stdout.write(t); return linhas.length ? Promise.resolve(linhas.shift()) : fechado ? Promise.resolve("") : new Promise((r) => espera.push(r)); },
    close: () => rl.close(),
  };
}

async function configurar() {
  const c = lerConfig();
  const rl = leitor();
  console.log("\n== Configuração do retransmissor do VAR ==\n");
  const site = (await rl.question(`Endereço do site${c.site ? ` [${c.site}]` : ""}: `)).trim() || c.site;
  const chave = (await rl.question(`Chave (a PT_TOKEN do Northflank)${c.chave ? " [a mesma de antes]" : ""}: `)).trim() || c.chave;
  if (!site || !chave) { console.log("Faltou o endereço ou a chave. Corre outra vez com --configurar."); process.exit(1); }
  gravarConfig({ ...c, site: site.replace(/\/$/, ""), chave });
  console.log(`\nGuardado em ${CONFIG}.`);
  console.log("\nVai abrir-se um browser. Nele:");
  console.log("  1. no separador do Instagram, entra com a conta SECUNDÁRIA (não a tua pessoal);");
  console.log("  2. no separador do Facebook, entra com a conta SECUNDÁRIA;");
  console.log("  3. o separador da FPF só tem de abrir o site normalmente.");
  console.log("Quando tiveres entrado nas duas contas, volta a esta janela e carrega Enter.\n");
  const ctx = await abrirBrowser(true);
  for (const u of ["https://www.instagram.com/accounts/login/", "https://www.facebook.com/login/", "https://www.fpf.pt/"]) {
    const p = await ctx.newPage();
    p.goto(u).catch(() => {});
  }
  await rl.question("Carrega Enter quando tiveres entrado no Instagram e no Facebook… ");
  rl.close();
  const s = await sessoes(ctx);
  console.log(`\nInstagram: ${s.instagram ? "sessão iniciada ✓" : "SEM sessão (os posts do Instagram não vão chegar)"}`);
  console.log(`Facebook:  ${s.facebook ? "sessão iniciada ✓" : "SEM sessão (os posts do Facebook não vão chegar)"}`);
  await ctx.close();
  console.log(SO_CONFIGURAR ? "\nConfiguração feita.\n" : "\nConfiguração feita. O retransmissor arranca agora.\n");
}

/* ───────── o browser ───────── */
let playwright;
try { playwright = await import("playwright"); } catch {
  console.error("Falta instalar o Playwright. Na pasta do retransmissor, corre: npm install");
  process.exit(1);
}

// um browser que ficou aberto de uma vez anterior (o programa foi parado à força) prende o perfil: fecha-se
// (só se chega aqui com a tranca na mão, por isso não há outro retransmissor a usá-lo)
async function libertarPerfil() {
  const { execFileSync } = await import("node:child_process");
  try {
    if (process.platform === "win32") {
      execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*--user-data-dir=*${PERFIL.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { stdio: "ignore", timeout: 20000 });
    } else {
      execFileSync("pkill", ["-f", "--", `--user-data-dir=${PERFIL}`], { stdio: "ignore", timeout: 10000 });
    }
  } catch { /* não havia nenhum */ }
  await new Promise((r) => setTimeout(r, 2000));
  for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) { try { fs.rmSync(path.join(PERFIL, f), { force: true }); } catch { /* */ } }
}

async function abrirBrowser(visivel) {
  const base = {
    headless: process.env.VAR_CASA_HEADLESS === "1", viewport: null, locale: "pt-PT", timezoneId: "Europe/Lisbon",
    // escondido: a janela abre fora do ecrã e minimizada (um browser «a sério», que passa os anti-robôs, sem incomodar)
    args: visivel ? ["--start-maximized"] : ["--start-minimized", "--window-position=-32000,-32000", "--window-size=1280,900"],
    ignoreDefaultArgs: ["--enable-automation"],
  };
  // o Chrome instalado (Mac/Windows), o Edge (vem com o Windows) ou o Chromium do Playwright
  const canais = (process.env.VAR_CASA_BROWSER ? [process.env.VAR_CASA_BROWSER] : ["chrome", "msedge", null]);
  let erro;
  let libertado = false;
  for (let i = 0; i < canais.length; i++) {
    const channel = canais[i];
    try {
      const ctx = await playwright.chromium.launchPersistentContext(PERFIL, { ...base, ...(channel ? { channel } : {}) });
      log(`browser: ${channel === "chrome" ? "Google Chrome" : channel === "msedge" ? "Microsoft Edge" : channel || "Chromium do Playwright"}${visivel ? "" : " (minimizado)"}`);
      await ctx.addInitScript(() => { try { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); } catch { /* */ } });
      if (!visivel) {
        // cada separador novo é minimizado logo (no Mac, a janela fora do ecrã não chega)
        ctx.on("page", (p) => minimizar(p));
        for (const p of ctx.pages()) minimizar(p);
      }
      return ctx;
    } catch (e) {
      // o perfil está preso por um browser que ficou aberto: fecha-se e tenta-se outra vez o mesmo browser
      if (!libertado && /ProcessSingleton|already in use|SingletonLock|profile.*in use|user data directory is already|has been closed/i.test(String(e?.message || e))) {
        libertado = true;
        log("o perfil do browser estava preso por um browser que ficou aberto; a fechá-lo e a tentar outra vez");
        await libertarPerfil();
        i--;
        continue;
      }
      erro = e;
    }
  }
  console.error(`Não consegui abrir nenhum browser (${String(erro?.message || erro).split("\n")[0]}).\nInstala o Google Chrome, ou corre na pasta do retransmissor: npx playwright install chromium`);
  process.exit(1);
}

async function minimizar(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
    await cdp.detach();
  } catch { /* sem janela (modo sem ecrã) ou já fechada */ }
}

async function sessoes(ctx) {
  const ck = await ctx.cookies(["https://www.instagram.com", "https://www.facebook.com"]).catch(() => []);
  return { instagram: ck.some((c) => c.name === "sessionid" && /instagram/.test(c.domain)), facebook: ck.some((c) => c.name === "c_user" && /facebook/.test(c.domain)) };
}

const DESAFIO = /just a moment|um momento|attention required|checking your browser|verifica(ndo|ção)|verify you are human/i;
async function esperarDesafio(page, ms = 30000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const t = await page.title().catch(() => "");
    if (!DESAFIO.test(t)) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

// um separador por site (origem), reaproveitado; os pedidos de dados são feitos dentro dele
const origens = new Map(); // origem → { page, desde, pronto }
const MAX_SEPARADORES = 8;
async function separador(ctx, origem, renovar = false) {
  const o = origens.get(origem);
  if (o && !renovar && !o.page.isClosed() && Date.now() - o.desde < 45 * 60e3) { o.usado = Date.now(); return o.pronto; }
  if (o) { origens.delete(origem); o.page.close().catch(() => {}); }
  // os separadores menos usados fecham-se (os cookies ficam)
  if (origens.size >= MAX_SEPARADORES) {
    const [velha] = [...origens.entries()].sort((a, b) => a[1].usado - b[1].usado);
    origens.delete(velha[0]);
    velha[1].page.close().catch(() => {});
  }
  const page = await ctx.newPage();
  const novo = { page, desde: Date.now(), usado: Date.now() };
  novo.pronto = (async () => {
    // uma página leve do próprio site: abre-o como uma pessoa (e passa o anti-robôs, se houver)
    await page.goto(`${origem}/robots.txt`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await esperarDesafio(page);
    return page;
  })();
  origens.set(origem, novo);
  return novo.pronto;
}

// cabeçalhos que o servidor manda e que o browser decide por si (o browser usa os seus: cookies, navegador…)
const PROIBIDOS = /^(cookie|user-agent|referer|host|connection|content-length|accept-encoding|origin|sec-.*|x-ponte.*|proxy-.*)$/i;

async function fazerPedido(ctx, m) {
  const u = new URL(m.url);
  if (!aceita(u)) return { erro: `site não permitido neste retransmissor (${u.hostname})`, status: 403 };
  // páginas montadas no browser (o plugin de página do Facebook): abrem-se e lê-se a página já montada
  if (/facebook\.com$/.test(u.hostname) && /^\/plugins\//.test(u.pathname) || process.env.VAR_CASA_TESTE === "1" && /\/montada/.test(u.pathname)) {
    const page = await ctx.newPage();
    try {
      const r = await page.goto(m.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await esperarDesafio(page);
      // espera que os posts apareçam (até 8 s)
      await page.waitForSelector("[data-utime], abbr[data-utime], [role=article]", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      const html = await page.content();
      return { status: r?.status() === 200 || html.length > 2000 ? 200 : r?.status() || 200, headers: { "content-type": "text/html; charset=utf-8" }, url: page.url(), corpo: Buffer.from(html).toString("base64") };
    } finally { page.close().catch(() => {}); }
  }
  const headers = {};
  for (const [k, v] of Object.entries(m.headers || {})) if (!PROIBIDOS.test(k)) headers[k] = v;
  // o Instagram exige o token da própria sessão do browser (não o do servidor)
  if (/instagram\.com$/.test(u.hostname)) {
    const csrf = (await ctx.cookies("https://www.instagram.com")).find((c) => c.name === "csrftoken")?.value;
    for (const k of Object.keys(headers)) if (/^x-csrftoken$/i.test(k)) delete headers[k];
    if (csrf) headers["X-CSRFToken"] = csrf;
  }
  const pedirNoSeparador = async (renovar) => {
    const page = await separador(ctx, u.origin, renovar);
    return page.evaluate(async ({ url, method, headers, corpo, redirect }) => {
      const body = corpo ? Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0)) : undefined;
      const r = await fetch(url, { method, headers, body, credentials: "include", redirect: redirect === "manual" ? "manual" : "follow" });
      if (r.type === "opaqueredirect") return { status: 302, headers: {}, url, corpo: null };
      const buf = new Uint8Array(await r.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const h = {};
      r.headers.forEach((v, k) => { h[k] = v; });
      return { status: r.status, headers: h, url: r.url || url, corpo: s ? btoa(s) : null };
    }, { url: m.url, method: m.method || "GET", headers, corpo: m.corpo || null, redirect: m.redirect });
  };
  let r = await pedirNoSeparador(false);
  // apanhou o anti-robôs (a autorização expirou): abre o site outra vez, passa o desafio e repete
  if ([403, 429, 503].includes(r.status) && DESAFIO.test(Buffer.from(r.corpo || "", "base64").toString().slice(0, 3000))) r = await pedirNoSeparador(true);
  return r;
}

/* ───────── ligação ao servidor ───────── */
let ctx = null;
async function abrir() {
  ctx = await abrirBrowser(VISIVEL);
  const s = await sessoes(ctx);
  log(`Instagram: ${s.instagram ? "sessão iniciada" : "sem sessão"} · Facebook: ${s.facebook ? "sessão iniciada" : "sem sessão"}${!s.instagram || !s.facebook ? " (para entrar nas contas: node retransmissor.js --configurar)" : ""}`);
  // abre já a FPF e o Instagram (passa os anti-robôs antes de chegarem pedidos)
  if (process.env.VAR_CASA_TESTE !== "1") for (const o of ["https://www.fpf.pt", "https://resultados.fpf.pt", "https://www.instagram.com"]) separador(ctx, o).catch(() => {});
  // se o browser fechar (por engano ou por falha), volta a abrir-se
  ctx.on("close", () => {
    ctx = null;
    origens.clear();
    log("o browser fechou; volto a abri-lo daqui a 5 s");
    setTimeout(() => abrir().catch((e) => { log(`não consegui reabrir o browser: ${e.message}`); process.exit(1); }), 5000);
  });
}

async function main() {
  if (!trancar()) {
    console.log("O retransmissor já está a correr neste computador.");
    if (CONFIGURAR) console.log("Para voltar a configurar, fecha-o primeiro: no Mac, reinicia o computador ou corre «launchctl unload ~/Library/LaunchAgents/pt.var.retransmissor.plist»; no Windows, reinicia o computador ou termina «node» no Gestor de Tarefas.");
    process.exit(0);
  }
  if (CONFIGURAR || !lerConfig().site) await configurar();
  if (SO_CONFIGURAR) process.exit(0);
  const { site, chave } = lerConfig();
  const nome = (process.env.RETRANSMISSOR_NOME || os.hostname() || "casa").slice(0, 40);
  await abrir();

  const conta = { pedidos: 0, erros: 0, porSite: {} };
  const emCurso = new Set();
  const fila = [];
  let aCorrer = 0;
  let ws = null;
  let espera = 2000;
  const enviar = (m) => { try { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); } catch { /* */ } };
  const andar = () => {
    while (aCorrer < PARALELO && fila.length) {
      const m = fila.shift();
      aCorrer++;
      const host = (() => { try { return new URL(m.url).hostname; } catch { return "?"; } })();
      conta.pedidos++;
      conta.porSite[host] = (conta.porSite[host] || 0) + 1;
      emCurso.add(m.id);
      Promise.race([ctx ? fazerPedido(ctx, m) : Promise.reject(new Error("o browser está a reabrir")), new Promise((_, nao) => setTimeout(() => nao(new Error("o site não respondeu em 40 s")), 40000))])
        .then((r) => { if (emCurso.has(m.id)) enviar(r.erro ? { t: "erro", id: m.id, erro: r.erro, status: r.status } : { t: "resposta", id: m.id, ...r }); })
        .catch((e) => { conta.erros++; enviar({ t: "erro", id: m.id, erro: String(e?.message || e).split("\n")[0] }); })
        .finally(() => { emCurso.delete(m.id); aCorrer--; andar(); });
    }
  };
  const WS = globalThis.WebSocket || (await import("ws")).default;
  const ligar = () => {
    ws = new WS(`${site.replace(/^http/, "ws")}/api/retransmissor?chave=${encodeURIComponent(chave)}&nome=${encodeURIComponent(nome)}`);
    ws.onopen = async () => {
      espera = 2000;
      const s2 = ctx ? await sessoes(ctx) : {};
      log(`ligado a ${site} como «${nome}»`);
      enviar({ t: "ola", hosts: HOSTS, versao: 2, browser: true, sessoes: s2 });
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString()); } catch { return; }
      if (m.t === "pedido") { fila.push(m); andar(); }
      else if (m.t === "cancelar") { emCurso.delete(m.id); const i = fila.findIndex((x) => x.id === m.id); if (i >= 0) fila.splice(i, 1); }
    };
    // no Node, uma ligação que falha logo de início só dá «error» (nunca «close»): os dois levam a nova tentativa,
    // uma vez só (sem isto, o programa ficava parado se o computador arrancasse antes de haver internet)
    const este = ws;
    let tratado = false;
    const caiu = (porque) => {
      if (tratado) return;
      tratado = true;
      log(`ligação ${porque}${espera >= 8000 ? " (há internet? o endereço e a chave estão certos?)" : ""}; volto a ligar daqui a ${Math.round(espera / 1000)} s`);
      fila.length = 0;
      try { este.close(); } catch { /* */ }
      setTimeout(ligar, espera);
      espera = Math.min(60e3, espera * 2);
    };
    ws.onclose = () => caiu("fechada");
    ws.onerror = () => caiu("falhou");
  };
  ligar();
  setInterval(() => {
    if (!conta.pedidos) return;
    const sites = Object.entries(conta.porSite).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h, n]) => `${h} ${n}`).join(", ");
    log(`${conta.pedidos} pedidos nos últimos 5 min (${conta.erros} com erro): ${sites}`);
    Object.assign(conta, { pedidos: 0, erros: 0, porSite: {} });
  }, 5 * 60e3);
}

main().catch((e) => { console.error(e); process.exit(1); });
