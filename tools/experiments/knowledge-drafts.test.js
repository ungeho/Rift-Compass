// node --test tools/experiments/knowledge-drafts.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { loadAll, draft, check, normUrl } = require("./knowledge-drafts");

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
  // 資料が付くのは、原典の URL が正式資料と一致する原典の行だけ（2026-11-01 時点：N・R、正式収録で H・K、2026-11-08 のローム収録のパイロットで P、同日のスプリットプッシュの収録で I が加わった）
  const norm = normUrl;
  const formal = new Set(data.resources.map((r) => norm(r.url)));
  for (const d of ds) assert.strictEqual(Boolean(d.evidence.resource_id), Boolean(d.source.url && formal.has(norm(d.source.url))), d.row);
  assert.deepStrictEqual([...new Set(ds.filter((d) => d.evidence.resource_id).map((d) => d.source.letter))].sort(), ["H", "I", "K", "N", "P", "R"]);
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
  // 実証の後、N10（スマイト）は同じ主張で正式に収録された（kn-smite-damage-261）。check は二重の登録として止める
  assert.deepStrictEqual(r.errors, ["第2回 N10: 同じ主張のノートが既にある"]);
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

// ---- operations の形式（2026-11-08 のローム収録のパイロットの判断を、正式データと衝突しない fixture の ID で再現する） ----
const WHO = "テスト（fixture）";
const L3 = { checked_level: "L3", checked_at: "2026-11-08" };
const rowsOf = (...ids) => Object.fromEntries(draft(ids.map((x) => `3:${x}`)).map((d) => [d.row.replace("第3回 ", ""), d]));
const fxNote = (id, extra = {}) => ({ id, kind: "decision", topic_ids: ["roaming"], status: "empirical", statement_ja: `（fixture）${id}`, ...extra });
const ltEv = (id, section = "fixture") => ({ id, resource_id: "res-loltheory-roaming", evidence_type: "empirical_claim", locator: { section }, summary_ja: `（fixture）${id}`, ...L3 });
const newNote = (id, evId, extra = {}) => ({ action: "new_note", note: fxNote(id, extra.note), evidence: extra.evidence ?? [{ id: evId, evidence_type: "empirical_claim", ...L3 }], status_approved_by: WHO, ...(extra.op ?? {}) });
const row = (d, operations) => ({ ...d, decision: { reviewed_by: WHO, operations } });

/** ローム収録の代表例（P1＋P5、P10＋P11、P9、P15、P6・P7、P3・P13 の関係）を1つの一括にした fixture */
function roamingFixture() {
  const r = rowsOf("P1", "P3", "P4", "P5", "P6", "P9", "P10", "P11", "P13", "P15");
  r.P11 = { ...r.P11, note: { ...r.P11.note, conditions_ja: ["ドラゴンが出ている（fixture の成立条件）"] } };
  return [
    // P1＋P5：2行を1つのノートに統合（両側で宣言する）
    row(r.P1, [newNote("kn-fx-cost", "ev-fx-p1", { note: { kind: "principle" }, op: { merges_rows: ["第3回 P5"], merge_reason_ja: "同じ節の流れで、1つの判断の枠組み" } })]),
    row(r.P5, [{ action: "merged", into: "kn-fx-cost", reason_ja: "P1 の機会費用の具体" }]),
    // P10＋P11：統合元の成立条件を統合先の例外に残す
    row(r.P10, [newNote("kn-fx-enemy-roam", "ev-fx-p10", { note: { exceptions_ja: ["ドラゴンが出ている（fixture の成立条件）ときに追うとドラゴンを失う"] }, op: { merges_rows: ["第3回 P11"], merge_reason_ja: "追う判断の例外" } })]),
    row(r.P11, [{ action: "merged", into: "kn-fx-enemy-roam", reason_ja: "P10 の例外" }]),
    // P9：1行から新しいノートと、既存ノートへの根拠の追加
    row(r.P9, [newNote("kn-fx-timing", "ev-fx-p9"), { action: "add_evidence", merge_into: "kn-flash-cd", evidence: { id: "ev-fx-p9-flash", ...L3 }, reason_ja: "同じ主張（フラッシュの後）" }]),
    // P15：1行を2つのノートに分け、既存ノートの補足にも追記する
    row(r.P15, [
      newNote("kn-fx-destination", "ev-fx-p15a"),
      newNote("kn-fx-return", "ev-fx-p15b", { evidence: [ltEv("ev-fx-p15b", "Common Roaming Mistakes")] }),
      { action: "annotate_note", note_id: "kn-cannon-wave-timing", notes_append_ja: "（fixture の追記）", source_person_add: "fixture", reason_ja: "別の著者の同じ判断を補足に書く" },
    ]),
    // P6：Wiki の仕様を主な根拠にし、LoL Theory の説明を別の根拠として並べる
    row(r.P6, [newNote("kn-fx-wave-gold", null, {
      note: { kind: "mechanic", status: "source_stated", topic_ids: ["wave-management"] },
      evidence: [
        { id: "ev-fx-p6-wiki", resource_id: "res-wiki-minion", evidence_type: "source_fact", locator: { section: "Wave Gold Value" }, summary_ja: "（fixture）Wiki の値", ...L3 },
        ltEv("ev-fx-p6-lt", "The Opportunity Cost of a Roam"),
      ],
    })]),
    // P3：新規 → 既存、既存 → 新規。P13：新規 → 新規（後の行で作るノートを参照する）
    row(r.P3, [newNote("kn-fx-mage", "ev-fx-p3", { op: { relations: [{ to: "kn-immobile-mage-not-alone", type: "context_of" }, { from: "kn-push-before-moving", to: "kn-fx-mage", type: "context_of" }] } })]),
    row(r.P13, [newNote("kn-fx-when-not", "ev-fx-p13", { op: { relations: [{ to: "kn-fx-prereq", type: "context_of" }] } })]),
    row(r.P4, [newNote("kn-fx-prereq", "ev-fx-p4")]),
  ];
}

