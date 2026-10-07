// Sonda do resultados.fpf.pt: mostra o que o leitor consegue tirar de uma página e grava-a em data/fpf-sonda/.
// Serve para confirmar o leitor quando a FPF mudar o site.
//
//   npm run fpf-sonda                                                     # lista de competições da AF Porto
//   npm run fpf-sonda -- "https://resultados.fpf.pt/Competition/Details?competitionId=29529&seasonId=106"
//   npm run fpf-sonda -- jornada 123456                                   # uma jornada (fixtureId)
//   npm run fpf-sonda -- ficheiro.html                                    # uma página já gravada
import fs from "node:fs";
import { pedir, lerListaCompeticoes, lerPaginaCompeticao, jornada, estado, BASE } from "../server/pt/fpf.js";
import { classificar } from "../server/pt/catalogo.js";

const [a, b] = process.argv.slice(2);
let html, nome;
if (a === "jornada") {
  const r = await jornada(b);
  console.log(`endereço que funcionou: ${estado.urlJornada}`);
  mostrar(r);
  process.exit(0);
} else if (a && fs.existsSync(a)) {
  html = fs.readFileSync(a, "utf8"); nome = a;
} else {
  const url = a || `${BASE}/Competition/GetCompetitionsByAssociation?associationId=232&seasonId=106`;
  html = await pedir(url); nome = url;
  fs.mkdirSync(new URL("../data/fpf-sonda/", import.meta.url), { recursive: true });
  const f = new URL(`../data/fpf-sonda/${url.replace(/[^a-z0-9]+/gi, "_").slice(-80)}.html`, import.meta.url);
  fs.writeFileSync(f, html);
  console.log(`página gravada em ${f.pathname} (${html.length} caracteres)`);
}
console.log(`\n== ${nome}`);
const lista = lerListaCompeticoes(html);
if (lista.length) {
  console.log(`\n${lista.length} ligações para competições:`);
  for (const c of lista) {
    const cl = classificar({ nome: c.nome, org: "af-porto", contexto: c.contexto });
    console.log(`  ${cl ? "✓" : "·"} ${c.competitionId}  ${c.nome}  [${c.contexto}]${cl ? ` → ${cl.mod}${cl.fem ? " fem" : ""} ${cl.tipo}` : " (fora: formação/veteranos/praia…)"}`);
  }
}
mostrar(lerPaginaCompeticao(html));

function mostrar(p) {
  console.log(`\ntítulo: ${p.titulo || "—"}`);
  console.log(`fases: ${p.fases.map((x) => `${x.id}:${x.nome}`).join(" | ") || "—"}`);
  console.log(`séries: ${p.series.map((x) => `${x.id}:${x.nome}${x.selecionado ? "*" : ""}`).join(" | ") || "—"}`);
  console.log(`jornadas (${p.jornadas.length}): ${p.jornadas.slice(0, 40).map((x) => `${x.n}${x.selecionado ? "*" : ""}=${x.id}`).join(" ") || "—"}`);
  console.log(`\njogos (${p.jogos.length}):`);
  for (const j of p.jogos.slice(0, 30)) console.log(`  ${j.fpfId || "-"}  j${j.jornada ?? "?"}  ${j.inicio ? new Date(j.inicio).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }) : "sem data"}  ${j.casa} ${j.hs ?? ""}-${j.as ?? ""} ${j.fora}${j.estado ? ` (${j.estado})` : ""}${j.local ? ` @ ${j.local}` : ""}`);
  for (const t of p.tabelas) {
    console.log(`\ntabela (${t.linhas.length} equipas):`);
    for (const l of t.linhas.slice(0, 20)) console.log(`  ${String(l.pos).padStart(2)} ${String(l.equipa).padEnd(30)} J${l.j ?? "?"} V${l.v ?? "?"} E${l.e ?? "?"} D${l.d ?? "?"} ${l.gm ?? "?"}:${l.gs ?? "?"} ${l.pts}pts`);
  }
  if (!p.jogos.length && !p.tabelas.length && !p.jornadas.length) console.log("\nO leitor não encontrou jogos, jornadas nem tabelas nesta página. Abre o ficheiro gravado e procura os endereços (fixtureId, matchId…) que a página usa.");
}
