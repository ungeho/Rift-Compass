import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ComponentProps, ReactElement } from "react";
import { DataPage, EffectCard, HistoryLine, ItemStatTable, ItemModeList, ItemMatchNotice, ItemVersionReview, SECTIONS } from "./DataPages";

import { ITEM_REVIEWS, itemReviewFor } from "../gamedata/itemReviews";

import { matchItemData, priceRows, resolveItemModes, type ItemReferenceData } from "../gamedata/itemRules";

describe("参照を含むモード一覧", () => {
  it("直接値・参照値は解決後のモード名を表示し、参照文字列の文字位置を表示しない", () => {
    const data = new Map<string, ItemReferenceData>([["A", { modes: "=>B" }], ["B", { modes: { "classic sr 5v5": true, aram: false } }]]);
    for (const name of ["A", "B"]) {
      const html = renderToStaticMarkup(<ItemModeList mode={resolveItemModes(name, data)} />);
      expect(html).toContain("classic sr 5v5");
      expect(html).not.toContain("aram");
      expect(html).not.toContain("0・1");
    }
  });
  it("参照が解決できない場合、非対応やモード名を推測しない", () => {
    const data = new Map<string, ItemReferenceData>([["A", { modes: "=>missing" }]]);
    const html = renderToStaticMarkup(<ItemModeList mode={resolveItemModes("A", data)} />);
    expect(html).toContain("不明（対応モードを確定できません）");
    expect(html).not.toContain("記載なし");
    expect(html).not.toContain("0・1");
  });
});

