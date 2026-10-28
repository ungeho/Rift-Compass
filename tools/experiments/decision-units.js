#!/usr/bin/env node
// Phase 5B：判断の部品（data/experiments/decision-units.json）の検査と、単純な語の一致による検索の実験
//
//   node tools/experiments/decision-units.js check           出典・関係・項目の整合性を検査する
//   node tools/experiments/decision-units.js search "質問"   判断の部品を、質問の語の一致数で並べる（実験用。アプリの検索とは別）
//
// アプリは判断の部品を読み込まない。検索はアプリの search() と比べるための素朴な方式で、意味は理解しない。
"use strict";
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const RELATION_TYPES = ["same_source_restated", "same_author_restated", "same_conclusion_independent", "condition_differs", "exception_of", "conflicts_with", "complements"];
const BASIS = ["source", "ai"];
const STATUSES = ["source_stated", "derived", "tactical_inference", "empirical", "unverified", "disputed"];
const NONE_FULL = "記載なし（全体を確認）"; // 出典の全体を読んで、記載がなかった
// 未読の範囲がある出典では「確認範囲に記載なし（未読の範囲あり）」と書く

function load() {
  return {
    du: require(path.join(ROOT, "data", "experiments", "decision-units.json")),
    dataset: require(path.join(ROOT, "data", "sample-resources.json")),
    candidates: require(path.join(ROOT, "data", "candidates", "candidates.json")),
  };
}

/** 整合性の検査。問題の一覧を返す（空なら合格）*/
function check({ du, dataset, candidates }) {
  const errors = [];
  const resIds = new Set(dataset.resources.map((r) => r.id));
  const candKeys = new Set(candidates.map((c) => c.key));
  const topicIds = new Set(dataset.topics.map((t) => t.id));
  const srcIds = new Set();
  for (const s of du.sources) {
    srcIds.add(s.id);
    if (s.resource_id && !resIds.has(s.resource_id)) errors.push(`${s.id}: 資料 ${s.resource_id} がない`);
    if (s.candidate_key && !candKeys.has(s.candidate_key)) errors.push(`${s.id}: 候補 ${s.candidate_key} がない`);
    if (!s.url || !s.read) errors.push(`${s.id}: url と確認の範囲（read）が要る`);
    if (!["full", "partial"].includes(s.coverage?.status)) errors.push(`${s.id}: 確認の範囲（coverage.status）が要る`);
    if (s.coverage?.status === "partial" && !s.coverage.unread_ja) errors.push(`${s.id}: 未読の範囲（coverage.unread_ja）が要る`);
  }
  const sourceById = new Map(du.sources.map((s) => [s.id, s]));
  // 著者名から括弧の付記（サイト名・字幕の担当など）を除いて比べる
  const authorsOf = (u) => new Set((u.evidence || []).map((e) => (sourceById.get(e.source)?.author || "").replace(/（.*?）|\(.*?\)/g, "").trim()));
  const unitById = new Map(du.units.map((u) => [u.id, u]));
  const unitIds = new Set(du.units.map((u) => u.id));
  if (unitIds.size !== du.units.length) errors.push("判断の部品の id が重複している");
  for (const u of du.units) {
    if (!STATUSES.includes(u.proposed_status)) errors.push(`${u.id}: status ${u.proposed_status}`);
    if (!u.evidence?.length) errors.push(`${u.id}: 根拠（evidence）がない`);
    for (const e of u.evidence || []) {
      if (!srcIds.has(e.source)) errors.push(`${u.id}: 出典 ${e.source} がない`);
      if (!e.locator) errors.push(`${u.id}: 確認箇所（locator）がない`);
    }
    for (const r of u.reasons || []) if (!BASIS.includes(r.basis)) errors.push(`${u.id}: 理由の basis ${r.basis}`);
    for (const t of u.topic_ids || []) if (!topicIds.has(t)) errors.push(`${u.id}: Topic ${t} がない`);
    for (const rel of u.relations || []) {
      if (!RELATION_TYPES.includes(rel.type)) errors.push(`${u.id}: 関係の種類 ${rel.type}`);
      // phase5a-* は docs/experiments/candidate-pipeline.md の判断の部品（E1〜E8）を指す
      if (!unitIds.has(rel.to) && !rel.to.startsWith("phase5a-")) errors.push(`${u.id}: 関係の相手 ${rel.to} がない`);
      // 「独立した著者」と「同じ著者」を取り違えない
      const other = unitById.get(rel.to);
      if (other) {
        const a = authorsOf(u), b = authorsOf(other);
        const shared = [...a].some((x) => b.has(x));
        if (rel.type === "same_conclusion_independent" && shared) errors.push(`${u.id} → ${rel.to}: 同じ著者なのに独立とされている`);
        if (rel.type === "same_author_restated" && !shared) errors.push(`${u.id} → ${rel.to}: 著者が違うのに同じ著者とされている`);
      }
    }
    // 「原典に記載なし」と「未読のため分からない」を区別する（「不明」とだけ書かない）
    const partial = (u.evidence || []).some((e) => sourceById.get(e.source)?.coverage?.status !== "full");
    for (const v of [...u.alternatives_ja, ...u.costs_ja, ...u.conditions_ja, ...u.exceptions_ja, u.scope?.champions, u.scope?.matchup]) {
      if (typeof v !== "string") continue;
      if (v.startsWith("不明")) errors.push(`${u.id}: 「不明」ではなく、記載なしか未読の範囲ありかを書く`);
      if (v === NONE_FULL && partial) errors.push(`${u.id}: 未読の範囲がある出典なのに「${NONE_FULL}」としている`);
    }
    // 本文・字幕の転載を避けるため、1つの文字列は短く保つ
    for (const s of JSON.stringify(u).match(/"(?:[^"\\]|\\.)*"/g) || []) if (s.length > 400) errors.push(`${u.id}: 長すぎる文字列（${s.length}字）`);
  }
  return errors;
}

