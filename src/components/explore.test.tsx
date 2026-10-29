// 知識の散策（試験）の画面と抽選対象の検査（実データ）
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { index, isPublic } from "../data/dataset";
import { decisionById, SHOWCASE_IDS } from "../data/decisions";
import { explorePool, exploreTopics } from "../data/explorePool";
import { classify, pickNext, type PickResult } from "../lib/explore";
import { decisionHref, exploreHref, parseHash, resourceHref } from "../router";
import { ExploreCard, ExplorePage } from "./ExplorePage";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("抽選対象", () => {
  it("公開の教材と試験表示の判断材料だけで、非公開・試験表示外のものを含まない", () => {
    const res = explorePool.filter((x) => x.kind === "resource");
    const dec = explorePool.filter((x) => x.kind === "decision");
    expect(res).toHaveLength(index.publicResources.length);
    for (const x of res) expect(isPublic(index.resourceById.get(x.id)!)).toBe(true);
    expect(dec.map((x) => x.id).sort()).toEqual([...SHOWCASE_IDS].sort());
    expect(dec.map((x) => x.id)).not.toContain("du-first-wave-aggro-release");
    for (const x of dec) for (const r of x.relatedIds ?? []) expect(SHOWCASE_IDS).toContain(r);
  });
  it("Topic を変えると近い候補が変わり、データの少ない Topic でも1件選べる", () => {
    const a = classify(explorePool, "freeze", index).near.map((x) => x.id);
    const b = classify(explorePool, "matchup", index).near.map((x) => x.id);
    expect(a).not.toEqual(b);
    const small = exploreTopics().find((t) => t.nearCount === 1)!;
    expect(small).toBeDefined();
    const r = pickNext({ items: explorePool, topicId: small.id, distance: 0, seen: [], graph: index, rng: seq([0.3]) })!;
    expect(r.group).toBe("near");
    const r2 = pickNext({ items: explorePool, topicId: small.id, distance: 0, seen: r.seen, graph: index, rng: seq([0.3]) })!;
    // 近い候補が1件だけなので、同じ1件を続けて出さず、別のグループ（中間）から出して知らせる
    expect(r2.item.id).not.toBe(r.item.id);
    expect(r2.fellBack).toBe(true);
    expect(r2.group).toBe("middle");
  });
});

describe("散策の画面", () => {
  it("URL で Topic と距離を持ち、範囲外の距離は 0〜100 に収める", () => {
    expect(parseHash(exploreHref("freeze", 70))).toEqual({ name: "explore", topic: "freeze", distance: 70 });
    expect(parseHash("#/explore?d=250")).toEqual({ name: "explore", topic: "", distance: 100 });
    expect(parseHash("#/explore")).toEqual({ name: "explore", topic: "", distance: 30 });
  });
  it("Topic・距離・ボタンがあり、割合と候補数を示す。Topic を選ぶまでボタンは押せない。おすすめとは書かない", () => {
    const empty = renderToStaticMarkup(<ExplorePage topic="" distance={30} />);
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>別の知識を見る<\/button>/);
    const markup = renderToStaticMarkup(<ExplorePage topic="freeze" distance={50} />);
    expect(markup).toContain('<label for="explore-topic">');
    expect(markup).toContain('<label for="explore-distance">');
    expect(markup).toContain('type="range"');
    expect(text(markup)).toContain("抽選の割合：近い 25%・中間 50%・遠い 25%");
    expect(text(markup)).toMatch(/候補：近い \d+件・中間 \d+件・遠い \d+件/);
    expect(markup).not.toMatch(/<button[^>]*disabled/);
    // 「おすすめや正しさの判定ではありません」という否定の説明以外に、おすすめ・最適とは書かない
    expect(text(markup)).not.toMatch(/おすすめ(?!や正しさの判定ではありません)|最適/);
  });
  it("教材と判断材料を区別し、正しい詳細へリンクする。表示対象外の id は出さない", () => {
    const base = { group: "near" as const, fellBack: false, cycled: false, seen: [] };
    const r = index.publicResources[0];
    const rm = renderToStaticMarkup(<ExploreCard result={{ ...base, item: { kind: "resource", id: r.id, topicIds: r.topic_ids } } as PickResult} topicLabel="X" />);
    expect(text(rm)).toContain("教材");
    expect(rm).toContain(`href="${resourceHref(r.id)}"`);
    const u = decisionById("du-trade-checklist")!;
    const dm = renderToStaticMarkup(<ExploreCard result={{ ...base, group: "far", item: { kind: "decision", id: u.id, topicIds: u.topic_ids } } as PickResult} topicLabel="X" />);
    expect(text(dm)).toContain("判断材料（試験）");
    expect(dm).toContain(`href="${decisionHref(u.id)}"`);
    expect(text(dm)).toContain("「原典の主張」と「AI の解釈」に分けて");
    expect(text(dm)).toContain("内容が無関係という意味ではありません");
    for (const bad of [{ kind: "decision" as const, id: "du-first-wave-aggro-release" }, { kind: "resource" as const, id: "no-such-id" }]) {
      const m = renderToStaticMarkup(<ExploreCard result={{ ...base, item: { ...bad, topicIds: [] } } as PickResult} topicLabel="X" />);
      expect(text(m)).toContain("この知識は表示の対象にありません");
    }
  });
});

describe("候補切れ・切り替えの知らせ", () => {
  const base = { item: { kind: "resource" as const, id: index.publicResources[0].id, topicIds: [] }, seen: [] };
  const notice = (r: Partial<PickResult>) => text(renderToStaticMarkup(<ExploreCard result={{ ...base, group: "middle", fellBack: false, cycled: false, ...r } as PickResult} topicLabel="X" />));
  it("一巡・別グループへの切り替え・その両方を、それぞれ1つの知らせで示す", () => {
    expect(notice({ cycled: true })).toContain("最初から表示し直しています");
    expect(notice({ fellBack: true })).toContain("選んだ距離に当たる候補がないため、「中間」の候補から");
    const both = notice({ cycled: true, fellBack: true });
    expect(both).toContain("選んだ距離の候補は直前に表示した1件だけなので、「中間」の候補から");
    expect(both).not.toContain("最初から表示し直しています");
  });
});
