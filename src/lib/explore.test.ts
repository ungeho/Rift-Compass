import { describe, expect, it } from "vitest";
import { classify, exploreKey, groupWeights, pickInGroup, pickMany, pickNext, type ExploreItem, type TopicGraph } from "./explore";

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

describe("まとめて抽選（pickMany）", () => {
  // 近い（a1）40件、中間（a2）30件、遠い（b1）30件の合計100件
  const big: ExploreItem[] = [
    ...Array.from({ length: 40 }, (_, i) => ({ kind: "resource" as const, id: `n${i}`, topicIds: [i % 2 ? "a1" : "A"] })),
    ...Array.from({ length: 30 }, (_, i) => ({ kind: "resource" as const, id: `m${i}`, topicIds: ["a2"] })),
    ...Array.from({ length: 30 }, (_, i) => ({ kind: "decision" as const, id: `f${i}`, topicIds: ["b1"] })),
  ];
  const keys = (r: ReturnType<typeof pickMany>) => r.picks.map((p) => exploreKey(p.item));
  const groupsOf = (r: ReturnType<typeof pickMany>) => {
    const n = { near: 0, middle: 0, far: 0 };
    for (const p of r.picks) n[p.group]++;
    return n;
  };

  it("1・20・50・100件を、1回の結果の中で重複なしに選ぶ（候補が十分なとき）", () => {
    for (const count of [1, 20, 50, 100]) {
      const r = pickMany({ items: big, topicId: "a1", distance: 50, count, graph, rng: seeded(count) });
      expect(r.picks).toHaveLength(count);
      expect(new Set(keys(r)).size).toBe(count);
      expect(r.short).toBe(false);
    }
  });

  it("距離の割合どおりに配分する（距離50で20件：近い5・中間10・遠い5）", () => {
    // 近い＝a1 とその下位。A（大分類）だけの20件は中間に入る
    const items: ExploreItem[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ kind: "resource" as const, id: `n${i}`, topicIds: ["a1"] })),
      ...Array.from({ length: 20 }, (_, i) => ({ kind: "resource" as const, id: `m${i}`, topicIds: ["a2"] })),
      ...Array.from({ length: 20 }, (_, i) => ({ kind: "resource" as const, id: `f${i}`, topicIds: ["b1"] })),
    ];
    const r = pickMany({ items, topicId: "a1", distance: 50, count: 20, graph, rng: seeded(2) });
    expect(groupsOf(r)).toEqual({ near: 5, middle: 10, far: 5 });
    expect(r.breakdown.middle).toEqual({ planned: 10, drawn: 10, available: 20 });
    expect(r.redistributed).toBe(false);
  });

  it("候補が足りなければ、割合が0のグループや重複で埋めず、選べた件数と理由を返す", () => {
    // 距離0は近いだけ。近い候補は a1 の20件
    const r = pickMany({ items: big, topicId: "a1", distance: 0, count: 100, graph, rng: seeded(4) });
    expect(r.eligible).toEqual(["near"]);
    expect(r.picks).toHaveLength(r.breakdown.near.available);
    expect(r.picks.every((p) => p.group === "near")).toBe(true);
    expect(new Set(keys(r)).size).toBe(r.picks.length);
    expect(r.short).toBe(true);
    expect(r.breakdown.far.drawn).toBe(0);
  });

  it("あるグループが足りないときは、割合が0より大きい別のグループにだけ配り直す", () => {
    // 近い（a1）20件・中間（a2）3件・遠い（b1）20件。距離50では中間に10件配分されるが3件しかない
    const few: ExploreItem[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ kind: "resource" as const, id: `n${i}`, topicIds: ["a1"] })),
      ...Array.from({ length: 3 }, (_, i) => ({ kind: "resource" as const, id: `m${i}`, topicIds: ["a2"] })),
      ...Array.from({ length: 20 }, (_, i) => ({ kind: "resource" as const, id: `f${i}`, topicIds: ["b1"] })),
    ];
    const r = pickMany({ items: few, topicId: "a1", distance: 50, count: 20, graph, rng: seeded(6) });
    expect(r.picks).toHaveLength(20);
    expect(r.breakdown.middle.drawn).toBe(3);
    expect(r.redistributed).toBe(true);
    expect(r.breakdown.near.drawn + r.breakdown.far.drawn).toBe(17);
    // 距離0なら中間・遠いは割合が0なので使わない
    const z = pickMany({ items: few, topicId: "a1", distance: 0, count: 50, graph, rng: seeded(6) });
    expect(z.breakdown.middle.drawn + z.breakdown.far.drawn).toBe(0);
  });

  it("同じ乱数の種なら同じ結果、候補が0件なら空", () => {
    const a = pickMany({ items: big, topicId: "a1", distance: 70, count: 50, graph, rng: seeded(9) });
    const b = pickMany({ items: big, topicId: "a1", distance: 70, count: 50, graph, rng: seeded(9) });
    expect(keys(a)).toEqual(keys(b));
    const e = pickMany({ items: [], topicId: "a1", distance: 50, count: 20, graph, rng: seeded(1) });
    expect(e.picks).toHaveLength(0);
    expect(e.short).toBe(true);
  });
});
