import { useEffect } from "react";
import { index } from "./data/dataset";
import { useRoute, type Route } from "./router";
import { ResourceDetail } from "./components/ResourceDetail";
import { SearchPage } from "./components/SearchPage";
import { TopicIndex, TopicPage } from "./components/TopicPages";
import { DecisionDetail, DecisionIndex } from "./components/DecisionPages";
import { ExplorePage } from "./components/ExplorePage";
import { decisionById } from "./data/decisions";

function pageTitle(route: Route): string {
  if (route.name === "resource") return index.resourceById.get(route.id)?.title ?? "資料";
  if (route.name === "topic") return index.topicById.get(route.id)?.label_ja ?? "Topic";
  if (route.name === "topics") return "Topic 一覧";
  if (route.name === "decisions") return "判断材料（試験）";
  if (route.name === "decision") return decisionById(route.id)?.statement_ja ?? "判断材料（試験）";
  if (route.name === "explore") return "知識を散策する（試験）";
  return route.q ? `「${route.q}」の検索結果` : "";
}

export function App() {
  const route = useRoute();
  const pageKey = route.name === "home" ? "home" : `${route.name}:${"id" in route ? route.id : ""}`;

  useEffect(() => {
    const title = pageTitle(route);
    document.title = title ? `${title} | Rift Compass` : "Rift Compass";
  });
  // 一覧以外へ移動したら先頭から表示する（検索語の入力中はスクロール位置を保つ）
  useEffect(() => {
    if (pageKey !== "home") window.scrollTo(0, 0);
  }, [pageKey]);

  return (
    <>
      <a className="skip-link" href="#main">
        本文へ移動
      </a>
      <header className="site-header">
        <a className="brand" href="#/">
          Rift Compass
        </a>
        <nav aria-label="メイン">
          <a href="#/">検索</a>
          <a href="#/topics">Topic 一覧</a>
          <a href="#/decisions">判断材料（試験）</a>
          <a href="#/explore">散策（試験）</a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === "home" && <SearchPage q={route.q} filters={route.filters} />}
        {route.name === "resource" && <ResourceDetail id={route.id} />}
        {route.name === "topic" && <TopicPage id={route.id} />}
        {route.name === "topics" && <TopicIndex />}
        {route.name === "decisions" && <DecisionIndex topic={route.topic} compare={route.compare} />}
        {route.name === "decision" && <DecisionDetail id={route.id} />}
        {route.name === "explore" && <ExplorePage topic={route.topic} distance={route.distance} />}
      </main>
      <footer className="site-footer">
        <p>
          League of Legends の無料公開教材への案内です。資料の内容はそれぞれの発信者に帰属します。確認レベルは資料の確認状況を示すもので、ゲーム内での検証を意味しません。
        </p>
        <p className="muted">
          データ：schema {index.data.schema_version}・調査日 {index.data.generated_at}（調査時点の最新パッチ {index.data.research_context.current_patch_at_research}。このパッチでの検証は行っていません）
        </p>
      </footer>
    </>
  );
}
