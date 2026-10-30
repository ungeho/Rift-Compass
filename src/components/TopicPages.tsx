import { index } from "../data/dataset";
import type { Topic } from "../data/types";
import { decisionsForTopic } from "../data/decisions";
import { decisionsHref, homeHref, topicHref } from "../router";
import { ResourceCard } from "./ResourceCard";

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
