/** Manually structured from the saved Wiki paragraph, not a live-game validation.
 * Both content hashes and the literal paragraph must match before reusing it. */
export function itemEffectHighlights(item: string, key: string, text: { plain: string; source_sha1?: string; plain_sha1?: string; residual?: boolean }) {
  if (item !== "Abyssal Mask" || key !== "pass" || text.residual || text.source_sha1 !== "2b6a44b210ab6a15a600c3fb8ca929065d51a0eb" || text.plain_sha1 !== "3d467a45949db3473e38d53c7b50aa7d0fc3431e" || text.plain !== "Enemy champions within 700 units of you become cursed, causing them to receive 12% increased magic damage from all sources.") return [];
  return [["対象", "自分の周囲の敵チャンピオン"], ["効果範囲", "700ユニット"], ["効果", "受ける魔法ダメージ +12%（すべての発生源）"]] as const;
}
