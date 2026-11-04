// アイテムの詳しい表示のための整理（値段・ステータスの分類と単位・効果の種類・固有効果の重複のルール・公式の説明の値の欠け）。
// どれも取得済みのデータ（Data Dragon・Wiki の Module:ItemData・Named item effect の表）を並べ替えるだけで、原典にない条件は足さない。
// 確かめられないものは「未確認」として返す。

// ---- ステータス ----

export interface WikiItemIdentity { name: string; data?: { id?: number } }
export interface OfficialItemIdentity { id: number; name: { en: string | null; ja: string | null }; maps: Record<string, boolean> }
export interface ItemDataMatch<T extends OfficialItemIdentity = OfficialItemIdentity> {
  status: "matched" | "unconfirmed" | "missing";
  official?: T;
  candidates: T[];
  wikiNames: string[];
  reason?: "name_mismatch" | "ambiguous";
}
/** 表示タグ・大文字小文字・Wikiの種別補足だけを除く。類似名・翻訳名から同一性を推測しない。 */
export function itemIdentityName(name: string) {
  return name.split(/<br\s*\/?\s*>/i)[0].replace(/<[^>]*>/g, "").replace(/\s*\((?:Trinket|Turret Item)\)$/i, "").normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}
/** IDと英語名の両方で照合し、一意な対応のみ返す。重複はMapで上書きしない。 */
export function matchItemData<T extends OfficialItemIdentity>(wiki: readonly WikiItemIdentity[], official: readonly T[]): Map<string, ItemDataMatch<T>> {
  const result = new Map<string, ItemDataMatch<T>>();
  for (const w of wiki) {
    const candidates = official.filter((d) => d.id === w.data?.id);
    const peers = wiki.filter((p) => p.data?.id === w.data?.id);
    const wikiNames = peers.map((p) => p.name);
    if (!candidates.length) { result.set(w.name, { status: "missing", candidates, wikiNames }); continue; }
    const d = candidates[0];
    const name = d.name.en && itemIdentityName(d.name.en);
    const matching = name ? peers.filter((p) => itemIdentityName(p.name) === name) : [];
    if (candidates.length === 1 && matching.length === 1 && matching[0] === w) {
      result.set(w.name, { status: "matched", official: d, candidates, wikiNames });
    } else {
      result.set(w.name, { status: "unconfirmed", reason: candidates.length > 1 || matching.length > 1 ? "ambiguous" : "name_mismatch", candidates, wikiNames });
    }
  }
  return result;
}

export interface ItemReferenceData { modes?: unknown; stats?: Record<string, unknown> }
export interface ItemFieldResolution {
  value: unknown;
  /** 参照元から終端まで。欠損・循環でも、たどった名前を保持する。 */
  chain: string[];
  error?: "missing_item" | "missing_field" | "cycle" | "invalid_type";
}
/** Wiki getter と同じく、参照先の同じキー経路を読む。元データは書き換えない。 */
export function resolveItemField(item: string, path: readonly string[], items: ReadonlyMap<string, ItemReferenceData>): ItemFieldResolution {
  const chain: string[] = [];
  const seen = new Set<string>();
  let name = item;
  for (;;) {
    chain.push(name);
    if (seen.has(name)) return { value: undefined, chain, error: "cycle" };
    seen.add(name);
    let value: unknown = items.get(name);
    if (!value) return { value: undefined, chain, error: "missing_item" };
    for (const key of path) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return { value: undefined, chain, error: "missing_field" };
      value = (value as Record<string, unknown>)[key];
    }
    if (typeof value === "string" && value.startsWith("=>")) { name = value.slice(2); continue; }
    return { value, chain };
  }
}

export function resolveItemModes(item: string, items: ReadonlyMap<string, ItemReferenceData>): ItemFieldResolution & { sr: boolean | null } {
  const r = resolveItemField(item, ["modes"], items);
  const value = r.value;
  if (!r.error && value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)["classic sr 5v5"] === "boolean") {
    return { ...r, sr: (value as Record<string, boolean>)["classic sr 5v5"] };
  }
  return { ...r, error: r.error ?? "invalid_type", sr: null };
}

export function resolveItemStats(item: string, items: ReadonlyMap<string, ItemReferenceData>) {
  const original = items.get(item)?.stats;
  const stats = { ...original };
  const references: Record<string, ItemFieldResolution> = {};
  for (const [key, value] of Object.entries(original ?? {})) {
    if (typeof value !== "string" || !value.startsWith("=>")) continue;
    const r = resolveItemField(item, ["stats", key], items);
    const valid = !r.error && typeof r.value === "number" && Number.isFinite(r.value);
    references[key] = valid ? r : { ...r, error: r.error ?? "invalid_type" };
    stats[key] = valid ? r.value : null;
  }
  return { stats, references };
}

