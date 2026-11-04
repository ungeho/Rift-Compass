import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { DataPage, EffectCard, SECTIONS } from "./DataPages";

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
