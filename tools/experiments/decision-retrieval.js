#!/usr/bin/env node
// Phase 5C：判断材料（data/experiments/decision-units.json）の検索・比較の実験
//
//   node tools/experiments/decision-retrieval.js search "質問"   方式C（構造化情報を使う検索）の結果を表示する
//   node tools/experiments/decision-retrieval.js eval            質問セット（decision-questions.json）で方式B・Cを評価する
//
// 方式B は Phase 5B の素朴な語の一致（decision-units.js の searchUnits）。
// 方式C は次の一般的な規則だけを加えたもの（質問セット専用の語や、個別の順位調整は入れない）：
//   1. 質問の語を既存の Topic の別名で Topic に対応づける（Phase 5A の topicMatcher を再利用。大分類は除く、下位の Topic を含む）
//   2. 判断材料の項目ごとに重みを付けて語を照合する（要旨・問題・状況・条件・例外 = 2、行動・理由・目的 = 1）
//   3. Topic が1つも一致せず、照合した語も2語未満の材料は返さない。返すものがなければ「該当なし」
//   4. 否定は区別しない（質問に否定の形があることを示すだけ）
// アプリの検索とは別で、アプリは読み込まない。
"use strict";
const path = require("path");
const { topicMatcher } = require("../candidates/lib");
const { load, terms, searchUnits } = require("./decision-units");

const ROOT = path.join(__dirname, "..", "..");
const NEGATION = /ない|ず[にでと、。]|ずに|べきではない|しない|避け|やめ/;

function descendantsOf(topics) {
  const children = new Map();
  for (const t of topics) for (const p of t.parent_ids) children.set(p, [...(children.get(p) || []), t.id]);
  return (id) => {
    const out = new Set([id]);
    const stack = [id];
    while (stack.length) for (const c of children.get(stack.pop()) || []) if (!out.has(c)) { out.add(c); stack.push(c); }
    return out;
  };
}

/** 方式C */
function searchC(q, { du, dataset }) {
  const match = topicMatcher(dataset.topics);
  const desc = descendantsOf(dataset.topics);
  const qTopics = match(q);
  const ts = terms(q);
  const label = new Map(dataset.topics.map((t) => [t.id, [t.label_ja, ...t.aliases_ja].join(" ")]));
  const norm = (s) => (s || "").normalize("NFKC").toLowerCase();
  const results = du.units.map((u) => {
    const strong = norm([u.statement_ja, u.problem_ja, ...u.observations_ja, ...u.conditions_ja, ...u.exceptions_ja].join(" "));
    const weak = norm([u.action_ja, u.goal_ja, ...u.reasons.map((r) => r.text), ...u.topic_ids.map((t) => label.get(t) || "")].join(" "));
    const topicHits = qTopics.filter((qt) => u.topic_ids.some((ut) => desc(qt).has(ut)));
    const termHits = ts.filter((t) => strong.includes(t) || weak.includes(t));
    const score = 3 * topicHits.length + ts.reduce((a, t) => a + (strong.includes(t) ? 2 : weak.includes(t) ? 1 : 0), 0);
    return { id: u.id, score, topicHits, termHits };
  });
  const kept = results.filter((r) => r.topicHits.length > 0 || r.termHits.length >= 2).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { qTopics, terms: ts, negation: NEGATION.test(q), hits: kept };
}

/** 方式B・C を質問セットで評価する（上位3件で見る）*/
function evaluate(ctx = load(), K = 3) {
  const qs = require(path.join(ROOT, "data", "experiments", "decision-questions.json")).questions;
  const judge = (q, ids) => {
    const top = ids.slice(0, K);
    const relevant = new Set([...q.primary, ...q.acceptable]);
    return {
      top,
      primaryInTop: q.primary.filter((p) => top.includes(p)).length,
      primaryRank: q.primary.map((p) => (ids.indexOf(p) + 1) || null),
      irrelevantInTop: top.filter((id) => !relevant.has(id)).length,
      trapsInTop: top.filter((id) => q.traps.includes(id)),
      returned: ids.length,
      noneCorrect: q.expected_none ? ids.length === 0 : null,
    };
  };
  return qs.map((q) => {
    const c = searchC(q.text, ctx);
    return {
      id: q.id,
      expected_none: q.expected_none,
      primary: q.primary,
      negation: c.negation,
      B: judge(q, searchUnits(q.text, ctx).map((r) => r.id)),
      C: judge(q, c.hits.map((r) => r.id)),
      C_topics: c.qTopics,
    };
  });
}

module.exports = { searchC, evaluate };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const ctx = load();
  if (cmd === "search") {
    const r = searchC(args.join(" "), ctx);
    console.log(`Topic：${r.qTopics.join("、") || "なし"}／語：${r.terms.join("、")}${r.negation ? "／否定を含む（検索では区別しない）" : ""}`);
    if (!r.hits.length) console.log("  該当なし");
    for (const h of r.hits.slice(0, 8)) console.log(`  ${h.score}  ${h.id}（Topic：${h.topicHits.join("、") || "-"}／語：${h.termHits.join("、") || "-"}）`);
  } else if (cmd === "eval") {
    console.log(JSON.stringify(evaluate(ctx), null, 1));
  } else {
    console.error('usage: node tools/experiments/decision-retrieval.js search "質問" | eval');
    process.exit(1);
  }
}
