import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_REVIEWS, ITEM_REVIEW_VERSION, itemReviewFor } from "./itemReviews";
import { matchItemData, resolveItemModes, resolveItemStats } from "./itemRules";

const wiki = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/items.json", "utf8")).items;
const official = JSON.parse(readFileSync("public/gamedata/ddragon/16.21.1/items.json", "utf8")).items;

describe("対象3件の原典の時期を分ける", () => {
  it.each(ITEM_REVIEWS)("$name：元データを変えず、確認記録と結合された公式データを別に読む", (review) => {
    const w = wiki.find((w: { name: string }) => w.name === review.name);
    const before = JSON.stringify(w);
    expect(itemReviewFor(w.name, w.data.id, w.source.last_modified, ITEM_REVIEW_VERSION)).toEqual({ review, needsReview: false });
    const d = matchItemData(wiki, official).get(w.name)!.official!;
    expect(d.id).toBe(w.data.id);
    expect(review.changes.every((c) => c.url.startsWith("https://www.leagueoflegends.com/"))).toBe(true);
    expect(review.unknowns.length).toBeGreaterThan(0);
    expect(JSON.stringify(w)).toBe(before);
  });
  it("26.1の初回変更だけを最新扱いせず、ホットフィックス・26.12・26.13を記録する", () => {
    expect(ITEM_REVIEWS[0].changes.map((c) => c.patch)).toContain("26.1・1月9日ホットフィックス");
    expect(ITEM_REVIEWS[2].changes.map((c) => c.patch)).toEqual(["26.11", "26.12", "26.13"]);
    const expected = [
      [3508, 3050, 500, ["3057", "3133", "1018"], "Spellblade"],
      [3179, 2800, 750, ["3134", "3133"], "Nightstalker"],
      [4005, 2400, 700, ["1052", "4642", "1052"], "Command"],
    ] as const;
    for (const [id, price, combine, from, effect] of expected) {
      const d = official.find((d: { id: number }) => d.id === id);
      expect(d.gold.total).toBe(price); expect(d.gold.base).toBe(combine); expect(d.from).toEqual(from);
      expect(d.description.en).toContain(effect); expect(d.maps["11"]).toBe(true);
    }
    expect(wiki.find((w: { name: string }) => w.name === "Essence Reaver").effect_text.pass.name).toBe("Essence Drain");
    expect(wiki.find((w: { name: string }) => w.name === "Umbral Glaive").effect_text.pass3.name).toBe("Extinguish");
    expect(wiki.find((w: { name: string }) => w.name === "Imperial Mandate").effect_text.pass.name).toBe("Coordinated Fire");
  });
  it("版・原典・名前・IDの更新で旧Wikiを通常表示へ自動復帰させない", () => {
    const r = ITEM_REVIEWS[0];
    for (const [name, id, date, version] of [[r.name, r.id, r.moduleModified, "16.22.1"], [r.name, r.id, "new-source-date", ITEM_REVIEW_VERSION], ["renamed", r.id, r.moduleModified, ITEM_REVIEW_VERSION], [r.name, 999999, r.moduleModified, ITEM_REVIEW_VERSION]] as const) {
      expect(itemReviewFor(name, id, date, version)?.needsReview).toBe(true);
    }
    for (const w of wiki.filter((w: { name: string }) => !ITEM_REVIEWS.some((r) => r.name === w.name))) expect(itemReviewFor(w.name, w.data.id, w.source.last_modified, ITEM_REVIEW_VERSION)).toBeNull();
  });
  it("C-2/C-3の分類・参照値・誤結合防止を維持する", () => {
    const data = new Map<string, { modes?: unknown; stats?: Record<string, unknown> }>(wiki.map((w: { name: string; data: object }) => [w.name, w.data]));
    expect(wiki.filter((w: { name: string }) => resolveItemModes(w.name, data).sr === true)).toHaveLength(229);
    expect(resolveItemStats("Fimbulwinter", data).stats.hp).toBe(550);
    expect(resolveItemStats("Muramana", data).stats.ad).toBe(35);
    const matches = matchItemData(wiki, official);
    expect(matches.get("Zephyr")?.official).toBeUndefined();
    expect(matches.get("Gunmetal Greaves")?.official?.name.ja).toBe("ガンメタル ブーツ");
  });
});
