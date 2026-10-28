// Phase 5D：判断材料（試験）の閲覧用データ。
// data/experiments/decision-units.json（Phase 5B）と decision-criteria.json（Phase 5E：追加の判断材料・具体的な目安・資料間の比較）を
// そのまま読み込み、表示する対象を SHOWCASE_IDS に絞る。
// 実験データは変更しない。検索・推奨には使わず、Topic による明示的な絞り込みと閲覧だけに使う。
// 選ばなかった判断材料と理由は docs/experiments/decision-browse.md に記録している。
import raw from "../../data/experiments/decision-units.json";
import rawCriteria from "../../data/experiments/decision-criteria.json";
import { index } from "./dataset";

export interface DecisionReason {
  basis: "source" | "ai";
  text: string;
}

export interface DecisionEvidence {
  source: string;
  locator: string | { start_sec?: number; end_sec?: number; label?: string };
  evidence_type: string;
  checked_level: string;
}

export interface DecisionRelation {
  to: string;
  type: string;
  note_ja?: string;
}

export interface DecisionUnit {
  id: string;
  statement_ja: string;
  kind: "decision" | "principle";
  problem_ja: string;
  observations_ja: string[];
  goal_ja: string;
  action_ja: string;
  reasons: DecisionReason[];
  alternatives_ja: string[];
  costs_ja: string[];
  conditions_ja: string[];
  exceptions_ja: string[];
  scope: { roles: string[]; champions: string; matchup: string };
  patch_dependency_ja: string;
  unknowns_ja: string[];
  topic_ids: string[];
  proposed_status: string;
  evidence: DecisionEvidence[];
  relations: DecisionRelation[];
}

export interface DecisionSource {
  id: string;
  resource_id: string | null;
  candidate_key?: string | null;
  url: string;
  author: string;
  published: string;
  read: string;
  coverage: { status: "full" | "partial"; unread_ja?: string };
}

interface DecisionData {
  checked_at: string;
  sources: DecisionSource[];
  units: DecisionUnit[];
}

/** 具体的な目安。数値は原典の言い方のまま、対象・観測方法・前提とともに持つ */
export interface DecisionCriterion {
  id: string;
  unit_id: string | null;
  about_ja: string;
  value_ja: string;
  target_ja: string;
  observe_ja: string;
  context_ja: string;
  source: string;
  locator: string;
  basis: "source" | "ai";
}

/** 資料間の比較。verdict は conflict（同じ条件で矛盾）／different_conditions（条件が違う）／undetermined（判断できない）*/
export interface DecisionComparison {
  id: string;
  title_ja: string;
  goal_ja: string;
  items: string[];
  related_note?: string;
  differences_ja: string[];
  premise_differences_ja: string[];
  verdict: "conflict" | "different_conditions" | "undetermined";
  verdict_ja: string;
  undetermined_ja: string[];
}

interface CriteriaData extends DecisionData {
  coverage_updates: { source: string; read_added: string; unread_ja: string }[];
  criteria: DecisionCriterion[];
  comparisons: DecisionComparison[];
}

const base = raw as unknown as DecisionData;
const extra = rawCriteria as unknown as CriteriaData;
// Phase 5E で追加で読んだ範囲を、Phase 5B の出典の確認範囲に反映する（Phase 5B のファイルは変更しない）
const updates = new Map(extra.coverage_updates.map((u) => [u.source, u]));
const data: DecisionData = {
  checked_at: base.checked_at,
  sources: [...base.sources, ...extra.sources].map((s) => {
    const u = updates.get(s.id);
    return u ? { ...s, read: `${s.read}／${u.read_added}`, coverage: { status: "partial", unread_ja: u.unread_ja } } : s;
  }),
  units: [...base.units, ...extra.units],
};

/**
 * 試験表示する判断材料（Phase 5D の9件、Phase 5E の5件、Phase 6A の5件）。選定基準：ロール共通・MID を優先し、理由と成立条件が具体的で、
 * 確認箇所が明確なもの。条件の違い（有利／不利、押す／押さない、現行／過去のパッチ）を並べて比べられるよう、
 * 対になる材料を含め、著者が偏らないようにした。
 */
