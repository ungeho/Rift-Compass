import { describe, expect, it } from "vitest";
import { mitigate, preMitigation } from "./damage";
import type { Leveling } from "./wikiAbility";
import darius from "../../public/gamedata/wiki/2026-11-02/abilities/122.json";
import ekko from "../../public/gamedata/wiki/2026-11-02/abilities/245.json";

const lev = (file: { templates: unknown[] }, name: string, i = 0) =>
  ((file.templates as { name: string; leveling?: Leveling[] }[]).find((t) => t.name === name)!.leveling ?? [])[i];

describe("軽減前のダメージ（computable の行だけ）", () => {
  it("Darius Q（Decimate）ランク3・攻撃力100：110 + 120% AD = 230", () => {
    expect(preMitigation(lev(darius, "Decimate"), { rank: 3, total_ad: 100 })).toBe(230);
  });
  it("必要な入力（攻撃力）がなければ計算しない", () => {
    expect(preMitigation(lev(darius, "Decimate"), { rank: 3 })).toBeNull();
  });
  it("computable でない行は計算しない", () => {
    const l = { ...lev(darius, "Decimate"), calc: { stage: "not_computable" as const, damage_type: "physical" as const } };
    expect(preMitigation(l, { rank: 3, total_ad: 100 })).toBeNull();
  });
  it("割合の基礎値と per 100 AP：(3% + 3%×AP/100) × 対象の減少体力", () => {
    const l = { field: "x", label: "x", raw: "", base: { ok: true as const, kind: "number" as const, values: [3], unit: "%", of: "of target's missing health" }, ratios: [{ percent: 3, of: "per 100 AP" }], calc: { stage: "computable" as const, damage_type: "magic" as const } };
    expect(preMitigation(l, { rank: 1, ap: 100, target_missing_hp: 1000 })).toBe(60);
  });
  it("Ekko のデータが読める（型の確認）", () => {
    expect(ekko.templates.length).toBeGreaterThan(0);
  });
});

describe("防御による軽減（Wiki の Armor / Magic resistance の式）", () => {
  it("防御100でダメージは半分、確定ダメージは軽減しない", () => {
    expect(mitigate(200, "physical", 100)).toBe(100);
    expect(mitigate(200, "magic", 100)).toBe(100);
    expect(mitigate(200, "true", 100)).toBe(200);
  });
  it("負の防御はダメージが増える：2 − 100/(100 − R)", () => {
    expect(mitigate(100, "physical", -100)).toBe(150);
    expect(mitigate(100, "physical", 0)).toBe(100);
  });
});
