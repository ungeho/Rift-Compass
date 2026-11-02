// 翻訳の検査（数・用語・記法）と、取り込んだ訳のファイル
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { checkOne } = require("./translate");

test("数が欠けた訳・増えた訳は不合格", () => {
  assert.equal(checkOne("Slows by 40% for 1 second.", "1秒間40%のスロウを与える。").length, 0);
  assert.ok(checkOne("Slows by 40% for 1 second.", "1秒間スロウを与える。").length > 0);
  assert.ok(checkOne("Slows by 40% for 1 second.", "1秒間40%のスロウを与え、2回まで重なる。").length > 0);
});

test("用語集：Root はスネア（直訳の「根」は不合格）", () => {
  assert.equal(checkOne("roots them for 2 seconds.", "2秒間スネアを与える。").length, 0);
  assert.ok(checkOne("roots them for 2 seconds.", "2秒間根を張らせる。").length > 0);
});

test("記法が残った訳は不合格", () => {
  assert.ok(checkOne("deals 10 damage.", "{{as|10}}のダメージを与える。").length > 0);
  assert.ok(checkOne("deals 10 damage.", "⟦pp|10⟧のダメージを与える。").length > 0);
});

test("取り込んだ訳：原文のハッシュ・訳者・未レビュー・ライセンスを持ち、Ekko R の訳に記法がない", () => {
  const dir = path.join(__dirname, "../../public/gamedata/wiki/2026-11-02/translations/ja/abilities");
  const f = JSON.parse(fs.readFileSync(path.join(dir, "245.json"), "utf8"));
  assert.equal(f.license.name, "CC BY-SA 3.0");
  assert.match(f.translator, /AI/);
  assert.match(f.review, /未レビュー/);
  const r = f.entries["Template:Data Ekko/Chronobreak#description2"];
  assert.ok(r && /^[0-9a-f]{40}$/.test(r.source_sha1));
  assert.match(r.ja, /固有時停止/);
  assert.doesNotMatch(r.ja, /\{\{|\}\}|label\d*=|⟦/);
  // 解けない記法が残る原文（Z-Drive Resonance の説明）は訳さず保留
  assert.equal(f.entries["Template:Data Ekko/Z-Drive Resonance#description"], undefined);
});

test("訳の有効：Wiki の原文の sha1 と、訳の対象にした英文の sha1 の両方が一致するときだけ", () => {
  const { valid } = require("./translate");
  const cur = { sha1: "a", plainSha1: "p" };
  assert.equal(valid({ source_sha1: "a", plain_sha1: "p" }, cur), true);
  // 原文は同じでも、解析の修正で英文が変わった訳は無効
  assert.equal(valid({ source_sha1: "a", plain_sha1: "q" }, cur), false);
  assert.equal(valid({ source_sha1: "b", plain_sha1: "p" }, cur), false);
  // plain_sha1 のない古い形式の訳は、確かめるまで無効
  assert.equal(valid({ source_sha1: "a" }, cur), false);
});

test("保存した訳はすべて plain_sha1 を持ち、現在の英文と一致する（ステルスのスキルの訳を含む）", () => {
  const crypto = require("node:crypto");
  const { fieldsOf } = require("./translate");
  const dir = path.join(__dirname, "../../public/gamedata/wiki/2026-11-02/translations/ja/abilities");
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const key = f.replace(/\.json$/, "");
    const tr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const cur = new Map(fieldsOf(key).map((x) => [`${x.title}#${x.field}`, x]));
    for (const [id, e] of Object.entries(tr.entries)) {
      const c = cur.get(id);
      assert.ok(c, id);
      assert.equal(e.plain_sha1, crypto.createHash("sha1").update(c.plain).digest("hex"), id);
      assert.equal(e.source_sha1, c.sha1, id);
      n++;
    }
  }
  assert.ok(n >= 125);
  const shaco = JSON.parse(fs.readFileSync(path.join(dir, "35.json"), "utf8"));
  assert.match(shaco.entries["Template:Data Shaco/Deceive#description"].ja, /インビジブル/);
  const tf = JSON.parse(fs.readFileSync(path.join(dir, "4.json"), "utf8"));
  assert.match(tf.entries["Template:Data Twisted Fate/Destiny#description"].ja, /可視化/);
});
