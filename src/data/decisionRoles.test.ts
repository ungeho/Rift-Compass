import { describe, expect, it } from "vitest";
import { decisionsForQuery } from "./decisions";

describe("ロールの Topic と判断材料の対象ロール（2026-11-02 に5ロールへ拡張）", () => {
  it("「ボットレーン」を含む Lv2 の質問で、ボット向けとロール共通の判断材料の両方に届く", () => {
    const ids = decisionsForQuery("ボットレーンで先にレベル2になるには、2ウェーブ目のどこまでミニオンを倒せばいい？").map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining(["du-lv2-duo-minion-count", "du-trade-checklist", "du-lvl1-contest-or-concede"]));
  });
  it("ロールの大分類だけでは判断材料を出さない（具体的な Topic が要る）", () => {
    expect(decisionsForQuery("ボットレーン")).toEqual([]);
    expect(decisionsForQuery("ジャングル")).toEqual([]);
  });
});
