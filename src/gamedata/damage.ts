// 英語 Wiki のスキルの式（取り込み時に calc.stage が computable と判定した行）から、軽減前のダメージを計算する。
// 全スキル対応の戦闘シミュレーターではない。条件（スタック・形態・対象の種類による上限など）は扱わず、computable の行だけを計算する。
import type { Leveling } from "./wikiAbility";

export type InputKind =
  | "ap"
  | "total_ad"
  | "bonus_ad"
  | "bonus_hp"
  | "self_max_hp"
  | "target_max_hp"
  | "target_missing_hp"
  | "target_current_hp"
  | "armor"
  | "bonus_armor"
  | "mr"
  | "bonus_mr"
  | "bonus_mana"
  | "max_mana";

export interface CalcInfo {
  stage: "raw_only" | "formula_parsed" | "damage_type_known" | "not_computable" | "computable";
  damage_type: "physical" | "magic" | "true" | null;
  base_basis?: "rank" | "fixed" | "level" | "other" | "special";
  inputs?: InputKind[];
  missing?: string[];
  reason?: string;
}

export interface CalcInputs extends Partial<Record<InputKind, number>> {
  rank: number;
  level?: number;
}

export const STAGE_LABELS: Record<CalcInfo["stage"], string> = {
  raw_only: "原文のみ（式は未解析）",
  formula_parsed: "式を解析済み（ダメージではない、または種類が不明）",
  damage_type_known: "ダメージの種類まで確認",
  not_computable: "計算に必要な条件が不足",
  computable: "数値で計算できる",
};

export const INPUT_LABELS: Record<InputKind, string> = {
  ap: "魔力（AP）",
  total_ad: "攻撃力（合計）",
  bonus_ad: "増加攻撃力",
  bonus_hp: "増加体力",
  self_max_hp: "自分の最大体力",
  target_max_hp: "対象の最大体力",
  target_missing_hp: "対象の減少体力",
  target_current_hp: "対象の現在体力",
  armor: "物理防御",
  bonus_armor: "増加物理防御",
  mr: "魔法防御",
  bonus_mr: "増加魔法防御",
  bonus_mana: "増加マナ",
  max_mana: "最大マナ",
};

const INPUT_OF: [RegExp, InputKind][] = [
  [/^of (the )?target'?s? max(imum)? health$/i, "target_max_hp"],
  [/^of (the )?target'?s? missing health$/i, "target_missing_hp"],
  [/^of (the )?target'?s? current health$/i, "target_current_hp"],
  [/^bonus AD$/i, "bonus_ad"],
  [/^AD$/i, "total_ad"],
  [/^AP$/i, "ap"],
  [/^bonus health$/i, "bonus_hp"],
  [/^(of (his|her|their|its) )?max(imum)? health$/i, "self_max_hp"],
  [/^bonus armor$/i, "bonus_armor"],
  [/^armor$/i, "armor"],
  [/^bonus magic resistance$/i, "bonus_mr"],
  [/^magic resistance$/i, "mr"],
  [/^bonus mana$/i, "bonus_mana"],
  [/^max(imum)? mana$/i, "max_mana"],
];
const inputOf = (of: string | undefined): InputKind | null => {
  for (const [re, k] of INPUT_OF) if (re.test((of ?? "").trim())) return k;
  return null;
};

const pick = (v: number | number[], rank: number) => (Array.isArray(v) ? v[Math.min(rank, v.length) - 1] : v);

/** 基礎値（ランク・固定・レベル）。計算できなければ null */
function baseValue(l: Leveling, inp: CalcInputs): number | null {
  const b = l.base;
  if (!b) return null;
  if (b.kind === "number") return b.values[0];
  if (b.kind === "by_rank" || b.kind === "by_rank_linear") return pick(b.values, inp.rank) ?? null;
  if (b.kind === "progression" && (b as { basis_label?: string }).basis_label === "level") return inp.level ? (b.values[inp.level - 1] ?? null) : null;
  return null;
}

/**
 * 軽減前の値。calc.stage が computable の行だけ。必要な入力が足りなければ null。
 * 割合の基礎値（例：対象の減少体力の 8%）は、その対象の値に掛ける。「per 100 AP」は割合への加算（8% + 1.5%×AP/100）。
 */
export function preMitigation(l: Leveling & { calc?: CalcInfo }, inp: CalcInputs): number | null {
  if (l.calc?.stage !== "computable") return null;
  const base = baseValue(l, inp);
  if (base === null) return null;
  const need = (k: InputKind) => (inp[k] === undefined ? null : (inp[k] as number));
  let value: number;
  let ratios = l.ratios;
  if (l.base?.unit === "%") {
    let pct = base;
    for (const r of l.ratios) {
      const per = /^per 100 (AP|AD|bonus AD|bonus health)$/i.exec(r.of);
      if (!per || r.percent === null) continue;
      const k = inputOf(per[1]);
      const x = k ? need(k) : null;
      if (x === null) return null;
      pct += pick(r.percent, inp.rank) * (x / 100);
    }
    ratios = l.ratios.filter((r) => !/^per\s/i.test(r.of));
    const k = inputOf(l.base.of);
    if (!k) return null;
    const x = need(k);
    if (x === null) return null;
    value = (pct / 100) * x;
  } else value = base;
  for (const r of ratios) {
    if (r.percent === null) return null;
    const k = inputOf(r.of);
    if (!k) return null;
    const x = need(k);
    if (x === null) return null;
    value += (pick(r.percent, inp.rank) / 100) * x;
  }
  return Math.round(value * 100) / 100;
}

/**
 * 物理防御・魔法防御による軽減（Wiki「Armor」「Magic resistance」の式）：
 * 防御が0以上なら ダメージ×100÷(100＋防御)、負なら ダメージ×(2−100÷(100−防御))。確定ダメージは軽減しない。
 * 防御貫通・軽減のスキル・アイテムは扱わない（呼ぶ側で防御の値を調整する）
 */
export function mitigate(damage: number, type: "physical" | "magic" | "true", resist: number): number {
  if (type === "true") return damage;
  const f = resist >= 0 ? 100 / (100 + resist) : 2 - 100 / (100 - resist);
  return Math.round(damage * f * 100) / 100;
}
