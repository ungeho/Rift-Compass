// 知識の散策（試験）の抽選対象。既存のデータをそのまま使い、新しい知識は作らない。
// 教材は公開対象（index.publicResources＝isPublic）だけ、判断材料は試験表示（showcaseDecisions）だけ。
// 知識ノートは、根拠が1件以上あり、根拠の資料がすべて公開対象のものだけ（isPublicNote）。
// 具体例は判断材料の詳細から読めるので、独立した抽選対象にはしない。
import type { ExploreItem } from "../lib/explore";
import { index, isPublic } from "./dataset";
import { isShowcased, showcaseDecisions } from "./decisions";
import type { KnowledgeNote } from "./types";

/**
 * 散策・ノートの詳細に出してよい知識ノートか。
 * 根拠のないノート（未確認の主張だけのもの）と、公開していない資料を根拠に含むノートは出さない
 * （公開していない資料へ導かないため。件数はデータから決まり、固定しない）
 */
export function isPublicNote(note: KnowledgeNote): boolean {
  const evidence = index.evidenceByNote.get(note.id) ?? [];
  return (
    evidence.length > 0 &&
    evidence.every((e) => {
      const r = index.resourceById.get(e.resource_id);
      return r !== undefined && isPublic(r);
    })
  );
}

export const publicNotes: KnowledgeNote[] = index.data.knowledge_notes.filter(isPublicNote);
const publicNoteIds = new Set(publicNotes.map((n) => n.id));

/** 公開する知識ノートどうしの関係（向きを問わない）。公開しないノートへはつながない */
export function relatedPublicNotes(id: string): string[] {
  const out = new Set<string>();
  for (const r of index.data.relations) {
    if (r.from === id && publicNoteIds.has(r.to)) out.add(r.to);
    if (r.to === id && publicNoteIds.has(r.from)) out.add(r.from);
  }
  return [...out];
}

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
  ...publicNotes.map(
    (n): ExploreItem => ({
      kind: "note",
      id: n.id,
      topicIds: n.topic_ids.filter((t) => index.topicById.has(t)),
      relatedIds: relatedPublicNotes(n.id),
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
