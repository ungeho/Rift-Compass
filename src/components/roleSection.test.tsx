import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleChampions, resourcesMentioningRole, ROLE_GUIDE_TOPICS } from "./RoleSection";
import { TopicPage } from "./TopicPages";
import { index } from "../data/dataset";
import { decisionsForRole } from "../data/decisions";

const root = join(__dirname, "../..");
const manifest = JSON.parse(readFileSync(join(root, "public/gamedata/manifest.json"), "utf8"));
const positions = JSON.parse(readFileSync(join(root, `public/gamedata/wiki-championdata/${manifest.current.wiki_championdata}/positions.json`), "utf8"));
const ROLES = ["role-top", "role-jungle", "role-mid", "role-bot", "role-support"];

describe("ポジションのページから、そのポジションのチャンピオンへ", () => {
  it("5ポジションの推奨（client）から、全173チャンピオンに届く。フレックスは複数のポジションに出る", () => {
    const reached = new Map<string, number>();
    for (const r of ROLES) for (const c of positions.roles[r].client) reached.set(c.id, (reached.get(c.id) ?? 0) + 1);
    expect(reached.size).toBe(173);
    expect([...reached.values()].some((n) => n > 1)).toBe(true);
    for (const r of ROLES) for (const c of [...positions.roles[r].client, ...positions.roles[r].external]) expect(index.topicById.get(c.topic_id)?.parent_ids).toContain("cat-champions");
  });
  it("チャンピオンはロールの子にしない（Topic の親子は変えず、一覧はデータから出す）", () => {
    for (const t of index.data.topics) expect(t.parent_ids.some((p) => ROLES.includes(p))).toBe(false);
  });
  it("画面：推奨と、推奨にない統計サイトでの使用を分け、出典の revid を示す", () => {
    const html = renderToStaticMarkup(<RoleChampions topicId="role-top" data={positions} />);
    expect(html).toContain("Riot クライアントの推奨");
    expect(html).toContain(`revid ${manifest.current.wiki_championdata}`);
    expect(html).toContain("#/topic/champ-darius");
    expect(html).toContain("#/topic/cat-champions");
  });
  it("ポジションのページ：ロールクエストのノート（現在の値と、置き換わった 26.1 の値）に届く", () => {
    const html = renderToStaticMarkup(<TopicPage id="role-top" />);
    expect(html).toContain("トップのロールクエスト");
    expect(html).toContain("レベル上限20");
    expect(html).toContain("26.1 の導入時");
    expect(html.indexOf("トップのロールクエスト：")).toBeLessThan(html.indexOf("（26.1 の導入時）")); // 旧仕様は後ろ
  });
  it("関連 Topic の案内は存在する Topic だけ。判断材料はロールを明記したものだけ", () => {
    for (const ids of Object.values(ROLE_GUIDE_TOPICS)) for (const id of ids) expect(index.topicById.has(id)).toBe(true);
    for (const u of decisionsForRole("role-bot")) expect(u.scope.roles).toContain("bot");
    expect(resourcesMentioningRole("role-support").length).toBeGreaterThan(0);
  });
});
