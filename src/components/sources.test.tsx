import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SourcesListBody, SourceDetailBody, CandidateCard } from "./SourcesPages";
import type { SourcesIndex } from "../data/sources";
import { SearchPage } from "./SearchPage";
const data = JSON.parse(readFileSync("public/sources/index.json", "utf8")) as SourcesIndex;

describe("Sourcesの表示", () => {
  it("一覧・個別候補・通常検索の入口を表示し、未確認の情報源を検証済みとしない", () => {
    const html = renderToStaticMarkup(<SourcesListBody data={data} q="Wardex" kind="" lang="" />);
    expect(html).toContain("#/source/wardex");
    expect(html).toContain("接続未確認");
    expect(html).toContain("情報源が未特定の個別候補");
    expect(html).toContain("T4d90Hjag5Y");
    expect(renderToStaticMarkup(<SearchPage q="視界" filters={{}} />)).toContain("#/sources?q=");
  });
  it("候補0件の情報源にも外部入口と未収録の説明を表示する", () => {
    const source = data.sources.find((s) => s.id === "wardex")!;
    const html = renderToStaticMarkup(<SourceDetailBody source={source} candidates={[]} />);
    expect(html).toContain('href="https://wardex.app/"');
    expect(html).toContain("自動収集は未設定");
    expect(html).toContain("対応する公開資料はまだありません");
    expect(html).toContain("現在の接続状態：未確認");
  });
  it("URLのみ・題名欠損・日付欠損・レビューなしを明示し、正式資料を捏造しない", () => {
    const html = renderToStaticMarkup(<CandidateCard candidate={data.unassigned[0]} />);
    for (const text of ["題名未取得", "URLのみ", "正式Resource未登録", "確認記録なし", "公開日：未取得"]) expect(html).toContain(text);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("#/r/");
    const unsafe = renderToStaticMarkup(<CandidateCard candidate={{ ...data.unassigned[0], url: "javascript:alert(1)" }} />);
    expect(unsafe).not.toContain('href="javascript:');
    const reviewed = renderToStaticMarkup(<CandidateCard candidate={{ ...data.unassigned[0], review: { checked_by: "AI", checked_at: "2026-11-03", method: "冒頭のみ" } }} />);
    expect(reviewed).toContain("AI・冒頭のみ");
  });
  it("明示的に対応したResourceを表示し、収集なし・正式登録・本文確認を分離する", () => {
    const source = data.sources.find((s) => s.id === "yt-dopagod")!;
    const html = renderToStaticMarkup(<SourceDetailBody source={source} candidates={[]} />);
    expect(source.resource_ids).toHaveLength(2);
    for (const id of source.resource_ids) expect(html).toContain(`#/r/${id}`);
    expect(html).toContain("収集コレクション 0件");
    expect(html).toContain("現在の接続状態：未確認");
  });
});
