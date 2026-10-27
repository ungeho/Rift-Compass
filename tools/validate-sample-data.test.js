// validate-sample-data.js の不正データ検出テスト（node:test、依存パッケージなし）
// 使い方: node --test tools/validate-sample-data.test.js
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { validate } = require("./validate-sample-data");

const original = require(path.join(__dirname, "..", "data", "sample-resources.json"));
// 実データを複製し、1か所だけ壊してから検査する
const mutate = (fn) => {
  const d = structuredClone(original);
  fn(d);
  return validate(d);
};
const note = (d, id) => d.knowledge_notes.find((n) => n.id === id);
const expectError = (errors, pattern) =>
  assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern}, got:\n${errors.join("\n") || "(no errors)"}`);

test("実データは検査を通過する", () => {
  assert.deepStrictEqual(validate(original), []);
});

test("1. 未定義の KnowledgeNote.status を拒否する", () => {
  const errors = mutate((d) => (note(d, "kn-cooldown-window").status = "verified"));
  expectError(errors, /kn-cooldown-window: unknown status verified/);
});

test("2. 根拠を要求する status で Evidence がない場合を検出する（empirical）", () => {
  const errors = mutate((d) => (d.evidence = d.evidence.filter((e) => e.note_id !== "kn-hist-ward-full-duration-2014")));
  expectError(errors, /kn-hist-ward-full-duration-2014: status empirical requires evidence, none found/);
});

test("2. empirical に empirical_claim がない場合を検出する", () => {
  const errors = mutate((d) => {
    for (const e of d.evidence) if (e.note_id === "kn-hist-ward-full-duration-2014") e.evidence_type = "hypothesis";
  });
  expectError(errors, /kn-hist-ward-full-duration-2014: empirical needs empirical_claim evidence/);
});

test("2. unverified は Evidence なしでも許容する", () => {
  // kn-offense-as-defense は実データでも Evidence なしの unverified
  assert.ok(!original.evidence.some((e) => e.note_id === "kn-offense-as-defense"));
  assert.ok(!validate(original).some((e) => e.includes("kn-offense-as-defense")));
});

test("3. Evidence の確認レベルが Resource の確認レベルを超える場合を検出する", () => {
  // ev-028 は L2 の動画（res-yt-dopaenglish-teacher-2）を参照している
  const errors = mutate((d) => (d.evidence.find((e) => e.id === "ev-028").checked_level = "L3"));
  expectError(errors, /ev-028: checked_level L3 exceeds res-yt-dopaenglish-teacher-2 verification level L2/);
});

test("4. Topic の自己参照を検出する", () => {
  const errors = mutate((d) => d.topics.find((t) => t.id === "cooldown").parent_ids.push("cooldown"));
  expectError(errors, /topic cycle: cooldown -> cooldown/);
});

test("4. Topic の循環参照を検出する", () => {
  // ability-haste -> cooldown は既存。cooldown -> ability-haste を足すと循環する
  const errors = mutate((d) => d.topics.find((t) => t.id === "cooldown").parent_ids.push("ability-haste"));
  expectError(errors, /topic cycle: .*cooldown.*ability-haste|topic cycle: .*ability-haste.*cooldown/);
});

test("5. derived は前提 Note も locator 付きの計算根拠もない場合を検出する", () => {
  const errors = mutate((d) => {
    d.relations = d.relations.filter((r) => r.to !== "kn-level2-minion-count");
    for (const e of d.evidence) if (e.note_id === "kn-level2-minion-count" && e.evidence_type === "derivation") e.locator = null;
  });
  expectError(errors, /kn-level2-minion-count: derived has no traceable basis/);
});

test("5. derived は Relation がなくても locator 付きの計算根拠があれば許容する", () => {
  const errors = mutate((d) => (d.relations = d.relations.filter((r) => r.to !== "kn-level2-minion-count")));
  assert.ok(!errors.some((e) => e.includes("kn-level2-minion-count")), errors.join("\n"));
});

test("5. derived の前提 Note が弱い status の場合を検出する", () => {
  const errors = mutate((d) => {
    note(d, "kn-level2-xp").status = "unverified";
  });
  expectError(errors, /kn-level2-minion-count: derived from weak premise kn-level2-xp/);
});
