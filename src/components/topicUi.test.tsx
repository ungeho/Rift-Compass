import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { filterTopics, matchesTopicFilter, TopicIndex, TopicPage } from "./TopicPages";
import { TopicTabs } from "./TopicTabs";
import { RoleChampions } from "./RoleSection";
import { index } from "../data/dataset";
import type { ComponentProps } from "react";
import { BrowseTopicChildren, BROWSE_PAGE_SIZE, topicBrowseGroups } from "./TopicBrowser";
import { ROLE_TOPICS, QUESTION_ENTRANCES } from "../data/decisions";
import { KNOWLEDGE_ENTRANCES } from "../data/questionEntrances";
import { SearchBrowse } from "./SearchBrowse";
import { decisionHref, homeHref } from "../router";

describe("Topicの階層と文字による絞り込み", () => {
  it("日本語・英語・別名・全角英字から探せ、空欄では全218件を保持する", () => {
    expect(filterTopics("").map((t) => t.id)).toEqual(index.data.topics.map((t) => t.id));
    expect(filterTopics("ＭＩＤ").map((t) => t.id)).toContain("role-mid");
    expect(filterTopics("freeze").map((t) => t.id)).toContain("freeze");
    const t = index.topicById.get("minion-aggro")!;
    expect(filterTopics(t.aliases_ja[0]).map((t) => t.id)).toContain(t.id);
    expect(filterTopics("存在しないTopic-xyz123")).toHaveLength(0);
    expect(matchesTopicFilter("敵  視界", ["敵の状況", "視界を確認"])).toBe(true);
    expect(matchesTopicFilter("敵 視界", ["敵の状況"])).toBe(false);
  });
  it("折りたたんでも全Topicリンクと多重親の経路を保持する", () => {
    const html = renderToStaticMarkup(<TopicIndex />);
    expect(html).toContain("<details>");
    for (const t of index.data.topics) expect(html).toContain(`href="#/topic/${t.id}"`);
    expect(html.match(/href="#\/topic\/minion-aggro"/g)!.length).toBeGreaterThan(1);
    const detail = renderToStaticMarkup(<TopicPage id="minion-aggro" />);
    for (const parent of index.topicById.get("minion-aggro")!.parent_ids) expect(detail).toContain(`href="#/topic/${parent}"`);
  });
});

describe("検索トップと一覧の分類表示", () => {
  it("既存のロール定義だけを表示グループへ移し、他の独立Topicや元の親子関係を変えない", () => {
    const before = JSON.stringify(index.data.topics);
    const groups = topicBrowseGroups();
    expect(groups.roles.map(t => t.id).sort()).toEqual(Object.keys(ROLE_TOPICS).sort());
    expect(groups.categories.some(t => Object.hasOwn(ROLE_TOPICS, t.id))).toBe(false);
    const orphan = { ...index.data.topics[0], id: "standalone-other", kind: "concept" as const, parent_ids: [] };
    const fixture = topicBrowseGroups([...index.data.topics, orphan]);
    expect(fixture.ungrouped).toContain(orphan);
    expect(fixture.roles).not.toContain(orphan);
    const html = renderToStaticMarkup(<TopicIndex />);
    const roleGroup = html.slice(html.indexOf('class="topic-role-group"'));
    expect(roleGroup).toContain("ロール別");
    expect(roleGroup).toContain("5ロール");
    for (const id of Object.keys(ROLE_TOPICS)) expect(roleGroup).toContain(`href="#/topic/${id}"`);
    expect(JSON.stringify(index.data.topics)).toBe(before);
  });
  it("Topic一覧は元の階層リストに戻し、カード・青いバッジ・開閉ラベルを使わない", () => {
    const html = renderToStaticMarkup(<TopicIndex />);
    expect(html).toContain('class="topic-tree"');
    for (const decoration of ["topic-browse-link", "browse-disclosure", "count-pill", "browse-toggle"]) expect(html).not.toContain(decoration);
    expect(html).toContain("この Topic を開く：");
    for (const topic of index.data.topics) expect(html).toContain(`href="#/topic/${topic.id}"`);
  });
  it("検索トップの大量の子Topicは最初の12件だけを可視にし、残数と追加表示操作を用意する", () => {
    const children = index.childrenOf.get("cat-champions")!;
    const html = renderToStaticMarkup(<BrowseTopicChildren topics={children} />);
    expect(html.match(/<li hidden="">/g)).toHaveLength(children.length - BROWSE_PAGE_SIZE);
    expect(html).toContain(`全${children.length}件・${BROWSE_PAGE_SIZE}件を表示`);
    expect(html).toContain(`残り ${children.length - BROWSE_PAGE_SIZE}件`);
    for (const t of children) expect(html).toContain(`href="#/topic/${t.id}"`);
    expect(html).toContain("名前・別名で絞り込む");
  });
  it("検索トップでも全Topic・元の質問の検索／判断材料URLを保持し、開閉対象に件数と操作ラベルを付ける", () => {
    const html = renderToStaticMarkup(<SearchBrowse />);
    for (const t of index.data.topics) expect(html).toContain(`href="#/topic/${t.id}"`);
    for (const q of QUESTION_ENTRANCES) expect(html).toContain(`href="${decisionHref(q.unit_id)}"`);
    for (const q of KNOWLEDGE_ENTRANCES) expect(html).toContain(`href="${homeHref(q.question_ja)}"`);
    expect(html).toContain("開く ＋"); expect(html).toContain("閉じる −");
    expect(html).toContain('class="count-pill"');
    for (const match of html.matchAll(/<summary id="([^"]+)"/g)) expect(html).toContain(`role="region" aria-labelledby="${match[1]}"`);
  });
});

