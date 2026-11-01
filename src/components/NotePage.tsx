// 知識ノートの詳細（#/note/<id>）。散策の対象になるノート（isPublicNote）だけを表示する。
// 内容は既存の NoteCard（状態・成立条件・時期・根拠と資料の確認箇所）をそのまま使う。
import { index } from "../data/dataset";
import { isPublicNote, relatedPublicNotes } from "../data/explorePool";
import { KIND_LABELS, noteHeading } from "../data/labels";
import { plainText } from "../lib/plainText";
import { exploreHref, noteHref } from "../router";
import { TopicChips } from "./common";
import { NoteCard } from "./NoteCard";

const RELATION_LABELS: Record<string, string> = {
  reason_for: "理由になる",
  condition_of: "成立条件・例外",
  refines: "詳しくする",
  prerequisite: "前提",
  applies_to: "適用される",
  generalizes: "一般化する",
  context_of: "背景・関連",
};

export function NotePage({ id }: { id: string }) {
  const note = index.noteById.get(id);
  const back = (
    <p className="back">
      <a href={exploreHref()}>← 知識を散策する</a>
    </p>
  );
  if (!note || !isPublicNote(note)) {
    return (
      <div className="detail">
        {back}
        <h1>知識ノートが見つかりません</h1>
        <p>ID「{id}」の知識ノートは、表示の対象にありません（根拠のないノートや、公開していない資料を根拠に含むノートは表示しません）。</p>
      </div>
    );
  }
  const related = relatedPublicNotes(id)
    .map((rid) => {
      const r = index.data.relations.find((x) => (x.from === id && x.to === rid) || (x.to === id && x.from === rid))!;
      return { note: index.noteById.get(rid)!, type: r.type, outgoing: r.from === id };
    })
    .filter((x) => x.note);
  return (
    <div className="detail note-page">
      {back}
      <h1>知識ノート</h1>
      <p className="muted">収録した資料から整理した知識です。根拠の資料と確認箇所を下に示します。ゲーム内での検証の有無も表示しています。</p>
      <NoteCard note={note} />
      <TopicChips ids={note.topic_ids} />
      {related.length > 0 && (
        <section className="note-related" aria-label="関係する知識ノート">
          <h2>関係する知識ノート</h2>
          <ul>
            {related.map((x) => (
              <li key={x.note.id}>
                <span className="badge">{RELATION_LABELS[x.type] ?? x.type}</span>{" "}
                <span className="muted">{x.outgoing ? "（このノート → 相手）" : "（相手 → このノート）"}</span>{" "}
                <a href={noteHref(x.note.id)}>{plainText(x.note.statement_ja)}</a>{" "}
                <span className="muted">
                  {KIND_LABELS[x.note.kind]}・{noteHeading(x.note)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
