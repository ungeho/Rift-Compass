// C-6限定照合の表示用注記。ルールの実行判定・ゲーム内実証の結果ではない。
export type ReviewedEffect = "Lifeline" | "Quicksilver";
const members = [
  [3155, "Hexdrinker", "Lifeline"], [6673, "Immortal Shieldbow", "Lifeline"],
  [3156, "Maw of Malmortius", "Lifeline"], [3040, "Seraph's Embrace", "Lifeline"],
  [3053, "Sterak's Gage", "Lifeline"], [2525, "Protoplasm Harness", "Lifeline"],
  [3140, "Quicksilver Sash", "Quicksilver"], [3139, "Mercurial Scimitar", "Quicksilver"],
] as const;
export function reviewedEffectFor(name: string, id: number | undefined): ReviewedEffect | null {
  return members.find((m) => m[0] === id && m[1] === name)?.[2] ?? null;
}
export const EFFECT_REVIEW_CHECKED = "2026-11-04";
const wiki = "https://wiki.leagueoflegends.com/en-us/";
export const EFFECT_REVIEWS = {
  Lifeline: {
    trigger: "公式16.21.1では最大体力30%未満になるダメージが条件。Hexdrinker・Mawは魔法ダメージと魔法シールド、Shieldbow・Seraph・Sterakは被ダメージとシールド。Protoplasm Harnessは最大体力増加と回復で、シールドと同一ではない。",
    duplication: "Named item effect表では共有効果。ただし表は26.11以降古い可能性を明記。同名でも効果量・対象・持続が異なり、現行SRの重複適用・優先順は未実証。表だけで現行ルールを確定しない。",
    cooldown: "保存Wikiの対象5アイテムは各90秒を記載。公式説明はCDを省略するか0を含む欠損の可能性がある表示。個別CDの数値が同じことから、異なるアイテム間の共有CDは推定しない（未確認）。",
    equip: "保存Wikiの対象5アイテムにはLifelineグループ1個までの記録。これは効果非重複やCD共有とは別の装備制限。Wiki一般則には合成・変化による取得の例外がある。公式16.21.1には装備グループ情報がなく、ゲーム内では未検証。",
    transfer: "公式26.16にはHexdrinker→Mawの合成時にCDがリセットされない不具合の修正を記載。Wikiの個別記事は『引き継がない』と説明する。共有CD一般の証明ではなく、リセット後の残秒や売買・他の組合せへは一般化しない。",
    exceptions: "26.8のShieldbow・Maw・SterakのCD60秒はARAM: Mayhem欄の記録でSRへ適用しない。26.11のShieldbowのシールド400–1000もArena欄の記録。別ID323040のSeraphは通常ID3040と別に扱い、今回の結論を自動適用しない。",
    sources: [
      { label: "Riot 26.16：合成時CDの不具合修正", url: "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-16-notes" },
      { label: "Riot 26.8：モード別CD", url: "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-8-notes" },
      { label: "Wiki Hexdrinker：注記・履歴（2026-11-01更新）", url: wiki + "Hexdrinker" },
      { label: "Wiki Named item effect：表（2026-07-25更新・26.11以降古い可能性）", url: wiki + "Named_item_effect" },
      { label: "Wiki Item：装備制限と合成・変化の例外（2026-08-05更新）", url: wiki + "Item" },
    ],
  },
  Quicksilver: {
    trigger: "公式16.21.1では自分の行動妨害を解除しAirborneを除外。Mercurial Scimitarだけ移動速度増加も記載。公式25.18はその持続を1.5→2秒へ変更。保存Wikiの1.5秒は旧情報。",
    duplication: "Named item effect表では共有効果として2アイテムを掲載。ただし表は26.11以降古い可能性があり、現行SRの併用・優先処理を実証した結果ではない。",
    cooldown: "保存Wikiは両方90秒。公式16.21.1の説明はCDを省略しており、同じCD値や同じ名前から共有CDを確定しない（未確認）。",
    equip: "保存WikiにはQuicksilverグループ1個までの記録。通常購入の制限と合成での上書きは別。装備制限からCD共有や効果非重複を推論しない。現行の購入・売買挙動は未実証。",
    transfer: "Template:Quicksilver info（2024-04-21更新）は、当該アクティブを持つアイテム間でCDを引き継がないと記載する。Wikiの注記であり、対象時点のRiot公式の明記・ゲーム内実証は未確認。",
    exceptions: "同テンプレートはAirborne中は使用不可、Suppression・Nearsightを解除、Stasisは解除不可、付随する持続効果やサモナースペルのデバフは別と説明。Mordekaiser Rを解除しない変更はWiki14.8履歴。公式26.20にはGraves W中に一時視界を得られた不具合の修正があり、恒常的な視界獲得効果とは扱わない。",
    sources: [
      { label: "Riot 25.18：Mercurial Scimitarの変更", url: "https://www.leagueoflegends.com/en-us/news/game-updates/patch-25-18-notes" },
      { label: "Riot 26.20：Graves W中の視界の不具合修正", url: "https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes" },
      { label: "Wiki Quicksilver共通注記（2024-04-21更新）", url: wiki + "Template:Quicksilver_info" },
      { label: "Wiki Quicksilver Sash：履歴（2024-08-01更新）", url: wiki + "Quicksilver_Sash" },
      { label: "Wiki Named item effect：表（古い可能性）", url: wiki + "Named_item_effect" },
      { label: "Wiki Item：装備制限と合成・変化の例外", url: wiki + "Item" },
    ],
  },
} as const;