test("operations：ローム収録の代表例（統合・1行から複数・分割・複数の根拠・関係の向き）を作業用のコピーで検証できる", () => {
  const before = fs.readFileSync(DATA, "utf8");
  const data = JSON.parse(before);
  const snapshot = JSON.stringify(data);
  const r = check(roamingFixture(), data);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.added, { notes: 9, evidence: 11 });
  assert.strictEqual(r.added_relations, 3); // P3 の2件（新規→既存・既存→新規）と P13 の1件（新規→新規）
  const res = (row) => r.report.filter((x) => x.row === `第3回 ${row}`).map((x) => x.result);
  assert.match(res("P1")[0], /kn-fx-cost.*統合：第3回 P5/);
  assert.match(res("P5")[0], /kn-fx-cost に統合/);
  assert.deepStrictEqual(res("P9").map((x) => x.split("（")[0]), ["新しいノート kn-fx-timing", "既存ノート kn-flash-cd に根拠を追加"]);
  assert.strictEqual(res("P15").length, 3);
  assert.match(res("P6")[0], /根拠2件/);
  // 公開データも、渡したデータも変えない
  assert.strictEqual(fs.readFileSync(DATA, "utf8"), before);
  assert.strictEqual(JSON.stringify(data), snapshot);
});

test("operations：不正な操作は1つでもエラーにし、黙って飛ばさない", () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const r = rowsOf("P2", "P5", "P9", "P10", "P11");
  const errs = (rows) => check(rows, data).errors;
  const one = (op) => errs([row(r.P2, [op])]);
  // 不正な ID（既存ノート・既存の根拠と衝突）
  assert.ok(one(newNote("kn-roam-roles", "ev-fx-a")).some((e) => /ノートの id kn-roam-roles が既にある/.test(e)));
  assert.ok(one(newNote("kn-fx-a", "ev-001")).some((e) => /根拠の id ev-001 が既にある/.test(e)));
  // 二重登録（同じノート・同じ資料の根拠）。旧形式と違い、飛ばさずにエラー
  assert.ok(one({ action: "add_evidence", merge_into: "kn-cannon-wave-timing", evidence: { id: "ev-fx-dup", ...L3 }, reason_ja: "x" }).some((e) => /二重登録/.test(e)));
  // 存在しない参照先
  assert.ok(one({ action: "add_evidence", merge_into: "kn-fx-none", evidence: { id: "ev-fx-b", ...L3 }, reason_ja: "x" }).some((e) => /merge_into kn-fx-none/.test(e)));
  assert.ok(one(newNote("kn-fx-c", "ev-fx-c", { op: { relations: [{ to: "kn-fx-none", type: "context_of" }] } })).some((e) => /関係の先 kn-fx-none がない/.test(e)));
  assert.ok(one(newNote("kn-fx-d", null, { evidence: [{ ...ltEv("ev-fx-d"), resource_id: "res-fx-none" }] })).some((e) => /res-fx-none が正式資料にない/.test(e)));
  // 不正な関係の種類・このノートを含まない関係
  assert.ok(one(newNote("kn-fx-e", "ev-fx-e", { op: { relations: [{ to: "kn-flash-cd", type: "causes" }] } })).some((e) => /関係の種類 causes/.test(e)));
  assert.ok(one(newNote("kn-fx-f", "ev-fx-f", { op: { relations: [{ from: "kn-flash-cd", to: "kn-push-before-moving", type: "context_of" }] } })).some((e) => /含まない関係/.test(e)));
  // 未承認の status の昇格・確認レベルの超過・根拠なし
  assert.ok(one({ ...newNote("kn-fx-g", "ev-fx-g"), status_approved_by: undefined }).some((e) => /status_approved_by が要る/.test(e)));
  assert.ok(one(newNote("kn-fx-h", null, { evidence: [{ id: "ev-fx-h", evidence_type: "empirical_claim", checked_level: "L4", checked_at: "2026-11-08" }] })).some((e) => /exceeds/.test(e)));
  assert.ok(one({ ...newNote("kn-fx-i", "ev-fx-i"), evidence: [] }).some((e) => /根拠がない/.test(e)));
  // 別の資料の根拠は、行の原典の節・要約を引き継がない（書かなければエラー）
  assert.ok(one(newNote("kn-fx-j", null, { evidence: [{ id: "ev-fx-j", resource_id: "res-wiki-minion", evidence_type: "source_fact", ...L3 }] })).some((e) => /locator/.test(e)));
  // 未知の操作・競合する操作
  assert.ok(one({ action: "rewrite_note", note_id: "kn-flash-cd" }).some((e) => /未知の操作 rewrite_note/.test(e)));
  assert.ok(errs([row(r.P2, [{ action: "skip", reason_ja: "x" }, newNote("kn-fx-k", "ev-fx-k")])]).some((e) => /skip とほかの操作/.test(e)));
  // annotate_note は補足・source_person への追記だけ（主張・status は変えられない）
  assert.ok(one({ action: "annotate_note", note_id: "kn-flash-cd", statement_ja: "書き換え", reason_ja: "x" }).some((e) => /変えられない欄：statement_ja/.test(e)));
  assert.ok(one({ action: "annotate_note", note_id: "kn-fx-none", notes_append_ja: "x", reason_ja: "x" }).some((e) => /既存ノートにない/.test(e)));
  // 統合は両側の宣言が一致するときだけ
  assert.ok(errs([row(r.P5, [{ action: "merged", into: "kn-flash-cd", reason_ja: "x" }])]).some((e) => /merges_rows にこの行がない/.test(e)));
  assert.ok(errs([row(r.P10, [newNote("kn-fx-l", "ev-fx-l", { op: { merges_rows: ["第3回 P11"], merge_reason_ja: "x" } })])]).some((e) => /merged の判断がない/.test(e)));
  // 統合元の成立条件を黙って捨てない（統合先にないなら conditions_handling_ja が要る）
  const p11 = { ...r.P11, note: { ...r.P11.note, conditions_ja: ["fixture の成立条件"] } };
  const merge = (handling) => errs([row(r.P10, [newNote("kn-fx-m", "ev-fx-m", { op: { merges_rows: ["第3回 P11"], merge_reason_ja: "x" } })]), row(p11, [{ action: "merged", into: "kn-fx-m", reason_ja: "x", ...(handling ? { conditions_handling_ja: handling } : {}) }])]);
  assert.ok(merge().some((e) => /統合元の成立条件「fixture の成立条件」/.test(e)));
  assert.deepStrictEqual(merge("条件は例外の欄に書き直した"), []);
  // 1つの不正な操作を含む複数の操作：ほかが正しくても、成功にしない
  const mixed = check([row(r.P9, [newNote("kn-fx-n", "ev-fx-n"), { action: "add_evidence", merge_into: "kn-fx-none", evidence: { id: "ev-fx-o", ...L3 }, reason_ja: "x" }])], data);
  assert.strictEqual(mixed.errors.length, 1);
  assert.match(mixed.report[0].result, /kn-fx-n/);
});

