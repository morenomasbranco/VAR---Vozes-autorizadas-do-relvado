// TEMPORÁRIO: abre o Glossário, escolhe um jogo à mão e mostra o texto da página e uma captura (em base64, aos bocados)
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const erros = [];
p.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
p.on("console", (m) => { if (m.type() === "error") erros.push(`console: ${m.text()}`); });
await p.goto("http://localhost:3001/", { waitUntil: "domcontentloaded" });
await p.getByRole("button", { name: /^Glossário/ }).click();
await p.waitForSelector(".glos", { timeout: 20000 });
console.log("== título ==", await p.locator(".feedhead h1").innerText(), await p.locator(".feedhead h1").evaluate((e) => getComputedStyle(e).color));
await p.getByRole("button", { name: "Escolher à mão" }).click();
await p.getByLabel("Equipa da casa").fill("Milan");
await p.getByLabel("Equipa de fora").fill("Juventus");
await p.getByLabel("Competição").fill("Serie A");
await p.getByRole("button", { name: "Preparar" }).click();
await p.waitForSelector(".gficha");
console.log("== ficha ==\n" + (await p.locator(".gficha").innerText()).slice(0, 1500));
await p.locator(".gficha .gchip").first().click();
console.log("== a minha lista ==", await p.locator(".gminha").innerText());
for (const aba of ["Expressões", "Clubes", "Competições", "Países"]) {
  await p.locator(".gabas").getByRole("button", { name: aba }).click();
  console.log(`== ${aba}: destacados ==`, await p.locator(".gdest").count(), "|", (await p.locator(".gdest").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160));
}
await p.locator(".gform input").first().fill("Dragões");
await p.getByRole("button", { name: "Procurar" }).click();
await p.waitForSelector(".gres");
console.log("== pesquisa Dragões ==", (await p.locator(".gres").innerText()).replace(/\s+/g, " ").slice(0, 300));
await p.locator(".gabas").getByRole("button", { name: "Expressões" }).click();
await p.evaluate(() => window.scrollTo(0, 0));
const img = (await p.screenshot({ type: "jpeg", quality: 45, fullPage: false })).toString("base64");
console.log("== erros ==", erros.length ? erros.join("\n") : "nenhum");
console.log("== captura ==", img.length);
for (let i = 0; i < img.length; i += 4000) console.log(`IMG${String(i / 4000).padStart(3, "0")} ${img.slice(i, i + 4000)}`);
await b.close();
