import { useState } from "react";
import { index } from "../data/dataset";
import type { KnowledgeNote, Resource, Topic } from "../data/types";
import { decisionsForTopic, ROLE_TOPICS } from "../data/decisions";
import { publicEvidenceOf, publicNotes } from "../data/explorePool";
import { decisionsHref, homeHref, topicHref, sourcesHref } from "../router";
import { NoteSummary } from "./ExplorePage";
import { ResourceCard } from "./ResourceCard";
import { ChampionData } from "./ChampionData";
import { RoleSection } from "./RoleSection";
import { TopicTabs, revealTopicItems, type TopicTab } from "./TopicTabs";
import { topicBrowseGroups } from "./TopicBrowser";
import { DecisionCard, DecisionNotice } from "./DecisionPages";

/** 知識ノートの段階表示の1回分（件数の上限ではない。「さらに表示」で全件に届く）*/
export const TOPIC_NOTE_PAGE_SIZE = 20;
export const TOPIC_RESOURCE_PAGE_SIZE = 20;

export function matchesTopicFilter(q: string, values: string[]): boolean {
  const normalize = (s: string) => s.normalize("NFKC").toLowerCase().trim();
  const text = normalize(values.join(" "));
  return normalize(q).split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}
export function filterTopics(q: string): Topic[] {
  return index.data.topics.filter((t) => matchesTopicFilter(q, [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en]));
}

/** Topic → ゲームデータの一覧（src/components/DataPages.tsx）*/
const DATA_LINKS: Record<string, string> = { itemization: "items", runes: "runes", "summoner-spells": "summoners", "jungle-invade": "units", "cat-basics": "articles" };

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
        <button type="button" className="button" onClick={(e) => revealTopicItems(e.currentTarget, shown, () => setShown(shown + TOPIC_NOTE_PAGE_SIZE))}>
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
      {children.length > 0 ? <details>
        <summary>{topic.label_ja} <span className="muted">{topic.label_en} ・ 下位 {children.length}件</span></summary>
        <p><a href={topicHref(topic.id)}>この Topic を開く：{topic.label_ja}</a></p>
        <ul>
          {children.map((c) => (
            <TopicTree key={c.id} topic={c} path={next} />
          ))}
        </ul>
      </details> : <><a href={topicHref(topic.id)}>{topic.label_ja}</a><span className="muted"> {topic.label_en}</span></>}
    </li>
  );
}

