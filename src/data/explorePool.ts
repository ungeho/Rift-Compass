// 知識の散策（試験）の抽選対象。既存のデータをそのまま使い、新しい知識は作らない。
// 教材は公開対象（index.publicResources＝isPublic）だけ、判断材料は試験表示（showcaseDecisions）だけ。
// 知識ノートは、公開対象の資料の根拠だけで根拠状態の規則を満たすものだけ（isPublicNote、P1）。
// 具体例は判断材料の詳細から読めるので、独立した抽選対象にはしない。
import type { ExploreItem } from "../lib/explore";
import { index, isPublic } from "./dataset";
import { isShowcased, showcaseDecisions } from "./decisions";
import { notePublicity, premisesOf, type NotePublicity } from "./notePublicity";
import type { Evidence, KnowledgeNote } from "./types";

const publicityCache = new Map<string, NotePublicity>();
/** ノートの公開判定と根拠の分け方（P1。src/data/notePublicity.ts）。保存データの index から求めて覚えておく */
export function publicityOf(note: KnowledgeNote): NotePublicity {
  let p = publicityCache.get(note.id);
  if (!p) {
    p = notePublicity({
      note,
      evidence: index.evidenceByNote.get(note.id) ?? [],
      resourceById: index.resourceById,
      isPublicResource: isPublic,
      premises: premisesOf(note.id, index.data.relations, index.noteById),
    });
    publicityCache.set(note.id, p);
  }
  return p;
}

/**
 * 散策・ノートの詳細・ノート検索・Topic・資料の詳細に出してよい知識ノートか（P1）。
 * 通常公開の対象の資料の根拠が1件以上あり、その根拠だけで根拠状態の規則（validate）を満たすノートだけを出す。
 * 公開対象でない資料の根拠は判定に使わず、画面では資料へのリンクを出さない（件数はデータから決まり、固定しない）
 */
export function isPublicNote(note: KnowledgeNote): boolean {
  return publicityOf(note).isPublic;
}

/** 画面の根拠の一覧・検索の索引・根拠の件数に使う根拠（公開対象の資料のものだけ） */
export function publicEvidenceOf(noteId: string): Evidence[] {
  const n = index.noteById.get(noteId);
  return n ? publicityOf(n).publicEvidence : [];
}

/** 公開対象でない資料の根拠（存在を知らせるだけ。内容・資料へのリンクは通常の画面に出さない） */
export function otherEvidenceOf(noteId: string): Evidence[] {
  const n = index.noteById.get(noteId);
  return n ? publicityOf(n).otherEvidence : [];
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
