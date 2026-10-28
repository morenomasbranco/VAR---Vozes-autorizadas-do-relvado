import { test } from "node:test";
import assert from "node:assert/strict";
import { deJson } from "../server/sources/reddit.js";

const SUBS = [{ sub: "soccer", regiao: "mundo", soMedia: true }];
const post = (url, extra = {}) => ({ id: "abc", subreddit: "soccer", title: "Sporting CP [2] - 0 Benfica - Trincão 34'", url, permalink: "/r/soccer/comments/abc/x/", author: "Lazy_Banana_1636", created_utc: 1793170000, ...extra });

test("reddit: os golos em streamff (qualquer domínio: .com, .pro…) e streamin entram no r/soccer", () => {
  for (const url of ["https://streamff.pro/v/a1b2c3", "https://streamff.com/v/a1b2c3", "https://streamff.link/v/x", "https://streamin.one/v/abc", "https://streamin.top/v/abc"]) {
    const diag = {};
    const v = deJson(post(url), SUBS, diag);
    assert.ok(v, `${url}: ${JSON.stringify(diag)}`);
    assert.equal(v.video_url, url);
    assert.equal(v.author, "Lazy_Banana_1636");
  }
  assert.equal(deJson(post("https://example.com/noticia"), SUBS), null);
});
