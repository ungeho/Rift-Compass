import type { ReactNode } from "react";
import { index } from "../data/dataset";
import { LEVEL_LABELS, noteHeading, STATUS_LABELS } from "../data/labels";
import type { KnowledgeNote, Level } from "../data/types";
import { externalLinkProps } from "../lib/links";
import { topicHref } from "../router";

export function LevelBadge({ level }: { level: Level }) {
  const info = LEVEL_LABELS[level];
  return (
    <span className={`badge level level-${level}`} title={info.description}>
      {info.short}
    </span>
  );
}

/**
 * 知識ノートの状態（source_stated・derived・tactical_inference・empirical・unverified・disputed）のバッジ。
 * どの画面でも同じ色（styles.css の status-*）と同じ文字のラベルで示す。色は根拠の性質を示すもので、ゲーム内での正しさを保証しない。
 * 種類（仕様・原理・判断・仮説）は意味が違うので、このバッジではなく中立色の badge で示す。
 */
export function NoteStatusBadge({ note, suffix }: { note: Pick<KnowledgeNote, "status" | "kind">; suffix?: string }) {
  const s = STATUS_LABELS[note.status];
  return (
    <span className={`badge status status-${s.tone}`} title={s.description} data-note-status={note.status}>
      {noteHeading(note as KnowledgeNote)}
      {suffix}
    </span>
  );
}

export function TopicChips({ ids, label }: { ids: string[]; label?: string }) {
  return (
    <ul className="chips" aria-label={label ?? "関連Topic"}>
      {ids.map((id) => {
        const t = index.topicById.get(id);
        return (
          <li key={id}>
            <a className="chip" href={topicHref(id)}>
              {t ? t.label_ja : id}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={className} {...externalLinkProps}>
      {children}
      <span className="visually-hidden">（新しいタブで開きます）</span>
    </a>
  );
}
