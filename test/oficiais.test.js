import { test } from "node:test";
import assert from "node:assert/strict";
import { dataDe, instante, lerEmbutido, lerLista, fusoDe } from "../server/sources/oficiais.js";

test("oficiais: horas no fuso da fonte (Itália não é Lisboa)", () => {
  assert.equal(new Date(dataDe("07/10/2026 15:30", "Europe/Rome").ts).toISOString(), "2026-10-07T13:30:00.000Z");
  assert.equal(new Date(dataDe("07/10/2026 15:30").ts).toISOString(), "2026-10-07T14:30:00.000Z");
  assert.equal(new Date(instante("2026-10-07T15:30:00", "Europe/Rome")).toISOString(), "2026-10-07T13:30:00.000Z");
  assert.equal(new Date(instante("2026-10-07T15:30:00+0200")).toISOString(), "2026-10-07T13:30:00.000Z");
  assert.equal(new Date(instante("2026-01-07T15:30:00Z")).toISOString(), "2026-01-07T15:30:00.000Z");
  assert.equal(fusoDe({ grupo: "it" }), "Europe/Rome");
  assert.equal(fusoDe({ grupo: "it", tz: "UTC" }), "UTC");
});

test("oficiais: datas relativas em várias línguas, e «hoje» num título não é uma data", () => {
  assert.ok(Math.abs(Date.now() - 5 * 60e3 - dataDe("5 minutes ago").ts) < 2000);
  assert.ok(Math.abs(Date.now() - 3 * 3600e3 - dataDe("3 ore fa").ts) < 2000);
  assert.ok(Math.abs(Date.now() - 2 * 3600e3 - dataDe("há 2 horas").ts) < 2000);
  assert.equal(dataDe("Jogo de hoje entre o Benfica e o FC Porto adiado"), null);
  assert.equal(dataDe("Ontem, 18:20").dia, false);
});

test("oficiais: lista de notícias que vem no JSON da página (sites feitos no browser)", () => {
  const dados = { props: { pageProps: { news: [
    { title: "Serie A: the Matchday 7 fixtures are confirmed", slug: "serie-a-matchday-7-fixtures", publishedAt: "2026-10-07T09:15:00.000Z" },
    { title: "Coppa Italia round of 16 schedule announced", url: "/serie-a/news/coppa-italia-r16", date: "2026-10-06" },
    { title: "Uma ligação para outro lado qualquer", url: "/club/inter" },
  ] } } };
  const l = lerEmbutido(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(dados)}</script>`, "https://en.legaseriea.it/serie-a/news", "/serie-a/news/[a-z0-9-]{6,}", "Europe/Rome");
  assert.equal(l.length, 2);
  assert.equal(l[0].url, "https://en.legaseriea.it/serie-a/news/serie-a-matchday-7-fixtures");
  assert.equal(new Date(l[0].ts).toISOString(), "2026-10-07T09:15:00.000Z");
  assert.equal(l[1].dia, true);
  const h = lerLista('<li><a href="/serie-a/news/derby-della-capitale">Lazio beat Roma in the derby, 2-1</a><span>07/10/2026 11:00</span></li>', "https://en.legaseriea.it/serie-a/news", "/serie-a/news/[a-z0-9-]{6,}", "Europe/Rome");
  assert.equal(new Date(h[0].ts).toISOString(), "2026-10-07T09:00:00.000Z");
});
