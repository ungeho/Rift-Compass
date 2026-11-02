// 英語 Wiki のスキルのデータ（public/gamedata/wiki/<取得日>/abilities/<キー>.json）の型と、表示用の変換。
// 原情報（params の文字列）はファイルに残し、ここでは表示のために簡略化するだけ（推測で値を補わない）。

export interface ParsedValue {
  ok: true;
  kind: "number" | "by_rank" | "by_rank_linear";
  values: number[];
  from?: number;
  to?: number;
  ranks?: number;
  /** 基礎値が割合のとき "%" と、その対象（例：of target's missing health）*/
  unit?: string;
  of?: string;
}

export interface Ratio {
  percent: number | number[] | null;
  of: string;
  raw?: string;
  reason?: string;
}

export interface Leveling {
  field: string;
  label: string;
  raw: string;
  base: ParsedValue | null;
  ratios: Ratio[];
  reason?: string;
}

export interface WikiAbilityTemplate {
  title: string;
  slot: "I" | "Q" | "W" | "E" | "R";
  name: string;
  form: string;
  source: { title: string; url: string; status: number; last_modified: string | null; fetched_at: string };
  params?: Record<string, string>;
  vars?: Record<string, string>;
  parsed?: Record<string, ParsedValue>;
  leveling?: Leveling[];
  unparsed?: { field: string; reason: string }[];
  /** ランク別の値の数が Data Dragon の最大ランクと違うとき（例：R のランクで変わる基本スキル）*/
  rank_note?: { ddragon_maxrank: number; value_counts: number[] };
  /** 転送（#REDIRECT）のとき、転送先のテンプレート */
  redirect_to?: string;
  compare?: { ddragon_version: string; ddragon_cooldown: number[]; wiki_cooldown: number[]; same: boolean };
}

export interface WikiAbilityFile {
  license: { name: string; url: string; attribution: string };
  champion: string;
  forms: string[];
  ddragon_key: string;
  templates: WikiAbilityTemplate[];
}

/** 値の表示：ランク別は「/」でつなぐ */
export const showValues = (v: { values: number[]; unit?: string; of?: string } | null | undefined) =>
  v ? `${v.values.map((x) => String(Number(x.toFixed(4)))).join("/")}${v.unit ?? ""}${v.of ? ` ${v.of}` : ""}` : "—";

export function showRatio(r: Ratio): string {
  // 解析できなかった係数は、記法を簡略化した原文に「未解析」を付けて示す（{{ }} をそのまま出さない）
  if (r.percent === null) return `(+ 未解析：${wikiPlain(r.raw ?? "?")}% ${r.of})`;
  const p = Array.isArray(r.percent) ? r.percent.map((x) => Number(x.toFixed(4))).join("/") : String(Number(r.percent.toFixed(4)));
  return `(+ ${p}% ${r.of})`;
}

const FIELD_LABELS: Record<string, string> = {
  cooldown: "CD",
  cost: "コスト",
  range: "射程",
  "target range": "対象への射程",
  "effect radius": "効果範囲",
  speed: "弾速・移動速度",
  width: "幅",
  angle: "角度",
  "cast time": "詠唱時間",
  static: "固定のクールダウン",
  recharge: "チャージの回復",
  charges: "チャージ数",
  delay: "遅延",
  duration: "効果時間",
  "collision radius": "当たり判定",
  "tether radius": "つながりの範囲",
  "attack range": "通常攻撃の射程",
};
export const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k;

/** 未解析の理由（取り込みの道具の理由コード）を、利用者向けの説明にする */
const REASONS: Record<string, string> = {
  level_dependent: "チャンピオンのレベル依存の式",
  "template:pp": "チャンピオンのレベル依存の式",
  "template:pplevel": "チャンピオンのレベル依存の式",
  "template:dv": "2つの値（形態・条件で違う値）",
  text: "文の値",
  "template:tt": "説明つきの値",
  "template:tip": "記法だけの値",
  "template:as": "入れ子の式",
  ap_complex: "読み取れない式",
  ap_range_without_ranks: "段階の数が分からない範囲",
  ap_part_without_count: "段階の数が分からない範囲",
  base_nested_template: "基礎値が未解決の変数・入れ子の式",
  no_base: "基礎値の表記がない",
  st_unpaired: "ラベルだけの項目",
  "template:degree": "角度の表記",
  "template:degrees": "角度の表記",
};
export const reasonLabel = (code: string | undefined) => (code ? (REASONS[code] ?? (code.startsWith("template:") ? `記法 ${code.slice(9)}` : code)) : "未解析");

