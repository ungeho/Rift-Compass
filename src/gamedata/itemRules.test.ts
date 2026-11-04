// アイテムの詳しい表示の整理：値段（売却は gold.sell）・ステータスの分類と単位・公式の説明の値の欠け・固有効果の重複のルール
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectKind, groupStats, hasPlaceholderZero, limitGroupJa, priceRows, splitPlaceholderZeros, uniqueInfo, type NamedEffect } from "./itemRules";

const SNAP = "public/gamedata/wiki/2026-11-02";
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

describe("ステータスの分類と単位", () => {
  it("明示された欠損値は不明と示し、0や未掲載の項目と区別する", () => {
    const lines = groupStats({ hp: 0, ad: null, armor: undefined, mr: NaN }).flatMap((g) => g.lines);
    expect(lines.find((l) => l.key === "hp")).toMatchObject({ value: "0", zero: true });
    for (const key of ["ad", "armor", "mr"]) expect(lines.find((l) => l.key === key)).toMatchObject({ value: "不明", zero: false });
    expect(lines.some((l) => l.key === "ap")).toBe(false);
  });
  it("意味ごとに分け、固定値と割合を区別する（移動速度・物理防御貫通・基本自動回復）", () => {
    const g = groupStats({ ad: 40, lethality: 18, armpen: 30, ms: 4, msflat: 25, hp5: 100, hp5flat: 5, hp: 400, ah: 10, tenacity: 20 });
    const flat = Object.fromEntries(g.flatMap((x) => x.lines.map((l) => [l.key, `${x.label}:${l.label} ${l.value}`])));
    expect(flat.lethality).toBe("攻撃:脅威（物理防御貫通の固定値） 18");
    expect(flat.armpen).toBe("攻撃:物理防御貫通（割合） 30%");
    expect(flat.ms).toBe("ユーティリティ:移動速度（割合） 4%");
    expect(flat.msflat).toBe("ユーティリティ:移動速度（固定値） 25");
    // hp5 は基本体力自動回復に対する割合（以前の表示「体力回復（5秒）100」は単位の誤り）
    expect(flat.hp5).toBe("リソース・回復:基本体力自動回復 100%");
    expect(flat.hp5flat).toBe("リソース・回復:体力自動回復（5秒あたり） 5");
    expect(flat.tenacity).toBe("ユーティリティ:行動妨害耐性 20%");
    // 持っている分類だけ、決まった順で
    expect(g.map((x) => x.label)).toEqual(["攻撃", "防御", "リソース・回復", "ユーティリティ"]);
  });
  it("値が0のものは隠さず zero を付け、数でない値（spec）は「その他」に文字のまま", () => {
    const g = groupStats({ crit: 0, spec: "+{{adaptive|80}}" }, (s) => s.replace(/\{\{adaptive\|(\d+)\}\}/, "$1 Adaptive"));
    expect(g.find((x) => x.group === "attack")!.lines[0]).toMatchObject({ key: "crit", value: "0%", zero: true });
    expect(g.find((x) => x.group === "other")!.lines[0]).toMatchObject({ label: "そのほかの値", value: "+80 Adaptive" });
  });
});

