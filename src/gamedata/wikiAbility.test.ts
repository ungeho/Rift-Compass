import { describe, expect, it } from "vitest";
import { derivedProperties, showRatio, wikiPlain, type WikiAbilityTemplate } from "./wikiAbility";

describe("英語 Wiki のスキルの表示用の変換", () => {
  it("テンプレート記法を読める文字列に簡略化する（原文はファイルに残す）", () => {
    expect(wikiPlain("{{sbc|Active:}} deals {{as|60% AP}} to {{tip|stasis (buff)|stasis}} [[Gold|gold]] '''bold'''")).toBe("Active: deals 60% AP to stasis gold bold");
    expect(wikiPlain("{{ap|9 to 4}} seconds")).toBe("9〜4 seconds");
  });
  it("ランク別の係数は / でつなぐ", () => {
    expect(showRatio({ percent: [100, 110], of: "AD" })).toBe("(+ 100/110% AD)");
    expect(showRatio({ percent: null, of: "AD", raw: "{{ap|(1 to 2)*(3 to 4)}}" })).toBe("(+ 未解析：(1〜2)*(3〜4)% AD)");
  });
  it("式から数学的に導ける性質だけを抽出し、戦術的な結論は含めない", () => {
    const t = { leveling: [{ field: "leveling", label: "Magic Damage", raw: "", base: null, ratios: [{ percent: 8, of: "of target's maximum health" }, { percent: 60, of: "AP" }] }] } as unknown as WikiAbilityTemplate;
    const d = derivedProperties(t);
    expect(d.map((x) => x.id)).toEqual(["target-max-hp", "ap"]);
    expect(d.map((x) => x.label_ja).join()).not.toMatch(/タンクに強い/);
  });
});
