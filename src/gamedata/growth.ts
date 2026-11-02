// チャンピオンのステータスの成長（LoL Wiki「Champion statistic」revid 4069636 の式）。
//   成長するステータス：基本値 + 成長値 × (n−1) × (0.7025 + 0.0175 × (n−1))
//   攻撃速度：基本攻撃速度 + [増加攻撃速度% + 成長値% × (n−1) × (0.7025 + 0.0175 × (n−1))] × 攻撃速度の反映率（AS ratio）
// 攻撃速度の成長は「増加攻撃速度」として扱われ、反映率を掛けてから基本攻撃速度に足す（基本攻撃速度に直接は掛けない）。
// 攻撃速度の上限（2.5 など）や、形態・特殊な成長（例：クレッドのスカール）はここでは扱わない（呼ぶ側で明示する）。

/** レベル n で成長値に掛ける係数。Lv1=0、Lv2=0.72、Lv18=17 */
export function growthMultiplier(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError(`レベルは1以上の整数：${level}`);
  const k = level - 1;
  return k * (0.7025 + 0.0175 * k);
}

/** 成長するステータス（体力・攻撃力・物理防御・魔法防御・体力回復・マナ・マナ回復）のレベル n の値（増加分を除く）*/
export function statAtLevel(base: number, growth: number, level: number): number {
  return base + growth * growthMultiplier(level);
}

/** 成長による増加攻撃速度（％）。例：成長値2.5なら Lv18 で 42.5% */
export function attackSpeedGrowthPercent(growthPercent: number, level: number): number {
  return growthPercent * growthMultiplier(level);
}

export interface AttackSpeedInput {
  /** 基本攻撃速度（Data Dragon の attackspeed、Wiki の as_base）*/
  base: number;
  /** 攻撃速度の反映率（Wiki の as_ratio。Data Dragon にはない）*/
  ratio: number;
  /** 成長値（％。Data Dragon の attackspeedperlevel、Wiki の as_lvl）*/
  growthPercent: number;
  /** レベル以外の増加攻撃速度（％。アイテム・ルーンなど）*/
  bonusPercent?: number;
}

/** 合計の攻撃速度（上限は適用しない）*/
export function totalAttackSpeed(input: AttackSpeedInput, level: number): number {
  const bonus = (input.bonusPercent ?? 0) + attackSpeedGrowthPercent(input.growthPercent, level);
  return input.base + (bonus / 100) * input.ratio;
}

/** 通常攻撃の間隔（秒）＝ 1 ÷ 合計の攻撃速度（Wiki「Attack speed」の Attack timer）*/
export function attackInterval(totalAs: number): number {
  return 1 / totalAs;
}

export const LEVELS = Array.from({ length: 18 }, (_, i) => i + 1);
