// node --test tools/experiments/knowledge-drafts.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { loadAll, draft, check } = require("./knowledge-drafts");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data", "sample-resources.json");
const pilot = require("../../data/experiments/knowledge-draft-pilot.json");
const all = loadAll();
const specs = [...all].flatMap(([b, { rows }]) => rows.map((r) => `${b}:${r.id}`));

test("バッチ1〜3の記録をすべて読める（列は見出しの名前で対応させる）", () => {
  assert.deepStrictEqual([...all].map(([, { rows }]) => rows.length), [83, 96, 74]);
  for (const [, { sources, rows }] of all) for (const r of rows) assert.ok(sources.has(r.letter), `${r.id} の原典`);
  // 照合の表（U）も、知識の列と結果の列を読む
  const u2 = all.get(3).rows.find((r) => r.id === "U2");
  assert.match(u2.claim, /Warming Up/);
  assert.match(u2.check, /一致/);
});

test("すべての行を下書きにでき、status・確認レベルは昇格させず、未登録の原典は資料にしない", () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const urls = new Map(data.resources.map((r) => [r.id, r]));
  const ds = draft(specs);
  assert.strictEqual(ds.length, 253);
  for (const d of ds) {
    assert.strictEqual(d.note.status, "unverified");
    assert.strictEqual(d.evidence.checked_level, null);
    assert.strictEqual(d.note.last_checked_patch, null);
    assert.deepStrictEqual(d.note.topic_ids, []); // Topic は提案だけ
    if (d.evidence.resource_id) assert.ok(urls.has(d.evidence.resource_id));
    else assert.ok(d.review.some((r) => r.field === "evidence.resource_id"));
    // 原典の URL・著者・行の位置を保持する
    assert.ok(d.row && d.source && d.source.author);
  }
  // 正式資料があるのは Patch 26.1（N）と mpbhg（R）の行だけ
  assert.deepStrictEqual([...new Set(ds.filter((d) => d.evidence.resource_id).map((d) => d.source.letter))].sort(), ["N", "R"]);
});

test("相違・同じ著者・古い記述は、統合しない理由・注意として review に残す", () => {
  const [h9, o8, n10] = draft(["2:H9", "3:O8", "2:N10"]);
  assert.ok(h9.flags.differs && h9.review.some((r) => r.field === "merge" && /無条件に統合しない/.test(r.reason)));
  assert.ok(o8.flags.outdated && o8.review.some((r) => r.field === "historical"));
  assert.ok(n10.refs.rows.includes("第1回 E7")); // 旧値の行への参照を保持する
});

test("実証：確認済みの下書きは既存の検証に通り、登録済みの行は二重に登録しない。公開データは変更しない", () => {
  const before = fs.readFileSync(DATA, "utf8");
  const r = check(pilot.drafts);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.added, { notes: 3, evidence: 3 });
  for (const row of ["第2回 N3", "第3回 R7", "第3回 R4"]) assert.match(r.report.find((x) => x.row === row).result, /既に登録済み/);
  assert.strictEqual(r.report.filter((x) => /^登録しない/.test(x.result)).length, 4);
  assert.strictEqual(fs.readFileSync(DATA, "utf8"), before);
  for (const d of pilot.drafts) assert.match(d.decision.reviewed_by, /人の確認待ち/);
});

test("確認が足りない下書きは通さない", () => {
  const base = pilot.drafts.find((d) => d.row === "第2回 N7");
  const run = (patch) => check([{ ...base, decision: { ...base.decision, ...patch, note: { ...base.decision.note, ...(patch.note ?? {}) }, evidence: { ...base.decision.evidence, ...(patch.evidence ?? {}) } } }]).errors;
  assert.ok(run({ note: { status: "source_stated" } }).some((e) => /status_approved_by/.test(e)));
  assert.deepStrictEqual(run({ note: { status: "source_stated" }, status_approved_by: "test" }), []);
  assert.ok(run({ note: { kind: null } }).some((e) => /kind/.test(e)));
  assert.ok(run({ note: { topic_ids: [] } }).some((e) => /topic_ids/.test(e)));
  assert.ok(run({ evidence: { checked_level: null } }).some((e) => /checked_level/.test(e)));
  assert.ok(run({ evidence: { checked_level: "L4" } }).some((e) => /exceeds/.test(e)));
  assert.ok(run({ evidence: { resource_id: null } }).some((e) => /根拠の資料がない/.test(e)));
  assert.ok(run({ reviewed_by: undefined }).some((e) => /reviewed_by/.test(e)));
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  assert.ok(run({ note: { statement_ja: data.knowledge_notes[0].statement_ja } }).some((e) => /同じ主張/.test(e)));
});

test("原典1件ごとの処理：原典の記号で全行を下書きにでき、その原典を正式資料にすると全行に資料が付く（作業用のコピーで確認）", () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const h = draft(["2:H"], data);
  assert.strictEqual(h.length, 18);
  assert.ok(h.every((d) => d.evidence.resource_id === null));
  const copy = JSON.parse(JSON.stringify(data));
  copy.resources.push({ id: "res-sim-h", url: h[0].source.url, creator: { name: h[0].source.author }, verification: { level: "L2" }, topic_ids: [] });
  const after = draft(["2:H"], copy);
  assert.ok(after.every((d) => d.evidence.resource_id === "res-sim-h"));
  // 資料を登録しても、status・確認レベルは決めない
  assert.ok(after.every((d) => d.note.status === "unverified" && d.evidence.checked_level === null));
  assert.throws(() => draft(["2:Z"], data), /行がない/);
});
