// 限定照合で判明した、時期の異なる原典を分離する表示用の確認記録。取得済みデータは上書きしない。
export interface ItemReview {
  id: number;
  name: string;
  moduleModified: string;
  changes: { patch: string; text: string; url: string }[];
  unknowns: string[];
}
const patch = (n: string) => `https://www.leagueoflegends.com/en-us/news/game-updates/${n === "26-1" ? "patch" : "league-of-legends-patch"}-${n}-notes`;
export const ITEM_REVIEWS: readonly ItemReview[] = [
  {
    id: 3508, name: "Essence Reaver", moduleModified: "Wed, 04 Jun 2025 00:32:38 GMT",
    changes: [
      { patch: "26.1", text: "Essence Drainを削除しSpellbladeを追加。攻撃力60→55、ヘイスト15→20。素材のPickaxeをSheenへ変更。", url: patch("26-1") },
      { patch: "26.1・1月9日ホットフィックス", text: "攻撃力55→50、価格2900→3050、合成費用350→500。初回変更時の55・2900を対象時点の値として使わない。", url: patch("26-1") },
    ],
    unknowns: ["Spellbladeの細かな発動条件・ダメージ式は16.21.1の説明に省略がある。26.1の式をゲーム内で再検証したものではない。", "Wiki記事の26.1履歴にはSpellbladeグループ1個までの記録がある。26.21時点の同時購入挙動は未実証。"],
  },
  {
    id: 3179, name: "Umbral Glaive", moduleModified: "Wed, 04 Jun 2025 02:58:02 GMT",
    changes: [{ patch: "26.1", text: "Nightstalkerを追加し、ExtinguishをBlackoutへ統合。攻撃力55→60、脅威15→18、ヘイスト10→15、価格2500→2800、合成費用450→750。素材2種は同じ。", url: patch("26-1") }],
    unknowns: ["16.21.1の説明ではNightstalkerの追加ダメージ量や待機時間、Blackoutの詳細値を省略している。26.1の数値を現行の実測値とは扱わない。", "装備制限はData Dragonに収録されていない。旧Moduleの制限を対象時点のルールとして流用しない。"],
  },
  {
    id: 4005, name: "Imperial Mandate", moduleModified: "Wed, 04 Jun 2025 01:27:43 GMT",
    changes: [
      { patch: "26.11", text: "Coordinated Fireを削除しControl／Commandへ再設計。価格2250→2400、ヘイスト20→15、基本マナ回復125%→150%。", url: patch("26-11") },
      { patch: "26.12", text: "CCを持たずCCスキルへ切り替わるスキルにもControlのヘイストが付く不具合を修正した記録がある。", url: patch("26-12") },
      { patch: "26.13", text: "魔力65→60、Controlのヘイスト15→20、Commandの被ダメージ増加6%→7%。素材をAmplifying Tome 2個＋Bandleglass Mirror、合成費用700へ変更。", url: patch("26-13") },
    ],
    unknowns: ["16.21.1の説明は7%・4秒を記載するが、再適用・個々のスキルとの相互作用・共有CDの挙動はゲーム内で未検証。", "装備制限はData Dragonに収録されていない。旧Moduleの制限を対象時点のルールとして流用しない。"],
  },
  {
    id: 3139, name: "Mercurial Scimitar", moduleModified: "Wed, 04 Jun 2025 01:59:42 GMT",
    changes: [{ patch: "25.18", text: "攻撃力40→50、魔法防御40→35、Quicksilverの移動速度持続1.5→2秒。16.21.1のステータスは変更後と一致するが、公式説明は持続時間を省略している。", url: "https://www.leagueoflegends.com/en-us/news/game-updates/patch-25-18-notes" }],
    unknowns: ["移動速度持続2秒は公式25.18の変更記録。以降26.21までの対象名の記録で更なる変更は見つからなかったが、ゲーム内で実測していない。", "CD90秒、移動速度50%、ゴースト化は保存Wikiの記載で、16.21.1の公式説明では省略。一般的な共有CD・同時装備・合成時のCD引継ぎとは別に確認が必要。"],
  },
];

export const ITEM_REVIEW_VERSION = "16.21.1";
export const ITEM_REVIEW_PATCH = "26.21";
export const ITEM_REVIEW_CHECKED = "2026-11-03";
/** 名前かIDが変わっても、既知の旧仕様を通常表示へ自動復帰させず再確認待ちにする。 */
export function itemReviewFor(name: string, id: number | undefined, modified: string | null, version: string) {
  const review = ITEM_REVIEWS.find((r) => r.name === name || r.id === id);
  return review ? { review, needsReview: review.name !== name || review.id !== id || review.moduleModified !== modified || version !== ITEM_REVIEW_VERSION } : null;
}
