import { Component, Suspense, type ReactNode } from "react";

// Chunk failures need an actionable message; reloading also obtains the latest deployment's URLs.
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <div role="alert">
      <h1>画面を読み込めませんでした</h1>
      <p>通信状態を確認して再読み込みしてください。URLの検索条件や表示先は保持されます。</p>
      <button className="button" onClick={() => window.location.reload()}>再読み込み</button>
      <p><a href="#/">検索へ戻る</a></p>
    </div>;
    return <Suspense fallback={<p role="status" aria-live="polite">画面を読み込んでいます…</p>}>
      {this.props.children}
    </Suspense>;
  }
}
