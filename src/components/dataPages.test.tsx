import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataPage, SECTIONS } from "./DataPages";

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
