import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { EffectGroupReview, ItemVersionReview } from "../components/DataPages";
import { EFFECT_REVIEWS, reviewedEffectFor } from "./effectReviews";
import { itemReviewFor } from "./itemReviews";
import { uniqueInfo, matchItemData } from "./itemRules";
import { relationNodes, type TreeItem } from "./itemTree";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const wiki = read("public/gamedata/wiki/2026-11-02/items.json").items;
const dd = read("public/gamedata/ddragon/16.21.1/items.json").items;
const rules = read("public/gamedata/wiki/2026-11-02/item_rules.json");
const plain = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("C-6の限定照合", () => {
  it("IDと名前の両方で対象を限定し、同名の別ID・他効果へ自動適用しない", () => {
    expect(reviewedEffectFor("Hexdrinker", 3155)).toBe("Lifeline");
    expect(reviewedEffectFor("Protoplasm Harness", 2525)).toBe("Lifeline");
    expect(reviewedEffectFor("Mercurial Scimitar", 3139)).toBe("Quicksilver");
    for (const [name, id] of [["Seraph's Embrace", 323040], ["Archangel's Staff", 3003], ["other", 3155], ["Hexdrinker", 9999], ["Zhonya's Hourglass", 3157]] as const) expect(reviewedEffectFor(name, id)).toBeNull();
    expect(wiki.filter((w: { name: string; data: { id: number } }) => reviewedEffectFor(w.name, w.data.id))).toHaveLength(7);
  });
  it.each(["Lifeline", "Quicksilver"] as const)("%s：重複・CD・装備制限・合成を分け、ゲーム内実証と混同しない", (family) => {
    const html = renderToStaticMarkup(<EffectGroupReview family={family} version="16.21.1" />);
    const text = plain(html);
    for (const s of ["一般的な共有CDは未確認", "効果の重複", "個別CD・共有CD", "同時装備制限", "合成・売買時のCD", "ゲーム内検証は未実施", "SR", "16.21.1", "推定", "2026-11-04"]) expect(text).toContain(s);
    for (const source of EFFECT_REVIEWS[family].sources) expect(html).toContain(`href="${source.url}"`);
    expect(text).not.toContain("ゲーム内で検証済み");
    const changed = plain(renderToStaticMarkup(<EffectGroupReview family={family} version="16.22.1" />));
    expect(changed).toContain("再確認待ち");
  });
  it("Lifelineの公式合成時修正を共有CD一般へ拡張せず、モード差も維持する", () => {
    const r = EFFECT_REVIEWS.Lifeline;
    expect(r.transfer).toContain("26.16"); expect(r.transfer).toContain("共有CD一般の証明ではなく");
    expect(r.exceptions).toContain("ARAM: Mayhem"); expect(r.exceptions).toContain("Arena");
    expect(r.trigger).toContain("シールドと同一ではない");
    const html = renderToStaticMarkup(<EffectGroupReview family="Lifeline" version="16.21.1" />);
    expect(html).toContain("dd%3A2525");
    expect(html).toContain("Archangel");
  });
  it("QuicksilverのWiki注記・公式変更・不明な挙動を分ける", () => {
    const r = EFFECT_REVIEWS.Quicksilver;
    expect(r.transfer).toContain("2024-04-21"); expect(r.transfer).toContain("実証は未確認");
    for (const s of ["Airborne", "Suppression", "Stasis", "Mordekaiser", "26.20"]) expect(r.exceptions).toContain(s);
    expect(r.trigger).toContain("1.5→2秒");
    expect(r.cooldown).toContain("共有CDを確定しない");
  });
  it("古い表による分類機能を再実装せず、CD共有は引き続き未確認とする", () => {
    for (const w of wiki) for (const e of Object.values(w.effect_text ?? {}) as { name?: string; meta?: { cd?: string } }[]) {
      if (!["Lifeline", "Quicksilver"].includes(e.name ?? "")) continue;
      const result = uniqueInfo(w.name, e.name!, !!e.meta?.cd, rules.named_effects, new Map());
      expect(result.status).toBe("shared_listed");
      expect(result.cooldownRuleUnconfirmed).toBe(true);
    }
  });
  it("Mercurialの旧1.5秒・旧ステータスを元データに残し、新値は出典付きの変更記録にする", () => {
    const w = wiki.find((w: { name: string }) => w.name === "Mercurial Scimitar");
    const before = JSON.stringify(w);
    const assessment = itemReviewFor(w.name, w.data.id, w.source.last_modified, "16.21.1")!;
    const d = matchItemData(wiki, dd).get(w.name)!.official! as (typeof dd)[number];
    expect(assessment.needsReview).toBe(false);
    expect(w.effect_text.act.plain).toContain("1.5 seconds");
    expect(w.data.stats).toMatchObject({ ad: 40, mr: 40 });
    expect(d.description.en).toContain("50 Attack Damage"); expect(d.description.en).toContain("35 Magic Resist");
    const html = renderToStaticMarkup(<ItemVersionReview assessment={assessment} dd={d} version="16.21.1" officialItems={dd} />);
    for (const s of ["25.18", "1.5→2秒", "旧仕様", "公式の英語原文", "未確認事項"]) expect(html).toContain(s);
    expect(JSON.stringify(w)).toBe(before);
    expect(relationNodes(d as TreeItem, "from", dd)?.map((n) => n.id)).toEqual(["3140", "1037", "1053"]);
    expect(matchItemData(wiki, dd).get("Zephyr")?.official).toBeUndefined();
  });
});
