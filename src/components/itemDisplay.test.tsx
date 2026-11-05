import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { EffectCard, ItemStatTable, PriceTable } from "./DataPages";

type Effect = ComponentProps<typeof EffectCard>["e"];
const source = { plain: "Within 700 units, take 12% more damage.", residual: false, source_sha1: "source", plain_sha1: "plain" };
const effect = (e: Effect, k = "pass") => renderToStaticMarkup(<EffectCard item="Example" k={k} e={e} tr={null} info={null} outdated={null} />);

describe("item reading layout", () => {
  it("pairs each Abyssal Mask stat label with its value without changing the snapshot", () => {
    const raw = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/items.json", "utf8"));
    const items: ComponentProps<typeof ItemStatTable>["items"] = new Map(raw.items.map((w: { name: string }) => [w.name, w]));
    const html = renderToStaticMarkup(<ItemStatTable item="Abyssal Mask" items={items} />);
    for (const [label, value] of [["体力", "350"], ["魔法防御", "45"], ["スキルヘイスト", "15"]]) expect(html).toContain(`<dt>${label}</dt><dd><strong>${value}</strong>`);
    expect(html).toContain("Module:ItemData");
  });
  it("keeps separate named effects and emphasizes literal numbers without deriving new facts", () => {
    const html = effect({ ...source, name: "First", __parts: { description2: { ...source, name: null, plain: "Additional condition." } } }) + effect({ ...source, name: "Second" }, "act");
    expect(html.match(/<section class="data-effect item-effect"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="パッシブ：First"');
    expect(html).toContain('aria-label="アクティブ：Second"');
    expect(html).toContain('class="item-effect-number">700</strong>');
    expect(html).toContain('class="item-effect-number">12%</strong>');
    expect(html).toContain("Additional condition.");
    expect(html).not.toContain("item-effect-facts");
    expect(html).toContain("日本語訳はまだありません");
    expect(html).toContain('lang="en"');
  });
  it("shows only supplied metadata including zero CD and keeps missing values absent", () => {
    const html = effect({ ...source, name: "Example", meta: { cd: "0", range: "5500", charges: "2" } });
    expect(html).toContain("<dt>クールダウン</dt><dd><strong>0秒</strong>");
    expect(html).toContain("<dt>射程</dt><dd><strong>5500</strong>");
    expect(html).toContain("<dt>チャージ</dt><dd><strong>2</strong>");
    expect(html).not.toContain("<dt>範囲</dt>");
    expect(html).not.toContain("<dt>再チャージ</dt>");
    expect(html).toContain("現行仕様の実証とは別");
  });
});

it("only reuses individually structured Wiki facts for the exact reviewed paragraph", () => {
  const raw = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/items.json", "utf8"));
  const e = raw.items.find((w: { name: string }) => w.name === "Abyssal Mask").effect_text.pass;
  const render = (item: string, text: Effect) => renderToStaticMarkup(<EffectCard item={item} k="pass" e={text} tr={null} info={null} outdated={null} />);
  const html = render("Abyssal Mask", e);
  for (const text of ["自分の周囲の敵チャンピオン", "700ユニット", "受ける魔法ダメージ +12%", "中心→対象の端", "ゲーム内は未検証"]) expect(html).toContain(text);
  expect(html).toContain("Enemy champions within");
  for (const changed of [{ ...e, source_sha1: "new" }, { ...e, plain_sha1: "new" }, { ...e, plain: "Changed condition." }, { ...e, residual: true }]) expect(render("Abyssal Mask", changed)).not.toContain('class="item-effect-highlights"');
  expect(render("Other item", e)).not.toContain('class="item-effect-highlights"');
  expect(html).not.toContain("<dt>クールダウン</dt>");
});

it("keeps price differences and unknown sell restrictions visible while ordinary source notes can expand", () => {
 const html = renderToStaticMarkup(<PriceTable rows={[{label:"購入価格",value:"2650ゴールド",note:"Data Dragon 16.21.1"},{label:"Wiki の購入価格",value:"3000ゴールド",note:"Data Dragonと異なる。現在の値は未確認"}]} />);
 expect(html).toContain("<strong>2650ゴールド</strong>");
 expect(html).toContain("<summary>出典・注意</summary>");
 expect(html).toContain("<span class=\"muted\">（Data Dragonと異なる。現在の値は未確認）</span>");
});