describe("値段", () => {
  const dd = { gold: { base: 400, total: 3200, sell: 2240, purchasable: true }, from: ["3044", "3133"] };
  it("購入価格・合成費用・売却価格（gold.sell をそのまま。割合から計算しない）", () => {
    const rows = priceRows(dd, { buy: 3200, sellratio: 0.5 }, "16.21.1");
    expect(rows.map((r) => `${r.label}=${r.value}`)).toEqual(["購入価格=3200ゴールド", "合成費用=400ゴールド", "売却価格=2240ゴールド", "Wiki の売却の割合=50%"]);
    // 割合（50%）から 1600 を作らない
    expect(rows.some((r) => r.value.includes("1600"))).toBe(false);
  });
  it("購入できないアイテムは値段の欄を購入価格として示さない。無料の0は「無料」", () => {
    expect(priceRows({ gold: { base: 0, total: 0, sell: 0, purchasable: false } }, undefined, "v")[0]).toMatchObject({ label: "購入", value: "ショップで購入できない" });
    expect(priceRows({ gold: { base: 0, total: 0, sell: 0, purchasable: true } }, undefined, "v")[0].value).toBe("0ゴールド（無料）");
    expect(priceRows(undefined, undefined, "v")[0]).toMatchObject({ label: "購入価格", value: "未取得" });
    // 売却価格0は、購入できる・できない・無料のどの場合も「売れる0」と「売却不可」を区別できないと注記する（購入価格0・購入不可とは別の行）
    for (const g of [{ base: 0, total: 0, sell: 0, purchasable: false }, { base: 0, total: 0, sell: 0, purchasable: true }, { base: 450, total: 450, sell: 0, purchasable: true }]) {
      const sell = priceRows({ gold: g }, undefined, "v").find((r) => r.label === "売却価格")!;
      expect(sell.value).toBe("0ゴールド");
      expect(sell.note).toMatch(/区別できない/);
    }
    expect(priceRows(dd, undefined, "v").find((r) => r.label === "売却価格")!.note).toBe("Data Dragon の gold.sell");
  });
  it("Wiki と Data Dragon の値段が違うときは両方を示し、どちらが現在か決めない。売却できないのは明記があるときだけ", () => {
    const rows = priceRows({ ...dd, gold: { ...dd.gold, total: 3500 } }, { buy: 3450 }, "16.21.1");
    expect(rows.find((r) => r.label === "Wiki の購入価格")).toMatchObject({ value: "3450ゴールド" });
    expect(rows.find((r) => r.label === "Wiki の購入価格")!.note).toMatch(/未確認/);
    expect(rows.some((r) => r.label === "売却")).toBe(false);
    const ns = priceRows({ gold: { base: 450, total: 450, sell: 0, purchasable: true } }, {}, "v", "Role Binding: ... Cannot be resold to the shop.");
    expect(ns.find((r) => r.label === "売却")).toMatchObject({ value: "売却できない" });
    expect(priceRows(dd, { sell: "No Sell" }, "v").find((r) => r.label === "売却")!.note).toMatch(/No Sell/);
  });
});

describe("公式の説明（Data Dragon）の値の欠け", () => {
  it("単独の 0 だけを印にし、0.25・10・-3 などは印にしない", () => {
    const parts = splitPlaceholderZeros("毎秒0の魔法ダメージ。0.25秒後に10ダメージ(0秒)。-3%。");
    expect(parts.filter((p) => p.zero).length).toBe(2);
    expect(parts.map((p) => p.text).join("")).toBe("毎秒0の魔法ダメージ。0.25秒後に10ダメージ(0秒)。-3%。");
    expect(hasPlaceholderZero("体力を15秒間かけて120回復する。")).toBe(false);
  });
  it("実データ：Black Hole Gauntlet の公式の説明（日本語）に値の欠けがあり、英語では空欄", () => {
    const dd = readJson("public/gamedata/ddragon/16.21.1/items.json").items.find((x: { name: { en: string } }) => x.name.en === "Black Hole Gauntlet");
    expect(hasPlaceholderZero(dd.description.ja)).toBe(true);
    expect(dd.description.en).toMatch(/take {2}magic damage/);
  });
});