export const ITEM_REFERENCE_ERRORS: Record<NonNullable<ItemFieldResolution["error"]>, string> = {
  missing_item: "参照先の記録なし", missing_field: "参照先の項目なし", cycle: "循環参照", invalid_type: "参照値の型が不正・数値等を確定できない",
};

/** 単位：flat は固定値、percent は割合（%）。Wiki の Module:ItemData/getter の isPercentage と同じ区別 */
export interface StatDef { label: string; unit: "flat" | "percent"; group: StatGroup }
export type StatGroup = "attack" | "magic" | "defense" | "resource" | "utility" | "other";
export const STAT_GROUP_LABELS: Record<StatGroup, string> = {
  attack: "攻撃", magic: "魔法", defense: "防御", resource: "リソース・回復", utility: "ユーティリティ", other: "その他",
};
const ORDER: StatGroup[] = ["attack", "magic", "defense", "resource", "utility", "other"];
export const STAT_DEFS: Record<string, StatDef> = {
  ad: { label: "攻撃力", unit: "flat", group: "attack" },
  as: { label: "攻撃速度", unit: "percent", group: "attack" },
  crit: { label: "クリティカル率", unit: "percent", group: "attack" },
  critdamage: { label: "クリティカルダメージ", unit: "percent", group: "attack" },
  lethality: { label: "脅威（物理防御貫通の固定値）", unit: "flat", group: "attack" },
  armpen: { label: "物理防御貫通（割合）", unit: "percent", group: "attack" },
  ap: { label: "魔力", unit: "flat", group: "magic" },
  mpenflat: { label: "魔法防御貫通（固定値）", unit: "flat", group: "magic" },
  mpen: { label: "魔法防御貫通（割合）", unit: "percent", group: "magic" },
  hp: { label: "体力", unit: "flat", group: "defense" },
  armor: { label: "物理防御", unit: "flat", group: "defense" },
  mr: { label: "魔法防御", unit: "flat", group: "defense" },
  mana: { label: "マナ", unit: "flat", group: "resource" },
  // hp5・mp5 は基本の自動回復に対する割合（Wiki の isPercentage）。hp5flat・mp5flat は5秒あたりの固定値
  hp5: { label: "基本体力自動回復", unit: "percent", group: "resource" },
  hp5flat: { label: "体力自動回復（5秒あたり）", unit: "flat", group: "resource" },
  mp5: { label: "基本マナ自動回復", unit: "percent", group: "resource" },
  mp5flat: { label: "マナ自動回復（5秒あたり）", unit: "flat", group: "resource" },
  lifesteal: { label: "ライフスティール", unit: "percent", group: "resource" },
  omnivamp: { label: "オムニヴァンプ", unit: "percent", group: "resource" },
  ah: { label: "スキルヘイスト", unit: "flat", group: "utility" },
  ms: { label: "移動速度（割合）", unit: "percent", group: "utility" },
  msflat: { label: "移動速度（固定値）", unit: "flat", group: "utility" },
  tenacity: { label: "行動妨害耐性", unit: "percent", group: "utility" },
  hsp: { label: "回復・シールド量", unit: "percent", group: "utility" },
  gp10: { label: "ゴールド（10秒あたり）", unit: "flat", group: "utility" },
};

export interface StatLine { key: string; label: string; value: string; zero: boolean }
/**
 * ステータスを意味ごとに分ける（そのアイテムが持つ分類だけ）。値が0のものは隠さず zero を付ける
 * （Wiki のデータの値が0。効果で決まる値・未設定の可能性があるため、画面では注記する）。
 * 明示された null・undefined・有限でない数値は「不明」。項目そのものがなければ値を作らない。
 * 数でない値（spec など）は「その他」に文字のまま入れる
 */
export function groupStats(stats: Record<string, unknown> | undefined, plain: (s: string) => string = (s) => s): { group: StatGroup; label: string; lines: StatLine[] }[] {
  const by = new Map<StatGroup, StatLine[]>();
  for (const [key, v] of Object.entries(stats ?? {})) {
    const def = STAT_DEFS[key];
    let line: StatLine;
    if (v == null || (typeof v === "number" && !Number.isFinite(v))) {
      line = { key, label: def?.label ?? key, value: "不明", zero: false };
    } else if (typeof v === "number") {
      line = { key, label: def?.label ?? key, value: `${v}${def?.unit === "percent" ? "%" : ""}`, zero: v === 0 };
    } else if (typeof v === "string") {
      line = { key, label: key === "spec" ? "そのほかの値" : def?.label ?? key, value: plain(v), zero: false };
    } else continue;
    const g = typeof v !== "string" && def ? def.group : "other";
    by.set(g, [...(by.get(g) ?? []), line]);
  }
  return ORDER.filter((g) => by.has(g)).map((g) => ({ group: g, label: STAT_GROUP_LABELS[g], lines: by.get(g)! }));
}

