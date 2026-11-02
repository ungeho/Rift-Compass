import { useState } from "react";
import { index } from "../data/dataset";
import type { KnowledgeNote, Topic } from "../data/types";
import { decisionsForTopic } from "../data/decisions";
import { publicNotes } from "../data/explorePool";
import { decisionsHref, homeHref, topicHref } from "../router";
import { NoteSummary } from "./ExplorePage";
import { ResourceCard } from "./ResourceCard";

/** 知識ノートの段階表示の1回分（件数の上限ではない。「さらに表示」で全件に届く）*/
export const TOPIC_NOTE_PAGE_SIZE = 20;

/** 旧仕様（現行では適用できない）のノートを後ろにする（同じ順位ではデータの順）*/
const supersededLast = (a: KnowledgeNote, b: KnowledgeNote) =>
  Number(a.historical?.current_applicability === "superseded") - Number(b.historical?.current_applicability === "superseded");

/**
 * Topic に付いた公開の知識ノート。direct＝この Topic が直接付いたもの、via＝下位の Topic だけで付いたもの（direct と重ならない）。
 * 公開の条件は散策・検索・詳細と同じ publicNotes（isPublicNote）
 */
export function notesForTopic(topicId: string): { direct: KnowledgeNote[]; via: { note: KnowledgeNote; through: string[] }[] } {
  const desc = index.descendants(topicId);
  const direct = publicNotes.filter((n) => n.topic_ids.includes(topicId)).sort(supersededLast);
  const via = publicNotes
    .filter((n) => !n.topic_ids.includes(topicId) && n.topic_ids.some((x) => desc.has(x)))
    .sort(supersededLast)
    .map((note) => ({ note, through: note.topic_ids.filter((x) => x !== topicId && desc.has(x)) }));
  return { direct, via };
}

/** 段階表示：最初に TOPIC_NOTE_PAGE_SIZE 件を出し、「さらに表示」で全件まで増やす */
function NoteList({ items, label }: { items: { note: KnowledgeNote; through?: string[] }[]; label: string }) {
  const [shown, setShown] = useState(TOPIC_NOTE_PAGE_SIZE);
  return (
    <>
      <ol className="result-list topic-notes">
        {items.slice(0, shown).map(({ note, through }) => (
          <li key={note.id}>
            {through && through.length > 0 && (
              <p className="muted topic-note-via">
                下位の Topic：
                {through.map((id, i) => (
                  <span key={id}>
                    {i > 0 && "、"}
                    <a href={topicHref(id)}>{index.topicById.get(id)?.label_ja ?? id}</a>
                  </span>
                ))}
              </p>
            )}
            <NoteSummary note={note} />
          </li>
        ))}
      </ol>
      {shown < items.length && (
        <button type="button" className="button" onClick={() => setShown(shown + TOPIC_NOTE_PAGE_SIZE)}>
          {label}をさらに{Math.min(TOPIC_NOTE_PAGE_SIZE, items.length - shown)}件表示する（残り {items.length - shown}件）
        </button>
      )}
    </>
  );
}