describe("効果の種類と固有効果の重複のルール", () => {
  const table: NamedEffect[] = [
    { name: "Lifeline", kind: "shared", items: ["Sterak's Gage", "Maw of Malmortius"] },
    { name: "Spellblade", kind: "shared", items: ["Sheen", "Trinity Force"] },
    { name: "Anguish", kind: "isolated", items: ["Unending Despair"] },
  ];
  const names = new Map([["Sterak's Gage", ["Lifeline"]], ["Maw of Malmortius", ["Lifeline"]], ["Divine Sunderer", ["Spellblade"]], ["Sheen", ["Spellblade"]], ["A", ["Foo"]], ["B", ["Foo"]]]);
  it("種類：pass・act・consume と、description2 は親の効果の種類", () => {
    expect([effectKind("pass"), effectKind("pass2"), effectKind("act"), effectKind("consume"), effectKind("pass.description2")]).toEqual(["パッシブ", "パッシブ", "アクティブ", "消費時の効果", "パッシブ"]);
  });
  it("表に載っているときだけ共有・単独と決める。CD の共有は決めず、共有の効果で CD があるときに未確認として示す", () => {
    expect(uniqueInfo("Sterak's Gage", "Lifeline", true, table, names)).toMatchObject({ status: "shared_listed", cooldownRuleUnconfirmed: true, sameNameItems: ["Maw of Malmortius"] });
    expect(uniqueInfo("Unending Despair", "Anguish", false, table, names)).toMatchObject({ status: "isolated_listed", cooldownRuleUnconfirmed: false });
  });
  it("名前が同じだけでは決めない：表にこのアイテムがない・表に名前がない → 未確認", () => {
    // Divine Sunderer は Spellblade の名前を持つが、表の Spellblade に載っていない
    expect(uniqueInfo("Divine Sunderer", "Spellblade", true, table, names)).toMatchObject({ status: "listed_other_items", cooldownRuleUnconfirmed: false, sameNameItems: ["Sheen"] });
    expect(uniqueInfo("A", "Foo", true, table, names)).toMatchObject({ status: "unlisted", cooldownRuleUnconfirmed: false, sameNameItems: ["B"] });
  });
  it("同時に持てる数の制限の日本語（Template:Item limit の分岐）", () => {
    expect(limitGroupJa("legendary")).toMatch(/同じアイテムは1つまで/);
    expect(limitGroupJa("Lifeline")).toBe("「Lifeline」グループのアイテムは1つまで");
    expect(limitGroupJa("Elixir")).toMatch(/置き換わる/);
  });
});

describe("取り込んだアイテムのデータ", () => {
  const items = readJson(`${SNAP}/items.json`).items as { name: string; effect_text?: Record<string, { plain: string; meta?: Record<string, unknown>; ref?: string; part_of?: string }>; limit_text?: { plain: string }; limit_groups?: { group: string }[] }[];
  const by = new Map(items.map((x) => [x.name, x]));
  it("文字列だけの消費効果（体力ポーション）・description2・参照（=>）・制限の文と同時に持てる数", () => {
    expect(by.get("Health Potion")!.effect_text!.consume.plain).toBe("Restores 4 health every 0.5 seconds over 15 seconds, restoring a total of 120 health.");
    expect(by.get("Health Potion")!.limit_text!.plain).toBe("Limited to 5 at a time.");
    expect(by.get("Titanic Hydra")!.effect_text!["act.description2"]).toMatchObject({ part_of: "act" });
    expect(by.get("Armored Advance")!.effect_text!.pass.ref).toBe("Plated Steelcaps");
    expect(by.get("Sterak's Gage")!.limit_groups!.map((x) => x.group)).toEqual(["Lifeline"]);
    expect(by.get("Sterak's Gage")!.effect_text!.pass2.meta).toEqual({ unique: true, cd: "90" });
    expect(by.get("Thornmail")!.limit_groups!.map((x) => x.group)).toEqual(["legendary"]);
  });
  it("Named item effect の表（名前とアイテムだけ）と出典、古い可能性の印", () => {
    const r = readJson(`${SNAP}/item_rules.json`);
    expect(r.named_effects_outdated_if_new_patch).toBe("26.11");
    expect(r.named_effects.find((x: NamedEffect) => x.name === "Lifeline")).toMatchObject({ kind: "shared" });
    expect(r.named_effects.every((x: object) => !("description" in x))).toBe(true);
    expect(Object.keys(r.sources)).toEqual(["Named item effect", "Item", "Template:Item limit", "Module:ItemData/getter"]);
  });
  it("アイテムの訳：効果・消費効果・制限の文まで、すべて AI・未レビュー（人によるレビュー済みは0）", () => {
    const tr = readJson(`${SNAP}/translations/ja/items.json`);
    const es = Object.values(tr.entries) as { status: string }[];
    expect(es.length).toBe(448);
    expect(es.every((e) => e.status === "ai_translated_unreviewed")).toBe(true);
    expect(tr.entries["Health Potion#consume"].ja).toMatch(/120/);
  });
});