const STOP = new Set(["なぜ", "理由", "場合", "とき", "どう", "べき", "何", "優先", "方法", "選択", "行動", "必要"]);

/** 質問から語を取り出す（ひらがな・記号で区切り、2文字以上の漢字・カタカナ・英数字の並び）*/
function terms(q) {
  return [...new Set(q.normalize("NFKC").toLowerCase().split(/[\s぀-ゟ、。，．,.!?？！「」『』()（）・/:;〜~]+/).filter((t) => [...t].length >= 2 && !STOP.has(t)))];
}

/** 判断の部品を、質問の語が本文（Topic の表示名・別名を含む）に現れる数で並べる */
function searchUnits(q, { du, dataset }) {
  const topics = new Map(dataset.topics.map((t) => [t.id, [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en].join(" ")]));
  const ts = terms(q);
  return du.units
    .map((u) => {
      const text = [u.statement_ja, u.problem_ja, u.goal_ja, u.action_ja, ...(u.observations_ja || []), ...(u.reasons || []).map((r) => r.text), ...(u.conditions_ja || []), ...(u.exceptions_ja || []), ...(u.topic_ids || []).map((t) => topics.get(t) || "")]
        .join(" ").normalize("NFKC").toLowerCase();
      const hit = ts.filter((t) => text.includes(t));
      return { id: u.id, hit, score: hit.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

module.exports = { load, check, terms, searchUnits, RELATION_TYPES };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const ctx = load();
  if (cmd === "check") {
    const errors = check(ctx);
    console.log(errors.length ? errors.join("\n") : `OK：判断の部品 ${ctx.du.units.length}件、出典 ${ctx.du.sources.length}件`);
    process.exit(errors.length ? 1 : 0);
  } else if (cmd === "search") {
    const q = args.join(" ");
    console.log(`語：${terms(q).join("、")}`);
    for (const r of searchUnits(q, ctx).slice(0, 8)) console.log(`  ${r.score}  ${r.id}（${r.hit.join("、")}）`);
  } else {
    console.error('usage: node tools/experiments/decision-units.js check | search "質問"');
    process.exit(1);
  }
}
