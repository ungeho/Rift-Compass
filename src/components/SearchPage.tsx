import { useEffect, useMemo, useRef, useState } from "react";
import { index } from "../data/dataset";
import { eraLabel, LANGUAGE_LABELS, LEVEL_LABELS, TYPE_LABELS } from "../data/labels";
import type { Level } from "../data/types";
import { facetCounts, search, type FilterKey, type Filters, type Hit, type Unit } from "../search/search";
import { noteMatchesForQuery } from "../data/noteSearch";
import { decisionMatchesForQuery, examplesForQuery } from "../data/decisions";
import { externalSearchUrls } from "../lib/links";
import { homeHref, rememberList, replaceHash, sourcesHref } from "../router";
import { ExternalLink } from "./common";
import { RelatedDecisions, RelatedExamples } from "./DecisionPages";
import { SearchBrowse } from "./SearchBrowse";
import { RelatedNotes } from "./RelatedNotes";
import { ResourceCard } from "./ResourceCard";
import { TopicTabs, revealTopicItems, type TopicTab } from "./TopicTabs";

export const SEARCH_PAGE_SIZE = 20;
function SearchHitList({ hits, partial = false }: { hits: Hit[]; partial?: boolean }) {
  const [shown, setShown] = useState(SEARCH_PAGE_SIZE);
  return <><ol className="result-list">{hits.slice(0, shown).map((h) => <li key={h.resource.id}><ResourceCard resource={h.resource} partial={partial} recognized={h.match === "recognized"} /></li>)}</ol>
    {shown < hits.length && <button className="button" onClick={(e) => revealTopicItems(e.currentTarget, shown, () => setShown(shown + SEARCH_PAGE_SIZE))}>資料をさらに{Math.min(SEARCH_PAGE_SIZE, hits.length - shown)}件表示する（残り {hits.length - shown}件）</button>}</>;
}

const EXAMPLES = [
  "敵のスキルを避けた後に仕掛ける理由",
  "Lv2先行が有利になる条件",
  "VeigarV2 リコール",
  "昔の視界管理は今も使える？",
  "AA無効化されたらどうする",
  "how to freeze a lane",
];

const FILTER_LABELS: Record<FilterKey, string> = {
  lang: "言語",
  type: "資料の種類",
  topic: "Topic",
  creator: "発信者",
  era: "対象時期",
  level: "確認レベル",
};

const distinct = (values: string[]) => [...new Set(values)];
const pub = index.publicResources;
const OPTIONS: Record<FilterKey, { value: string; label: string }[]> = {
  lang: distinct(pub.map((r) => r.language)).map((v) => ({ value: v, label: LANGUAGE_LABELS[v] ?? v })),
  type: distinct(pub.map((r) => r.type)).map((v) => ({ value: v, label: TYPE_LABELS[v] ?? v })),
  topic: [...index.data.topics]
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "category" ? -1 : 1))
    .map((t) => ({ value: t.id, label: t.kind === "category" ? `【${t.label_ja}】` : t.label_ja })),
  creator: distinct(pub.map((r) => r.creator.name)).sort().map((v) => ({ value: v, label: v })),
  era: distinct(pub.map((r) => r.patch_context.era)).sort().map((v) => ({ value: v, label: eraLabel(v) })),
  level: distinct(pub.map((r) => r.verification.level)).sort().map((v) => ({ value: v, label: LEVEL_LABELS[v as Level].short })),
};

function unitLabel(u: Unit): string {
  if (u.kind === "topic") return `Topic「${u.topic.label_ja}」`;
  if (u.kind === "creator") return `発信者「${[...u.creators].join(" / ")}」`;
  return `語「${u.matched}」`;
}

