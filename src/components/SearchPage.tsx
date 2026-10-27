import { useEffect, useMemo, useRef, useState } from "react";
import { index } from "../data/dataset";
import { eraLabel, LANGUAGE_LABELS, LEVEL_LABELS, TYPE_LABELS } from "../data/labels";
import type { Level } from "../data/types";
import { facetCounts, search, type FilterKey, type Filters, type Hit, type Unit } from "../search/search";
import { externalSearchUrls } from "../lib/links";
import { homeHref, rememberList, replaceHash, topicHref } from "../router";
import { ExternalLink } from "./common";
import { ResourceCard } from "./ResourceCard";

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

  useEffect(() => {
    rememberList(href);
  }, [href]);

  const setFilter = (key: FilterKey, value: string) => replaceHash(homeHref(q, { ...filters, [key]: value || undefined }));
  const clearFilters = () => replaceHash(homeHref(q));

  return (
    <div className="search-page">
      <section className="hero" aria-labelledby="search-heading">
        <h1 id="search-heading">何を知りたいですか？</h1>
        <form role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="q" className="visually-hidden">
            知りたいことを日本語または英語で入力
          </label>
          <input
            id="q"
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
        </form>
        <div className="examples">
          <span className="examples-label">質問の例：</span>
          <ul className="chips">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <a className="chip" href={homeHref(ex, filters)}>
                  {ex}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {!hasQuery && activeFilters.length === 0 && <TopicEntrances />}

      <div className="results-layout">
        <aside className="filters" aria-label="絞り込み">
          <details open={filtersInitiallyOpen}>
            <summary>
              絞り込み{activeFilters.length > 0 && <span className="count-pill">{activeFilters.length}</span>}
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

        <section className="results" aria-live="polite" aria-labelledby="results-heading">
          <h2 id="results-heading" className="results-heading">
            {hasQuery ? "検索結果" : "資料一覧"}{" "}
            <span className="result-count">
              {hasQuery
                ? `条件に一致：${fullCount}件・認識できた条件に一致：${recognizedCount}件・関連候補：${partial.length}件`
                : `${result.hits.length}件`}
            </span>
          </h2>

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
                <p className="muted">資料中に見つからず、検索条件に含めなかった語：{result.analysis.ignored.join("、")}</p>
              )}
              {result.hits.length > 0 && (
                <p className="muted">検索語に一致した資料が、質問に直接答えているとは限りません。各資料の紹介と確認レベルを確かめてください。</p>
              )}
            </div>
          )}

          {activeFilters.length > 0 && (
            <p className="active-filters">
              絞り込み中：
              {activeFilters.map((k) => (
                <button key={k} type="button" className="chip removable" onClick={() => setFilter(k, "")}>
                  {FILTER_LABELS[k]}：{OPTIONS[k].find((o) => o.value === filters[k])?.label ?? filters[k]}
                  <span aria-hidden="true"> ×</span>
                  <span className="visually-hidden">（解除）</span>
                </button>
              ))}
            </p>
          )}

          {hasQuery && main.length > 0 && recognizedOnly && (
            <p className="notice">
              「{result.analysis.ignored.join("」「")}」は資料中に見つからなかったため、検索条件に含めていません。以下は、それ以外の条件（
              {result.analysis.units.map(unitLabel).join("・")}）にすべて一致した資料です。「{result.analysis.ignored.join("」「")}」について扱っているとは限りません。
            </p>
          )}
          {hasQuery && main.length === 0 && partial.length > 0 && (
            subjectMatched.length > 0 ? (
              <p className="notice">
                主題（{subjectUnits.map(unitLabel).join("・")}）に一致する資料は{subjectMatched.length}件あります。ただし、質問から取り出した語（
                {[...new Set(subjectMatched.flatMap((h) => missingTerms(h)))].map((u) => `「${u.matched}」`).join("")}
                など）が資料の題名・紹介文・Topic に見つからないため、「条件に一致」には数えていません。その資料が質問に答えているかは、各資料で確かめてください。
              </p>
            ) : (
              <p className="notice">
                すべての条件に一致する資料はありません。下に、一部の条件だけに関連する候補を条件ごとに表示しています。
              </p>
            )
          )}

          {result.hits.length === 0 ? (
            <div className="empty">
              <p>
                <strong>この検索条件では、Rift Compass に登録された公開資料から一致する資料が見つかりませんでした。</strong>
              </p>
              <p className="muted">
                Rift Compass が収録している資料は一部だけです。ここで見つからなくても、その話題を扱う資料が存在しないという意味ではありません。
              </p>
              <ul>
                <li>別の言い方（例：「Lv2」「レベル2」「level 2 spike」）や英語でも試してください。</li>
                <li>語を減らすと見つかる場合があります。</li>
                {activeFilters.length > 0 && (
                  <li>
                    <button type="button" className="link-button" onClick={clearFilters}>
                      絞り込みを解除する
                    </button>
                  </li>
                )}
                <li>
                  <a href="#/topics">Topic 一覧から探す</a>
                </li>
              </ul>
            </div>
          ) : (
            <>
              {main.length > 0 && (
                <ol className="result-list">
                  {main.map((h) => (
                    <li key={h.resource.id}>
                      <ResourceCard resource={h.resource} recognized={h.match === "recognized"} />
                    </li>
                  ))}
                </ol>
              )}
              {partial.length > 0 && (
                <PartialCandidates hits={partial} units={result.analysis.units} requiredKeys={result.requiredKeys} open={main.length === 0} />
              )}
            </>
          )}

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
          <ol className="result-list">
            {list.map((h) => (
              <li key={h.resource.id}>
                <ResourceCard resource={h.resource} partial />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </details>
  );
}

function TopicEntrances() {
  const categories = index.data.topics.filter((t) => t.kind === "category");
  return (
    <section className="entrances" aria-labelledby="entrances-heading">
      <h2 id="entrances-heading">Topic から探す</h2>
      <ul className="entrance-grid">
        {categories.map((c) => (
          <li key={c.id} className="entrance">
            <a className="entrance-title" href={topicHref(c.id)}>
              {c.label_ja}
              <span className="muted"> {c.label_en}</span>
            </a>
            <ul className="chips">
              {(index.childrenOf.get(c.id) ?? []).map((t) => (
                <li key={t.id}>
                  <a className="chip" href={topicHref(t.id)}>
                    {t.label_ja}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
