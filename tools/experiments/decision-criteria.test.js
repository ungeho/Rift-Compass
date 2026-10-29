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

test("Phase 6B の追加ファイルも合わせて検査し、同じ出典の確認範囲は 5E・6B の順に積み重ねる", () => {
  const ctx = loadMerged();
  const side = require("../../data/experiments/side-wave-decisions.json");
  for (const u of side.units) assert.ok(ctx.du.units.some((x) => x.id === u.id), u.id);
  for (const c of side.criteria) assert.ok(ctx.crit.criteria.some((x) => x.id === c.id), c.id);
  // Phase 5E のファイルは9件のまま（6B は別のファイルに追加している）
  assert.equal(require("../../data/experiments/decision-criteria.json").units.length, 9);
  const lt = ctx.du.sources.find((s) => s.id === "src-loltheory");
  assert.match(lt.read, /Phase 5E で.*／.*Phase 6B で/);
  assert.equal(lt.coverage.unread_ja, side.coverage_updates.find((u) => u.source === "src-loltheory").unread_ja);
});

test("発見性レビューの追加ファイルも合わせて検査し、6B の出典に確認範囲を積み重ねる（6B のファイルは変更しない）", () => {
  const ctx = loadMerged();
  const wave = require("../../data/experiments/wave-technique-decisions.json");
  for (const u of wave.units) assert.ok(ctx.du.units.some((x) => x.id === u.id), u.id);
  assert.equal(require("../../data/experiments/side-wave-decisions.json").units.length, 5);
  const yz = ctx.du.sources.find((s) => s.id === "src-yzwsh");
  assert.match(yz.read, /Phase 6B で.*／発見性レビューで/);
  assert.equal(yz.coverage.unread_ja, "ファストプッシュの節");
  // 単一の古い記事にもとづき、現行での成立を確認できない材料は、歴史的な説明・未検証として記録する
  const aggro = ctx.du.units.find((u) => u.id === "du-first-wave-aggro-release");
  assert.equal(aggro.proposed_status, "unverified");
  assert.match(aggro.patch_dependency_ja, /26\.10/);
  assert.ok(aggro.unknowns_ja.some((s) => s.includes("ゲーム内では検証していない")));
});

test("具体例は判断材料の evidence に加えず、具体例の出典が判断材料全体の出典に入ったら検出する", () => {
  const ctx = loadMerged();
  assert.equal(ctx.crit.examples.length, 2);
  // どの具体例の出典も、判断材料の evidence には入っていない
  for (const e of ctx.crit.examples) assert.ok(!ctx.du.units.find((u) => u.id === e.unit_id).evidence.some((ue) => ue.source === e.evidence.source), e.id);
  const x = ctx.crit.examples.find((e) => e.id === "ex-evi-mundo-jax-minion-retaliation");
  assert.equal(x.unit_id, "du-trade-checklist");
  assert.ok(!ctx.du.units.find((u) => u.id === x.unit_id).evidence.some((e) => e.source === x.evidence.source));
  assert.equal(x.evidence.locator.start_sec, 330);
  // 検出できるか：具体例の出典を判断材料の evidence に入れると、エラーになる
  const units = ctx.du.units.map((u) => (u.id === x.unit_id ? { ...u, evidence: [...u.evidence, x.evidence] } : u));
  const errors = checkCriteria({ ...ctx, du: { ...ctx.du, units } });
  assert.ok(errors.some((e) => e.includes("具体例の出典が判断材料の evidence にも入っている")));
});
