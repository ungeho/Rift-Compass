import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { attackInterval, attackSpeedGrowthPercent, growthMultiplier, LEVELS, statAtLevel, totalAttackSpeed } from "./growth";

const root = join(__dirname, "../..");
const manifest = JSON.parse(readFileSync(join(root, "public/gamedata/manifest.json"), "utf8"));
const ddIndex = JSON.parse(readFileSync(join(root, `public/gamedata/ddragon/${manifest.current.ddragon}/index.json`), "utf8"));

describe("成長の式（Wiki「Champion statistic」revid 4069636 の記載と一致する値）", () => {
  it("係数：Lv1 は0、Lv2 は0.72、Lv18 は17、Lv20 は19.665", () => {
    expect(growthMultiplier(1)).toBe(0);
    expect(growthMultiplier(2)).toBeCloseTo(0.72, 10);
    expect(growthMultiplier(18)).toBeCloseTo(17, 10);
    expect(growthMultiplier(20)).toBeCloseTo(19.665, 10);
  });
  it("1レベルごとの増分は線形に増える：Lv9→10 は100%、Lv17→18 は128%、Lv19→20 は135%", () => {
    expect(growthMultiplier(10) - growthMultiplier(9)).toBeCloseTo(1.0, 10);
    expect(growthMultiplier(18) - growthMultiplier(17)).toBeCloseTo(1.28, 10);
    expect(growthMultiplier(20) - growthMultiplier(19)).toBeCloseTo(1.35, 10);
    const steps = LEVELS.slice(1).map((n) => growthMultiplier(n) - growthMultiplier(n - 1));
    for (let k = 1; k < steps.length; k++) expect(steps[k] - steps[k - 1]).toBeCloseTo(0.035, 10);
  });
  it("レベルは1以上の整数だけ", () => {
    expect(() => growthMultiplier(0)).toThrow(RangeError);
    expect(() => growthMultiplier(1.5)).toThrow(RangeError);
  });
  it("ステータス：Lv18 は「基本値＋17×成長値」（全チャンピオンの Data Dragon の体力・物理防御で確認）", () => {
    for (const c of ddIndex.champions) {
      expect(statAtLevel(c.stats.hp, c.stats.hpperlevel, 18)).toBeCloseTo(c.stats.hp + 17 * c.stats.hpperlevel, 6);
      expect(statAtLevel(c.stats.armor, c.stats.armorperlevel, 1)).toBe(c.stats.armor);
    }
  });
  it("手計算の例：基本体力650・成長114（Data Dragon 16.21.1 のエイトロックス）は Lv2 で 732.08、Lv18 で 2588", () => {
    expect(statAtLevel(650, 114, 2)).toBeCloseTo(732.08, 10);
    expect(statAtLevel(650, 114, 18)).toBeCloseTo(2588, 10);
  });
});

describe("攻撃速度：基本攻撃速度・反映率（AS ratio）・成長値を混同しない", () => {
  it("成長は増加攻撃速度（％）で、反映率を掛けてから基本攻撃速度に足す", () => {
    // 基本0.651・反映率0.651・成長2.5%（Wiki のエイトロックス）：Lv18 の増加は42.5%
    expect(attackSpeedGrowthPercent(2.5, 18)).toBeCloseTo(42.5, 10);
    expect(totalAttackSpeed({ base: 0.651, ratio: 0.651, growthPercent: 2.5 }, 18)).toBeCloseTo(0.651 + 0.425 * 0.651, 10);
  });
  it("反映率が基本攻撃速度と違うチャンピオンでは、基本攻撃速度を掛けると誤る（基本0.668・反映率0.625・成長2.2%、Wiki のアーリ）", () => {
    const right = totalAttackSpeed({ base: 0.668, ratio: 0.625, growthPercent: 2.2 }, 18);
    expect(right).toBeCloseTo(0.668 + 0.374 * 0.625, 10);
    const wrong = 0.668 * (1 + 0.374); // 基本攻撃速度に成長を掛ける誤り
    expect(Math.abs(right - wrong)).toBeGreaterThan(0.01);
  });
  it("アイテムなどの増加攻撃速度は、成長と同じく反映率を掛けて足す", () => {
    expect(totalAttackSpeed({ base: 0.625, ratio: 0.625, growthPercent: 0, bonusPercent: 100 }, 1)).toBeCloseTo(1.25, 10);
  });
  it("Lv1 は増加がなければ基本攻撃速度そのもの", () => {
    expect(totalAttackSpeed({ base: 0.658, ratio: 0.669, growthPercent: 3 }, 1)).toBe(0.658);
  });
  it("通常攻撃の間隔は 1 ÷ 合計の攻撃速度（0.625 なら1.6秒）", () => {
    expect(attackInterval(0.625)).toBeCloseTo(1.6, 10);
  });
});
