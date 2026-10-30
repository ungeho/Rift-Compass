// Phase 5D：判断材料（試験）の閲覧用データ。
// data/experiments/decision-units.json（Phase 5B）と、同じ形の追加ファイル decision-criteria.json（Phase 5E）・
// side-wave-decisions.json（Phase 6B）・wave-technique-decisions.json（発見性レビュー）・decision-examples.json（既存の判断材料の具体例）・
// new-decision-units.json（新規判断材料の収録試験）
// （追加の判断材料・具体的な目安・資料間の比較・具体例）をそのまま読み込み、表示する対象を SHOWCASE_IDS に絞る。
// 実験データは変更しない。検索・推奨には使わず、Topic による明示的な絞り込みと閲覧だけに使う。
// 選ばなかった判断材料と理由は docs/experiments/decision-browse.md に記録している。
import raw from "../../data/experiments/decision-units.json";
import rawCriteria from "../../data/experiments/decision-criteria.json";
import rawSideWave from "../../data/experiments/side-wave-decisions.json";
import rawWaveTechnique from "../../data/experiments/wave-technique-decisions.json";
import rawExamples from "../../data/experiments/decision-examples.json";
import rawNewUnits from "../../data/experiments/new-decision-units.json";
import sideWaveDiagramUrl from "../../docs/experiments/side-wave-diagram.svg";
import { index } from "./dataset";
import { analyzeQuery, containsTerm, expandLevelAbbr, normalize } from "../search/search";

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
  related_note?: string | null;
  differences_ja: string[];
  premise_differences_ja: string[];
  verdict: "conflict" | "different_conditions" | "undetermined";
  verdict_ja: string;
  undetermined_ja: string[];
}

/**
 * 既存の判断材料に付ける具体例（別の出典による実戦例・具体化）。判断材料の evidence には加えない。
 * 具体例の出典が裏付けるのはその具体例だけで、判断材料全体の出典ではない。
 */
export interface DecisionExample {
  id: string;
  unit_id: string;
  title_ja: string;
  /** 原典で確認した内容 */
  source_ja: string;
  /** 仕様上の根拠（任意）と、その出典 */
  spec_ja?: string;
  spec_source?: string;
  /** AI の整理（原典には書かれていない）*/
  ai_ja: string;
  unverified_ja: string[];
  scope_ja: string;
  /** 検索画面で、この具体例を案内する語（解説者名など）。教材の検索とは別に、語の一致だけで案内する */
  search_terms?: string[];
  evidence: DecisionEvidence;
}

interface CriteriaData extends DecisionData {
  coverage_updates: { source: string; read_added: string; unread_ja: string }[];
  criteria: DecisionCriterion[];
  comparisons: DecisionComparison[];
  examples?: DecisionExample[];
}

const base = raw as unknown as DecisionData;
const criteriaFile = rawCriteria as unknown as CriteriaData;
const sideWaveFile = rawSideWave as unknown as CriteriaData;
const waveTechniqueFile = rawWaveTechnique as unknown as CriteriaData;
const examplesFile = rawExamples as unknown as CriteriaData;
const newUnitsFile = rawNewUnits as unknown as CriteriaData;
// 追加ファイルを順に合わせる（tools/experiments/decision-criteria.js の loadMerged と同じ規則）
const extraFiles = [criteriaFile, sideWaveFile, waveTechniqueFile, examplesFile, newUnitsFile];
const extra = {
  coverage_updates: extraFiles.flatMap((f) => f.coverage_updates),
  sources: extraFiles.flatMap((f) => f.sources),
  units: extraFiles.flatMap((f) => f.units),
  criteria: extraFiles.flatMap((f) => f.criteria),
  comparisons: extraFiles.flatMap((f) => f.comparisons),
  examples: extraFiles.flatMap((f) => f.examples ?? []),
};
// 追加で読んだ範囲を、出典の確認範囲に積み重ねる。未読の範囲は後のファイルの記録を使う（Phase 5B・5E のファイルは変更しない）
const data: DecisionData = {
  checked_at: base.checked_at,
  sources: [...base.sources, ...extra.sources].map((s) => {
    const us = extra.coverage_updates.filter((u) => u.source === s.id);
    if (!us.length) return s;
    return { ...s, read: [s.read, ...us.map((u) => u.read_added)].join("／"), coverage: { status: "partial", unread_ja: us[us.length - 1].unread_ja } };
  }),
  units: [...base.units, ...extra.units],
};