describe("旧Wiki Moduleと対象時点の公式情報", () => {
  const dd = JSON.parse(readFileSync("public/gamedata/ddragon/16.21.1/items.json", "utf8")).items;
  it.each(ITEM_REVIEWS)("$name：公式原文・出典・素材・SR・未確認事項を分ける", (r) => {
    const d = dd.find((d: { id: number }) => d.id === r.id);
    const html = renderToStaticMarkup(<ItemVersionReview assessment={itemReviewFor(r.name, r.id, r.moduleModified, "16.21.1")!} dd={d} version="16.21.1" officialItems={dd} />);
    for (const text of ["旧仕様", "現行仕様として使用せず", "16.21.1", "26.21", "推定", "対象はSR", "公式の英語原文", "未確認事項", "ゲーム内検証済みを意味しません"]) expect(html).toContain(text);
    expect(html).toContain('lang="en"');
    expect(html).toContain(d.description.en.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    expect(html).toContain(`/cdn/16.21.1/data/en_US/item.json`);
    for (const id of d.from) expect(html).toContain(`ID ${id}`);
    for (const c of r.changes) { expect(html).toContain(c.url); expect(html).toContain(c.patch); }
  });
  it("公式対応不明や更新後は旧Wikiで補完せず、再確認待ちを明示する", () => {
    const r = ITEM_REVIEWS[0];
    const html = renderToStaticMarkup(<ItemVersionReview assessment={itemReviewFor(r.name, r.id, r.moduleModified, "next-version")!} version="next-version" officialItems={[]} />);
    expect(html).toContain("再確認待ち");
    expect(html).toContain("旧Wikiから現行値を補いません");
    expect(html).not.toContain("公式の英語原文");
  });
});

describe("公式アイテムの対応状態", () => {
  it("実際のZephyrを未確認とし、候補・版・Wikiレコードを示して価格を流用しない", () => {
    const wiki = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/items.json", "utf8")).items;
    const dd = JSON.parse(readFileSync("public/gamedata/ddragon/16.21.1/items.json", "utf8")).items;
    const r = matchItemData(wiki, dd).get("Zephyr")!;
    const html = renderToStaticMarkup(<ItemMatchNotice match={r} version="16.21.1" sr={false} />);
    for (const text of ["対応は未確認", "Gunmetal Greaves", "Zephyr", "16.21.1", "公式名・説明・価格は結合せず"]) expect(html).toContain(text);
    const rows = priceRows(r.official as undefined, { buy: 2500 }, "16.21.1", undefined, true);
    expect(rows[0]).toMatchObject({ value: "対応未確認" });
    expect(rows.some((r) => r.label === "Wiki の購入価格" && r.value === "2500ゴールド")).toBe(true);
    expect(rows.some((r) => r.label === "売却価格")).toBe(false);
  });
  it("公式データなしと対応未確認を区別し、同名でもモードの差は併記する", () => {
    expect(renderToStaticMarkup(<ItemMatchNotice match={{ status: "missing", candidates: [], wikiNames: ["A"] }} version="x" sr={null} />)).toContain("同じIDのデータはありません");
    const d = { id: 1, name: { en: "A", ja: "日本語" }, maps: { "11": false } };
    const html = renderToStaticMarkup(<ItemMatchNotice match={{ status: "matched", official: d, candidates: [d], wikiNames: ["A"] }} version="x" sr={true} />);
    expect(html).toContain("モード情報に差があります");
    expect(html).toContain("どちらが現行かは未確認");
  });
});

describe("アイテムの参照ステータスの表示", () => {
  it("数値と単位を示し、元と参照先へのリンクを保持する", () => {
    const raw = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/items.json", "utf8"));
    const items: ComponentProps<typeof ItemStatTable>["items"] = new Map(raw.items.map((w: { name: string }) => [w.name, w]));
    const html = renderToStaticMarkup(<ItemStatTable item="Chainlaced Crushers" items={items} />);
    expect(html).toContain("行動妨害耐性 30%");
    expect(html).toContain("参照値：");
    for (const name of ["Chainlaced Crushers", "Mercury's Treads"]) expect(html).toContain(`href="${items.get(name)!.source.url.replace(/'/g, "&#x27;")}"`);
    expect(html).not.toContain("=&gt;");
    const direct = renderToStaticMarkup(<ItemStatTable item="Boots" items={items} />);
    expect(direct).toContain("移動速度（固定値） 25");
    expect(direct).not.toContain("参照値：");
  });
  it("参照失敗を不明と理由で示し、0に補完しない", () => {
    const items: ComponentProps<typeof ItemStatTable>["items"] = new Map([["A", { name: "A", source: { title: "A", url: "https://example.com/a", status: 200, last_modified: null }, data: { stats: { hp: "=>missing", crit: 0 } } }]]);
    const html = renderToStaticMarkup(<ItemStatTable item="A" items={items} />);
    expect(html).toContain("体力 不明");
    expect(html).toContain("参照先の記録なし");
    expect(html).toContain("クリティカル率 0%（0）");
  });
});

describe("ゲームデータのページ（一覧）", () => {
  it("アイテム・ルーン・サモナースペル・モンスター・記事の区分と、出典・未検証の注記を示す", () => {
    const html = renderToStaticMarkup(<DataPage section="" />);
    for (const s of SECTIONS) expect(html).toContain(`#/data/${s.id}`);
    expect(html).toContain("Data Dragon");
    expect(html).toContain("CC BY-SA 3.0");
    expect(html).toContain("ゲーム内では検証していません");
    expect(html).toContain("サモナーズリフト用とモード専用");
  });
  it("各区分は読み込み中の表示から始まる（ファイルは開いたときに読む）", () => {
    expect(renderToStaticMarkup(<DataPage section="items" />)).toContain("読み込んでいます");
  });
});

describe("同じパッチ番号の変更履歴", () => {
  type History = NonNullable<ComponentProps<typeof HistoryLine>["h"]>;
  type Versions = NonNullable<History["versions"]>;
  const { entries } = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/history/items.json", "utf8")) as { entries: Record<string, History> };
  const history = entries["Faerie Charm"];
  const versions = history.versions!.filter((v) => v.version === "V9.23");
  const keys = (vs: Versions) => {
    const tree = HistoryLine({ h: { ...history, versions: vs } });
    return (tree.props.children[1].props.children as ReactElement[]).map((row) => row.key);
  };
  it("実データのV9.23を両方残し、別の行の挿入・順序変更でも各履歴のキーを維持する", () => {
    expect(versions).toHaveLength(2);
    const original = keys(versions);
    expect(new Set(original).size).toBe(2);
    expect(keys(versions)).toEqual(original);
    expect(keys([{ version: "V26.21", subjects: [], lines: 1 }, ...versions]).slice(1)).toEqual(original);
    expect(keys([...versions].reverse())).toEqual([...original].reverse());
    const html = renderToStaticMarkup(<HistoryLine h={{ ...history, versions }} />);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html.match(/V9\.23/g)).toHaveLength(2);
  });
  it("内容まで同じ履歴も削除せず、一意で再描画時に安定したキーを付ける", () => {
    const repeated = [versions[0], { ...versions[0] }];
    expect(new Set(keys(repeated)).size).toBe(2);
    expect(keys(repeated)).toEqual(keys(repeated));
    const html = renderToStaticMarkup(<HistoryLine h={{ ...history, versions: repeated }} />);
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
});

describe("アイテム効果の説明と翻訳状態", () => {
  type Effect = ComponentProps<typeof EffectCard>["e"];
  const text = { plain: "Deals 0 damage. ⟦unknown⟧", residual: false, source_sha1: "source", plain_sha1: "plain" };
  const render = (e: Effect, tr: ComponentProps<typeof EffectCard>["tr"] = null, k = "pass") => renderToStaticMarkup(
    <EffectCard item="Example" k={k} e={e} tr={tr} info={null} outdated={null} />,
  );
  it("パッシブとアクティブ、固有効果の名前・CD0・複数段落を欠落させない", () => {
    const e = { ...text, name: "First effect", meta: { unique: true, cd: "0" }, __parts: { "pass.description2": { ...text, plain: "Second paragraph.", name: null } } };
    const html = render(e);
    expect(html).toContain("パッシブ");
    expect(html).toContain("固有（Unique）");
    expect(html).toContain("First effect");
    expect(html).toContain("クールダウン 0秒");
    expect(html).toContain("Deals 0 damage.");
    expect(html).toContain("Second paragraph.");
    expect(html).toContain("［解析できない記法］");
    expect(html).not.toContain("⟦");
    expect(render({ ...text, name: "Second effect" }, null, "act")).toContain("アクティブ");
  });
  it("有効な日本語訳を原文より先に示し、未翻訳・古い訳・解析保留を区別する", () => {
    const e = { ...text, name: null };
    const tr = { entries: { "Example#pass": { source_sha1: "source", plain_sha1: "plain", ja: "0ダメージを与える。", status: "ai_translated_unreviewed" } } };
    const html = render(e, tr);
    expect(html).toContain("0ダメージを与える。");
    expect(html).toContain("Deals 0 damage.");
    expect(html.indexOf("0ダメージを与える。")).toBeLessThan(html.indexOf("Deals 0 damage."));
    expect(render(e)).toContain("日本語訳はまだありません");
    const stale = { entries: { "Example#pass": { ...tr.entries["Example#pass"], plain_sha1: "old" } } };
    expect(render(e, stale)).toContain("古い訳は表示しません");
    expect(render(e, stale)).not.toContain("0ダメージを与える。");
    const residual = render({ ...e, residual: true }, tr);
    expect(residual).toContain("翻訳を保留しています");
    expect(residual).not.toContain("0ダメージを与える。");
    expect(residual).toContain("Deals 0 damage.");
  });
});
