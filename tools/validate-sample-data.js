// Phase 0 サンプルデータの整合性・根拠状態の検査（依存パッケージなし）
// 使い方: node tools/validate-sample-data.js [data/sample-resources.json]
// テスト:  node --test tools/validate-sample-data.test.js
const path = require("path");

const NOTE_STATUSES = ["source_stated", "derived", "tactical_inference", "empirical", "unverified", "disputed"];
const LEVELS = ["L0", "L1", "L2", "L3", "L4"];
const PREMISE_RELATIONS = ["reason_for", "prerequisite"];

function validate(d) {
  const errors = [];
  const ids = (arr, name) => {
    const s = new Set();
    for (const x of arr) {
      if (s.has(x.id)) errors.push(`duplicate ${name} id: ${x.id}`);
      s.add(x.id);
    }
    return s;
  };
  const T = ids(d.topics, "topic");
  const R = ids(d.resources, "resource");
  const N = ids(d.knowledge_notes, "note");
  ids(d.evidence, "evidence");
  ids(d.relations, "relation");

  // 参照切れ
  for (const t of d.topics) for (const p of t.parent_ids) if (!T.has(p)) errors.push(`${t.id}: unknown parent ${p}`);
  for (const r of d.resources) {
    for (const t of r.topic_ids) if (!T.has(t)) errors.push(`${r.id}: unknown topic ${t}`);
    if (r.derived_from && !R.has(r.derived_from)) errors.push(`${r.id}: unknown derived_from ${r.derived_from}`);
    if (!LEVELS.includes(r.verification.level)) errors.push(`${r.id}: unknown verification level ${r.verification.level}`);
  }
  for (const n of d.knowledge_notes) for (const t of n.topic_ids) if (!T.has(t)) errors.push(`${n.id}: unknown topic ${t}`);
  for (const e of d.evidence) {
    if (!N.has(e.note_id)) errors.push(`${e.id}: unknown note ${e.note_id}`);
    if (!R.has(e.resource_id)) errors.push(`${e.id}: unknown resource ${e.resource_id}`);
    if (!LEVELS.includes(e.checked_level)) errors.push(`${e.id}: unknown checked_level ${e.checked_level}`);
  }
  for (const r of d.relations) {
    if (!N.has(r.from)) errors.push(`${r.id}: unknown from ${r.from}`);
    if (!N.has(r.to)) errors.push(`${r.id}: unknown to ${r.to}`);
  }

  // Topic の自己参照・循環参照（parent_ids を辿る DFS）
  const topics = Object.fromEntries(d.topics.map((t) => [t.id, t]));
  const state = {}; // undefined: 未訪問, 1: 訪問中, 2: 完了
  const visit = (id, trail) => {
    if (state[id] === 2 || !topics[id]) return;
    if (state[id] === 1) {
      errors.push(`topic cycle: ${[...trail.slice(trail.indexOf(id)), id].join(" -> ")}`);
      return;
    }
    state[id] = 1;
    for (const p of topics[id].parent_ids) visit(p, [...trail, id]);
    state[id] = 2;
  };
  for (const t of d.topics) visit(t.id, []);

  // Evidence の確認レベルは、参照先 Resource の確認レベルを超えられない
  const resources = Object.fromEntries(d.resources.map((r) => [r.id, r]));
  for (const e of d.evidence) {
    const r = resources[e.resource_id];
    if (r && LEVELS.indexOf(e.checked_level) > LEVELS.indexOf(r.verification.level)) {
      errors.push(`${e.id}: checked_level ${e.checked_level} exceeds ${r.id} verification level ${r.verification.level}`);
    }
  }

  // 根拠状態の規則（docs/knowledge-model.md 4章）
  const notes = Object.fromEntries(d.knowledge_notes.map((n) => [n.id, n]));
  const ev = (id) => d.evidence.filter((e) => e.note_id === id);
  const strong = (e) => ["L3", "L4"].includes(e.checked_level);
  const premises = (id) => d.relations.filter((r) => r.to === id && PREMISE_RELATIONS.includes(r.type)).map((r) => notes[r.from]).filter(Boolean);
  for (const n of d.knowledge_notes) {
    if (!NOTE_STATUSES.includes(n.status)) {
      errors.push(`${n.id}: unknown status ${n.status}`);
      continue;
    }
    const es = ev(n.id);
    const has = (type) => es.some((e) => e.evidence_type === type && strong(e));
    if (n.status !== "unverified" && es.length === 0) errors.push(`${n.id}: status ${n.status} requires evidence, none found`);
    if (n.status === "source_stated" && !has("source_fact")) errors.push(`${n.id}: source_stated needs L3+ source_fact`);
    if (n.status === "derived") {
      if (!has("derivation")) errors.push(`${n.id}: derived needs L3+ derivation`);
      // 前提 Note（Relation）または、所在を辿れる計算根拠（locator 付きの derivation Evidence）のどちらかが必要
      const ps = premises(n.id);
      const traceable = es.some((e) => e.evidence_type === "derivation" && strong(e) && e.locator);
      if (ps.length === 0 && !traceable) errors.push(`${n.id}: derived has no traceable basis (no premise note and no derivation evidence with locator)`);
      for (const p of ps) if (!["source_stated", "derived"].includes(p.status)) errors.push(`${n.id}: derived from weak premise ${p.id}`);
    }
    if (n.status === "tactical_inference" && !has("tactical_inference")) errors.push(`${n.id}: tactical_inference needs L3+ tactical_inference evidence`);
    if (n.status === "empirical" && !es.some((e) => e.evidence_type === "empirical_claim")) errors.push(`${n.id}: empirical needs empirical_claim evidence`);
    if (n.status === "disputed" && !es.some((e) => e.evidence_type === "counter")) errors.push(`${n.id}: disputed needs counter evidence`);
    // last_checked_patch は現行環境で検証したパッチのみ。in_game_test がない限り設定しない
    if (n.last_checked_patch && !es.some((e) => e.evidence_type === "in_game_test")) errors.push(`${n.id}: last_checked_patch set without in_game_test evidence`);
    if (n.historical && n.historical.valid_until && !n.historical.valid_from) errors.push(`${n.id}: valid_until without valid_from`);
  }
  return errors;
}

function summarize(d) {
  const count = (arr, key) => arr.reduce((a, x) => ((a[key(x)] = (a[key(x)] || 0) + 1), a), {});
  return {
    resources: d.resources.length,
    topics: d.topics.length,
    notes: d.knowledge_notes.length,
    evidence: d.evidence.length,
    relations: d.relations.length,
    verification: count(d.resources, (r) => r.verification.level),
    language: count(d.resources, (r) => r.language),
    note_status: count(d.knowledge_notes, (n) => n.status),
  };
}

module.exports = { validate, NOTE_STATUSES, LEVELS };

if (require.main === module) {
  const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "data", "sample-resources.json"));
  const d = require(file);
  console.log(summarize(d));
  const errors = validate(d);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("OK: no errors");
}