test("operations：確認者の欄が「人の確認待ち」なら、文字列があっても人の承認とは扱わず報告する", () => {
  const r = rowsOf("P2");
  const pendingWho = "AI の提案（人の確認待ち）";
  const out = check([{ ...r.P2, decision: { reviewed_by: pendingWho, operations: [{ ...newNote("kn-fx-p", "ev-fx-p"), status_approved_by: pendingWho }] } }]);
  assert.deepStrictEqual(out.errors, []); // 既存の規則（status_approved_by があること）は満たす
  assert.strictEqual(out.pending_human_review.length, 2); // reviewed_by と status の承認の両方を、確認待ちとして返す
  // 旧形式と operations の形式は、同じ一括に混ぜられる（旧形式の動作は変えない）
  const legacy = pilot.drafts.find((d) => d.row === "第2回 N7");
  const both = check([legacy, row(r.P2, [newNote("kn-fx-q", "ev-fx-q")])]);
  assert.deepStrictEqual(both.errors, []);
  assert.deepStrictEqual(both.added, { notes: 2, evidence: 2 });
});

test("operations：P8 の形（1行の仕様部分を別の行のノートに統合し、戦術部分は既存ノートに根拠を足す）", () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const snapshot = JSON.stringify(data);
  const r = rowsOf("P6", "P8");
  const COND = "砲台のウェーブ（fixture の成立条件）";
  const p8 = { ...r.P8, note: { ...r.P8.note, conditions_ja: [COND] } };
  const target = "kn-push-slowpush-purposes"; // ローム記事の根拠をまだ持たない既存ノート
  assert.ok(!data.evidence.some((e) => e.note_id === target && e.resource_id === "res-loltheory-roaming"));
  const rows = (p6Note) => [
    row(r.P6, [newNote("kn-fx-p8-spec", null, {
      note: { kind: "mechanic", status: "source_stated", topic_ids: ["wave-management"], ...p6Note },
      evidence: [{ id: "ev-fx-p8-wiki", resource_id: "res-wiki-minion", evidence_type: "source_fact", locator: { section: "Spawning" }, summary_ja: "（fixture）砲台の出現", ...L3 }],
      op: { merges_rows: ["第3回 P8"], merge_reason_ja: "P8 の仕様部分は P6 の仕様と同じ" },
    })]),
    row(p8, [
      { action: "merged", into: "kn-fx-p8-spec", reason_ja: "仕様部分を P6 のノートに統合" },
      { action: "add_evidence", merge_into: target, evidence: { id: "ev-fx-p8-tactic", ...L3 }, reason_ja: "戦術部分は既存ノートと同じ判断" },
    ]),
  ];
  // 統合先が統合元の成立条件を持てば通る
  const ok = check(rows({ conditions_ja: [COND] }), data, { withCopy: true });
  assert.deepStrictEqual(ok.errors, []);
  assert.deepStrictEqual(ok.added, { notes: 1, evidence: 2 }); // 新しいノートは統合先の1件だけ（P8 からは作らない）
  assert.strictEqual(ok.added_relations, 0);
  const added = ok.copy.evidence.filter((e) => /^ev-fx-p8-/.test(e.id)).map((e) => [e.id, e.note_id, e.resource_id]);
  assert.deepStrictEqual(added, [
    ["ev-fx-p8-wiki", "kn-fx-p8-spec", "res-wiki-minion"],
    ["ev-fx-p8-tactic", target, "res-loltheory-roaming"], // 行の原典（P8）の根拠を引き継ぐ
  ]);
  assert.ok(!ok.copy.knowledge_notes.some((n) => n.id === r.P8.note.id)); // P8 の下書きのノートは作らない
  assert.deepStrictEqual(ok.report.filter((x) => x.row === "第3回 P8").map((x) => x.result.split("：")[0].split("（")[0]), ["kn-fx-p8-spec に統合", "既存ノート kn-push-slowpush-purposes に根拠を追加"]);
  // 統合先に成立条件がなければ、黙って捨てずにエラー
  assert.ok(check(rows({}), data).errors.some((e) => /第3回 P8 操作1: 統合元の成立条件「砲台のウェーブ（fixture の成立条件）」/.test(e)));
  assert.strictEqual(JSON.stringify(data), snapshot);
});

