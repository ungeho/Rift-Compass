import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { index } from "../data/dataset";
import { fetchSourcesFile, filterSources, filterSourceCandidates, SOURCE_KINDS, SOURCE_LANGUAGES, type Source, type SourceCandidate, type SourcesIndex, type SourceFile, type CandidateFilter } from "../data/sources";
import { safeExternalUrl } from "../lib/links";
import { replaceHash, resourceHref, sourceHref, sourcesHref } from "../router";
import { ExternalLink, TopicChips } from "./common";
import { ResourceCard } from "./ResourceCard";

function SafeLink({ url, children }: { url: string; children: ReactNode }) {
  const href = safeExternalUrl(url);
  return href ? <ExternalLink href={href}>{children}</ExternalLink> : <span>外部URLが不正なためリンクを表示できません</span>;
}
function useFile<T>(file: string) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let active = true;
    setState({});
    fetchSourcesFile<T>(file).then((data) => { if (active) setState({ data }); }).catch((e: Error) => { if (active) setState({ error: e.message }); });
    return () => { active = false; };
  }, [file]);
  return state;
}
function Loading({ error }: { error?: string }) {
  return <p role="status">{error ? `情報源データを読み込めませんでした（${error}）。ページを再読み込みしてください。` : "情報源を読み込んでいます…"}</p>;
}
function Presence({ source: s }: { source: Source }) {
  return <p className="muted">情報源の登録と接続確認は別です。{s.presence.status === "checked" ? `接続確認：${s.presence.checked_at}` : "現在の接続状態：未確認"}。{s.presence.basis_ja} 内容の正確性や現行パッチへの適合を保証しません。</p>;
}
export function SourcesPage({ q, kind, lang }: { q: string; kind: string; lang: string }) {
  const { data, error } = useFile<SourcesIndex>("index.json");
  return data ? <SourcesListBody data={data} q={q} kind={kind} lang={lang} /> : <Loading error={error} />;
}
export function SourcesListBody({ data, q, kind, lang }: { data: SourcesIndex; q: string; kind: string; lang: string }) {
  const [draft, setDraft] = useState(q);
  const [composing, setComposing] = useState(false);
  useEffect(() => { if (!composing) setDraft(q); }, [q, composing]);
  const sources = filterSources(data.sources, { q, kind, lang }, index.data.topics);
  const update = (query: string, type = kind, language = lang) => replaceHash(sourcesHref(query, type, language));
  return <div className="detail sources-page">
    <h1>情報源を探す</h1>
    <p>サイトやYouTubeチャンネルから、Rift Compassに未収録の記事・動画も探せます。情報源の登録、記事の発見、本文確認、ゲーム内検証はそれぞれ別です。</p>
    <div className="source-controls">
      <label>名前・テーマで探す<input type="search" value={draft} onChange={(e) => { setDraft(e.target.value); if (!composing) update(e.target.value); }} onCompositionStart={() => setComposing(true)} onCompositionEnd={(e) => { setComposing(false); update(e.currentTarget.value); }} /></label>
      <label>種別<select aria-label="種別" value={kind} onChange={(e) => update(q, e.target.value)}><option value="">すべて</option>{Object.entries(SOURCE_KINDS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label>言語<select aria-label="言語" value={lang} onChange={(e) => update(q, kind, e.target.value)}><option value="">すべて</option>{Object.entries(SOURCE_LANGUAGES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
    </div>
    <p role="status">{sources.length}件／登録情報源 {data.sources.length}件</p>
    <p className="muted">テーマ検索は編集上の案内と、候補の語から推定したTopicを含みます。情報源全体の専門分野を確認したものではありません。</p>
    {!sources.length && <p>条件に一致する情報源はありません。条件を変えると、ほかの情報源も探せます。</p>}
    <ul className="source-list">{sources.map((s) => <li key={s.id}><article className="card">
      <p className="card-meta">{SOURCE_KINDS[s.kind]} ・ {s.languages.map((l) => SOURCE_LANGUAGES[l] || l).join("・")} ・ 接続{s.presence.status === "checked" ? "確認記録あり" : "未確認"}</p>
      <h2 className="card-title"><a href={sourceHref(s.id)}>{s.name}</a></h2><p>{s.description_ja}</p>
      {s.topic_ids.length > 0 && <><p className="muted">テーマ（編集上の案内）</p><TopicChips ids={s.topic_ids} /></>}
      <p className="muted">発見済み {s.candidate_count}件 ・ 関連する公開資料 {s.resource_ids.length}件</p>
      <a href={sourceHref(s.id)}>情報源の詳細と記事・動画を見る</a>
    </article></li>)}</ul>
    {data.unassigned.length > 0 && <section><h2>情報源が未特定の個別候補</h2><p>個別の記事・動画のURLです。情報源としては登録せず、内容未確認の候補として保持しています。</p><ul className="source-list">{data.unassigned.map((c) => <li key={c.key}><CandidateCard candidate={c} /></li>)}</ul></section>}
  </div>;
}
export function SourceDetailPage({ id }: { id: string }) {
  const { data, error } = useFile<SourcesIndex>("index.json");
  if (!data) return <Loading error={error} />;
  const source = data.sources.find((s) => s.id === id);
  return source ? <SourceCandidates key={id} source={source} /> : <div className="detail"><h1>情報源が見つかりません</h1><a href={sourcesHref()}>情報源一覧へ</a></div>;
}
function SourceCandidates({ source }: { source: Source }) {
  const { data, error } = useFile<SourceFile>(`${encodeURIComponent(source.id)}.json`);
  if (!data) return <Loading error={error} />;
  if (data.source_id !== source.id) return <p role="alert">情報源データの対応が不正です。</p>;
  return <SourceDetailBody source={source} candidates={data.candidates} />;
}
export function CandidateCard({ candidate: c }: { candidate: SourceCandidate }) {
  return <article className="card source-candidate">
    <h3 className="card-title">{c.resource_id ? <a href={resourceHref(c.resource_id)}>{c.title || "題名未取得"}</a> : <SafeLink url={c.url}>{c.title || "題名未取得：外部の原典を開く"}</SafeLink>}</h3>
    <p className="muted">{c.type === "video" ? "動画" : "記事等"} ・ {SOURCE_LANGUAGES[c.language] || c.language} ・ {c.registered ? "正式Resource登録あり" : "正式Resource未登録"}{c.registered && !c.resource_id && "（通常公開対象外）"}</p>
    <p>{c.metadata_state === "url_only" ? "URLのみ。題名・公開日・内容は未確認です。" : "メタデータ取得済み。本文・本編の確認とは別です。"}</p>
    <p className="muted">個別確認：{c.review ? `${c.review.checked_by || "確認者不明"}・${c.review.method}（${c.review.checked_at || "確認日不明"}）` : "確認記録なし"}。ゲーム内での検証を示すものではありません。</p>
    {c.discovered_at && <p className="muted">URL発見日：{c.discovered_at}（接続確認日ではありません）</p>}
    {c.registered_at && <p className="muted">候補登録日：{c.registered_at}</p>}
    <p className="muted">公開日：{c.published_at || "未取得"}</p>
    <p className="muted">区分：{({ candidate: "個別確認待ち", hold: "保留", excluded: "対象外候補", registered: "正式資料に対応" } as Record<string, string>)[c.triage.status] || c.triage.status}。{c.triage.reason}</p>
    {(c.topic_ids.length > 0 || c.roles.length > 0) && <details><summary>候補の語から推定した分類（内容・専門分野は未確認）</summary><TopicChips ids={c.topic_ids} />{c.roles.length > 0 && <p>推定ロール：{c.roles.join("・")}</p>}</details>}
    {c.notes_ja && <p>{c.notes_ja}</p>}
    <SafeLink url={c.url}>{c.url}</SafeLink>
  </article>;
}
export const SOURCE_CANDIDATE_PAGE_SIZE = 20;
export function SourceDetailBody({ source: s, candidates }: { source: Source; candidates: SourceCandidate[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CandidateFilter>("unregistered");
  const [page, setPage] = useState(0);
  const candidateHeading = useRef<HTMLHeadingElement>(null);
  const changePage = (next: number) => {
    setPage(next);
    candidateHeading.current?.scrollIntoView({ block: "start" });
    candidateHeading.current?.focus({ preventScroll: true });
  };
  const found = filterSourceCandidates(candidates, q, filter, index.data.topics);
  const pages = Math.max(1, Math.ceil(found.length / SOURCE_CANDIDATE_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const resources = s.resource_ids.flatMap((id) => index.publicResources.filter((r) => r.id === id));
  return <div className="detail sources-page">
    <a href={sourcesHref()}>← 情報源一覧</a><h1>{s.name}</h1><p>{s.description_ja}</p>
    <p><SafeLink url={s.url}>情報源を開く：{s.url}</SafeLink></p><Presence source={s} />
    <h2>収集範囲</h2><p>{s.coverage_ja}</p><p className="muted">収集コレクション {s.collection_ids.length}件 ・ 発見済み候補 {s.candidate_count}件。サイト全体の件数や現在の更新状況を示すものではありません。</p>
    {s.topic_ids.length > 0 && <><h3>テーマ（編集上の案内）</h3><TopicChips ids={s.topic_ids} /></>}
    {s.inferred_topic_ids.length > 0 && <details><summary>発見済み候補の語から推定したテーマ</summary><p>情報源全体の専門分野や、各記事の内容を確認した分類ではありません。</p><TopicChips ids={s.inferred_topic_ids} /></details>}
    <section><h2>関連する正式Resource（{resources.length}件）</h2><p className="muted">URL・動画IDの一致、または明示的な資料IDの対応によります。確認レベルは各資料の記録を参照してください。</p>{resources.length ? <ul className="source-list">{resources.map((r) => <li key={r.id}><ResourceCard resource={r} /></li>)}</ul> : <p>対応する公開資料はまだありません。情報源に有用な情報がないという意味ではありません。</p>}</section>
    <section><h2 ref={candidateHeading} tabIndex={-1}>発見済みの記事・動画候補</h2><p>未収録 {s.unregistered_count}件（対象外を含む）。保留は確認の順番・判断の記録であり、低品質の断定ではありません。対象外候補は区分を切り替えると表示できます。</p>
      <div className="source-controls"><label>候補の題名・テーマ<input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label><label>候補の区分<select aria-label="候補の区分" value={filter} onChange={(e) => { setFilter(e.target.value as CandidateFilter); setPage(0); }}><option value="unregistered">未収録（対象外を除く）</option><option value="hold">保留</option><option value="registered">登録済み</option><option value="excluded">対象外候補</option><option value="all">すべて</option></select></label></div>
      <p role="status">{found.length}件{found.length > 0 && ` ・ ${current * SOURCE_CANDIDATE_PAGE_SIZE + 1}～${Math.min((current + 1) * SOURCE_CANDIDATE_PAGE_SIZE, found.length)}件目`}</p>
      {!found.length && <p>この区分・検索条件の候補はありません。</p>}
      <ul className="source-list">{found.slice(current * SOURCE_CANDIDATE_PAGE_SIZE, (current + 1) * SOURCE_CANDIDATE_PAGE_SIZE).map((c) => <li key={c.key}><CandidateCard candidate={c} /></li>)}</ul>
      {pages > 1 && <nav className="source-pagination" aria-label="候補のページ"><button className="button" disabled={current === 0} onClick={() => changePage(current - 1)}>前のページ</button><span>{current + 1} / {pages}</span><button className="button" disabled={current + 1 === pages} onClick={() => changePage(current + 1)}>次のページ</button></nav>}
    </section>
  </div>;
}