// ---- 値段 ----

export interface DdGold { base: number; total: number; sell: number; purchasable: boolean }
export interface PriceRow { label: string; value: string; note?: string }
/**
 * 値段の行：購入価格・合成費用・売却価格・購入できるか・売却できるか（明記があるときだけ）。
 * 売却価格は Data Dragon の gold.sell をそのまま使い、購入価格から割合で計算しない。
 * Wiki の buy・sell・sellratio は Wiki の値として別に示す（Data Dragon と違うときは両方）
 */
export function priceRows(dd: { gold: DdGold; from?: string[]; description?: { ja: string | null } } | undefined, wiki: { buy?: unknown; sell?: unknown; sellratio?: unknown } | undefined, ddVersion: string, limitEn?: string, unconfirmed = false): PriceRow[] {
  const rows: PriceRow[] = [];
  if (!dd) {
    rows.push({ label: "購入価格", value: unconfirmed ? "対応未確認" : "未取得", note: unconfirmed ? `Data Dragon ${ddVersion} に同じIDの候補はあるが、対応を確定できないため結合していない` : `Data Dragon ${ddVersion} にこのアイテムの ID がない` });
  } else {
    const g = dd.gold;
    if (g.purchasable) {
      rows.push({ label: "購入価格", value: g.total === 0 ? "0ゴールド（無料）" : `${g.total}ゴールド`, note: `Data Dragon ${ddVersion}` });
      if (dd.from && dd.from.length) rows.push({ label: "合成費用", value: `${g.base}ゴールド`, note: "素材を除いた額（Data Dragon の gold.base）" });
    } else {
      rows.push({ label: "購入", value: "ショップで購入できない", note: `Data Dragon の purchasable が false（値段の欄の値 ${g.total} は購入価格として扱わない）` });
    }
    // 売却価格の0は「0ゴールドで売れる」と「売却できない」をこの値だけでは区別できないので、どの場合も注記する
    rows.push({ label: "売却価格", value: `${g.sell}ゴールド`, note: `Data Dragon の gold.sell${g.sell === 0 ? "。0 は「0ゴールドで売れる」のか「売却できない」のか、この値だけでは区別できない（下に明記があればそれに従う。なければ未確認）" : ""}` });
  }
  if (wiki) {
    const ddTotal = dd?.gold.total;
    if (typeof wiki.buy === "number" && wiki.buy !== ddTotal) rows.push({ label: "Wiki の購入価格", value: `${wiki.buy}ゴールド`, note: dd ? `Data Dragon（${ddTotal}）と異なる。どちらが現在の値かは未確認` : undefined });
    else if (typeof wiki.buy === "string" && wiki.buy.startsWith("=>")) rows.push({ label: "Wiki の購入価格", value: `${wiki.buy.slice(2)} の値を参照`, note: "Wiki のデータの参照" });
    if (typeof wiki.sell === "number") rows.push({ label: "Wiki の売却価格", value: `${wiki.sell}ゴールド`, note: dd && dd.gold.sell !== wiki.sell ? `Data Dragon（${dd.gold.sell}）と異なる。どちらが現在の値かは未確認` : undefined });
    if (typeof wiki.sellratio === "number") rows.push({ label: "Wiki の売却の割合", value: `${Math.round(wiki.sellratio * 100)}%`, note: "Wiki のデータの値（Rift Compass はこの割合から売却価格を計算しない）" });
  }
  // 売却できるか：明記があるときだけ（Wiki の sell = "No Sell"、制限の文、公式の説明の「売却不可」）
  const noSell: string[] = [];
  if (wiki && typeof wiki.sell === "string" && /no sell/i.test(wiki.sell)) noSell.push("Wiki のデータ（No Sell）");
  if (limitEn && /cannot be (re)?sold/i.test(limitEn)) noSell.push("Wiki の制限の文");
  if (dd?.description?.ja && /売却不可/.test(dd.description.ja)) noSell.push("公式の説明");
  if (noSell.length) rows.push({ label: "売却", value: "売却できない", note: `明記：${noSell.join("・")}` });
  return rows;
}

