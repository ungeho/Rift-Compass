// node --test tools/experiments/decision-criteria.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { check } = require("./decision-units");
const { loadMerged, checkCriteria } = require("./decision-criteria");

test("Phase 5E の判断材料・目安・比較が整合している（Phase 5B の検査も合わせて通る）", () => {
  const ctx = loadMerged();
  assert.deepEqual(check(ctx), []);
  assert.deepEqual(checkCriteria(ctx), []);
});

test("Phase 5B の判断材料29件は変えていない（Phase 5E は別のファイルに追加している）", () => {
  const ctx = loadMerged();
  assert.equal(ctx.du.units.length, 29 + ctx.crit.units.length);
  const base = require("../../data/experiments/decision-units.json");
  assert.equal(base.units.length, 29);
});

test("目安は、数値だけでなく対象・観測方法・前提・確認箇所を持たないと検出する", () => {
  const ctx = loadMerged();
  const broken = JSON.parse(JSON.stringify(ctx.crit));
  delete broken.criteria[0].context_ja;
  broken.criteria[1].target_ja = "";
  broken.criteria[2].unit_id = "du-missing";
  const errors = checkCriteria({ ...ctx, crit: broken }).join("\n");
  assert.match(errors, /context_ja がない/);
  assert.match(errors, /target_ja がない/);
  assert.match(errors, /判断材料 du-missing がない/);
});

test("比較は、1つの出典だけの目安や、判断できない点のない比較を検出する", () => {
  const ctx = loadMerged();
  const broken = JSON.parse(JSON.stringify(ctx.crit));
  broken.comparisons[0].items = ["crit-trade-2of5", "crit-trade-window"]; // どちらも MetaBot
  broken.comparisons[1].undetermined_ja = [];
  const errors = checkCriteria({ ...ctx, crit: broken }).join("\n");
  assert.match(errors, /1つの出典だけ/);
  assert.match(errors, /判断できない点が要る/);
});

test("フリーズの数値は平均や統一をせず、資料ごとの数値と前提をそのまま残している", () => {
  const { crit } = loadMerged();
  const cmp = crit.comparisons.find((c) => c.id === "cmp-freeze-minion-count");
  const values = cmp.items.map((id) => crit.criteria.find((c) => c.id === id).value_ja);
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.some((v) => v.includes("2〜3体")) && values.some((v) => v.includes("3〜4体多く")));
  assert.equal(cmp.verdict, "different_conditions"); // 条件の違いを矛盾として扱わない
});
