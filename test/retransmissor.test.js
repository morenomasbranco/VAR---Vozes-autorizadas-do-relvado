import { test } from "node:test";
import assert from "node:assert/strict";
import { registar, retransmissorLigado, hostBate, respostaDe } from "../server/retransmissor.js";
import { buscar, caminhos, bloqueado } from "../server/ponte.js";

// um retransmissor a fingir: guarda os pedidos e responde com o que o teste mandar
function falso(responder) {
  const enviados = [];
  const ws = { readyState: 1, send: (t) => { const m = JSON.parse(t); enviados.push(m); if (m.t === "pedido") setImmediate(() => lig.receber(responder(m))); } };
  const lig = registar(ws, "teste");
  return { lig, enviados };
}
const ids = (u) => caminhos(u).map((c) => c.id);
const b64 = (s) => Buffer.from(s).toString("base64");

test("retransmissor: os subdomínios da FPF contam como sites bloqueados; os outros não", () => {
  assert.ok(hostBate("afporto.fpf.pt", "*.fpf.pt"));
  assert.ok(hostBate("fpf.pt", ".fpf.pt"));
  assert.ok(!hostBate("fpf.pt.exemplo.com", "*.fpf.pt"));
  assert.ok(bloqueado("resultados.fpf.pt") && bloqueado("www.fpf.pt") && bloqueado("www.instagram.com"));
  assert.ok(!bloqueado("www.record.pt"));
});

test("retransmissor: a resposta chega como a do fetch (estado, cabeçalhos, endereço final, corpo)", async () => {
  const r = respostaDe({ status: 200, headers: { "content-type": "text/html", "content-encoding": "gzip" }, url: "https://www.fpf.pt/x", corpo: b64("<h1>olá</h1>") });
  assert.equal(r.status, 200);
  assert.equal(r.url, "https://www.fpf.pt/x");
  assert.equal(r.headers.get("content-encoding"), null); // o corpo já vem descomprimido
  assert.equal(await r.text(), "<h1>olá</h1>");
});

test("retransmissor: com ele ligado, a FPF passa por ele; se ele for recusado, o servidor tenta direto", async () => {
  const original = globalThis.fetch;
  const diretos = [];
  globalThis.fetch = async (url) => { diretos.push(url); return new Response("direto", { status: 200 }); };
  let estado = 200;
  const { lig, enviados } = falso((m) => ({ t: "resposta", id: m.id, status: estado, headers: { "content-type": "text/html" }, url: m.url, corpo: b64(`casa:${m.url}`) }));
  try {
    assert.ok(retransmissorLigado());
    assert.deepEqual(ids("https://resultados.fpf.pt/a"), ["casa", "direto"]);
    const r = await buscar("https://resultados.fpf.pt/Competition/GetCompetitionsByAssociation?associationId=224&seasonId=106", { headers: { "User-Agent": "X" } });
    assert.equal(await r.text(), "casa:https://resultados.fpf.pt/Competition/GetCompetitionsByAssociation?associationId=224&seasonId=106");
    assert.equal(enviados[0].headers["User-Agent"], "X");
    assert.equal(diretos.length, 0);
    // os outros sites vão sempre diretos
    await buscar("https://www.record.pt/");
    assert.deepEqual(diretos, ["https://www.record.pt/"]);
    // o Instagram recusa a ligação de casa: tenta-se direto e a casa fica de lado para esse site
    estado = 429;
    const r2 = await buscar("https://www.instagram.com/api/v1/users/web_profile_info/?username=x");
    assert.equal(await r2.text(), "direto");
    assert.deepEqual(ids("https://www.instagram.com/x"), ["direto"]);
    assert.deepEqual(ids("https://www.fpf.pt/x"), ["casa", "direto"]); // os outros sites continuam pela casa
  } finally {
    globalThis.fetch = original;
    lig.sair();
  }
  assert.ok(!retransmissorLigado());
});

test("retransmissor: só recebe os sites que diz aceitar, e um pedido pendente falha se ele se desligar", async () => {
  const { lig, enviados } = falso(() => null); // nunca responde
  lig.receber({ t: "ola", hosts: ["*.fpf.pt"] });
  try {
    assert.deepEqual(ids("https://www.facebook.com/plugins/page.php"), ["direto"]);
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("sem rede"); };
    try {
      const p = buscar("https://www.fpf.pt/noticias");
      await new Promise((r) => setImmediate(r));
      assert.equal(enviados.at(-1).url, "https://www.fpf.pt/noticias");
      lig.sair();
      await assert.rejects(p, /sem rede|desligou/);
    } finally { globalThis.fetch = original; }
  } finally { lig.sair(); }
});