// ---- 公式の説明（Data Dragon）の値の欠け ----

/**
 * Data Dragon の説明では、値を埋め込めなかった箇所が日本語では「0」、英語では空欄（"take  magic damage"・"(0s)"）になることがある。
 * 単独の 0（0.25・10・-0 などではない）を、値の欠けの可能性として分ける。本当の0の可能性もあるので「可能性」として示す
 */
export function splitPlaceholderZeros(text: string): { text: string; zero: boolean }[] {
  const out: { text: string; zero: boolean }[] = [];
  const re = /(^|[^\d.\-－])0(?![\d.])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const at = m.index + m[1].length;
    if (at > last) out.push({ text: text.slice(last, at), zero: false });
    out.push({ text: "0", zero: true });
    last = at + 1;
  }
  if (last < text.length) out.push({ text: text.slice(last), zero: false });
  return out;
}
export const hasPlaceholderZero = (text: string | null | undefined) => !!text && splitPlaceholderZeros(text).some((x) => x.zero);

// ---- 効果の種類・固有効果の重複のルール ----

export const EFFECT_KIND_LABELS: Record<string, string> = { pass: "パッシブ", act: "アクティブ", consume: "消費時の効果" };
/** 効果のキー（pass・pass2・act・consume など）から種類。description2 などの続きは親の効果の種類 */
export function effectKind(key: string): string {
  const base = key.split(".")[0].replace(/\d+$/, "");
  return EFFECT_KIND_LABELS[base] ?? base;
}

export interface NamedEffect { name: string; kind: "shared" | "isolated"; group?: string; items: string[]; runes?: string[] }
export type UniqueStatus = "shared_listed" | "isolated_listed" | "listed_other_items" | "unlisted";
export interface UniqueInfo {
  status: UniqueStatus;
  /** 表の効果（名前の大文字・小文字の違いだけはそろえる） */
  table?: NamedEffect;
  /** データ上、同じ名前の効果を持つほかのアイテム（表で確かめられたものとは限らない） */
  sameNameItems: string[];
  /**
   * クールダウンの共有は未確認として示す：Item の記事の一般則（同じ名前の効果を持つアイテムを複数持てるとき CD を共有する）は、
   * 同時に持てる数の制限（Lifeline など）で複数持てない場合には当てはまらないため、Rift Compass は共有と決めない。表で共有の効果で CD があるときだけ true
   */
  cooldownRuleUnconfirmed: boolean;
}
/**
 * 効果の名前を Named item effect の表と照らす。名前が同じだけでは重複のルールを決めない：
 * - shared_listed：表の共有の固有効果で、このアイテムが表に載っている
 * - isolated_listed：表の単独の固有効果で、このアイテムが表に載っている
 * - listed_other_items：表に同じ名前の効果があるが、このアイテムは載っていない（未確認）
 * - unlisted：表に名前がない（未確認）
 */
export function uniqueInfo(itemName: string, effectName: string, hasCooldown: boolean, table: NamedEffect[], effectNamesByItem: Map<string, string[]>): UniqueInfo {
  const low = effectName.toLowerCase();
  const rows = table.filter((t) => t.name.toLowerCase() === low);
  const listed = rows.find((t) => t.items.includes(itemName));
  const sameNameItems = [...effectNamesByItem].filter(([item, names]) => item !== itemName && names.some((n) => n.toLowerCase() === low)).map(([item]) => item);
  if (listed) {
    return { status: listed.kind === "shared" ? "shared_listed" : "isolated_listed", table: listed, sameNameItems, cooldownRuleUnconfirmed: listed.kind === "shared" && hasCooldown };
  }
  return { status: rows.length ? "listed_other_items" : "unlisted", table: rows[0], sameNameItems, cooldownRuleUnconfirmed: false };
}

/** 同時に持てる数の制限（Template:Item limit の分岐）を日本語で。原文の英語は別に示す */
export function limitGroupJa(group: string): string {
  switch (group) {
    case "legendary": return "同じアイテムは1つまで（レジェンダリーの既定の制限）";
    case "Potion": return "ポーションは1種類まで";
    case "Elixir": return "エリクサーの効果は同時に1つまで（別のエリクサーを飲むと効果が置き換わる）";
    case "Jungle": case "Support": return "ジャングル・サポートのアイテムは合わせて1つまで";
    case "Crit Modifier": case "Marksman Capstone": return "Crit Modifier・Marksman Capstone のアイテムは合わせて1つまで";
    default: return `「${group}」グループのアイテムは1つまで`;
  }
}
