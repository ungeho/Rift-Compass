// 2026-11-08 のローム収録のパイロット（知識抽出の第3回 P1〜P15、LoL Theory「Roaming」）の回帰テスト。
// 記録：docs/experiments/roaming-intake-pilot.md
import { describe, expect, it } from "vitest";
import { index, isPublic } from "./dataset";
import { isPublicNote, publicEvidenceOf } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";

const RES = "res-loltheory-roaming";
const NEW_NOTES = [
  "kn-roam-definition-cost",
  "kn-roam-roles",
  "kn-roam-immobile-mage",
  "kn-roam-prerequisites",
  "kn-wave-gold-siege-schedule",
  "kn-champion-kill-xp",
  "kn-roam-timing-windows",
  "kn-enemy-roam-response",
  "kn-roam-bait",
  "kn-roam-when-not",
  "kn-roam-when-behind",
  "kn-roam-destination-and-return",
];
const LEVELS = ["L0", "L1", "L2", "L3", "L4"];

describe("ローム収録のパイロット（第3回 P）", () => {
  it("原典を公開対象の正式資料（L3・無料）として1件だけ登録した", () => {
    const r = index.resourceById.get(RES)!;
    expect(r.url).toBe("https://blog.loltheory.gg/roaming-lol/");
    expect(r.verification.level).toBe("L3");
    expect(r.access.free).toBe(true);
    expect(isPublic(r)).toBe(true);
    expect(index.data.resources.filter((x) => x.url.includes("roaming-lol"))).toHaveLength(1);
  });

  it("新しいノート12件はすべて公開対象で、根拠の確認レベルは資料を超えない", () => {
    for (const id of NEW_NOTES) {
      const n = index.noteById.get(id)!;
      expect(n, id).toBeDefined();
      expect(isPublicNote(n), id).toBe(true);
      expect(n.last_checked_patch, id).toBeNull();
      for (const e of index.evidenceByNote.get(id) ?? []) {
        const r = index.resourceById.get(e.resource_id)!;
        expect(LEVELS.indexOf(e.checked_level), e.id).toBeLessThanOrEqual(LEVELS.indexOf(r.verification.level));
      }
    }
  });

  it("仕様のノートは Wiki の source_fact を主な根拠にし、LoL Theory の説明は経験則の根拠として並べる", () => {
    for (const [id, wiki] of [["kn-wave-gold-siege-schedule", "res-wiki-minion"], ["kn-champion-kill-xp", "res-wiki-experience"]] as const) {
      const n = index.noteById.get(id)!;
      expect(n.status).toBe("source_stated");
      const ev = publicEvidenceOf(id);
      expect(ev.find((e) => e.resource_id === wiki)?.evidence_type).toBe("source_fact");
      expect(ev.find((e) => e.resource_id === RES)?.evidence_type).toBe("empirical_claim");
    }
    // 砲台のゴールドは段階ではなく時間とともに増える（原典の段階の表との相違を補足に残す）
    expect(index.noteById.get("kn-wave-gold-siege-schedule")!.notes_ja).toContain("単純化");
  });

  it("既存ノート2件には根拠だけを足し、主張と status は変えていない", () => {
    const cannon = index.noteById.get("kn-cannon-wave-timing")!;
    expect(cannon.status).toBe("empirical");
    expect(cannon.statement_ja).toBe("大砲のウェーブは動く好機：ローム・リコールの前なら相手の処理に時間がかかり、ダイブなら相手が処理に追われて動きが制限され、スキルも当てやすい。");
    expect(publicEvidenceOf("kn-cannon-wave-timing").map((e) => e.resource_id)).toEqual(["res-donekifu-wave-basics", RES]);
    const flash = index.noteById.get("kn-engage-when-flash-down")!;
    expect(flash.status).toBe("tactical_inference");
    expect(publicEvidenceOf("kn-engage-when-flash-down").map((e) => e.resource_id)).toContain(RES);
  });

  it("原典の具体例（体力40%・4/0・ゲーム時刻の秒数）を主張の閾値にしていない", () => {
    expect(index.noteById.get("kn-roam-prerequisites")!.statement_ja).not.toMatch(/40%|4〜8秒/);
    expect(index.noteById.get("kn-roam-destination-and-return")!.statement_ja).not.toContain("4/0");
    expect(index.noteById.get("kn-cannon-wave-timing")!.statement_ja).not.toMatch(/6〜10秒/);
  });

  it("動けないメイジのノートは既存の R4 のノートと統合せず、関係でつなぐ", () => {
    expect(index.data.relations).toContainEqual(expect.objectContaining({ from: "kn-roam-immobile-mage", to: "kn-immobile-mage-not-alone", type: "context_of" }));
    expect(index.noteById.get("kn-immobile-mage-not-alone")!.statement_ja).not.toContain("ローム");
  });

  it("自然な質問で、相手のロームへの対応のノートがすべての条件に一致する", () => {
    const r = noteMatchesForQuery("相手のミッドがロームしたら");
    expect(r.matches.filter((m) => m.tier === "full").map((m) => m.note.id)).toContain("kn-enemy-roam-response");
  });
});
