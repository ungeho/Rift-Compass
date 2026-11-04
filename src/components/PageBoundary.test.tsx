import { lazy } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageBoundary } from "./PageBoundary";

describe("画面の遅延読み込み", () => {
  it("通常の内容とリンクを維持する", () => {
    expect(renderToStaticMarkup(<PageBoundary><a href="#/topics">Topic 一覧</a></PageBoundary>))
      .toContain('href="#/topics"');
  });

  it("未解決の画面には読み込み状態を通知する", () => {
    const Pending = lazy(() => new Promise<{ default: () => null }>(() => {}));
    const html = renderToStaticMarkup(<PageBoundary><Pending /></PageBoundary>);
    expect(html).toContain('role="status"');
    expect(html).toContain("画面を読み込んでいます");
  });

  it("読み込み失敗には再読み込みと検索への復帰を提示する", () => {
    const boundary = new PageBoundary({ children: <p>読み込み対象</p> });
    boundary.state = PageBoundary.getDerivedStateFromError();
    const html = renderToStaticMarkup(boundary.render());
    expect(html).toContain('role="alert"');
    expect(html).toContain("再読み込み");
    expect(html).toContain('href="#/"');
    expect(html).not.toContain("読み込み対象");
  });
});
