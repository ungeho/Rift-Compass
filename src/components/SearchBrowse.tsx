import { index } from "../data/dataset";
import { QUESTION_ENTRANCES } from "../data/decisions";
import { KNOWLEDGE_ENTRANCES } from "../data/questionEntrances";
import { decisionHref, homeHref, sourcesHref } from "../router";
import { BrowseDisclosure, BrowseTopicChildren, BrowseTopicLink, topicBrowseGroups } from "./TopicBrowser";
import { TopicTabs } from "./TopicTabs";

export function SearchBrowse() {
  const { categories, roles, ungrouped } = topicBrowseGroups();
  const categoriesTabs = categories.map(t => {
    const children = index.childrenOf.get(t.id) ?? [];
    return { id: t.id, label: `${t.label_ja}（${children.length}）`, content: <>
      <BrowseTopicLink topic={t} />
      <BrowseDisclosure label="下位Topicを選ぶ" count={children.length}><BrowseTopicChildren topics={children} path={new Set([t.id])} /></BrowseDisclosure>
    </> };
  });
  const topicTabs = [
    ...categoriesTabs,
    { id: "roles", label: `ロール別（${roles.length}）`, content: <BrowseDisclosure label="ロールTopicを選ぶ" count={roles.length}><BrowseTopicChildren topics={roles} /></BrowseDisclosure> },
    ...(ungrouped.length ? [{ id: "ungrouped", label: `その他（${ungrouped.length}）`, content: <BrowseDisclosure label="その他のTopic" count={ungrouped.length}><BrowseTopicChildren topics={ungrouped} /></BrowseDisclosure> }] : []),
  ];
  return <section className="search-browse topic-browser" aria-labelledby="search-browse-heading">
    <h2 id="search-browse-heading">入口を選んで探す</h2>
    <TopicTabs label="探し方" initial="questions" tabs={[
      { id: "questions", label: "知りたいことから探す", content: <>
        <p className="muted">分野を開いて質問を選びます。原典の主張とAIの整理は区別し、ゲーム内では検証していません。</p>
        <BrowseDisclosure label="ウェーブ操作の質問" count={QUESTION_ENTRANCES.length}>
          <p className="muted">判断材料の詳細へ移動します。</p>
          <ul className="browse-question-list">{QUESTION_ENTRANCES.map(e => <li key={e.unit_id}><a className="topic-browse-link" href={decisionHref(e.unit_id)}><span>{e.question_ja}</span><span className="browse-link-action" aria-hidden="true">判断材料 →</span></a></li>)}</ul>
        </BrowseDisclosure>
        <BrowseDisclosure label="そのほかの分野の質問" count={KNOWLEDGE_ENTRANCES.length}>
          <p className="muted">質問の文で検索します。一致しても正しい答えを保証するものではありません。</p>
          <ul className="browse-question-list">{KNOWLEDGE_ENTRANCES.map(e => <li key={e.question_ja}><a className="topic-browse-link" href={homeHref(e.question_ja)}><span>{e.question_ja}</span><span className="browse-link-action" aria-hidden="true">検索 →</span></a></li>)}</ul>
        </BrowseDisclosure>
      </> },
      { id: "topics", label: "Topicから探す", content: <>
        <p className="muted">分類タブを選び、その下のTopicを開いて探せます。複数の分類に属するTopicは、各経路から同じ詳細へ移動します。</p>
        <TopicTabs label="Topicの分類" initial={topicTabs[0].id} tabs={topicTabs} />
      </> },
    ]} />
    <p className="muted browse-source-link">未収録の記事・動画も探すなら、<a href={sourcesHref()}>情報源ディレクトリへ →</a></p>
  </section>;
}
