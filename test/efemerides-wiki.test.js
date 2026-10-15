import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Nesta semana: a Wikipédia lida pelo GitHub entra quando a do servidor vem vazia, só a da semana atual e limpa", async () => {
  const { createEfemerides, semanaLisboa } = await import("../server/sources/efemerides.js");
  const ficheiro = new URL("../data/efemerides.json", import.meta.url);
  const sem = semanaLisboa();
  const existia = fs.existsSync(ficheiro);
  const antes = existia ? fs.readFileSync(ficheiro) : null;
  fs.mkdirSync(new URL("../data", import.meta.url), { recursive: true });
  // o servidor só conseguiu os nascimentos do Wikidata (a Wikipédia ficou sem resposta)
  fs.writeFileSync(ficheiro, JSON.stringify({ semana: sem.id, versao: 2, dias: sem.dias.map((d) => d.iso), anos: [1, 10], completo: true, wiki: {}, pessoas: [], eventos: [], jogos: [] }));
  try {
    const ef = createEfemerides();
    // só os da Wikipédia (os da pesquisa na web vêm de outro ficheiro, que outro teste pode estar a escrever)
    const daWiki = (e) => e.para("pt").itens.filter((x) => !x.claude);
    assert.equal(daWiki(ef).length, 0);
    const d = sem.dias[3];
    const item = { tipo: "acontecimento", ano: d.ano - 10, dia: d.iso, texto: "O FC Porto vence a Taça", qids: ["Q1", "x"], link: "https://pt.wikipedia.org/wiki/FC_Porto", img: "javascript:alert(1)", lixo: "não passa" };
    assert.equal(ef.receberWiki({ semana: "1999-01-04", wiki: { pt: [item] } }).ok, false); // semana errada
    const r = ef.receberWiki({ semana: sem.id, wiki: { pt: [item, { tipo: "outro", ano: 2000, dia: d.iso, texto: "x" }, { ...item, dia: "1999-01-01" }] } });
    assert.equal(r.ok, true);
    assert.equal(r.contagem.pt, 1);
    const lista = daWiki(ef);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].tipo, "acontecimento");
    assert.equal(lista[0].texto, "O FC Porto vence a Taça");
    assert.equal(lista[0].anos, 10);
    assert.equal(lista[0].img, null);
    assert.equal(lista[0].lixo, undefined);
    assert.ok(ef.estado().wikiGitHub.at);
    // fica gravada: depois de reiniciar, continua lá
    assert.equal(daWiki(createEfemerides()).length, 1);
  } finally {
    if (existia) fs.writeFileSync(ficheiro, antes); else fs.rmSync(ficheiro, { force: true });
  }
});
