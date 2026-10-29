// 知識の散策（試験）の抽選対象。既存のデータをそのまま使い、新しい知識は作らない。
// 教材は公開対象（index.publicResources＝isPublic）だけ、判断材料は試験表示（showcaseDecisions）だけ。
// 具体例は判断材料の詳細から読めるので、独立した抽選対象にはしない。
import type { ExploreItem } from "../lib/explore";
import { index } from "./dataset";
import { isShowcased, showcaseDecisions } from "./decisions";

export const explorePool: ExploreItem[] = [
  ...index.publicResources.map((r): ExploreItem => ({ kind: "resource", id: r.id, topicIds: r.topic_ids })),
  ...showcaseDecisions.map(
    (u): ExploreItem => ({
      kind: "decision",
      id: u.id,
      topicIds: u.topic_ids.filter((t) => index.topicById.has(t)),
      // 試験表示の判断材料どうしの関係だけを使う（表示しない判断材料へはつながない）
      relatedIds: u.relations.map((r) => r.to).filter((id) => isShowcased(id)),
    }),
  ),
];

/** 散策で選べる Topic（近い候補が1件以上あるもの）。大分類を先に並べる */
export function exploreTopics(): { id: string; label: string; nearCount: number }[] {
  return [...index.data.topics]
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "category" ? -1 : 1))
    .map((t) => {
      const desc = index.descendants(t.id);
      const nearCount = explorePool.filter((x) => x.topicIds.some((id) => desc.has(id))).length;
      return { id: t.id, label: t.kind === "category" ? `【${t.label_ja}】` : t.label_ja, nearCount };
    })
    .filter((t) => t.nearCount > 0);
}
