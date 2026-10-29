// 知識の散策（試験）の抽選ロジック。画面やデータの読み込みから切り離し、乱数を注入して再現できるようにする。
// 距離は Topic の構造による近似で、内容の近さ・遠さを保証しない。推薦や正しさの判定もしない。

export type ExploreKind = "resource" | "decision";
export type ExploreGroup = "near" | "middle" | "far";
export const GROUPS: ExploreGroup[] = ["near", "middle", "far"];

/** 抽選の対象1件。データの種類によらず、id・Topic・明示的な関係だけを持つ */
export interface ExploreItem {
  kind: ExploreKind;
  id: string;
  topicIds: string[];
  /** 同じ種類の知識への明示的な関係（判断材料の relations など）*/
  relatedIds?: string[];
}

/** Topic の構造。index（data/dataset.ts）が満たす形 */
export interface TopicGraph {
  /** topic 自身とその子孫 */
  descendants(topicId: string): Set<string>;
  /** topic 自身とその祖先 */
  ancestors(topicId: string): Set<string>;
}

/** 中間に入った理由（topic：上位・同じ大分類の Topic でつながる、relation：判断材料どうしの明示的な関係）*/
export type MiddleReason = "topic" | "relation";

export interface Classified {
  near: ExploreItem[];
  middle: ExploreItem[];
  far: ExploreItem[];
  middleReason: Map<string, MiddleReason>;
}

const keyOf = (x: ExploreItem) => `${x.kind}:${x.id}`;

/**
 * 選んだ Topic との距離で3つに分ける。
 * - 近い：選んだ Topic かその下位の Topic が付いている
 * - 中間：近い Topic の上位（大分類など）の配下の Topic が付いている、または近い判断材料と明示的な関係がある
 * - 遠い：上のどちらでもない
 */
export function classify(items: ExploreItem[], topicId: string, graph: TopicGraph): Classified {
  const nearTopics = graph.descendants(topicId);
  const middleTopics = new Set<string>();
  for (const n of nearTopics) {
    for (const a of graph.ancestors(n)) {
      if (nearTopics.has(a)) continue;
      for (const d of graph.descendants(a)) if (!nearTopics.has(d)) middleTopics.add(d);
    }
  }
  const near = items.filter((x) => x.topicIds.some((t) => nearTopics.has(t)));
  const nearKeys = new Set(near.map(keyOf));
  const relatedToNear = new Set<string>();
  for (const x of near) for (const r of x.relatedIds ?? []) relatedToNear.add(`${x.kind}:${r}`);
  const middle: ExploreItem[] = [];
  const far: ExploreItem[] = [];
  const middleReason = new Map<string, MiddleReason>();
  for (const x of items) {
    const k = keyOf(x);
    if (nearKeys.has(k)) continue;
    if (x.topicIds.some((t) => middleTopics.has(t))) {
      middle.push(x);
      middleReason.set(k, "topic");
    } else if (relatedToNear.has(k) || (x.relatedIds ?? []).some((r) => nearKeys.has(`${x.kind}:${r}`))) {
      middle.push(x);
      middleReason.set(k, "relation");
    } else far.push(x);
  }
  return { near, middle, far, middleReason };
}

/**
 * 距離（0〜100）から、各グループを選ぶ重み。0 は近いだけ、50 は中間が半分、100 は遠いだけ。
 * 2次のベルンシュタイン多項式で、スライダーを動かすと割合がなめらかに変わる。合計は1。
 */
export function groupWeights(distance: number): Record<ExploreGroup, number> {
  const t = Math.min(100, Math.max(0, distance)) / 100;
  return { near: (1 - t) ** 2, middle: 2 * t * (1 - t), far: t ** 2 };
}

/** 重みが0より大きいグループに候補がないときに試す順番（スライダーに近い側から）*/
const fallbackOrder = (distance: number): ExploreGroup[] => (distance <= 50 ? ["near", "middle", "far"] : ["far", "middle", "near"]);

