// 2026-11-09 のカイティングの収録（知識抽出の第2回 J1〜J10、LoL Theory「Kiting」）の回帰テスト。apply で正式データに反映した最初の収録。
// 記録：docs/experiments/kiting-intake-pilot.md
import { describe, expect, it } from "vitest";
import { index, isPublic } from "./dataset";
import { isPublicNote, publicEvidenceOf } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";

const RES = "res-loltheory-kiting";
const NEW_NOTES = [
  "kn-aa-windup-cancel",
  "kn-kite-vs-stutter-step",
  "kn-attack-move-click",
  "kn-kite-learning-champions",
  "kn-kite-stats",
  "kn-as-cap-3003",
  "kn-anti-kite-tools",
  "kn-anti-kite-terrain",
  "kn-kite-practice-drill",
];
const textOf = (id: string) => {
  const n = index.noteById.get(id)!;
  return [n.statement_ja, ...(n.conditions_ja ?? []), ...(n.exceptions_ja ?? []), n.notes_ja ?? ""].join(" ");
};
const fullIds = (q: string) => noteMatchesForQuery(q).matches.filter((m) => m.tier === "full").map((m) => m.note.id);

describe("カイティングの収録（第2回 J）", () => {
  it("原典を公開対象の正式資料（L3・無料）として1件だけ登録し、新しいノート9件はすべて公開対象", () => {
    const r = index.resourceById.get(RES)!;
    expect(r.url).toBe("https://blog.loltheory.gg/kiting-lol/");
    expect(isPublic(r)).toBe(true);
    for (const id of NEW_NOTES) expect(isPublicNote(index.noteById.get(id)!), id).toBe(true);
    // 仕様のノートは Wiki の根拠を持つ
    expect(publicEvidenceOf("kn-aa-windup-cancel").map((e) => e.resource_id)).toEqual([RES, "res-wiki-attack-speed"]);
    expect(publicEvidenceOf("kn-as-cap-3003").map((e) => e.resource_id)).toEqual(["res-wiki-attack-speed", RES]);
  });

  it("既存ノートへの変更は、根拠2件の追加と補足への追記1件だけ", () => {
    expect(publicEvidenceOf("kn-kite-timing").map((e) => e.resource_id)).toEqual(["res-lolninja-tol2-aa", RES]);
    expect(publicEvidenceOf("kn-attack-move-settings").map((e) => e.resource_id)).toEqual(["res-lolninja-tol2-aa", RES]);
    expect(index.noteById.get("kn-attack-move-settings")!.notes_ja).toMatch(/^設定の名前は2022年のクライアントの表記。/);
    expect(index.noteById.get("kn-attack-move-settings")!.notes_ja).toContain("res-loltheory-kiting");
  });

  it("J6（グインソー）は保留：公開するノートに入れていない。J7 の原典の誤り（E の根・アイテムの突進）を本文に入れていない", () => {
    for (const id of NEW_NOTES) expect(textOf(id), id).not.toContain("グインソー");
    expect(fullIds("グインソー")).toEqual([]);
    for (const id of NEW_NOTES) expect(index.noteById.get(id)!.statement_ja, id).not.toMatch(/ラックス|ストライドブレイカー|突進とスロウ/);
    // ハード CC は効果の種類の意味で、必中の意味ではないことを書いている
    expect(index.noteById.get("kn-anti-kite-tools")!.notes_ja).toContain("「必ず当たる CC」の意味ではない");
    // 練習期間は著者の目安で、保証ではない
    expect(index.noteById.get("kn-kite-practice-drill")!.notes_ja).toContain("習得にかかる期間の保証ではない");
  });

  it("参照文だけの偶然の一致を作らない（M1 型の再発防止）：補足で触れたチャンピオン・アイテムの名前で J7 のノートが出ない", () => {
    expect(fullIds("ラックス")).not.toContain("kn-anti-kite-tools");
    expect(fullIds("ストライドブレイカー")).not.toContain("kn-anti-kite-tools");
    expect(fullIds("グインソー")).not.toContain("kn-kite-stats");
    expect(fullIds("オーブウォーク")).toEqual(["kn-kite-vs-stutter-step"]);
    expect(fullIds("攻撃速度 上限")).toEqual(["kn-as-cap-3003"]);
  });

  it("関係8件は向き・種類どおり（既存 → 新規の1件を含む）", () => {
    const rel = (from: string, to: string, type: string) => expect(index.data.relations).toContainEqual(expect.objectContaining({ from, to, type }));
    rel("kn-aa-windup-cancel", "kn-kite-timing", "reason_for");
    rel("kn-kite-vs-stutter-step", "kn-kite-timing", "context_of");
    rel("kn-attack-move-click", "kn-attack-move-settings", "context_of");
    rel("kn-kite-learning-champions", "kn-kite-practice-drill", "context_of");
    rel("kn-aa-interval-from-attack-speed", "kn-kite-stats", "reason_for");
    rel("kn-as-cap-3003", "kn-kite-stats", "context_of");
    rel("kn-anti-kite-tools", "kn-kite-timing", "context_of");
    rel("kn-anti-kite-terrain", "kn-anti-kite-tools", "context_of");
  });
});
