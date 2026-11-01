// 知識の散策（試験）の抽選ロジック。画面やデータの読み込みから切り離し、乱数を注入して再現できるようにする。
// 距離は Topic の構造による近似で、内容の近さ・遠さを保証しない。推薦や正しさの判定もしない。

export type ExploreKind = "resource" | "decision" | "note";
export type ExploreGroup = "near" | "middle" | "far";
export const GROUPS: ExploreGroup[] = ["near", "middle", "far"];

/** 抽選の対象1件。データの種類によらず、id・Topic・明示的な関係だけを持つ */
export interface ExploreItem {
  kind: ExploreKind;
  id: string;
  topicIds: string[];
  /** 同じ種類の知識への明示的な関係（判断材料・知識ノートの relations など）*/
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

/** 複数件の抽選の1件 */
export interface ManyPick {
  item: ExploreItem;
  group: ExploreGroup;
  middleReason?: MiddleReason;
}

/** グループごとの内訳（planned：割合どおりの件数、drawn：実際に選んだ件数、available：候補の件数）*/
export type GroupBreakdown = Record<ExploreGroup, { planned: number; drawn: number; available: number }>;

export interface ManyResult {
  requested: number;
  picks: ManyPick[];
  breakdown: GroupBreakdown;
  /** 割合が0より大きい距離のグループ（抽選の対象）*/
  eligible: ExploreGroup[];
  /** 候補が足りず、要求より少ない件数になった */
  short: boolean;
  /** あるグループの候補が足りず、その分を割合が0より大きい別のグループから選んだ */
  redistributed: boolean;
}

/** 最大剰余法で、合計 total を重みに比例して整数に分ける */
function apportion(total: number, weights: Partial<Record<ExploreGroup, number>>): Record<ExploreGroup, number> {
  const gs = GROUPS.filter((g) => (weights[g] ?? 0) > 0);
  const sum = gs.reduce((n, g) => n + weights[g]!, 0);
  const out: Record<ExploreGroup, number> = { near: 0, middle: 0, far: 0 };
  if (sum === 0 || total <= 0) return out;
  const exact = gs.map((g) => ({ g, v: (total * weights[g]!) / sum }));
  for (const e of exact) out[e.g] = Math.floor(e.v);
  let rest = total - exact.reduce((n, e) => n + Math.floor(e.v), 0);
  // 端数の大きい順（同じなら GROUPS の順）に1件ずつ足す
  for (const e of [...exact].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || GROUPS.indexOf(a.g) - GROUPS.indexOf(b.g))) {
    if (rest <= 0) break;
    out[e.g]++;
    rest--;
  }
  return out;
}

/**
 * 複数件をまとめて抽選する（1回の結果の中で同じ知識を重複させない）。
 * 1. 対象は距離の割合が0より大きいグループだけ。割合が0のグループ（無関係な距離）からは選ばない。
 * 2. 要求件数を割合に比例して各グループに配分する（最大剰余法）。
 * 3. 候補が配分より少ないグループは候補の件数までにし、足りない分は、まだ候補が残る対象のグループへ
 *    割合に比例して配分し直す（redistributed）。それでも足りなければ、選べた件数だけを返す（short）。
 * 4. グループの中では、件数の多い Topic に偏らないよう pickInGroup で1件ずつ、重複なしで選ぶ。
 * 5. 表示の順は、各グループの残りの件数に比例した抽選で混ぜる。
 * 1件だけを順に見る使い方（一巡・直前の1件の除外・別グループへの切り替え）は pickNext を使う。
 */