test("operations：annotate_note は既存ノートの補足と source_person に追記するだけで、ほかの欄・ほかのノートは変えない", () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const snapshot = JSON.stringify(data);
  const r = rowsOf("P2");
  const id = "kn-cannon-wave-timing";
  const before = data.knowledge_notes.find((n) => n.id === id);
  assert.ok(before.notes_ja && before.source_person); // 既存の補足と source_person があるノートで確かめる
  const annotate = { action: "annotate_note", note_id: id, notes_append_ja: "（fixture の追記）", source_person_add: "fixture の著者", reason_ja: "別の著者の同じ判断" };
  const out = check([row(r.P2, [annotate])], data, { withCopy: true });
  assert.deepStrictEqual(out.errors, []);
  assert.deepStrictEqual(out.added, { notes: 0, evidence: 0 });
  const after = out.copy.knowledge_notes.find((n) => n.id === id);
  // 追記：既存の文の後ろに足し、既存の値は失わない
  assert.strictEqual(after.notes_ja, `${before.notes_ja}（fixture の追記）`);
  assert.strictEqual(after.source_person, `${before.source_person}・fixture の著者`);
  // ほかの欄は同じ
  const { notes_ja: _a, source_person: _b, ...restBefore } = before;
  const { notes_ja: _c, source_person: _d, ...restAfter } = after;
  assert.deepStrictEqual(restAfter, restBefore);
  // ほかのノート・根拠・関係は同じ
  assert.deepStrictEqual(out.copy.knowledge_notes.filter((n) => n.id !== id), data.knowledge_notes.filter((n) => n.id !== id));
  assert.deepStrictEqual(out.copy.evidence, data.evidence);
  assert.deepStrictEqual(out.copy.relations, data.relations);
  // 補足が空のノートにも追記できる（既存の値がないときは追記した文だけ）
  const empty = data.knowledge_notes.find((n) => !n.notes_ja && !n.source_person);
  const out2 = check([row(r.P2, [{ action: "annotate_note", note_id: empty.id, notes_append_ja: "（fixture）", source_person_add: "fixture", reason_ja: "x" }])], data, { withCopy: true });
  const after2 = out2.copy.knowledge_notes.find((n) => n.id === empty.id);
  assert.deepStrictEqual([after2.notes_ja, after2.source_person], ["（fixture）", "fixture"]);
  // 許可しない欄（本文・status・kind・Topic・パッチ）はどれも拒否する
  for (const [k, v] of [["statement_ja", "x"], ["status", "source_stated"], ["kind", "mechanic"], ["topic_ids", ["roaming"]], ["patch_dependencies", ["x"]], ["last_checked_patch", "26.1"]]) {
    assert.ok(check([row(r.P2, [{ ...annotate, [k]: v }])], data).errors.some((e) => new RegExp(`変えられない欄：${k}`).test(e)), k);
  }
  // 不正な操作が混ざれば成功にしない
  const mixed = check([row(r.P2, [annotate, { action: "annotate_note", note_id: "kn-fx-none", notes_append_ja: "x", reason_ja: "x" }])], data);
  assert.strictEqual(mixed.errors.length, 1);
  // 入力データは変えない
  assert.strictEqual(JSON.stringify(data), snapshot);
});

