// node --test tools/experiments/decision-retrieval.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./decision-units");
const { searchC, evaluate } = require("./decision-retrieval");

const ctx = load();
const questions = require("../../data/experiments/decision-questions.json").questions;

test("質問セット：期待値の判断材料が実在し、「該当なし」の質問は必須の材料を持たない", () => {
  const ids = new Set(ctx.du.units.map((u) => u.id));
  for (const q of questions) {
    for (const id of [...q.primary, ...q.acceptable, ...q.traps]) assert.ok(ids.has(id), `${q.id}: ${id}`);
    assert.equal(q.expected_none, q.primary.length === 0, q.id);
    assert.ok(q.rationale_ja, `${q.id}: 期待値の理由が要る`);
  }
});

test("方式C：Topic にも語にも一致しない質問は「該当なし」を返す", () => {
  assert.equal(searchC("おすすめのマウスとキーボード", ctx).hits.length, 0);
});

test("方式C：否定の形は検出するが、順位では区別しない（未解決の限界として残す）", () => {
  const a = searchC("有利なときにフリーズしないほうがいいのはどんなとき？", ctx);
  assert.equal(a.negation, true);
  assert.equal(searchC("フリーズするべきとき", ctx).negation, false);
});

test("評価は質問セットのすべての質問を、方式B・Cの両方で処理する", () => {
  const r = evaluate(ctx);
  assert.equal(r.length, questions.length);
  for (const x of r) assert.ok(x.B && x.C);
});
