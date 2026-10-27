import type { ReactNode } from "react";
import { index } from "../data/dataset";
import { LEVEL_LABELS } from "../data/labels";
import type { Level } from "../data/types";
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