test("operations：CLI の check は、エラーがあれば終了コード1で、公開データを変えない", () => {
  const os = require("os");
  const { spawnSync } = require("child_process");
  const before = fs.readFileSync(DATA, "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kd-check-"));
  const run = (rows) => {
    const f = path.join(dir, "reviewed.json");
    fs.writeFileSync(f, JSON.stringify(rows));
    return spawnSync(process.execPath, [path.join(__dirname, "knowledge-drafts.js"), "check", f], { encoding: "utf8" });
  };
  assert.strictEqual(run(roamingFixture()).status, 0);
  const bad = roamingFixture();
  bad[0].decision.operations.push({ action: "unknown" });
  assert.strictEqual(run(bad).status, 1);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual(fs.readFileSync(DATA, "utf8"), before);
});

test("原典1件ごとの処理：原典の記号で全行を下書きにでき、その原典を正式資料にすると全行に資料が付く（作業用のコピーで確認）", () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  // 未登録の原典の例（I は 2026-11-08 に正式資料になったので、まだ未登録の J に替えた）
  const h = draft(["2:J"], data);
  assert.strictEqual(h.length, 10);
  assert.ok(h.every((d) => d.evidence.resource_id === null));
  const copy = JSON.parse(JSON.stringify(data));
  copy.resources.push({ id: "res-sim-j", url: h[0].source.url, creator: { name: h[0].source.author }, verification: { level: "L2" }, topic_ids: [] });
  const after = draft(["2:J"], copy);
  assert.ok(after.every((d) => d.evidence.resource_id === "res-sim-j"));
  // 資料を登録しても、status・確認レベルは決めない
  assert.ok(after.every((d) => d.note.status === "unverified" && d.evidence.checked_level === null));
  assert.throws(() => draft(["2:Z"], data), /行がない/);
});