/**
 * 試験表示する判断材料（Phase 5D の9件、Phase 5E の5件、Phase 6A の5件、Phase 6B の4件、発見性レビューの2件、新規判断材料の収録試験の3件）。選定基準：ロール共通・MID を優先し、理由と成立条件が具体的で、
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
  // Phase 6B：サイドウェーブの方向とミニマップ。観測→解釈→予測→行動→例外が原典で読み取れるもの
  // （選定理由と表示しなかった材料は docs/experiments/side-wave-decisions.md）
  "du-wave-drift-by-meeting-point",
  "du-slow-push-advantage-by-position",
  "du-minimap-next-enemy-wave",
  "du-bounce-after-crash",
  // 発見性レビュー：レベル1・スロープッシュの大きなウェーブ（docs/experiments/wave-discovery-review.md）。
  // du-first-wave-aggro-release は2019年の歴史的な説明で現行パッチでの成立を確認できないため、実用的な手順と誤解されないよう表示しない
  "du-lvl1-contest-or-concede",
  "du-slow-push-big-wave-trade",
  // 新規判断材料の収録試験：既存の判断材料に対応先がなかった原典から作ったもの（docs/experiments/new-decision-unit-pilot.md）
  "du-support-to-mid-when-bot-lost",
  "du-no-force-retake-when-allies-winning",
  "du-early-recall-vs-ignite-with-tp",
] as const;

/**
 * 「知りたいことから探す」の入口。利用者が判断材料のタイトル・ID・Topic を知らなくても、自然文の疑問から既存の判断材料に届くようにする。
 * 新しい検索はせず、疑問と判断材料を手で対応させる（リンクはここだけで管理し、トップ画面と判断材料の一覧の両方が使う）。
 */
export const QUESTION_ENTRANCES: { question_ja: string; unit_id: (typeof SHOWCASE_IDS)[number] }[] = [
  { question_ja: "放置したウェーブはどちらへ進む？", unit_id: "du-wave-drift-by-meeting-point" },
  { question_ja: "スロープッシュには何体多く必要？", unit_id: "du-slow-push-advantage-by-position" },
  { question_ja: "敵の次のウェーブは、ミニマップのどこにいる？", unit_id: "du-minimap-next-enemy-wave" },
  { question_ja: "レベル1でウェーブを押す？相手に押させる？", unit_id: "du-lvl1-contest-or-concede" },
  { question_ja: "スロープッシュの大きなウェーブは、何に使う？", unit_id: "du-slow-push-big-wave-trade" },
];

/** 判断材料に付ける模式図（Phase 6C）。原典の画像ではなく、原典の説明をもとに作ったオリジナルの図 */
export interface DecisionDiagram {
  unit_id: string;
  src: string;
  alt: string;
  compares_ja: string;
  premises_ja: string[];
  sources: string[];
  /** なぜそうなるか。原典にある説明（source）と、AI の整理（ai）を分けて持つ */
  why: DecisionReason[];
}