describe("Topicの情報タブ", () => {
  it("選択タブだけをフォーカス順に置き、各パネルへ一意のARIA参照を付ける", () => {
    const html = renderToStaticMarkup(<TopicTabs initial="notes" tabs={[{ id: "notes", label: "ノート", content: <p>既存ノート</p> }, { id: "resources", label: "資料", content: <p>既存資料</p> }]} />);
    const tabs = [...html.matchAll(/<button[^>]+role="tab"[^>]*>/g)].map((m) => m[0]);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(tabs[0]).toContain('tabindex="0"');
    expect(tabs[1]).toContain('aria-selected="false"');
    expect(tabs[1]).toContain('tabindex="-1"');
    for (const tab of tabs) {
      const target = /aria-controls="([^"]+)"/.exec(tab)![1];
      const id = /\sid="([^"]+)"/.exec(tab)![1];
      expect(html).toContain(`id="${target}" role="tabpanel" aria-labelledby="${id}"`);
    }
    expect(html).toContain("既存ノート");
    expect(html).toContain("既存資料");
    expect(html.match(/hidden=""/g)).toHaveLength(1);
  });
  it("ノート・資料・判断材料を分け、検索・Sources・ゲームデータへの入口を残す", () => {
    const html = renderToStaticMarkup(<TopicPage id="recall" />);
    for (const name of ["知識ノート", "資料", "判断材料（試験）"]) expect(html).toContain(`>${name}`);
    expect(html).toContain('href="#/decisions?topic=recall"');
    expect(html).toContain('href="#/?topic=recall"');
    expect(html).toContain('href="#/sources?q=');
    expect(renderToStaticMarkup(<TopicPage id="runes" />)).toContain('href="#/data/runes"');
    expect(renderToStaticMarkup(<TopicPage id="champ-zed" />)).toContain("基本データ・スキル");
  });
  it("大きいチャンピオン分類の子Topicは、検索可能な折りたたみに置く", () => {
    const html = renderToStaticMarkup(<TopicPage id="cat-champions" />);
    expect(html).toContain('class="topic-hierarchy"');
    expect(html).toContain("下位 Topic を名前・別名で絞り込む");
    for (const t of index.childrenOf.get("cat-champions")!) expect(html).toContain(`href="#/topic/${t.id}"`);
  });
});

describe("ロール別チャンピオンのコンパクト表示", () => {
  it("推奨の最初の20体を表示し、残りのリンクも保持する。推奨以外は別の折りたたみに置く", () => {
    const data = JSON.parse(readFileSync("public/gamedata/wiki-championdata/4088335/positions.json", "utf8")) as ComponentProps<typeof RoleChampions>["data"];
    const html = renderToStaticMarkup(<RoleChampions topicId="role-top" data={data} />);
    const list = html.slice(html.indexOf('aria-label="推奨チャンピオン一覧"'), html.indexOf("</ul>"));
    expect(list.match(/<li[^>]*>/g)).toHaveLength(data.roles["role-top"].client.length);
    expect(list.match(/hidden=""/g)).toHaveLength(data.roles["role-top"].client.length - 20);
    expect(html).toContain("推奨チャンピオンをさらに20体表示する");
    expect(html).toContain('class="topic-auxiliary"');
    expect(html).toContain("このポジションのチャンピオンを検索");
  });
});
