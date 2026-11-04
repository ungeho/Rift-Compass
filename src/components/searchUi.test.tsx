import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchPage, SEARCH_PAGE_SIZE } from "./SearchPage";
import { RelatedNotes } from "./RelatedNotes";
import { search, type Filters } from "../search/search";
import { index } from "../data/dataset";
import { noteMatchesForQuery } from "../data/noteSearch";
import { homeHref, parseHash } from "../router";

const render = (q: string, filters: Filters = {}) => renderToStaticMarkup(<SearchPage q={q} filters={filters} />);
const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
function resourcePanel(html: string) {
  const start = /<section class="topic-tabpanel" id="[^"]+-panel-resources"[^>]*>/.exec(html);
  const end = /<section class="topic-tabpanel" id="[^"]+-panel-notes"[^>]*>/.exec(html);
  return start && end ? html.slice(start.index, end.index) : html;
}
const resourceIds = (html: string) => [...html.matchAll(/<h3 class="card-title"><a href="#\/r\/([^"]+)"/g)].map((m) => m[1]);

describe("検索トップと結果の整理", () => {
  it("トップの主操作と入口を維持し、大量の補助情報を折りたたみ、資料には段階表示を使う", () => {
    const html = render("");
    expect(html).toContain('class="search-form"');
    for (const href of ["#/topics", "#/sources", "#/explore", "#/data"]) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('class="search-browse"><details>');
    expect(html).toContain("知りたいことから探す");
    expect(html).toContain("Topic から探す");
    expect(resourceIds(html)).toEqual(index.publicResources.slice(0, SEARCH_PAGE_SIZE).map((r) => r.id));
    expect(plain(html)).toContain(`資料一覧 ${index.publicResources.length}件`);
    expect(html).toContain(`残り ${index.publicResources.length - SEARCH_PAGE_SIZE}件`);
  });
  it.each(["VeigarV2 リコール", "VeigarV2 ローム", "ウェーブ管理 未知の技能", "フリーズ"])("%sの判定・件数・主資料の順位を変えない", (q) => {
    const expected = search(q);
    const html = render(q);
    const full = expected.hits.filter((h) => h.match === "full").length;
    const recognized = expected.hits.filter((h) => h.match === "recognized").length;
    const partial = expected.hits.filter((h) => h.match === "partial").length;
    expect(plain(html)).toContain(`条件に一致：${full}件・認識できた条件に一致：${recognized}件・関連候補：${partial}件`);
    const main = expected.hits.filter((h) => h.match !== "partial").slice(0, SEARCH_PAGE_SIZE);
    expect(resourceIds(resourcePanel(html)).slice(0, main.length)).toEqual(main.map((h) => h.resource.id));
    expect(html).toContain('aria-label="検索結果の種類"');
  });
  it("知識ノートしか見つからない検索では、資料0件でもノートのタブを初期表示する", () => {
    const q = "ヴォイドグラブ", html = render(q);
    expect(search(q).hits).toHaveLength(0);
    expect(noteMatchesForQuery(q).matches.length).toBeGreaterThan(0);
    expect(html).toMatch(/<button[^>]+id="[^"]+-tab-notes"[^>]+aria-selected="true"/);
    expect(html).toContain("資料の絞り込みは、知識ノート・判断材料には適用しません");
    expect(html).toContain("その話題を扱う資料が存在しないという意味ではありません");
  });
  it("未知語と、資料を収録していないTopicの扱いを区別し、空の引用符を表示しない", () => {
    expect(render("ウェーブ管理 未知の技能")).toContain("検索条件に含めなかった語");
    const q = "アーリ リコール", expected = search(q);
    expect(expected.analysis.ignored).toHaveLength(0);
    expect(expected.hits.some((h) => h.match === "recognized")).toBe(true);
    const html = render(q);
    expect(html).toContain("認識したTopicの一部には、対応する資料をまだ収録していません");
    expect(html).not.toContain("「」は資料中に");
  });
  it("URLから復元した複数フィルターを折りたたみの外に表示し、0件でも解除・外部探索を残す", () => {
    const filters = { lang: "ja", type: "article" };
    const route = parseHash(homeHref("qwertyuiop", filters));
    expect(route).toEqual({ name: "home", q: "qwertyuiop", filters });
    const html = render("qwertyuiop", filters);
    expect(html.indexOf('aria-label="現在の資料の絞り込み"')).toBeLessThan(html.indexOf('class="results-layout"'));
    for (const text of ["言語：日本語", "資料の種類：記事", "すべて解除", "絞り込みを解除する", "Google で検索", "YouTube で検索"]) expect(plain(html)).toContain(text);
    expect(html).toContain('href="#/sources?q=qwertyuiop"');
  });
  it("資料件数のみをライブ通知し、大きな結果一覧全体を読み上げ対象にしない", () => {
    const html = render("リコール");
    expect(html).toContain('class="result-count" role="status" aria-live="polite"');
    expect(html).not.toContain('class="results" aria-live=');
    expect(html).toContain('id="results-heading" tabindex="-1"');
  });
  it("大量の知識ノートも件数を維持し、段階表示から残りに到達できる", () => {
    const q = ["ダメージ", "視界", "行動妨害"].find((q) => noteMatchesForQuery(q).matches.filter((m) => m.tier === "full").length > 20)!;
    expect(q).toBeDefined();
    const result = noteMatchesForQuery(q);
    const html = renderToStaticMarkup(<RelatedNotes q={q} result={result} />);
    const full = result.matches.filter((m) => m.tier === "full"), partial = result.matches.filter((m) => m.tier === "partial");
    expect(html.match(/class="note-summary"/g)).toHaveLength(Math.min(20, full.length) + Math.min(20, partial.length));
    expect(html).toContain(`残り ${full.length - 20}件`);
    expect(html).toContain("知識ノートをさらに20件表示する");
  });
});
