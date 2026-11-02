// チャンピオンの基本データ（public/gamedata の Data Dragon・Wiki）から、表示用の行を作る（画面から切り離した純粋な関数）。
// 2つの出典の値が違うときは、どちらが正しいかを決めずに両方を示す。値のない項目は推測で埋めない。
import { growthMultiplier, statAtLevel, totalAttackSpeed } from "./growth";

export type Lang = { en: string | null; ja: string | null };

export interface DDragonSpell {
  slot: string;
  id: string;
  name: Lang;
  description: Lang;
  tooltip: Lang;
  maxrank: number;
  cooldown: number[];
  cooldownBurn: string;
  cost: number[];
  costBurn: string;
  costType: Lang;
  resource: Lang;
  range: number[];
  rangeBurn: string;
  maxammo: string;
}

export interface DDragonChampion {
  source: { name: string; version: string; files: string[]; fetched_at: string };
  id: string;
  key: string;
  name: Lang;
  title: Lang;
  tags: string[];
  partype: Lang;
  stats: Record<string, number>;
  passive: { name: Lang; description: Lang };
  spells: DDragonSpell[];
}

export interface DDragonIndexEntry {
  id: string;
  key: string;
  name: Lang;
  tags: string[];
  topic_id: string | null;
  stats: Record<string, number>;
}

export interface WikiForm {
  form: string;
  id: number;
  apiname: string;
  stats?: Record<string, number | Record<string, unknown>>;
  rangetype?: string;
  resource?: string;
  role?: string[];
  herotype?: string;
  alttype?: string;
  /** Wiki がこの項目を最後に変更したと記録するパッチ（例：V26.21）。revid 全体の意味ではない */
  changes?: string;
  client_positions?: string[];
  external_positions?: string[];
}

export interface WikiByKey {
  source: { revid: number; timestamp: string; url: string };
  key: string;
  forms: WikiForm[];
}

/** Riot のチャンピオンクラス（Data Dragon の tags）。ポジション（TOP・JG・MID・BOT・SUP）とは別の分類 */
export const CLASS_LABELS: Record<string, string> = {
  Mage: "メイジ",
  Assassin: "アサシン",
  Marksman: "マークスマン",
  Fighter: "ファイター",
  Tank: "タンク",
  Support: "サポート",
};

/** ポジション（Wiki の client_positions・external_positions の表記）→ ロールの Topic */
export const POSITION_TOPICS: Record<string, { topic: string; label: string }> = {
  Top: { topic: "role-top", label: "トップ" },
  Jungle: { topic: "role-jungle", label: "ジャングル" },
  Middle: { topic: "role-mid", label: "ミッド" },
  Bottom: { topic: "role-bot", label: "ボット" },
  Support: { topic: "role-support", label: "サポート" },
};

/** Data Dragon の stats の名前 → Wiki の stats の名前 */
const STATS: { label: string; base: string; growth: string | null; wikiBase: string; wikiGrowth: string | null; digits: number }[] = [
  { label: "体力", base: "hp", growth: "hpperlevel", wikiBase: "hp_base", wikiGrowth: "hp_lvl", digits: 0 },
  { label: "リソース（マナなど）", base: "mp", growth: "mpperlevel", wikiBase: "mp_base", wikiGrowth: "mp_lvl", digits: 0 },
  { label: "攻撃力", base: "attackdamage", growth: "attackdamageperlevel", wikiBase: "dam_base", wikiGrowth: "dam_lvl", digits: 1 },
  { label: "物理防御", base: "armor", growth: "armorperlevel", wikiBase: "arm_base", wikiGrowth: "arm_lvl", digits: 1 },
  { label: "魔法防御", base: "spellblock", growth: "spellblockperlevel", wikiBase: "mr_base", wikiGrowth: "mr_lvl", digits: 1 },
  { label: "体力回復（5秒あたり）", base: "hpregen", growth: "hpregenperlevel", wikiBase: "hp5_base", wikiGrowth: "hp5_lvl", digits: 2 },
  { label: "リソース回復（5秒あたり）", base: "mpregen", growth: "mpregenperlevel", wikiBase: "mp5_base", wikiGrowth: "mp5_lvl", digits: 2 },
  { label: "射程", base: "attackrange", growth: null, wikiBase: "range", wikiGrowth: null, digits: 0 },
  { label: "移動速度", base: "movespeed", growth: null, wikiBase: "ms", wikiGrowth: null, digits: 0 },
];

export const SHOWN_LEVELS = [1, 6, 11, 18];

/** Data Dragon の既知の不具合（版の一覧 index.json の known_issues）。この項目の生の値は計算・表示に採用しない */
export interface KnownIssue {
  field: string;
  since: string;
  reference: string;
  note: string;
  status: "excluded";
  detected: string;
}

