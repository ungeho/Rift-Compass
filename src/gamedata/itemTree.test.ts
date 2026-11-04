import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { displayItemName, itemCategory, itemIconUrl, relationNodes, treePrice, type TreeItem } from "./itemTree";
import { matchItemData } from "./itemRules";
import { ItemTree } from "../components/ItemTree";
import { itemHref, parseHash } from "../router";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const official: TreeItem[] = read("public/gamedata/ddragon/16.21.1/items.json").items;
const wiki = read("public/gamedata/wiki/2026-11-02/items.json").items;
const matches = matchItemData(wiki, official);
const sample = (id: number, from?: string[], into?: string[]): TreeItem => ({ id, name: { en: `Item ${id}`, ja: `品 ${id}` }, maps: { "11": true }, gold: { total: 100, base: 100, sell: 70, purchasable: true }, from, into });
const render = (current: TreeItem | undefined, all = official) => renderToStaticMarkup(createElement(ItemTree, { current, all, matches, version: "16.21.1" }));

describe("アイテム合成関係", () => {
  it("一意な公式ノードだけ同じ版のCDN画像を使い、Wiki IDだけから生成しない", () => {
    const d = official.find((d) => d.id === 1001)!;
    expect(itemIconUrl("16.21.1", d, official)).toBe("https://ddragon.leagueoflegends.com/cdn/16.21.1/img/item/1001.png");
    expect(itemIconUrl("16.20.1", d, official)).toContain("/16.20.1/");
    expect(itemIconUrl("16.21.1", { ...d, name: { en: "another wiki item", ja: null } }, official)).toBeNull();
    expect(itemIconUrl("16.21.1", d, [...official, d])).toBeNull();
    expect(itemIconUrl("16.21.1", d, [])).toBeNull();
    for (const version of ["latest", "../../x", "https://example.com", "16.21.1?x", ""]) expect(itemIconUrl(version, d, official)).toBeNull();
    expect(itemIconUrl("16.21.1", sample(-1), [])).toBeNull();
  });
  it("素材・選択中・上位候補を画像と名前で示し、寸法・遅延読み込み・装飾用altを持つ", () => {
    const a = sample(1, ["2"], ["3"]), all = [a, sample(2), sample(3)];
    const html = render(a, all);
    for (const id of [1, 2, 3]) expect(html).toContain(`/cdn/16.21.1/img/item/${id}.png`);
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html.match(/loading="lazy"/g)).toHaveLength(3);
    expect(html).toContain('alt="" width="40" height="40"');
    for (const s of ["品 1", "品 2", "品 3", "100G", "名前・価格・詳細リンクは利用できます"]) expect(html).toContain(s);
  });
  it("未結合Wikiには他アイテムの画像を使わず、公式単独ノードでは表示できる", () => {
    const blocked = render(matches.get("Zephyr")?.official as TreeItem | undefined);
    expect(blocked).not.toContain("<img");
    const d = official.find((d) => d.id === 3172)!;
    expect(render(d)).toContain("/img/item/3172.png");
    const standalone = sample(123456, [], []);
    expect(render(standalone, [standalone])).toContain("/img/item/123456.png");
  });
  it("ID重複・参照先欠損では代替枠を出し、情報と遷移先を残す", () => {
    const a = sample(1, ["2", "3"], []), all = [a, sample(2), sample(2)];
    const html = render(a, all);
    expect(html.match(/item-icon-placeholder/g)).toHaveLength(2);
    expect(html).not.toContain("/img/item/2.png");
    expect(html).not.toContain("/img/item/3.png");
    expect(html).toContain(itemHref("dd:2")); expect(html).toContain(itemHref("dd:3"));
    expect(html).toContain("参照先未収録");
  });
  it("単純な関係・複数の素材・上位分岐を元の順序で保つ", () => {
    const a = sample(1, ["2", "3"], ["4", "5"]), all = [a, sample(2), sample(3), sample(4), sample(5)];
    expect(relationNodes(a, "from", all)?.map((n) => n.id)).toEqual(["2", "3"]);
    expect(relationNodes(a, "into", all)?.map((n) => n.id)).toEqual(["4", "5"]);
    expect(render(a, all)).toContain("品 5");
    expect(render(a, all)).toContain("16.21.1");
  });
  it("同じ素材の個数を保持し、レシピの数量を消さない", () => {
    const d = official.find((d) => d.id === 4005)!;
    expect(relationNodes(d, "from", official)?.map((n) => [n.id, n.count])).toEqual([["1052", 2], ["4642", 1]]);
    expect(render(d)).toContain("×2個");
  });
  it("空の登録と、項目が未収録の場合を区別する", () => {
    expect(relationNodes(sample(1, []), "from", [])).toEqual([]);
    expect(relationNodes(sample(1), "from", [])).toBeNull();
    expect(render(sample(1, [], []))).toContain("素材の登録はありません");
    expect(render(sample(1))).toContain("この方向の合成情報は未収録");
  });
  it("欠損・ID重複は未確認にし、自己参照・循環は再帰展開しない", () => {
    const a = sample(1, ["1", "2", "3", "4"]), b = sample(2, ["1"]);
    const all = [a, b, sample(3), sample(3)];
    const nodes = relationNodes(a, "from", all)!;
    expect(nodes.map((n) => n.status)).toEqual(["ok", "ok", "ambiguous", "missing"]);
    expect(nodes.slice(0, 2).every((n) => n.cyclic)).toBe(true);
    const html = render(a, all);
    for (const s of ["参照先未収録", "同じIDが複数", "循環・自己参照"]) expect(html).toContain(s);
  });
  it("多数の上位候補を固定件数で切り捨てない", () => {
    const targets = Array.from({ length: 80 }, (_, i) => sample(i + 2));
    const d = sample(1, [], targets.map((d) => String(d.id)));
    const html = render(d, [d, ...targets]);
    for (const target of targets) expect(html).toContain(itemHref(`dd:${target.id}`));
  });
  it("C-3の未確認対応では合成関係を流用しない。公式単独ノードは公式詳細へ進む", () => {
    expect(render(matches.get("Zephyr")?.official as TreeItem | undefined)).toContain("合成関係は確認待ち");
    expect(render(matches.get("Zephyr")?.official as TreeItem | undefined)).not.toContain("ガンメタル");
    expect(render(sample(123456, [], []))).toContain(itemHref("dd:123456"));
    const d = official.find((d) => d.id === 3172)!;
    expect(render(d)).toContain(itemHref("wiki:Gunmetal Greaves"));
    expect(render(d)).not.toContain(itemHref("wiki:Zephyr"));
  });
  it("C-4の3レシピは公式のfromだけを使い、旧Wiki素材で補完しない", () => {
    for (const [id, from] of [[3508, ["3057", "3133", "1018"]], [3179, ["3134", "3133"]], [4005, ["1052", "4642"]]] as const) {
      const d = official.find((d) => d.id === id)!;
      expect(relationNodes(d, "from", official)?.map((n) => n.id)).toEqual(from);
    }
    expect(relationNodes(official.find((d) => d.id === 3508)!, "from", official)?.some((n) => n.id === "1037")).toBe(false);
  });
  it("モード差・購入不可・特殊アップグレードを通常購入と断定しない", () => {
    const d = { ...sample(1, ["2"], []), maps: { "11": false, "30": true }, gold: { base: 0, total: 0, sell: 0, purchasable: false } };
    const html = render(d, [d, sample(2)]);
    for (const s of ["SR：", "非対応", "30", "購入不可", "通常合成か特殊アップグレードかは未確認"]) expect(html).toContain(s);
    expect(treePrice(d)).not.toContain("無料");
    expect(itemCategory({ champion: ["Gangplank"] }, d)).toContain("特殊");
    expect(itemCategory({ type: ["Turret"] }, d)).toContain("施設");
    expect(itemCategory({ type: ["Legendary"] }, sample(2))).toContain("購入可");
  });
  it("詳細URLはWiki名と公式IDを区別し、既存URLも維持する", () => {
    expect(parseHash(itemHref("wiki:Death's Daughter"))).toEqual({ name: "data", section: "items", item: "wiki:Death's Daughter" });
    expect(parseHash(itemHref("dd:1001"))).toEqual({ name: "data", section: "items", item: "dd:1001" });
    expect(parseHash("#/data/items")).toEqual({ name: "data", section: "items" });
    expect(displayItemName("<rarityLegendary>Name</rarityLegendary><br>500 tokens")).toBe("Name");
  });
});
