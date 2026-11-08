import { index } from "../data/dataset";
import { otherEvidenceOf, publicEvidenceOf } from "../data/explorePool";
import { APPLICABILITY_LABELS, EVIDENCE_TYPE_LABELS, formatSeconds, KIND_LABELS, periodLabel, STATUS_LABELS } from "../data/labels";
import type { KnowledgeNote } from "../data/types";
import { youtubeAt } from "../lib/links";
import { plainText } from "../lib/plainText";
import { resourceHref } from "../router";
import { ExternalLink, LevelBadge, NoteStatusBadge } from "./common";

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="note-list">
      <h5>{title}</h5>
      <ul>
        {items.map((s) => (
          <li key={s}>{plainText(s)}</li>
        ))}
      </ul>
    </div>
  );
}

export function NoteCard({ note, currentResourceId }: { note: KnowledgeNote; currentResourceId?: string }) {
  const status = STATUS_LABELS[note.status];
  // 表示する根拠：通常公開の対象の資料の根拠（公開判定・検索・件数と同じ集合）。
  // 公開対象でない資料の根拠は、いま開いている資料の詳細（警告つきの直接アクセス）のものだけを「この資料」として示し、
  // ほかは資料の名前・発信者・URL・リンクを出さず、存在だけを知らせる（保存データからは消さない）
  const others = otherEvidenceOf(note.id);
  const evidence = [...publicEvidenceOf(note.id), ...others.filter((e) => e.resource_id === currentResourceId)];
  const hiddenCount = others.filter((e) => e.resource_id !== currentResourceId).length;
  const gameTested = evidence.some((e) => e.evidence_type === "in_game_test");
  const h = note.historical;

  return (
    <article className={`note tone-${status.tone}`} aria-labelledby={`note-${note.id}`}>
      <header className="note-header">
        <NoteStatusBadge note={note} />
        <span className="badge">{KIND_LABELS[note.kind]}</span>
      </header>
      <p className="note-statement" id={`note-${note.id}`}>
        {plainText(note.statement_ja)}
      </p>
      <p className="note-status-desc">{status.description}</p>
      <p className="note-verification">
        ゲーム内での検証：
        {gameTested && note.last_checked_patch ? `パッチ ${note.last_checked_patch} で検証` : "未実施"}
      </p>

      {h && (
        <div className="historical">
          <p>
            <strong>主張の対象時期：</strong>
            {h.valid_from ? periodLabel(h.valid_from) : "限定なし"}
            {h.valid_from && (h.valid_until ? (h.valid_until === h.valid_from ? "（この時期のみ）" : `〜${periodLabel(h.valid_until)}`) : "〜（終了時期は未確認）")}
          </p>
          <p>
            <strong>現在への適用：</strong>
            {APPLICABILITY_LABELS[h.current_applicability]}
          </p>
          {h.applicability_note_ja && <p className="muted">{plainText(h.applicability_note_ja)}</p>}
        </div>
      )}

      <List title="成立条件" items={note.conditions_ja} />
      <List title="例外" items={note.exceptions_ja} />
      <List title="反証条件（観察されたら見直す状況）" items={note.falsifiers_ja} />
      {note.notes_ja && <p className="muted">{plainText(note.notes_ja)}</p>}

      <div className="note-list">
        <h5>根拠</h5>
        {evidence.length === 0 ? (
          <p className="muted">根拠となる資料は登録されていません。</p>
        ) : (
          <ul className="evidence-list">
            {evidence.map((e) => {
              const r = index.resourceById.get(e.resource_id);
              const at = e.locator?.start_sec !== undefined && r ? youtubeAt(r.url, e.locator.start_sec) : null;
              return (
                <li key={e.id}>
                  <span className="badge">{EVIDENCE_TYPE_LABELS[e.evidence_type] ?? e.evidence_type}</span>{" "}
                  <LevelBadge level={e.checked_level} />{" "}
                  {r && r.id !== currentResourceId ? <a href={resourceHref(r.id)}>{r.title ?? `（タイトル未確認の資料：${r.creator.name}）`}</a> : <span>この資料</span>}
                  {e.locator?.section && <span className="muted">（{e.locator.section}）</span>}
                  {at && e.locator?.start_sec !== undefined && (
                    <>
                      {" "}
                      <ExternalLink href={at}>{formatSeconds(e.locator.start_sec)}から</ExternalLink>
                    </>
                  )}
                  <div className="muted">{plainText(e.summary_ja)}</div>
                </li>
              );
            })}
          </ul>
        )}
        {hiddenCount > 0 && (
          <p className="muted note-other-evidence">
            未確認の参考情報あり：通常公開の対象ではない資料に基づく記録が{hiddenCount}件あります。資料の確認状況により、確認済みの根拠としては表示していません。
          </p>
        )}
      </div>
    </article>
  );
}
