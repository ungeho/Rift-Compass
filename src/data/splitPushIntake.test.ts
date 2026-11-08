// 2026-11-08 のスプリットプッシュの収録（知識抽出の第2回 I1〜I14、LoL Theory「Split Pushing」）の回帰テスト。
// 記録：docs/experiments/split-push-intake-pilot.md
import { describe, expect, it } from "vitest";
import { index, isPublic } from "./dataset";
import { isPublicNote, publicEvidenceOf } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";

const RES = "res-loltheory-split-push";
const NEW_NOTES = [
  "kn-split-push-requirements",
  "kn-split-push-forced-choice",
  "kn-split-131-14",
  "kn-split-push-tp-pattern",
  "kn-inhibitor-no-reinforced",
  "kn-split-pusher-traits",
  "kn-split-push-before-objective",
  "kn-split-push-when",
  "kn-split-push-when-not",
  "kn-split-push-failures",
  "kn-split-push-vs-backdoor",
];
const LEVELS = ["L0", "L1", "L2", "L3", "L4"];
const textOf = (id: string) => {
  const n = index.noteById.get(id)!;
  return [n.statement_ja, ...(n.conditions_ja ?? []), ...(n.exceptions_ja ?? []), n.notes_ja ?? ""].join(" ");
};

describe("スプリットプッシュの収録（第2回 I）", () => {
  it("原典を公開対象の正式資料（L3・無料）として1件だけ登録した", () => {
    const r = index.resourceById.get(RES)!;
    expect(r.url).toBe("https://blog.loltheory.gg/split-push-lol/");
    expect(r.verification.level).toBe("L3");
    expect(isPublic(r)).toBe(true);
    expect(index.data.resources.filter((x) => x.url.includes("split-push-lol"))).toHaveLength(1);
  });

  it("新しいノート11件はすべて公開対象で、根拠の確認レベルは資料を超えない", () => {
    for (const id of NEW_NOTES) {
      const n = index.noteById.get(id)!;
      expect(n, id).toBeDefined();
      expect(isPublicNote(n), id).toBe(true);
      expect(n.last_checked_patch, id).toBeNull();
      for (const e of index.evidenceByNote.get(id) ?? []) {
        expect(LEVELS.indexOf(e.checked_level), e.id).toBeLessThanOrEqual(LEVELS.indexOf(index.resourceById.get(e.resource_id)!.verification.level));
      }
    }
    // 失敗の型のノートは、LoL Theory の説明と Wiki の Turret（Reinforced Armor の80%）の2件の根拠を区別して持つ
    expect(publicEvidenceOf("kn-split-push-failures").map((e) => [e.resource_id, e.evidence_type])).toEqual([
      [RES, "empirical_claim"],
      ["res-wiki-turret", "source_fact"],
    ]);
  });

  it("既存ノートへの変更は、根拠1件の追加と補足への追記だけ", () => {
    const top = index.noteById.get("kn-role-quest-top-current")!;
    expect(top.status).toBe("source_stated");
    expect(publicEvidenceOf("kn-role-quest-top-current").map((e) => e.resource_id)).toContain(RES);
    const diag = index.noteById.get("kn-diagonal-objective-trade")!;
    expect(diag.statement_ja).toBe("相手が一方のサイドのオブジェクトに人数をかけたら、反対側でタワー・オブジェクトなどの利益を取り、損を交換にする。");
    expect(diag.notes_ja).toContain("kn-split-push-forced-choice");
    expect(publicEvidenceOf("kn-diagonal-objective-trade").map((e) => e.resource_id)).not.toContain(RES);
  });

  it("保留した仕様の値（インヒビター・テレポートの基本の値）を主張に入れていない", () => {
    for (const id of NEW_NOTES) expect(index.noteById.get(id)!.statement_ja, id).not.toMatch(/4000|4,000|15 ?回復|300秒|330|240秒/);
    // 抽出記録の誤読（「湧いてから10秒」）を写していない。原典は湧く10秒前
    expect(textOf("kn-split-push-before-objective")).toContain("湧く10秒前");
    expect(textOf("kn-split-push-before-objective")).not.toContain("湧いてから");
  });

  it("参照文だけの偶然の一致を作らない（ローム収録の M1 の再発防止）：既存ノートの補足に「スプリットプッシュ」の語を書かない", () => {
    expect(index.noteById.get("kn-diagonal-objective-trade")!.notes_ja).not.toContain("スプリットプッシュ");
    const full = noteMatchesForQuery("スプリットプッシュ").matches.filter((m) => m.tier === "full").map((m) => m.note.id);
    expect(full).not.toContain("kn-diagonal-objective-trade");
    for (const id of ["kn-split-push-requirements", "kn-split-push-forced-choice", "kn-split-push-when", "kn-split-push-failures"]) expect(full).toContain(id);
  });

  it("関係8件は向き・種類どおり（既存 → 新規の1件を含む）", () => {
    const rel = (from: string, to: string, type: string) => expect(index.data.relations).toContainEqual(expect.objectContaining({ from, to, type }));
    rel("kn-split-push-requirements", "kn-split-push-forced-choice", "condition_of");
    rel("kn-split-push-forced-choice", "kn-diagonal-objective-trade", "context_of");
    rel("kn-inhibitor-no-reinforced", "kn-turret-reinforced-armor", "context_of");
    rel("kn-split-pusher-traits", "kn-split-push-requirements", "refines");
    rel("kn-split-push-before-objective", "kn-objective-prep-1min", "context_of");
    rel("kn-split-push-when", "kn-split-push-before-objective", "context_of");
    rel("kn-split-push-when-not", "kn-split-push-when", "context_of");
    rel("kn-turret-reinforced-armor", "kn-split-push-failures", "reason_for");
  });
});