export function TopicIndex() {
  const [q, setQ] = useState("");
  const { categories, roles, ungrouped } = topicBrowseGroups();
  const found = filterTopics(q);
  return (
    <div className="detail topic-index">
      <h1>Topic 一覧</h1>
      <p className="muted">
        1つの Topic が複数の分類に属することがあります（例：ミニオンアグロは「ウェーブ管理」と「ゲームの基本仕様」の両方）。どの分類からたどっても、同じ資料に到達できます。
      </p>
      <label className="topic-filter">Topic の名前・別名で探す<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <p className="muted" role="status">{q.trim() ? `${found.length}件が一致` : `全${index.data.topics.length}件。分類を開くか、名前・別名を検索して探せます。`}</p>
      {q.trim() ? <ul className="topic-search-results">{found.map((t) => <li key={t.id}>
        <a href={topicHref(t.id)}>{t.label_ja}</a> <span className="muted">{t.label_en}</span>
        {t.parent_ids.length > 0 && <p className="muted">上位の分類：{t.parent_ids.map((id) => <a key={id} href={topicHref(id)}>{index.topicById.get(id)?.label_ja ?? id}</a>)}</p>}
      </li>)}</ul> : <ul className="topic-tree">
        {categories.map((c) => (
          <TopicTree key={c.id} topic={c} path={new Set()} />
        ))}
        <li className="topic-role-group"><details><summary>ロール別 <span className="muted">{roles.length}ロール</span></summary><ul>{roles.map(t => <TopicTree key={t.id} topic={t} path={new Set()} />)}</ul></details></li>
        {ungrouped.map((t) => <TopicTree key={t.id} topic={t} path={new Set()} />)}
      </ul>}
      {q.trim() && !found.length && <p>一致する Topic はありません。日本語・英語の名前や別名でも探せます。</p>}
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
  return <TopicDetail key={id} topic={t} />;
}

function ChildTopics({ topics }: { topics: Topic[] }) {
  const [q, setQ] = useState("");
  const found = topics.filter((t) => matchesTopicFilter(q, [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en]));
  return <details className="topic-hierarchy" open={topics.length <= 12}>
    <summary>下位の Topic（{topics.length}件）</summary>
    {topics.length > 12 && <label className="topic-filter">下位 Topic を名前・別名で絞り込む<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
    {q && <p role="status">{found.length}件が一致</p>}
    <ul className="chips">{found.map((t) => <li key={t.id}><a className="chip" href={topicHref(t.id)}>{t.label_ja}</a></li>)}</ul>
  </details>;
}

function ResourceList({ resources, label }: { resources: Resource[]; label: string }) {
  const [shown, setShown] = useState(TOPIC_RESOURCE_PAGE_SIZE);
  return <><ol className="result-list">{resources.slice(0, shown).map((r) => <li key={r.id}><ResourceCard resource={r} /></li>)}</ol>
    {shown < resources.length && <button className="button" onClick={(e) => revealTopicItems(e.currentTarget, shown, () => setShown(shown + TOPIC_RESOURCE_PAGE_SIZE))}>{label}をさらに{Math.min(TOPIC_RESOURCE_PAGE_SIZE, resources.length - shown)}件表示する（残り {resources.length - shown}件）</button>}</>;
}

/**
 * Topic のノートの絞り込み：主張・成立条件・例外・反証条件・補足・根拠の要約で照合する。
 * 根拠の要約は公開対象の資料の根拠だけ（publicEvidenceOf。ノート検索の索引と同じ）。公開対象でない資料の記述では一致させない
 */
export function matchesTopicNote(q: string, n: KnowledgeNote): boolean {
  return matchesTopicFilter(q, [n.statement_ja, ...(n.conditions_ja ?? []), ...(n.exceptions_ja ?? []), ...(n.falsifiers_ja ?? []), n.notes_ja ?? "", ...publicEvidenceOf(n.id).map((e) => e.summary_ja)]);
}

function TopicNotes({ notes }: { notes: ReturnType<typeof notesForTopic> }) {
  const [q, setQ] = useState("");
  const match = (n: KnowledgeNote) => matchesTopicNote(q, n);
  const direct = notes.direct.filter(match), via = notes.via.filter((v) => match(v.note));
  return <section aria-labelledby="topic-notes-heading">
    <h2 id="topic-notes-heading">この Topic の知識ノート <span className="result-count">{notes.direct.length}件</span>{notes.via.length > 0 && <span className="result-count">（下位の Topic のノート {notes.via.length}件）</span>}</h2>
    <p className="muted">公開対象の資料の根拠で成り立つ知識ノートです（それ以外の資料の記録は判定・絞り込みに使いません）。ゲーム内では検証していません。旧仕様（現行では適用できない）のノートは後ろに並べます。</p>
    <label className="topic-filter">主張・条件・例外・根拠の要約で絞り込む<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
    {q && <p role="status">{direct.length + via.length}件が一致。語の一致は、質問に正しく答えることを示しません。</p>}
    {direct.length ? <NoteList key={`direct-${q}`} items={direct.map((note) => ({ note }))} label="この Topic のノート" /> : <p className="muted">{q ? "この条件で一致する直接のノートはありません。" : "この Topic が直接付いた知識ノートはありません。"}</p>}
    {notes.via.length > 0 && <><h3>下位の Topic の知識ノート</h3><NoteList key={`via-${q}`} items={via} label="下位の Topic のノート" /></>}
  </section>;
}

function TopicResources({ direct, via }: { direct: Resource[]; via: Resource[] }) {
  const [q, setQ] = useState("");
  const match = (r: Resource) => matchesTopicFilter(q, [r.title ?? "", r.summary_ja, r.creator.name]);
  const ds = direct.filter(match), vs = via.filter(match);
  return <><h2>この Topic の資料 <span className="result-count">{direct.length}件</span></h2>
    <label className="topic-filter">資料の題名・紹介文・発信者で絞り込む<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
    {q && <p role="status">{ds.length + vs.length}件が一致</p>}
    {ds.length ? <ResourceList key={`direct-${q}`} resources={ds} label="この Topic の資料" /> : <p className="muted">{q ? "この条件で一致する直接の資料はありません。" : "この Topic が直接付いた資料はありません。"}</p>}
    {via.length > 0 && <><h2>下位の Topic の資料 <span className="result-count">{via.length}件</span></h2><ResourceList key={`via-${q}`} resources={vs} label="下位の Topic の資料" /></>}
  </>;
}

function TopicDecisions({ topicId }: { topicId: string }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(20);
  const all = decisionsForTopic(topicId);
  const found = all.filter((u) => matchesTopicFilter(q, [u.statement_ja, u.problem_ja, ...u.conditions_ja, ...u.exceptions_ja, ...u.observations_ja, ...u.reasons.map((r) => r.text)]));
  return <><h2>この Topic の判断材料（試験）</h2><DecisionNotice />
    <p><a href={decisionsHref(topicId)}>この Topic の判断材料（試験）{all.length}件を見る</a></p>
    <label className="topic-filter">判断材料の状況・主張・条件で絞り込む<input type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown(20); }} /></label>
    <p role="status">{found.length}件{q && "が一致"}</p><ul className="result-list">{found.slice(0, shown).map((u) => <DecisionCard key={u.id} u={u} />)}</ul>
    {shown < found.length && <button className="button" onClick={(e) => revealTopicItems(e.currentTarget, shown, () => setShown(shown + 20))}>判断材料をさらに{Math.min(20, found.length - shown)}件表示する（残り {found.length - shown}件）</button>}
  </>;
}