export interface StatRow {
  label: string;
  base: number | null;
  /** 計算に採用した成長値（既知の不具合で Data Dragon を除外したときは Wiki の値、どちらもなければ null＝不明）*/
  growth: number | null;
  /** 採用した成長値の出典 */
  growthSource: "ddragon" | "wiki" | null;
  /** Data Dragon の生の成長値（除外したときも残す）*/
  rawGrowth: number | null;
  /** 除外の理由（既知の不具合）*/
  excluded: KnownIssue | null;
  /** 採用した値で計算した各レベルの値（成長値が不明なら Lv1 以外は null）*/
  levels: (number | null)[];
  wikiBase: number | null;
  wikiGrowth: number | null;
  /** Wiki の値で計算した各レベルの値（採用した値と違うときだけ）*/
  wikiLevels: (number | null)[] | null;
  conflict: boolean;
  digits: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const same = (a: number | null, b: number | null) => a === null || b === null || Math.abs(a - b) < 1e-9;

export function statRows(dd: DDragonChampion, wiki: WikiForm | null, knownIssues: KnownIssue[] = []): StatRow[] {
  return STATS.map((s) => {
    const base = num(dd.stats[s.base]);
    const rawGrowth = s.growth ? num(dd.stats[s.growth]) : null;
    const wikiBase = wiki ? num(wiki.stats?.[s.wikiBase]) : null;
    const wikiGrowth = wiki && s.wikiGrowth ? num(wiki.stats?.[s.wikiGrowth]) : null;
    const excluded = s.growth ? (knownIssues.find((k) => k.field === s.growth) ?? null) : null;
    // 除外した成長値は Wiki の値で補う（Wiki も現行の正解とは限らないので、出典を示す）。Wiki にもなければ不明
    const growth = excluded ? wikiGrowth : rawGrowth;
    const growthSource = !s.growth ? null : excluded ? (wikiGrowth === null ? null : "wiki") : rawGrowth === null ? null : "ddragon";
    const calc = (b: number | null, g: number | null) =>
      SHOWN_LEVELS.map((n) => (b === null ? null : !s.growth ? b : g === null ? (n === 1 ? b : null) : statAtLevel(b, g, n)));
    const conflict = !same(base, wikiBase) || (!excluded && !same(rawGrowth, wikiGrowth));
    const levels = calc(base, growth);
    const wikiLevels = conflict ? calc(wikiBase, wikiGrowth) : null;
    return { label: s.label, base, growth, growthSource, rawGrowth, excluded, levels, wikiBase, wikiGrowth, wikiLevels, conflict, digits: s.digits };
  });
}

export interface AttackSpeedRow {
  base: number | null;
  growthPercent: number | null;
  /** 反映率は Wiki にだけある。ない場合は合計を計算しない */
  ratio: number | null;
  levels: (number | null)[];
  wikiBase: number | null;
  wikiGrowthPercent: number | null;
  conflict: boolean;
}

export function attackSpeedRow(dd: DDragonChampion, wiki: WikiForm | null): AttackSpeedRow {
  const base = num(dd.stats.attackspeed);
  const growthPercent = num(dd.stats.attackspeedperlevel);
  const ratio = wiki ? num(wiki.stats?.as_ratio) : null;
  const wikiBase = wiki ? num(wiki.stats?.as_base) : null;
  const wikiGrowthPercent = wiki ? num(wiki.stats?.as_lvl) : null;
  const levels = SHOWN_LEVELS.map((n) => (base === null || ratio === null ? null : totalAttackSpeed({ base, ratio, growthPercent: growthPercent ?? 0 }, n)));
  return { base, growthPercent, ratio, levels, wikiBase, wikiGrowthPercent, conflict: !same(base, wikiBase) || !same(growthPercent, wikiGrowthPercent) };
}

/** Data Dragon と比べる Wiki の形態（違いの最も少ない形態。形態が1つならそれ）*/
export function closestForm(dd: DDragonChampion, forms: WikiForm[], knownIssues: KnownIssue[] = []): WikiForm | null {
  if (forms.length === 0) return null;
  const score = (w: WikiForm) => statRows(dd, w, knownIssues).filter((r) => r.conflict).length + (attackSpeedRow(dd, w).conflict ? 1 : 0);
  return [...forms].sort((a, b) => score(a) - score(b))[0];
}

/** Data Dragon の説明文の穴埋め（{{ qdamage }} など）。値は Data Dragon に含まれないことが多い */
export function placeholders(text: string | null): string[] {
  return [...(text ?? "").matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);
}

/** 射程 25000 以上は、Data Dragon が全体・自分中心などのスキルに付ける大きな値（実際の射程ではない可能性が高い。解釈はしない）*/
export const RANGE_MARKER = 25000;

/** 版のあいだの基本ステータス・スキルの変化 */
export function statChanges(oldDd: DDragonChampion, newDd: DDragonChampion): { field: string; from: unknown; to: unknown }[] {
  const out: { field: string; from: unknown; to: unknown }[] = [];
  for (const k of new Set([...Object.keys(oldDd.stats), ...Object.keys(newDd.stats)])) if (oldDd.stats[k] !== newDd.stats[k]) out.push({ field: k, from: oldDd.stats[k] ?? null, to: newDd.stats[k] ?? null });
  newDd.spells.forEach((s, i) => {
    const o = oldDd.spells[i];
    if (!o) return;
    for (const f of ["maxrank", "cooldownBurn", "costBurn", "rangeBurn"] as const) if (String(o[f]) !== String(s[f])) out.push({ field: `${s.slot} ${f}`, from: o[f], to: s[f] });
    if (o.tooltip.en !== s.tooltip.en) out.push({ field: `${s.slot} 説明文`, from: "（変更前）", to: "（変更後）" });
  });
  return out;
}

export { growthMultiplier };
