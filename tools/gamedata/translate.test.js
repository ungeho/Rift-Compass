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
  // 以前は解けない記法（pp の式）で保留だった Z-Drive Resonance の説明は、2026-11-03 の解析の改善で解けて訳された。
  // 訳は現在の英文に対応し、保留の一覧（withheld）からは外れている
  const zr = f.entries["Template:Data Ekko/Z-Drive Resonance#description"];
  assert.ok(zr && zr.status === "ai_translated_unreviewed");
  assert.match(zr.ja, /30～150（レベルに応じて）/);
  assert.equal((f.withheld || {})["Template:Data Ekko/Z-Drive Resonance#description"], undefined);
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

test("用語集：各用語の正規表現に制御文字がなく（\b が文字化けしていない）、例の語に一致する", () => {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/gamedata/glossary.json"), "utf8"));
  for (const t of g.terms) {
    assert.doesNotMatch(t.en, /[\x00-\x1f]/, t.ja);
    assert.doesNotThrow(() => new RegExp(t.en, "i"), t.ja);
  }
  const re = (ja) => new RegExp(g.terms.find((t) => t.ja === ja).en, "i");
  assert.ok(re("味方").test("allied champions"));
  assert.ok(re("敵").test("nearby enemies"));
  assert.ok(re("インビジブル").test("becomes invisible"));
  assert.ok(re("グラウンド").test("grounds enemies"));
  assert.ok(re("増加体力").test("gains bonus health"));
  assert.ok(!re("増加体力").test("bonus health regeneration"));
});

test("否定の検査：原文に否定があり訳にないときは不合格（「なければ」「なかった」は否定として扱う）", () => {
  assert.ok(checkOne("Enemies cannot be hit twice.", "敵には二回命中する。").some((p) => /否定/.test(p)));
  assert.equal(checkOne("If the tether is not broken, it roots.", "つながりが切れなければスネアを与える。").length, 0);
});

test("取り込み：訳した原文の source_sha1 と英文の plain_sha1 の両方が必須で、どちらも現在と一致するときだけ取り込む", () => {
  const { importRejection } = require("./translate");
  const cur = { sha1: "s1", plainSha1: "p1", residual: false };
  assert.equal(importRejection(cur, { sha1: "s1", plain_sha1: "p1" }), null);
  // plain_sha1 がない訳は、現在の英文の sha1 を付けて保存しない（取り込まない）
  assert.match(importRejection(cur, { sha1: "s1" }), /plain_sha1/);
  assert.match(importRejection(cur, { plain_sha1: "p1" }), /source_sha1/);
  assert.match(importRejection(cur, { sha1: "s0", plain_sha1: "p1" }), /原文が変わった/);
  assert.match(importRejection(cur, { sha1: "s1", plain_sha1: "p0" }), /英文/);
  assert.match(importRejection({ ...cur, residual: true }, { sha1: "s1", plain_sha1: "p1" }), /保留/);
  assert.match(importRejection(null, { sha1: "s1", plain_sha1: "p1" }), /見つからない/);
});

test("訳の対象：アイテムの効果の文・ルーンの説明も、スキルと同じく原文と英文の sha1 を持つ", () => {
  const { fieldsOf, keysOf } = require("./translate");
  assert.deepEqual(keysOf("items"), ["items"]);
  assert.deepEqual(keysOf("runes"), ["runes"]);
  const items = fieldsOf("items");
  const runes = fieldsOf("runes");
  assert.ok(items.length >= 300 && runes.length >= 100);
  for (const x of [...items, ...runes]) {
    assert.match(x.sha1, /^[0-9a-f]{40}$/, x.id);
    assert.match(x.plainSha1, /^[0-9a-f]{40}$/, x.id);
    assert.ok(x.plain.length > 0, x.id);
  }
  // 同じ効果の名前（Hollow Radiance の Desolate）が別の効果で決めた変数を使って解けている
  const hr = items.find((x) => x.title === "Hollow Radiance" && x.field === "pass2");
  assert.equal(hr.residual, false);
  assert.match(hr.plain, /30 \(\+ 2% bonus health\) magic damage/);
});
