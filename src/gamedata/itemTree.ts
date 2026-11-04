import type { DdGold, OfficialItemIdentity } from "./itemRules";

export interface TreeItem extends OfficialItemIdentity {
  gold: DdGold;
  from?: string[];
  into?: string[];
}
/** RiotのItem Assetsの規則。16.21.1の863件すべてでimage.full = ID.pngを照合済み。
 * 一意な公式レコードそのものだけを許可し、Wiki IDや曖昧な候補から画像を推測しない。
 */
export function itemIconUrl(version: string, item: TreeItem, all: readonly TreeItem[]): string | null {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(item.id) || item.id <= 0) return null;
  const records = all.filter((d) => d.id === item.id);
  if (records.length !== 1 || records[0] !== item) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.id}.png`;
}
export function displayItemName(name: string | null) {
  return name?.split(/<br\s*\/?\s*>/i)[0].replace(/<[^>]*>/g, "") || "名前未収録";
}
export function relationNodes(item: TreeItem, direction: "from" | "into", all: readonly TreeItem[]) {
  const ids = item[direction];
  if (!Array.isArray(ids)) return null;
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => {
    const candidates = all.filter((d) => String(d.id) === id);
    const target = candidates.length === 1 ? candidates[0] : undefined;
    const cyclic = id === String(item.id) || !!target?.[direction]?.includes(String(item.id));
    return { id, count, target, cyclic, status: candidates.length === 0 ? "missing" as const : candidates.length > 1 ? "ambiguous" as const : "ok" as const };
  });
}

/** 値段0を「無料」と解釈せず、購入不可や条件付きの変化も区別する。 */
export function treePrice(item: TreeItem) {
  return item.gold.purchasable ? `${item.gold.total}G（Data Dragonの価格）` : `購入不可・値段欄 ${item.gold.total}G（購入価格ではない）`;
}
export function itemCategory(data: { type?: unknown; champion?: unknown; ornn?: unknown; req?: unknown } | undefined, official?: TreeItem) {
  const types = Array.isArray(data?.type) ? data.type : [];
  if (data?.champion || data?.ornn || data?.req) return "特殊・条件付き（専用強化など）";
  if (types.some((t) => ["Turret", "Minion"].includes(t))) return "施設・ミニオン用";
  if (types.some((t) => ["Consumable", "Potion", "Elixir", "Anvil"].includes(t))) return "消耗品・特殊用途";
  if (types.some((t) => ["Trinket", "Distributed", "Special"].includes(t))) return "配布・トリンケット・特殊用途";
  if (official?.gold.purchasable === false) return "購入不可（変化・配布など。詳細参照）";
  return types.length && official?.gold.purchasable ? "装備（公式データでは購入可）" : "装備種別・購入条件は未確認";
}
