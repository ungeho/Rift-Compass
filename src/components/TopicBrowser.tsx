import { useId, useState, type ReactNode } from "react";
import { index } from "../data/dataset";
import { ROLE_TOPICS } from "../data/decisions";
import type { Topic } from "../data/types";
import { topicHref } from "../router";
import { revealTopicItems } from "./TopicTabs";

export const BROWSE_PAGE_SIZE = 12;

/** 一覧上の表示グループ。Topicのkind・ID・親子関係は変更しない。 */
export function topicBrowseGroups(topics: readonly Topic[] = index.data.topics) {
  const isRole = (t: Topic) => Object.hasOwn(ROLE_TOPICS, t.id);
  return {
    categories: topics.filter(t => t.kind === "category" && !isRole(t)),
    roles: topics.filter(isRole),
    ungrouped: topics.filter(t => t.kind !== "category" && !isRole(t) && t.parent_ids.length === 0),
  };
}

export function BrowseDisclosure({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const id = useId();
  return <details className="browse-disclosure">
    <summary id={id}><span className="browse-label">{label}</span><span className="count-pill">{count}件</span><span className="browse-toggle" aria-hidden="true"><span className="when-closed">開く ＋</span><span className="when-open">閉じる −</span></span></summary>
    <div className="browse-content" role="region" aria-labelledby={id}>{children}</div>
  </details>;
}

export function BrowseTopicLink({ topic }: { topic: Topic }) {
  return <a className="topic-browse-link" href={topicHref(topic.id)}><span><strong>{topic.label_ja}</strong><span className="muted">{topic.label_en}</span></span><span className="browse-link-action" aria-hidden="true">詳細 →</span></a>;
}

export function BrowseTopicChildren({ topics, path = new Set<string>() }: { topics: Topic[]; path?: Set<string> }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(BROWSE_PAGE_SIZE);
  const words = q.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const found = topics.filter(t => {
    const text = [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en].join(" ").normalize("NFKC").toLowerCase();
    return words.every(w => text.includes(w));
  });
  return <>
    {topics.length > BROWSE_PAGE_SIZE && <label className="topic-filter">下位Topicの名前・別名で絞り込む<input type="search" value={q} onChange={e => { setQ(e.target.value); setShown(BROWSE_PAGE_SIZE); }} /></label>}
    <p className="muted browse-count" role="status">{q ? `${found.length}件が一致／全${topics.length}件` : `全${topics.length}件`}・{Math.min(shown, found.length)}件を表示</p>
    <ul className="browse-topic-list">{found.map((t, i) => <BrowseTopicBranch key={t.id} topic={t} path={path} hidden={i >= shown} />)}</ul>
    {shown < found.length && <button type="button" className="button" onClick={e => revealTopicItems(e.currentTarget, shown, () => setShown(shown + BROWSE_PAGE_SIZE))}>下位Topicをさらに{Math.min(BROWSE_PAGE_SIZE, found.length - shown)}件表示する（残り {found.length - shown}件）</button>}
    {!found.length && <p>一致する下位Topicはありません。検索語を変更・削除して探せます。</p>}
  </>;
}

/** 複数親の各経路を残す。経路上の循環だけを除外する。 */
export function BrowseTopicBranch({ topic, path = new Set<string>(), hidden = false }: { topic: Topic; path?: Set<string>; hidden?: boolean }) {
  const next = new Set(path).add(topic.id);
  const children = (index.childrenOf.get(topic.id) ?? []).filter(t => !next.has(t.id));
  return <li hidden={hidden}>{children.length ? <BrowseDisclosure label={topic.label_ja} count={children.length}>
    <BrowseTopicLink topic={topic} />
    <BrowseTopicChildren topics={children} path={next} />
  </BrowseDisclosure> : <BrowseTopicLink topic={topic} />}</li>;
}
