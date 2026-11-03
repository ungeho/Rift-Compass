// 視界・命中の確認・位置の検知の正式登録（2026-11-03）：仕様・導出・戦術的推論の区別
import { describe, expect, it } from "vitest";
import { index } from "./dataset";
import { search } from "../search/search";

const note = (id: string) => {
  const n = index.noteById.get(id);
  if (!n) throw new Error(`note ${id} がない`);
  return n;
};
const premises = (id: string) => index.data.relations.filter((r) => r.to === id && r.type === "reason_for").map((r) => r.from);

describe("命中の確認・位置の検知（原典の仕様）", () => {
  it("エズリアル Q はスペルシールドで防がれても CD が短くなる。E の可視化は通常の視界", () => {
    expect(note("kn-ezreal-q-hit-cdr").statement_ja).toContain("スペルシールドで防がれても、クールダウンの短縮は起きる");
    expect(note("kn-ezreal-e-homing-reveal").notes_ja).toContain("通常の視界");
  });
  it("アッシュ E のピンは見た目だけで、実際には可視化しない", () => {
    expect(note("kn-ashe-e-hawkshot").statement_ja).toContain("実際には可視化せず");
  });
  it("カイ＝サ W とフィドルスティックス W は真の視界、スウェイン W とホライゾンフォーカスは通常の視界", () => {
    expect(note("kn-kaisa-w-reveal").statement_ja).toContain("真の視界");
    expect(note("kn-fiddlesticks-w-tether").notes_ja).toContain("真の視界のスキルの一覧");
    expect(note("kn-swain-w-vision").notes_ja).toContain("通常の視界");
    expect(note("kn-horizon-focus-hypershot").notes_ja).toContain("ステルス中の敵は見えるようにならない");
  });
  it("カタリナ R の位置の露出は Wiki が不具合と書くので、例外として分ける", () => {
    const n = note("kn-katarina-r-self-reveal");
    expect(n.statement_ja).not.toContain("4.5秒");
    expect(n.exceptions_ja?.join("")).toContain("不具合");
  });
  it("ホライゾンフォーカスは V26.01 の変更と、Module のデータの食い違いを残す", () => {
    const n = note("kn-horizon-focus-hypershot");
    expect(n.historical?.valid_from).toBe("V26.01");
    expect(n.notes_ja).toContain("反映されていない");
  });
  it("ザイラのいばらのエフェクトは E（捕縛の根）", () => {
    expect(note("kn-skillshot-hits-stealth").statement_ja).toContain("ザイラ E（捕縛の根）");
    expect(note("kn-checking-brush-methods").statement_ja).not.toContain("ザイラ Q");
  });
});

describe("導出と戦術的推論", () => {
  it("命中で分かる対象の種類（導出）は、各スキルのノートを前提に持つ", () => {
    expect(note("kn-hit-confirmation-target-kind").status).toBe("derived");
    expect(premises("kn-hit-confirmation-target-kind")).toEqual(expect.arrayContaining(["kn-soraka-q-rejuvenation", "kn-kaisa-w-reveal", "kn-neeko-q-bloom", "kn-mundo-q-refund", "kn-ezreal-q-hit-cdr"]));
  });
  it("ラックス E でブッシュを見る推論は、ブッシュの規則とラックス E の仕様を前提にし、ステルスを例外にする", () => {
    const n = note("kn-tactic-lux-e-brush");
    expect(n.status).toBe("tactical_inference");
    expect(premises(n.id)).toEqual(expect.arrayContaining(["kn-brush-sight-rule", "kn-lux-e-sight"]));
    expect(n.exceptions_ja?.join("")).toContain("ステルス");
  });
});

describe("検索", () => {
  it("チャンピオンのスキルの資料は「視界・ワード」の Topic を付けず、昔の視界管理の質問の上位を占めない", () => {
    for (const id of ["res-wiki-ezreal", "res-wiki-ashe", "res-wiki-soraka", "res-wiki-horizon-focus"]) expect(index.resourceById.get(id)?.topic_ids).not.toContain("vision");
    const hits = search("昔の視界管理の知識は今も利用できる？").hits.map((h) => h.resource.id);
    expect(hits.slice(0, 8)).toEqual(expect.arrayContaining(["res-wiki-sight-ward", "res-engadget-wards-2014", "res-wiki-v3-14"]));
  });
});