export function SearchPage({ q, filters }: { q: string; filters: Filters }) {
  const href = homeHref(q, filters);
  // filters はルートの解析ごとに新しいオブジェクトになるため、URL 文字列で依存を判定する
  const result = useMemo(() => search(q, filters), [href]);
  // IME（日本語入力）の変換中は URL と検索を更新せず、確定してから反映する。
  // 入力欄の表示は手元の draft で持ち、URL 側の変更（質問例のクリック・戻る操作）は変換中でなければ取り込む。
  const [draft, setDraft] = useState(q);
  const queryInput = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current) setDraft(q);
  }, [q]);
  const commit = (value: string) => replaceHash(homeHref(value, filters));
  // スマートフォン幅では絞り込みを閉じた状態で始め、結果を先に見せる
  const [filtersInitiallyOpen] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 761px)").matches);
  const activeFilters = (Object.keys(FILTER_LABELS) as FilterKey[]).filter((k) => filters[k]);
  const hasQuery = q.trim() !== "";
  const main = result.hits.filter((h) => h.match !== "partial");
  const partial = result.hits.filter((h) => h.match === "partial");
  // 関連候補のうち、Topic・発信者の必須条件にはすべて一致し、未一致が「語」だけのもの（主題には到達している）
  const required = new Set(result.requiredKeys);
  const unitByKey = new Map(result.analysis.units.map((u) => [u.key, u]));
  const subjectUnits = result.analysis.units.filter((u) => u.kind !== "term" && required.has(u.key));
  const missingTerms = (h: Hit) =>
    result.requiredKeys.filter((k) => !h.matchedKeys.includes(k)).map((k) => unitByKey.get(k)!).filter((u) => u.kind === "term");
  const subjectMatched =
    subjectUnits.length === 0
      ? []
      : partial.filter((h) => subjectUnits.every((u) => h.matchedKeys.includes(u.key)) && missingTerms(h).length > 0);
  const fullCount = main.filter((h) => h.match === "full").length;
  const recognizedCount = main.length - fullCount;
  const recognizedOnly = recognizedCount > 0;
  const noteResult = useMemo(() => hasQuery ? noteMatchesForQuery(q) : undefined, [q]);
  const decisionCount = useMemo(() => hasQuery ? decisionMatchesForQuery(q).length : 0, [q]);
  const exampleCount = useMemo(() => hasQuery ? examplesForQuery(q).length : 0, [q]);

  useEffect(() => {
    rememberList(href);
  }, [href]);

  const setFilter = (key: FilterKey, value: string, focusQuery = false) => {
    replaceHash(homeHref(q, { ...filters, [key]: value || undefined }));
    if (focusQuery) queryInput.current?.focus();
  };
  const clearFilters = () => { replaceHash(homeHref(q)); queryInput.current?.focus(); };

  const resourceContent = <>
    <h3 className="search-section-title">{hasQuery ? "資料の検索結果" : "公開資料"}</h3>
    {hasQuery && main.length > 0 && recognizedOnly && (result.analysis.ignored.length > 0 ? (
      <p className="notice">「{result.analysis.ignored.join("」「")}」は資料中に見つからなかったため、検索条件に含めていません。以下は、それ以外の条件（{result.analysis.units.map(unitLabel).join("・")}）にすべて一致した資料です。「{result.analysis.ignored.join("」「")}」について扱っているとは限りません。</p>
    ) : <p className="notice">認識したTopicの一部には、対応する資料をまだ収録していません。以下は一致判定に使えた条件に一致した資料で、検索語のすべてを扱っているとは限りません。</p>)}
    {hasQuery && main.length === 0 && partial.length > 0 && (subjectMatched.length > 0 ? (
      <p className="notice">主題（{subjectUnits.map(unitLabel).join("・")}）に一致する資料は{subjectMatched.length}件あります。ただし、質問から取り出した語（{[...new Set(subjectMatched.flatMap((h) => missingTerms(h)))].map((u) => `「${u.matched}」`).join("")}など）が資料の題名・紹介文・Topic に見つからないため、「条件に一致」には数えていません。その資料が質問に答えているかは、各資料で確かめてください。</p>
    ) : <p className="notice">すべての条件に一致する資料はありません。下に、一部の条件だけに関連する候補を条件ごとに表示しています。</p>)}
    {result.hits.length === 0 ? <div className="empty">
      <p><strong>この検索条件では、Rift Compass に登録された公開資料から一致する資料が見つかりませんでした。</strong></p>
      <p className="muted">Rift Compass が収録している資料は一部だけです。ここで見つからなくても、その話題を扱う資料が存在しないという意味ではありません。</p>
      <ul><li>別の言い方（例：「Lv2」「レベル2」「level 2 spike」）や英語でも試してください。</li><li>語を減らすと見つかる場合があります。</li>
        {activeFilters.length > 0 && <li><button type="button" className="link-button" onClick={clearFilters}>絞り込みを解除する</button></li>}
        <li><a href="#/topics">Topic 一覧から探す</a></li><li><a href={sourcesHref(q)}>情報源から未収録の記事・動画を探す</a></li></ul>
    </div> : <>
      {main.length > 0 && <SearchHitList key={`main-${href}`} hits={main} />}
      {partial.length > 0 && <PartialCandidates key={`partial-${href}`} hits={partial} units={result.analysis.units} requiredKeys={result.requiredKeys} open={main.length === 0} />}
    </>}
  </>;
  const resultTabs: TopicTab[] = [
    { id: "resources", label: `資料 ${result.hits.length}件`, content: resourceContent },
    { id: "notes", label: `知識ノート ${noteResult?.matches.length ?? 0}件`, content: <><h3>知識ノートの照合結果</h3>{noteResult?.matches.length ? <RelatedNotes q={q} result={noteResult} /> : <p>この検索語で一致する公開の知識ノートはありません。未収録の知識が存在しないという意味ではありません。</p>}</> },
    { id: "decisions", label: `判断材料 ${decisionCount}件・具体例 ${exampleCount}件`, content: <><h3>判断材料・具体例の照合結果</h3><RelatedDecisions q={q} open /><RelatedExamples q={q} />{decisionCount + exampleCount === 0 && <p>この検索語で一致する判断材料・具体例はありません。別の言い方やTopicからも探せます。</p>}</> },
  ];
  const initialTab = result.hits.length > 0 ? "resources" : noteResult?.matches.length ? "notes" : decisionCount + exampleCount > 0 ? "decisions" : "resources";

  return (
    <div className="search-page">
      <section className="hero" aria-labelledby="search-heading">
        <h1 id="search-heading">何を知りたいですか？</h1>
        <form role="search" className="search-form" onSubmit={(e) => { e.preventDefault(); if (!composing.current) { resultsHeading.current?.focus(); resultsHeading.current?.scrollIntoView({ block: "start" }); } }}>
          <label htmlFor="q" className="visually-hidden">
            知りたいことを日本語または英語で入力
          </label>
          <input
            id="q"
            ref={queryInput}
            type="search"
            className="search-input"
            placeholder="例：Lv2先行が有利になる条件 / how to freeze a lane"
            value={draft}
            autoComplete="off"
            onChange={(e) => {
              setDraft(e.target.value);
              if (!composing.current) commit(e.target.value);
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(e) => {
              composing.current = false;
              commit(e.currentTarget.value);
            }}
          />
          <button type="submit" className="button primary">結果を見る</button>
          {hasQuery && <button type="button" className="button" onClick={() => { setDraft(""); commit(""); queryInput.current?.focus(); }}>検索語を消す</button>}
        </form>
        <p className="muted search-scope">資料・知識ノート・判断材料を別々に照合します。語の一致は、質問への正しい答えを保証しません。</p>
        <details className="examples">
          <summary className="examples-label">質問の例（{EXAMPLES.length}件）</summary>
          <ul className="chips">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <a className="chip" href={homeHref(ex, filters)}>
                  {ex}
                </a>
              </li>
            ))}
          </ul>
        </details>
        {hasQuery && <p className="muted search-scope"><a href={sourcesHref(q)}>検索語に関連する情報源を探す →</a>（未収録の記事・動画への入口）</p>}
      </section>

      {!hasQuery && activeFilters.length === 0 && <SearchBrowse />}

      {activeFilters.length > 0 && <div className="active-filters" aria-label="現在の資料の絞り込み">
        <strong>資料の絞り込み中：</strong>
        {activeFilters.map((k) => <button key={k} type="button" className="chip removable" onClick={() => setFilter(k, "", true)}>{FILTER_LABELS[k]}：{OPTIONS[k].find((o) => o.value === filters[k])?.label ?? filters[k]}<span aria-hidden="true"> ×</span><span className="visually-hidden">（解除）</span></button>)}
        <button type="button" className="link-button" onClick={clearFilters}>すべて解除</button>
      </div>}

      <div className="results-layout">
        <aside className="filters" aria-label="絞り込み">
          <details open={filtersInitiallyOpen}>
            <summary>
              資料の絞り込み{activeFilters.length > 0 && <span className="count-pill">{activeFilters.length}</span>}
            </summary>
            {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
              const counts = facetCounts(q, filters, key);
              return (
                <div className="filter" key={key}>
                  <label htmlFor={`f-${key}`}>{FILTER_LABELS[key]}</label>
                  <select id={`f-${key}`} value={filters[key] ?? ""} onChange={(e) => setFilter(key, e.target.value)}>
                    <option value="">すべて</option>
                    {OPTIONS[key].map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}（{counts.get(o.value) ?? 0}）
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            <button type="button" className="button" onClick={clearFilters} disabled={activeFilters.length === 0}>
              絞り込みを解除
            </button>
            <p className="filter-note">
              表示対象は、無料アクセスを確認した確認レベルL2以上の資料（{result.totalPublic}件）です。未確認の候補資料は表示していません。
            </p>
          </details>
        </aside>

        <section className="results" aria-labelledby="results-heading">
          <h2 id="results-heading" ref={resultsHeading} tabIndex={-1} className="results-heading">
            {hasQuery ? "検索結果" : "資料一覧"}{" "}
            <span className="result-count" role="status" aria-live="polite">
              {hasQuery
                ? `条件に一致：${fullCount}件・認識できた条件に一致：${recognizedCount}件・関連候補：${partial.length}件`
                : `${result.hits.length}件`}
            </span>
          </h2>
          {hasQuery && <p className="muted search-scope">上の件数は資料のみです。タブの件数は一部一致の候補も含む別集計です。資料の絞り込みは、知識ノート・判断材料には適用しません。</p>}

          {hasQuery && (
            <div className="analysis">
              {result.analysis.units.length > 0 && (
                <p>
                  検索条件として使った語：
                  {result.analysis.units.map((u) => (
                    <span key={u.key} className="unit">
                      {unitLabel(u)}
                    </span>
                  ))}
                </p>
              )}
              {result.analysis.ignored.length > 0 && (
                <p className="search-ignored">資料中に見つからず、検索条件に含めなかった語：{result.analysis.ignored.join("、")}</p>
              )}
              {result.hits.length > 0 && (
                <p className="muted">検索語に一致した資料が、質問に直接答えているとは限りません。各資料の紹介と確認レベルを確かめてください。</p>
              )}
              <details className="search-match-help"><summary>資料の一致区分について</summary><dl><dt>条件に一致：</dt><dd>検索の一致判定に使った条件を満たす資料です。</dd><dt>認識できた条件に一致：</dt><dd>資料にない語や、資料未収録のTopicを含む検索です。表示した資料が検索語のすべてを扱うとは限りません。</dd><dt>関連候補（一部一致）：</dt><dd>必須とした条件の一部だけに一致する資料です。一致しなかった条件も表示します。</dd></dl><p>いずれも資料の内容の正しさや、現在のパッチでの適合性を判定したものではありません。</p></details>
            </div>
          )}

          {hasQuery ? <TopicTabs key={href} label="検索結果の種類" tabs={resultTabs} initial={initialTab} /> : resourceContent}

          {hasQuery && <ExternalSearch query={q} />}
        </section>
      </div>
    </div>
  );
}