// SVG は docs/experiments/ の1ファイルだけを管理し、ビルド時にアセットとして読み込む（複製しない）
export const DIAGRAMS: DecisionDiagram[] = [
  {
    unit_id: "du-wave-drift-by-meeting-point",
    src: sideWaveDiagramUrl,
    alt:
      "模式図。両軍のミニオンの数・体力が同じで、プレイヤーが触らない場合の3つの例。自陣タワー寄りでぶつかると相手側へ押し始め、中央では大きくは動かず、敵タワー寄りでは自分側へ押し返される。理由は、タワーに近い側の援軍が先に着くため。",
    compares_ja: "ウェーブがぶつかる位置（自陣タワー寄り・中央・敵タワー寄り）と、放置したときにウェーブが進む向き",
    premises_ja: ["両軍のミニオンの数と体力が同じ", "プレイヤーがウェーブに触らない", "ミニオンの強化やスーパーミニオンで、どちらかのウェーブが強くなっていない"],
    sources: ["src-xcewl", "src-wiki-farm"],
    why: [
      { basis: "ai", text: "両軍の通常のミニオンは、同じ間隔で出現し、同じ条件で進む（Wiki「Minion」の出現間隔とサイドレーンの移動速度の記述を、両軍に共通とみた整理）。そのため、差が出るのはぶつかる位置になる" },
      { basis: "source", text: "ぶつかる位置が一方のタワーに近いほど、その側の次のミニオンが早く着いて加わる（Wiki「Farm」・lol-guide）" },
      { basis: "source", text: "先に援軍が着いた側は、相手のミニオンが揃う前に攻撃を始め、数の多い側として押し返す（lol-guide）" },
      { basis: "source", text: "最初のウェーブ同士がぶつかるときは、ミニオンは距離に関係なく、敵の近接ミニオン3体に攻撃を分ける（Wiki「Minion」）" },
      { basis: "ai", text: "中央付近では、どのミニオンに攻撃が集まるか、どれが先に倒れるかという小さな差で、進む向きが変わりうる。最初のウェーブは攻撃の分け方が特殊なので、差の出方は後のウェーブと同じとは限らない。どちらもゲーム内では検証していない" },
    ],
  },
];
export const diagramsForUnit = (unitId: string) => DIAGRAMS.filter((d) => d.unit_id === unitId);

const unitById = new Map(data.units.map((u) => [u.id, u]));
export const sourceById = new Map(data.sources.map((s) => [s.id, s]));
export const decisionsCheckedAt = data.checked_at;
export const criteriaCheckedAt = criteriaFile.checked_at;
export const sideWaveCheckedAt = sideWaveFile.checked_at;
export const waveTechniqueCheckedAt = waveTechniqueFile.checked_at;

export const allCriteria: DecisionCriterion[] = extra.criteria;
export const comparisons: DecisionComparison[] = extra.comparisons;
/** 判断材料に付いた具体例 */
export const examplesForUnit = (unitId: string) => extra.examples.filter((x) => x.unit_id === unitId);

let examplesByResource: Map<string, DecisionExample[]> | undefined;
/**
 * この資料（Resource）を主たる出典とする具体例。試験表示の判断材料に付いたものだけを返す。
 * 主たる出典は具体例の evidence.source だけで、仕様の補足（spec_source）は使わない。
 * 出典の resource_id が null の具体例（動画など、資料一覧に未収録の出典）は、どの資料にも結びつけない。
 * 索引は最初の呼び出しで1回だけ作る。
 */
export function examplesForResource(resourceId: string): DecisionExample[] {
  if (!examplesByResource) {
    examplesByResource = new Map();
    for (const x of extra.examples) {
      if (!showcaseSet.has(x.unit_id)) continue;
      const rid = sourceById.get(x.evidence.source)?.resource_id;
      if (!rid) continue;
      const list = examplesByResource.get(rid) ?? [];
      if (!list.some((y) => y.id === x.id)) list.push(x);
      examplesByResource.set(rid, list);
    }
  }
  return examplesByResource.get(resourceId) ?? [];
}

/** 判断材料に付いた具体例のうち、id が一致するもの（別の判断材料の具体例や、存在しない id には undefined）*/
export const exampleOf = (unitId: string, exampleId: string) => examplesForUnit(unitId).find((x) => x.id === exampleId);

// 検索語の比較用：全角・半角と大文字・小文字をそろえ、カタカナをひらがなにする（「えびンモ」と「えびんも」を同じに扱う）
const foldKana = (str: string) =>
  str.normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