/** Topic は複数の親を持てる（DAG）。各分類の下に同じ Topic が現れることがあるが、同じ経路上の循環は辿らない。 */
function TopicTree({ topic, path }: { topic: Topic; path: Set<string> }) {
  const children = (index.childrenOf.get(topic.id) ?? []).filter((c) => !path.has(c.id));
  const next = new Set(path).add(topic.id);
  return (
    <li>
      <a href={topicHref(topic.id)}>{topic.label_ja}</a>
      <span className="muted"> {topic.label_en}</span>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TopicTree key={c.id} topic={c} path={next} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TopicIndex() {
  const categories = index.data.topics.filter((t) => t.kind === "category");
  return (
    <div className="detail">
      <h1>Topic 一覧</h1>
      <p className="muted">
        1つの Topic が複数の分類に属することがあります（例：ミニオンアグロは「ウェーブ管理」と「ゲームの基本仕様」の両方）。どの分類からたどっても、同じ資料に到達できます。
      </p>
      <ul className="topic-tree">
        {categories.map((c) => (
          <TopicTree key={c.id} topic={c} path={new Set()} />
        ))}
      </ul>
    </div>
  );
}

export function TopicPage({ id }: { id: string }) {
  const t = index.topicById.get(id);
  if (!t) {
    return (
      <div className="detail">
        <p className="back">
          <a href="#/topics">← Topic 一覧</a>
        </p>
        <h1>Topic が見つかりません</h1>
        <p>ID「{id}」の Topic は登録されていません。</p>
      </div>
    );
  }
  const parents = t.parent_ids.map((p) => index.topicById.get(p)).filter((p) => p !== undefined);
  const children = index.childrenOf.get(t.id) ?? [];
  const desc = index.descendants(t.id);
  const direct = index.publicResources.filter((r) => r.topic_ids.includes(t.id));
  const viaChildren = index.publicResources.filter((r) => !r.topic_ids.includes(t.id) && r.topic_ids.some((x) => desc.has(x)));
  const aliases = [...t.aliases_ja, ...t.aliases_en];
  // 試験表示の判断材料（下位の Topic を含む）。0件なら案内を出さない（判断材料一覧の絞り込みと同じ数え方）
  const decisionCount = decisionsForTopic(t.id).length;
  const notes = notesForTopic(t.id);

  return (
    <div className="detail">
      <p className="back">
        <a href="#/topics">← Topic 一覧</a>
      </p>
      <h1>
        {t.label_ja} <span className="muted">{t.label_en}</span>
      </h1>
      {aliases.length > 0 && <p className="muted">別名：{aliases.join("、")}</p>}
      {parents.length > 0 && (
        <p>
          上位の分類：
          {parents.map((p, i) => (
            <span key={p.id}>
              {i > 0 && "、"}
              <a href={topicHref(p.id)}>{p.label_ja}</a>
            </span>
          ))}
        </p>
      )}
      {children.length > 0 && (
        <div>
          <h2>下位の Topic</h2>
          <ul className="chips">
            {children.map((c) => (
              <li key={c.id}>
                <a className="chip" href={topicHref(c.id)}>
                  {c.label_ja}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <a className="button" href={homeHref("", { topic: t.id })}>
          この Topic で絞り込んで検索する
        </a>
      </p>
      {decisionCount > 0 && (
        <p>
          <a href={decisionsHref(t.id)}>この Topic の判断材料（試験）{decisionCount}件を見る</a>
        </p>
      )}

      {(notes.direct.length > 0 || notes.via.length > 0) && (
        <section aria-labelledby="topic-notes-heading">
          <h2 id="topic-notes-heading">
            この Topic の知識ノート <span className="result-count">{notes.direct.length}件</span>
            {notes.via.length > 0 && <span className="result-count">（下位の Topic のノート {notes.via.length}件）</span>}
          </h2>
          <p className="muted">
            根拠の資料がすべて公開されている知識ノートです。ゲーム内では検証していません。旧仕様（現行では適用できない）のノートは後ろに並べます。
          </p>
          {notes.direct.length === 0 ? (
            <p className="muted">この Topic が直接付いた知識ノートはありません。</p>
          ) : (
            <NoteList key={`direct-${t.id}`} items={notes.direct.map((note) => ({ note }))} label="この Topic のノート" />
          )}
          {notes.via.length > 0 && (
            <>
              <h3>下位の Topic の知識ノート</h3>
              <NoteList key={`via-${t.id}`} items={notes.via} label="下位の Topic のノート" />
            </>
          )}
        </section>
      )}

      <h2>
        この Topic の資料 <span className="result-count">{direct.length}件</span>
      </h2>
      {direct.length === 0 ? (
        <p className="muted">この Topic が直接付いた資料はありません。</p>
      ) : (
        <ol className="result-list">
          {direct.map((r) => (
            <li key={r.id}>
              <ResourceCard resource={r} />
            </li>
          ))}
        </ol>
      )}
      {viaChildren.length > 0 && (
        <>
          <h2>
            下位の Topic の資料 <span className="result-count">{viaChildren.length}件</span>
          </h2>
          <ol className="result-list">
            {viaChildren.map((r) => (
              <li key={r.id}>
                <ResourceCard resource={r} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