/** 収録資料の外を探すための導線。外部の検索 API は呼ばず、利用者がリンクを開いたときだけ検索語が外部へ送られる */
function ExternalSearch({ query }: { query: string }) {
  const urls = externalSearchUrls(query);
  if (!urls) return null;
  return (
    <aside className="external-search" aria-labelledby="external-search-heading">
      <h3 id="external-search-heading">Rift Compass の外で探す</h3>
      <p className="muted">
        リンクを開くと、入力した検索語が Google または YouTube に送られ、新しいタブで検索結果が表示されます。外部の検索結果は Rift
        Compass では確認しておらず、答えが見つかるとは限りません。内容が正しいか、現在のパッチで有効かは、各資料で確かめてください。
      </p>
      <ul className="external-links">
        <li>
          <ExternalLink href={urls.google}>Google で検索</ExternalLink>
        </li>
        <li>
          <ExternalLink href={urls.youtube}>YouTube で検索</ExternalLink>
        </li>
      </ul>
    </aside>
  );
}

/** 一部の条件だけに一致した候補を、一致した条件の組み合わせごとにまとめて表示する */
function PartialCandidates({ hits, units, requiredKeys, open }: { hits: Hit[]; units: Unit[]; requiredKeys: string[]; open: boolean }) {
  const labelOf = new Map(units.map((u) => [u.key, unitLabel(u)]));
  const groups = new Map<string, Hit[]>();
  const missingOf = new Map<string, string>();
  for (const h of hits) {
    const key = h.matchedKeys.map((k) => labelOf.get(k)).join("・");
    groups.set(key, [...(groups.get(key) ?? []), h]);
    missingOf.set(key, requiredKeys.filter((k) => !h.matchedKeys.includes(k)).map((k) => labelOf.get(k)).join("・"));
  }
  return (
    <details className="partial-candidates" open={open}>
      <summary>一部の条件だけに関連する候補（{hits.length}件）</summary>
      {[...groups].map(([label, list]) => (
        <section key={label} className="partial-group">
          <h3>
            {label} にだけ一致 <span className="result-count">{list.length}件</span>
          </h3>
          {missingOf.get(label) && <p className="muted partial-missing">一致しなかった条件：{missingOf.get(label)}</p>}
          <SearchHitList hits={list} partial />
        </section>
      ))}
    </details>
  );
}
