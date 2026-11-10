// サポートのロールクエストのコントロールワードの枠（2026-11-10）：26.1〜26.3 の公式ノートとの対応
import { describe, expect, it } from "vitest";
import { index } from "./dataset";
import { isPublicNote, publicEvidenceOf } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";

const NOTE = "kn-role-quest-support-current";
const note = () => {
  const n = index.noteById.get(NOTE);
  if (!n) throw new Error(`note ${NOTE} がない`);
  return n;
};

describe("サポートのロールクエスト：コントロールワードの枠の時期と値下げの条件", () => {
  it("枠に入る時期（26.3 から試合開始時、26.1〜26.2 は達成後）と、40ゴールドの値下げ（達成後）を分けて書く", () => {
    const s = note().statement_ja;
    expect(s).toContain("サモナーズリフトでは試合開始時からこの枠に入る（26.3 から。26.1〜26.2 ではクエスト達成後）");
    expect(s).toContain("達成後の報酬は");
    expect(s).toContain("コントロールワードの値段40ゴールド（値下げは 26.3 以降も達成後）");
    // 26.3 の変更から、無料の配布や達成前の値下げを推論しない
    expect(s).not.toMatch(/無料|達成前.*40/);
    // 既存の確認済みの値は変えない
    expect(s).toContain("800ポイントで達成");
    expect(s).toContain("レベル5まで33%減る");
    // 後続のパッチを確かめていない範囲を残し、ゲーム内での検証をしたことにしない
    expect(note().notes_ja).toContain("V26.20 以降の変更は確認していない");
    expect(note().last_checked_patch).toBeNull();
  });

  it("公式の 26.2・26.3 の資料と根拠を結び付ける。26.1・Wiki の根拠も残す", () => {
    const r26 = (id: string) => index.data.resources.find((r) => r.id === id)!;
    expect(r26("res-riot-patch-26-2-en")).toMatchObject({ url: "https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-2-notes/", title: "Patch 26.2 Notes", published_at: "2026-01-21", patch_context: { stated_patch: "26.2" }, verification: { level: "L3", checked_at: "2026-11-10" } });
    expect(r26("res-riot-patch-26-3-en")).toMatchObject({ url: "https://www.leagueoflegends.com/en-ph/news/game-updates/patch-26-3-notes/", title: "Patch 26.3 Notes", published_at: "2026-02-03", patch_context: { stated_patch: "26.3" }, verification: { level: "L3", checked_at: "2026-11-10" } });
    const ev = index.data.evidence.filter((e) => e.note_id === NOTE);
    expect(ev.map((e) => [e.id, e.resource_id, e.locator?.section])).toEqual([
      ["ev-170", "res-wiki-role-quests", "Quests（Support）/ Patch History V26.16"],
      ["ev-171", "res-riot-patch-26-1-en", "Role Quests / Support"],
      ["ev-363", "res-riot-patch-26-3-en", "Support Control Wards"],
      ["ev-364", "res-riot-patch-26-2-en", "Support Quest Usability"],
      ["ev-365", "res-wiki-role-quests", "Quests（Support）Passive・Rewards / Patch History"],
    ]);
    // 公開ノートのまま、公開対象の資料の根拠として画面に出る（ノートの詳細から原典へ到達できる）
    expect(isPublicNote(note())).toBe(true);
    expect(publicEvidenceOf(NOTE).map((e) => e.resource_id)).toEqual(expect.arrayContaining(["res-riot-patch-26-1-en", "res-riot-patch-26-2-en", "res-riot-patch-26-3-en", "res-wiki-role-quests"]));
  });

  it("検索：コントロールワードの専用の枠・40ゴールドの検索でこのノートが全条件一致になる", () => {
    const full = (q: string) => noteMatchesForQuery(q).matches.filter((m) => m.tier === "full").map((m) => m.note.id);
    expect(full("サポートのロールクエスト")).toContain(NOTE);
    expect(full("コントロールワードの枠")[0]).toBe(NOTE);
    expect(full("コントロールワード 40ゴールド")).toEqual([NOTE]);
    // 年代の指定：主張に「2026年」はないので、年は照合に使わない（26.3 の公開日では一致させない）
    expect(noteMatchesForQuery("2026年のコントロールワード").yearsNotUsed).toEqual(["2026年"]);
  });
});