/**
 * 検索語に、具体例の案内語（search_terms）が含まれる具体例。試験表示の判断材料に付いたものだけを返す。
 * 教材の検索結果には混ぜず、検索画面で別の種類のデータとして案内する。英数字の語は単語の途中では一致させない。
 */
export function examplesForQuery(query: string): DecisionExample[] {
  const q = foldKana(query);
  if (!q.trim()) return [];
  return extra.examples.filter(
    (x) =>
      showcaseSet.has(x.unit_id) &&
      (x.search_terms ?? []).some((term) => {
        const t = foldKana(term);
        if (/^[a-z0-9 ]+$/.test(t)) return new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`).test(q);
        return q.includes(t);
      }),
  );
}
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

/**
 * この判断材料を relations で参照している、試験表示の判断材料（逆引き）。関係は片方向に記録しているので、
 * 逆向きはここで導出する（データには重複登録しない）。関係の種類と注記は参照元の側の記述なので、逆向きの主張としては使わない
 */
export function referencingDecisions(unitId: string): DecisionUnit[] {
  return showcaseDecisions.filter((u) => u.id !== unitId && u.relations.some((r) => r.to === unitId));
}

/** Topic（下位の Topic を含む）に付いている、試験表示の判断材料。該当がなければ空配列（判断を作り出さない）*/
export function decisionsForTopic(topicId: string): DecisionUnit[] {
  const desc = index.descendants(topicId);
  return showcaseDecisions.filter((u) => u.topic_ids.some((t) => desc.has(t)));
}

// ロールの Topic と、判断材料の対象ロール（scope.roles）の対応。「ロール共通」（all）の判断材料は、どのロールにも当てはまるものとして扱う
const ROLE_TOPICS: Record<string, string> = { "role-mid": "mid" };

const decisionTextCache = new Map<string, string>();
/** 判断材料の照合に使う文（要旨・状況・目的・行動・見る情報・成立条件と、付いている Topic の名前・別名）*/
function decisionText(u: DecisionUnit): string {
  let s = decisionTextCache.get(u.id);
  if (s === undefined) {
    const topicText = u.topic_ids.flatMap((id) => {
      const t = index.topicById.get(id);
      return t ? [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en] : [];
    });
    s = normalize([u.statement_ja, u.problem_ja, u.goal_ja, u.action_ja, ...u.observations_ja, ...u.conditions_ja, ...topicText].join(" "));
    decisionTextCache.set(u.id, s);
  }
  return s;
}

/**
 * 検索語のすべての条件（Topic・語）に一致する、試験表示の判断材料。資料の検索結果とは別に示すためのもので、資料の順位は変えない。
 * 出典が資料一覧にない判断材料にも、検索から到達できるようにする。発信者名を含む検索は、資料の発信者と判断材料の出典を混同しないよう対象外にする
 */
export function decisionsForQuery(query: string): DecisionUnit[] {
  // 「Lv1」などの略記は、ここでだけ「レベル1」と読む（資料の検索結果は変えない）
  const { units } = analyzeQuery(expandLevelAbbr(query));
  // 大分類（ロール・レーニングなど）や一般語だけの検索では、判断材料が広く一致しすぎるので出さない。具体的な Topic を1つ以上含むときだけ照合する
  if (units.some((x) => x.kind === "creator") || !units.some((x) => x.kind === "topic" && x.topic.kind !== "category")) return [];
  return showcaseDecisions.filter((u) =>
    units.every((x) => {
      if (x.kind === "topic") {
        const desc = index.descendants(x.topic.id);
        const role = ROLE_TOPICS[x.topic.id];
        return u.topic_ids.some((t) => desc.has(t)) || (role !== undefined && u.scope.roles.some((r) => r === role || r === "all")) || containsTerm(decisionText(u), x.matched);
      }
      return x.kind === "term" && containsTerm(decisionText(u), x.matched);
    }),
  );
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
  // 結論の一致を前提にしない（条件が違えば、行動の向きが逆になる関係もある）
  condition_differs: "条件・文脈が異なる判断",
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