/**
 * グループの中から1件。件数の多い Topic に偏らないよう、先頭の Topic ごとにまとめて Topic を均等に選び、
 * その中から1件を均等に選ぶ。
 */
export function pickInGroup(candidates: ExploreItem[], rng: () => number): ExploreItem {
  const buckets = new Map<string, ExploreItem[]>();
  for (const x of candidates) {
    const b = x.topicIds[0] ?? "";
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(x);
  }
  const keys = [...buckets.keys()].sort();
  const bucket = buckets.get(keys[Math.floor(rng() * keys.length)])!;
  return bucket[Math.floor(rng() * bucket.length)];
}

export interface PickResult {
  item: ExploreItem;
  group: ExploreGroup;
  /** 中間のとき、つながりの種類 */
  middleReason?: MiddleReason;
  /** 選んだ距離のグループに候補がなく、別のグループから出した */
  fellBack: boolean;
  /** すべての候補を一度ずつ表示し終えたので、表示済みの記録を空にしてから選んだ（直前の1件は除く）*/
  cycled: boolean;
  /** 次の抽選に渡す表示済みの記録 */
  seen: string[];
}

/**
 * 次の1件を選ぶ。
 * 1. 距離の重みが0より大きいグループのうち、候補があるものを対象にする。どれにも候補がなければ、
 *    スライダーに近い側から順に、候補のある1グループを対象にする（fellBack）。
 * 2. 対象のグループの中で、表示済み（seen）でない候補から、重みに比例してグループを選び、その中から1件選ぶ。
 * 3. 対象の候補をすべて表示し終えたら、表示済みの記録を空にして一巡し直す（cycled）。
 *    このとき直前に表示した1件は続けて出さない。対象の候補がその1件しかなければ、
 *    スライダーに近い側の別のグループから出す（fellBack）。候補全体が1件だけのときは同じ1件を出す。
 * 候補が1件もなければ null。
 */
export function pickNext(args: {
  items: ExploreItem[];
  topicId: string;
  distance: number;
  seen: string[];
  graph: TopicGraph;
  rng: () => number;
}): PickResult | null {
  const { items, topicId, distance, graph, rng } = args;
  const c = classify(items, topicId, graph);
  const w = groupWeights(distance);
  let targets = GROUPS.filter((g) => w[g] > 0 && c[g].length > 0);
  let fellBack = false;
  if (targets.length === 0) {
    const g = fallbackOrder(distance).find((x) => c[x].length > 0);
    if (!g) return null;
    targets = [g];
    fellBack = true;
  }
  const weightOf = (g: ExploreGroup) => (fellBack ? 1 : w[g]);
  const unseenIn = (seen: Set<string>) => (g: ExploreGroup) => c[g].filter((x) => !seen.has(keyOf(x)));

  let seen = args.seen;
  let cycled = false;
  let unseen = unseenIn(new Set(seen));
  if (targets.every((g) => unseen(g).length === 0)) {
    cycled = true;
    const last = seen[seen.length - 1];
    seen = last && items.length > 1 ? [last] : [];
    unseen = unseenIn(new Set(seen));
    if (targets.every((g) => unseen(g).length === 0)) {
      // 対象の候補が直前の1件だけ：同じものを続けて出さず、スライダーに近い側の別のグループへ
      const g = fallbackOrder(distance).find((x) => !targets.includes(x) && unseen(x).length > 0);
      if (!g) return null;
      targets = [g];
      fellBack = true;
    }
  }
  const usable = targets.filter((g) => unseen(g).length > 0);
  const sum = usable.reduce((n, g) => n + weightOf(g), 0);
  let r = rng() * sum;
  let group = usable[usable.length - 1];
  for (const g of usable) {
    if (r < weightOf(g)) {
      group = g;
      break;
    }
    r -= weightOf(g);
  }
  const item = pickInGroup(unseen(group), rng);
  const middleReason = group === "middle" ? c.middleReason.get(keyOf(item)) : undefined;
  return { item, group, middleReason, fellBack, cycled, seen: [...seen, keyOf(item)] };
}

export { keyOf as exploreKey };