export function pickMany(args: { items: ExploreItem[]; topicId: string; distance: number; count: number; graph: TopicGraph; rng: () => number }): ManyResult {
  const { items, topicId, distance, count, graph, rng } = args;
  const c = classify(items, topicId, graph);
  const w = groupWeights(distance);
  const eligible = GROUPS.filter((g) => w[g] > 0);
  const available = (g: ExploreGroup) => c[g].length;
  const planned = apportion(count, w);
  // 候補の件数で上限を付け、足りない分を、候補が残る対象のグループへ割合に比例して配り直す
  const take: Record<ExploreGroup, number> = { near: 0, middle: 0, far: 0 };
  for (const g of eligible) take[g] = Math.min(planned[g], available(g));
  let redistributed = false;
  for (let guard = 0; guard < 3; guard++) {
    const missing = count - GROUPS.reduce((n, g) => n + take[g], 0);
    const open = eligible.filter((g) => take[g] < available(g));
    if (missing <= 0 || open.length === 0) break;
    const extra = apportion(missing, Object.fromEntries(open.map((g) => [g, w[g]])));
    for (const g of open) {
      const add = Math.min(extra[g], available(g) - take[g]);
      if (add > 0) redistributed = true;
      take[g] += add;
    }
  }
  // 各グループから重複なしで選ぶ
  const chosen: Record<ExploreGroup, ExploreItem[]> = { near: [], middle: [], far: [] };
  for (const g of eligible) {
    const pool = [...c[g]];
    for (let i = 0; i < take[g]; i++) {
      const x = pickInGroup(pool, rng);
      chosen[g].push(x);
      pool.splice(pool.indexOf(x), 1);
    }
  }
  // 残りの件数に比例して混ぜる
  const picks: ManyPick[] = [];
  const left = { ...take };
  while (GROUPS.some((g) => left[g] > 0)) {
    const total = GROUPS.reduce((n, g) => n + left[g], 0);
    let r = rng() * total;
    let group = GROUPS.find((g) => left[g] > 0)!;
    for (const g of GROUPS) {
      if (left[g] === 0) continue;
      if (r < left[g]) {
        group = g;
        break;
      }
      r -= left[g];
    }
    const item = chosen[group][take[group] - left[group]];
    left[group]--;
    picks.push({ item, group, middleReason: group === "middle" ? c.middleReason.get(keyOf(item)) : undefined });
  }
  const breakdown = Object.fromEntries(GROUPS.map((g) => [g, { planned: planned[g], drawn: take[g], available: available(g) }])) as GroupBreakdown;
  return { requested: count, picks, breakdown, eligible, short: picks.length < count, redistributed };
}

/** Topic を限定しない全体からの抽選の結果。距離（近い・中間・遠い）は持たない */
export interface AllResult {
  requested: number;
  picks: ExploreItem[];
  /** 抽選の対象（除外を除く）の件数 */
  available: number;
  short: boolean;
  /** 表示済みの記録（1件ずつ見るとき）を使い切ったので、記録を空にしてから選んだ（直前の1件は除く）*/
  cycled: boolean;
}

/**
 * Topic を限定しない全体から、count 件を重複なしで選ぶ（散策の「すべて」）。
 * 距離の分類（classify）と割合（groupWeights）は使わない。件数の多い Topic に偏らないよう、
 * グループの中の抽選と同じ pickInGroup（先頭の Topic ごとに均等）で1件ずつ選ぶ。
 * exclude は1件ずつ見るときの表示済みの記録。除外で候補がなくなったら、記録を空にして一巡し直す（直前の1件は除く）。
 */
export function pickAll(args: { items: ExploreItem[]; count: number; rng: () => number; exclude?: string[] }): AllResult {
  const { items, count, rng } = args;
  let exclude = new Set(args.exclude ?? []);
  let cycled = false;
  let pool = items.filter((x) => !exclude.has(keyOf(x)));
  if (pool.length === 0 && items.length > 0) {
    cycled = true;
    const last = args.exclude?.[args.exclude.length - 1];
    exclude = new Set(last && items.length > 1 ? [last] : []);
    pool = items.filter((x) => !exclude.has(keyOf(x)));
  }
  const available = pool.length;
  const picks: ExploreItem[] = [];
  while (picks.length < count && pool.length > 0) {
    const x = pickInGroup(pool, rng);
    picks.push(x);
    pool.splice(pool.indexOf(x), 1);
  }
  return { requested: count, picks, available, short: picks.length < count, cycled };
}

export { keyOf as exploreKey };