/**
 * Wiki のテンプレート記法を、読める文字列に簡略化する（表示専用。原文はファイルに残す）。
 * 例：{{as|60% AP}} → 60% AP、{{tip|stasis (buff)|stasis}} → stasis、[[Gold|g]] → g
 */
export function wikiPlain(text: string | undefined | null): string {
  if (!text) return "";
  let t = text.replace(/<!--[\s\S]*?-->/g, "");
  for (let k = 0; k < 30; k++) {
    const before = t;
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_all, inner: string) => {
      const parts = inner.split("|").map((x) => x.trim());
      const name = (parts[0] || "").toLowerCase();
      const args = parts.slice(1).filter((x) => !/^[a-z]+\s*=/.test(x));
      if (name === "sbc" || name === "as" || name === "fd" || name === "g" || name === "sti") return args[0] ?? "";
      if (name === "ap" || name === "pp" || name === "rd") return args.join(" / ").replace(/\s+to\s+/g, "〜");
      if (name === "st") return `${args[0] ?? ""}: ${args[1] ?? ""}`;
      if (name === "tt") return args[0] ?? "";
      if (/^(ci|cai|ai|si|ii|ri|bi|ui|csl|nie)$/.test(name)) return args[args.length > 1 && name !== "ci" ? 0 : 0] ?? "";
      if (name === "tip") return args[args.length - 1] ?? args[0] ?? "";
      return args.length ? args[args.length - 1] : "";
    });
    if (t === before) break;
  }
  t = t
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return t;
}

export interface DerivedProperty {
  id: string;
  label_ja: string;
  basis: string;
}

/**
 * 式から数学的に導ける性質（スキルの係数の対象から機械的に判定）。戦術的な結論（「タンクに強い」など）は含めない。
 * 例：対象の最大体力に比例するダメージ → 軽減前のダメージは対象の最大体力が大きいほど増える
 */
export function derivedProperties(t: WikiAbilityTemplate): DerivedProperty[] {
  const out: DerivedProperty[] = [];
  const add = (id: string, label_ja: string, basis: string) => {
    if (!out.some((x) => x.id === id)) out.push({ id, label_ja, basis });
  };
  for (const l of t.leveling ?? []) {
    const items = [...l.ratios.map((r) => ({ of: r.of, where: `${l.label} ${showRatio(r)}` })), ...(l.base?.of ? [{ of: l.base.of, where: `${l.label} ${showValues(l.base)}` }] : [])];
    for (const { of: rawOf, where } of items) {
      const of = rawOf.toLowerCase();
      if (/target'?s? max(imum)? health|of the target's max(imum)? health|max(imum)? health of the target/.test(of)) add("target-max-hp", "対象の最大体力が大きいほど、軽減前の値が増える", where);
      else if (/target'?s? missing health/.test(of)) add("target-missing-hp", "対象の減少体力が大きいほど、軽減前の値が増える", where);
      else if (/target'?s? current health/.test(of)) add("target-current-hp", "対象の現在体力が大きいほど、軽減前の値が増える", where);
      else if (/(his|her|their|its|own) missing health/.test(of)) add("self-missing-hp", "自分の減少体力が大きいほど増える", where);
      else if (/bonus health/.test(of)) add("self-bonus-hp", "自分の増加体力が大きいほど増える", where);
      else if (/maximum health|max health/.test(of)) add("self-max-hp", "自分の最大体力が大きいほど増える（対象か自分かは原文で確認）", where);
      else if (/bonus ad/.test(of)) add("bonus-ad", "増加攻撃力が大きいほど増える（基本攻撃力は含まない）", where);
      else if (/\bad\b/.test(of)) add("total-ad", "合計の攻撃力が大きいほど増える", where);
      else if (/\bap\b/.test(of)) add("ap", "魔力（AP）が大きいほど増える", where);
      else if (/armor|magic resistance|bonus resistances/.test(of)) add("resists", "防御のステータスが大きいほど増える", where);
    }
  }
  return out;
}
