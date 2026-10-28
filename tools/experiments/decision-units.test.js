// node --test tools/experiments/decision-units.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { load, check, terms, searchUnits } = require("./decision-units");

test("判断の部品：出典・確認箇所・関係・Topic が整合している", () => {
  assert.deepEqual(check(load()), []);
});

test("理由は、原典の主張（source）と AI の解釈（ai）を必ず区別している", () => {
  const { du } = load();
  for (const u of du.units) for (const r of u.reasons) assert.ok(["source", "ai"].includes(r.basis), u.id);
});

test("検査は不整合を検出できる（存在しない資料・出典・関係）", () => {
  const ctx = load();
  const broken = JSON.parse(JSON.stringify(ctx.du));
  broken.sources[0].resource_id = "res-does-not-exist";
  broken.units[0].evidence[0].source = "src-missing";
  broken.units[0].relations.push({ to: "du-missing", type: "same_conclusion_independent" });
  const errors = check({ ...ctx, du: broken }).join("\n");
  assert.match(errors, /資料 res-does-not-exist がない/);
  assert.match(errors, /出典 src-missing がない/);
  assert.match(errors, /関係の相手 du-missing がない/);
});

test("同じ著者と独立した著者、記載なしと未読を取り違えると検出する", () => {
  const ctx = load();
  const broken = JSON.parse(JSON.stringify(ctx.du));
  const farm = broken.units.find((u) => u.id === "du-behind-farm-first");
  farm.relations.find((r) => r.to === "du-behind-keep-wave-own-side").type = "same_conclusion_independent"; // どちらも がりある
  farm.costs_ja = ["不明"];
  broken.units.find((u) => u.id === "du-dopa-tf-fizz-pull-wave").costs_ja = ["記載なし（全体を確認）"]; // 字幕は一部だけ確認
  broken.sources.find((s) => s.id === "src-tib").coverage = { status: "partial" };
  const errors = check({ ...ctx, du: broken }).join("\n");
  assert.match(errors, /同じ著者なのに独立とされている/);
  assert.match(errors, /記載なしか未読の範囲ありかを書く/);
  assert.match(errors, /未読の範囲がある出典なのに/);
  assert.match(errors, /未読の範囲（coverage.unread_ja）が要る/);
});

test("語の一致による検索の限界：否定の語（「追わず」「押してはいけない」）は検索語に残らない", () => {
  assert.deepEqual(terms("ロームを追わずに別の行動を選ぶ理由"), ["ローム"]);
  assert.ok(!terms("なぜ不利な対面でウェーブを押してはいけないのか").some((t) => t.includes("押")));
  assert.ok(searchUnits("同じ戦術が別のマッチアップでは通用しない理由", load())[0].id === "du-vlad-keystone-by-matchup");
});

// Phase 5D で、判断材料の閲覧画面（src/data/decisions.ts）だけが判断材料を読み込むようになった。
// 公開の検索・正式データの読み込みには、実験データ（判断材料・質問セット・評価）を入れない。
test("公開の検索と正式データは実験データを読み込まない。閲覧画面は判断材料だけを読み込む", () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, "..", "..", "src", ...p), "utf8");
  for (const f of [["data", "dataset.ts"], ["search", "search.ts"]]) assert.ok(!read(...f).includes("experiments"), f.join("/"));
  const decisions = read("data", "decisions.ts");
  assert.ok(decisions.includes("data/experiments/decision-units.json"));
  assert.ok(!decisions.includes("decision-questions") && !decisions.includes("decision-retrieval"));
});
