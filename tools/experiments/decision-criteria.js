#!/usr/bin/env node
// Phase 5E：具体的な判断基準（data/experiments/decision-criteria.json）の検査
//
//   node tools/experiments/decision-criteria.js check
//
// 新しい判断材料は Phase 5B の decision-units.json と合わせて、既存の check()（decision-units.js）で検査する。
// 目安（criteria）と比較（comparisons）は、ここで検査する。Phase 5B のファイルは変更しない。
"use strict";
const path = require("path");
const { load, check } = require("./decision-units");

const ROOT = path.join(__dirname, "..", "..");
const VERDICTS = ["conflict", "different_conditions", "undetermined"];

/** Phase 5B と 5E の判断材料・出典を合わせる。5E で追加で読んだ範囲は、出典の確認範囲に反映する */
function loadMerged() {
  const base = load();
  const crit = require(path.join(ROOT, "data", "experiments", "decision-criteria.json"));
  const updates = new Map(crit.coverage_updates.map((u) => [u.source, u]));
  const sources = [...base.du.sources, ...crit.sources].map((s) => {
    const u = updates.get(s.id);
    return u ? { ...s, read: `${s.read}／${u.read_added}`, coverage: { status: "partial", unread_ja: u.unread_ja } } : s;
  });
  return { ...base, crit, du: { ...base.du, sources, units: [...base.du.units, ...crit.units] } };
}

/** 目安と比較の検査。問題の一覧を返す（空なら合格）*/
function checkCriteria(ctx = loadMerged()) {
  const errors = [];
  const { crit, du, dataset } = ctx;
  const srcIds = new Set(du.sources.map((s) => s.id));
  const unitIds = new Set(du.units.map((u) => u.id));
  for (const u of crit.coverage_updates) if (!srcIds.has(u.source)) errors.push(`coverage_updates: 出典 ${u.source} がない`);
  const critIds = new Set();
  for (const c of crit.criteria) {
    if (critIds.has(c.id)) errors.push(`${c.id}: id が重複している`);
    critIds.add(c.id);
    if (c.unit_id !== null && !unitIds.has(c.unit_id)) errors.push(`${c.id}: 判断材料 ${c.unit_id} がない`);
    if (!srcIds.has(c.source)) errors.push(`${c.id}: 出典 ${c.source} がない`);
    // 数値だけを残さない：何についての目安か・対象・観測方法・前提・確認箇所を必ず持つ
    for (const k of ["about_ja", "value_ja", "target_ja", "observe_ja", "context_ja", "locator"]) if (!c[k]) errors.push(`${c.id}: ${k} がない`);
    if (!["source", "ai"].includes(c.basis)) errors.push(`${c.id}: basis ${c.basis}`);
    if (c.unit_id) {
      const unit = du.units.find((u) => u.id === c.unit_id);
      if (unit && !unit.evidence.some((e) => e.source === c.source)) errors.push(`${c.id}: 判断材料 ${c.unit_id} の出典に ${c.source} がない`);
    }
  }
  const noteIds = new Set(dataset.knowledge_notes.map((n) => n.id));
  for (const m of crit.comparisons) {
    if (m.items.length < 2) errors.push(`${m.id}: 比較には2件以上の目安が要る`);
    for (const id of m.items) if (!critIds.has(id)) errors.push(`${m.id}: 目安 ${id} がない`);
    if (!VERDICTS.includes(m.verdict)) errors.push(`${m.id}: verdict ${m.verdict}`);
    if (m.related_note && !noteIds.has(m.related_note)) errors.push(`${m.id}: 知識ノート ${m.related_note} がない`);
    for (const k of ["title_ja", "goal_ja", "verdict_ja"]) if (!m[k]) errors.push(`${m.id}: ${k} がない`);
    if (!m.differences_ja?.length || !m.premise_differences_ja?.length || !m.undetermined_ja?.length) errors.push(`${m.id}: 違い・前提の違い・判断できない点が要る`);
    const sources = new Set(m.items.map((id) => crit.criteria.find((c) => c.id === id)?.source));
    if (sources.size < 2) errors.push(`${m.id}: 比較する目安が1つの出典だけ`);
  }
  return errors;
}

module.exports = { loadMerged, checkCriteria, VERDICTS };

if (require.main === module) {
  const ctx = loadMerged();
  const errors = [...check(ctx), ...checkCriteria(ctx)];
  console.log(errors.length ? errors.join("\n") : `OK：判断材料 ${ctx.du.units.length}件（うち Phase 5E ${ctx.crit.units.length}件）、目安 ${ctx.crit.criteria.length}件、比較 ${ctx.crit.comparisons.length}組`);
  process.exit(errors.length ? 1 : 0);
}