export const SHOWCASE_IDS = [
  "du-behind-keep-wave-own-side",
  "du-freeze-not-always",
  "du-freeze-when-behind-dignitas",
  "du-mid-freeze-hard",
  "du-dopa-tf-fizz-pull-wave",
  "du-roam-do-not-chase",
  "du-trade-checklist",
  "du-mid-recall-4th-wave",
  "du-vlad-keystone-by-matchup",
  // Phase 5E：具体的な目安（数値・観測項目）を持つもの
  "du-freeze-extra-casters-loltheory",
  "du-recall-resource-threshold",
  "du-jungle-tracking-cs-div4",
  "du-mid-lvl1-no-hard-push",
  "du-mid-join-scuttle-checklist",
  // Phase 6A：観測項目・例外・代替案が原典に書かれていて、表示中の材料と別の場面・別の著者の視点を加えるもの
  // （選定理由と選ばなかった材料は docs/experiments/decision-showcase-expansion.md）
  "du-roam-counter-action",
  "du-plates-vs-clean-recall",
  "du-fast-push-on-enemy-recall",
  "du-half-push-gets-frozen",
  "du-lv2-duo-minion-count",
] as const;

const unitById = new Map(data.units.map((u) => [u.id, u]));
export const sourceById = new Map(data.sources.map((s) => [s.id, s]));
export const decisionsCheckedAt = data.checked_at;
export const criteriaCheckedAt = extra.checked_at;

export const allCriteria: DecisionCriterion[] = extra.criteria;
export const comparisons: DecisionComparison[] = extra.comparisons;
const criterionById = new Map(allCriteria.map((c) => [c.id, c]));
export const criterionOf = (id: string) => criterionById.get(id);
/** 判断材料に付いた具体的な目安 */
export const criteriaForUnit = (unitId: string) => allCriteria.filter((c) => c.unit_id === unitId);
/** 判断材料の目安を含む比較 */
export const comparisonsForUnit = (unitId: string) => comparisons.filter((m) => m.items.some((id) => criterionById.get(id)?.unit_id === unitId));

export const VERDICT_LABELS: Record<DecisionComparison["verdict"], string> = {
  conflict: "同じ条件で主張が矛盾している",
  different_conditions: "条件や数え方が違い、直接は比較できない（同じ条件で矛盾しないかは未確認）",
  undetermined: "矛盾かどうか判断できない",
};

export const showcaseDecisions: DecisionUnit[] = SHOWCASE_IDS.map((id) => {
  const u = unitById.get(id);
  if (!u) throw new Error(`判断材料 ${id} が実験データにない`);
  return u;
});

const showcaseSet = new Set<string>(SHOWCASE_IDS);
export const isShowcased = (id: string) => showcaseSet.has(id);
export const decisionById = (id: string) => (showcaseSet.has(id) ? unitById.get(id) : undefined);

/** Topic（下位の Topic を含む）に付いている、試験表示の判断材料。該当がなければ空配列（判断を作り出さない）*/
export function decisionsForTopic(topicId: string): DecisionUnit[] {
  const desc = index.descendants(topicId);
  return showcaseDecisions.filter((u) => u.topic_ids.some((t) => desc.has(t)));
}

/** 正式資料を出典にもつ、試験表示の判断材料 */
export function decisionsForResource(resourceId: string): DecisionUnit[] {
  return showcaseDecisions.filter((u) => u.evidence.some((e) => sourceById.get(e.source)?.resource_id === resourceId));
}

/** 試験表示の判断材料に付いている Topic（絞り込みの選択肢）*/
export function showcaseTopicIds(): string[] {
  return [...new Set(showcaseDecisions.flatMap((u) => u.topic_ids))].filter((t) => index.topicById.has(t));
}

// 「記載なし」の2種類（Phase 5B 最終確認で書き分けたもの）
export const NONE_FULL = "記載なし（全体を確認）";
export const NONE_PARTIAL = "確認範囲に記載なし（未読の範囲あり）";
export const isNone = (s: string) => s === NONE_FULL || s === NONE_PARTIAL;

export const RELATION_LABELS: Record<string, string> = {
  same_conclusion_independent: "別の著者が同じ結論を述べている",
  same_author_restated: "同じ著者の再説明（独立した根拠ではない）",
  condition_differs: "結論は近いが、条件や理由が違う",
  exception_of: "例外の関係",
  conflicts_with: "主張が対立している",
  complements: "補い合う",
  same_source_restated: "同じ原典の翻訳・再説明",
};

export const ROLE_LABELS: Record<string, string> = { mid: "ミッド", top: "トップ", bot: "ボット", support: "サポート", jungle: "ジャングル", all: "ロール共通" };

/** 確認箇所の表示用の文字列と、動画の開始秒（記録にある場合だけ）*/
export function locatorOf(e: DecisionEvidence): { text: string; startSec?: number } {
  if (typeof e.locator === "string") return { text: e.locator };
  return { text: e.locator.label ?? "", startSec: e.locator.start_sec };
}