function TopicDetail({ topic: t }: { topic: Topic }) {
  const parents = t.parent_ids.map((p) => index.topicById.get(p)).filter((p) => p !== undefined);
  const children = index.childrenOf.get(t.id) ?? [];
  const desc = index.descendants(t.id);
  const direct = index.publicResources.filter((r) => r.topic_ids.includes(t.id));
  const viaChildren = index.publicResources.filter((r) => !r.topic_ids.includes(t.id) && r.topic_ids.some((x) => desc.has(x)));
  const aliases = [...t.aliases_ja, ...t.aliases_en];
  // 試験表示の判断材料（下位の Topic を含む）。0件なら案内を出さない（判断材料一覧の絞り込みと同じ数え方）
  const decisionCount = decisionsForTopic(t.id).length;
  const notes = notesForTopic(t.id);
  const tabs: TopicTab[] = [];
  if (t.parent_ids.includes("cat-champions")) tabs.push({ id: "champion", label: "基本データ・スキル", content: <ChampionData topicId={t.id} /> });
  if (ROLE_TOPICS[t.id]) tabs.push({ id: "role", label: "ロール別ガイド", content: <RoleSection topicId={t.id} /> });
  if (notes.direct.length + notes.via.length > 0) tabs.push({ id: "notes", label: `知識ノート ${notes.direct.length + notes.via.length}件`, content: <TopicNotes notes={notes} /> });
  tabs.push({ id: "resources", label: `資料 ${direct.length + viaChildren.length}件`, content: <TopicResources direct={direct} via={viaChildren} /> });
  if (decisionCount > 0) tabs.push({ id: "decisions", label: `判断材料（試験）${decisionCount}件`, content: <TopicDecisions topicId={t.id} /> });

  return (
    <div className="detail topic-detail">
      <p className="back">
        <a href="#/topics">← Topic 一覧</a>
      </p>
      <h1>
        {t.label_ja} <span className="muted">{t.label_en}</span>
      </h1>
      {aliases.length > 0 && <details className="topic-aliases"><summary>別名・検索語（{aliases.length}件）</summary><p className="muted">別名：{aliases.join("、")}</p></details>}
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
      {children.length > 0 && <ChildTopics topics={children} />}
      <p>
        <a className="button" href={homeHref("", { topic: t.id })}>
          この Topic で絞り込んで検索する
        </a>
      </p>
      <p><a href={sourcesHref(t.label_ja)}>情報源を探す：{t.label_ja}（編集上の案内・候補の推定テーマから検索）</a></p>
      {/* ゲームデータの一覧への導線（アイテム・ルーン・サモナースペル）*/}
      {DATA_LINKS[t.id] && (
        <p>
          <a href={`#/data/${DATA_LINKS[t.id]}`}>ゲームデータ：{t.label_ja}の一覧（数値・効果・変更履歴）</a>
        </p>
      )}

      <p className="muted">情報の種類を切り替えて探せます。タブは左右矢印・Home・Endキーでも切り替えられます。</p>
      <TopicTabs tabs={tabs} initial={tabs[0].id} />
    </div>
  );
}
