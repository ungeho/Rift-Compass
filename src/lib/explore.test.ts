import { describe, expect, it } from "vitest";
import { classify, exploreKey, groupWeights, pickInGroup, pickNext, type ExploreItem, type TopicGraph } from "./explore";

/** 再現できる乱数（mulberry32）*/
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 大分類 A（a1・a2）と B（b1）
const parents: Record<string, string[]> = { A: [], B: [], a1: ["A"], a2: ["A"], b1: ["B"] };
const walk = (start: string, next: (id: string) => string[]) => {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length) for (const n of next(stack.pop()!)) if (!seen.has(n)) (seen.add(n), stack.push(n));
  return seen;
};
const graph: TopicGraph = {
  descendants: (id) => walk(id, (x) => Object.keys(parents).filter((k) => parents[k].includes(x))),
  ancestors: (id) => walk(id, (x) => parents[x] ?? []),
};
const items: ExploreItem[] = [
  { kind: "resource", id: "r1", topicIds: ["a1"] },
  { kind: "resource", id: "r2", topicIds: ["a2"] },
  { kind: "resource", id: "r3", topicIds: ["b1"] },
  { kind: "decision", id: "d1", topicIds: ["a1"], relatedIds: ["d2"] },
  { kind: "decision", id: "d2", topicIds: ["b1"] },
];
const ids = (xs: ExploreItem[]) => xs.map((x) => x.id).sort();

describe("距離の分類", () => {
  it("近い＝選んだ Topic とその下位、中間＝上位の配下の Topic か明示的な関係、遠い＝それ以外", () => {
    const c = classify(items, "a1", graph);
    expect(ids(c.near)).toEqual(["d1", "r1"]);
    expect(ids(c.middle)).toEqual(["d2", "r2"]);
    expect(c.middleReason.get("resource:r2")).toBe("topic");
    expect(c.middleReason.get("decision:d2")).toBe("relation");
    expect(ids(c.far)).toEqual(["r3"]);
  });
  it("Topic を変えると候補が変わる", () => {
    const c = classify(items, "b1", graph);
    expect(ids(c.near)).toEqual(["d2", "r3"]);
    expect(ids(c.middle)).toEqual(["d1"]); // d1 → d2 の関係
    expect(ids(c.far)).toEqual(["r1", "r2"]);
  });
});

describe("距離スライダーの重み", () => {
  it("0 は近いだけ、50 は中間が半分、100 は遠いだけ。合計は1", () => {
    expect(groupWeights(0)).toEqual({ near: 1, middle: 0, far: 0 });
    expect(groupWeights(50)).toEqual({ near: 0.25, middle: 0.5, far: 0.25 });
    expect(groupWeights(100)).toEqual({ near: 0, middle: 0, far: 1 });
    for (const d of [0, 10, 30, 70, 90]) {
      const w = groupWeights(d);
      expect(w.near + w.middle + w.far).toBeCloseTo(1);
    }
  });
  it("抽選の傾向がスライダーで変わる（同じ乱数の種で再現できる）", () => {
    const tally = (d: number) => {
      const rng = seeded(7);
      const n = { near: 0, middle: 0, far: 0 };
      for (let i = 0; i < 600; i++) n[pickNext({ items, topicId: "a1", distance: d, seen: [], graph, rng })!.group]++;
      return n;
    };
    expect(tally(0)).toEqual({ near: 600, middle: 0, far: 0 });
    expect(tally(100)).toEqual({ near: 0, middle: 0, far: 600 });
    const mid = tally(50);
    expect(mid.middle).toBeGreaterThan(mid.near);
    expect(mid.middle).toBeGreaterThan(mid.far);
    expect(tally(30).near).toBeGreaterThan(tally(70).near);
    expect(tally(50)).toEqual(mid);
  });
});

describe("偏り・重複・候補切れ", () => {
  it("件数の多い Topic に偏らない（Topic を均等に選んでから1件）", () => {
    const many: ExploreItem[] = [...Array.from({ length: 10 }, (_, i) => ({ kind: "resource" as const, id: `x${i}`, topicIds: ["a1"] })), { kind: "resource", id: "y", topicIds: ["a2"] }];
    const rng = seeded(3);
    let y = 0;
    for (let i = 0; i < 2000; i++) if (pickInGroup(many, rng).id === "y") y++;
    expect(y / 2000).toBeGreaterThan(0.4);
    expect(y / 2000).toBeLessThan(0.6);
  });
  it("一巡するまで同じ知識を出さず、一巡したら知らせて、直前の1件は続けて出さない", () => {
    const rng = seeded(11);
    let seen: string[] = [];
    const shown: string[] = [];
    const flags: boolean[] = [];
    for (let i = 0; i < 9; i++) {
      const r = pickNext({ items, topicId: "a1", distance: 0, seen, graph, rng })!;
      seen = r.seen;
      shown.push(exploreKey(r.item));
      flags.push(r.cycled);
    }
    // 近いだけ（距離0）の候補は2件：1巡目は重複なし、以後も連続しない
    expect(new Set(shown.slice(0, 2)).size).toBe(2);
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1]);
    expect(flags[0]).toBe(false);
    expect(flags[2]).toBe(true);
  });
  it("選んだ距離に候補がなければ、スライダーに近い側の別のグループから出して知らせる", () => {
    const noFar = items.filter((x) => x.id !== "r3");
    const r = pickNext({ items: noFar, topicId: "a1", distance: 100, seen: [], graph, rng: seeded(1) })!;
    expect(r.fellBack).toBe(true);
    expect(r.group).toBe("middle");
  });
  it("候補が1件だけでも動き、候補がなければ null", () => {
    const one: ExploreItem[] = [{ kind: "resource", id: "r1", topicIds: ["a1"] }];
    const a = pickNext({ items: one, topicId: "a1", distance: 0, seen: [], graph, rng: seeded(1) })!;
    const b = pickNext({ items: one, topicId: "a1", distance: 0, seen: a.seen, graph, rng: seeded(1) })!;
    expect(b.item.id).toBe("r1");
    expect(b.cycled).toBe(true);
    expect(pickNext({ items: [], topicId: "a1", distance: 0, seen: [], graph, rng: seeded(1) })).toBeNull();
  });
});

describe("近い候補が1件だけの Topic", () => {
  it("直前と同じ1件を続けて出さず、スライダーに近い側の別のグループから出して知らせる", () => {
    const first = pickNext({ items, topicId: "a2", distance: 0, seen: [], graph, rng: seeded(5) })!;
    expect(first.item.id).toBe("r2");
    const second = pickNext({ items, topicId: "a2", distance: 0, seen: first.seen, graph, rng: seeded(5) })!;
    expect(second.item.id).not.toBe("r2");
    expect(second.group).toBe("middle");
    expect(second.fellBack).toBe(true);
    expect(second.cycled).toBe(true);
  });
});
