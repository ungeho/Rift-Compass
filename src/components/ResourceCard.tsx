import { eraLabel, LANGUAGE_LABELS, TYPE_LABELS } from "../data/labels";
import type { Resource } from "../data/types";
import { plainText } from "../lib/plainText";
import { resourceHref } from "../router";
import { LevelBadge, TopicChips } from "./common";

export function ResourceCard({ resource: r, partial, recognized }: { resource: Resource; partial?: boolean; recognized?: boolean }) {
  return (
    <article className="card">
      <div className="card-meta">
        <span className="badge">{TYPE_LABELS[r.type] ?? r.type}</span>
        <span className="badge lang">{LANGUAGE_LABELS[r.language] ?? r.language}</span>
        <LevelBadge level={r.verification.level} />
        {partial && <span className="badge partial">一部の条件に一致</span>}
        {recognized && <span className="badge partial">認識できた条件に一致</span>}
      </div>
      <h3 className="card-title">
        <a href={resourceHref(r.id)}>{r.title ?? "（タイトル未確認）"}</a>
      </h3>
      <p className="card-creator">
        {r.creator.name}
        {r.published_at && <span> ・ 公開 {r.published_at}</span>}
        {r.patch_context.era !== "unknown" && <span> ・ 対象時期 {eraLabel(r.patch_context.era)}</span>}
      </p>
      <p className="card-summary">{plainText(r.summary_ja)}</p>
      <TopicChips ids={r.topic_ids} />
    </article>
  );
}
