// 知識ノートの公開判定（P1）：公開対象の資料の根拠だけで、既存の根拠状態の規則（validate）を満たすノートを公開する。
// 最小のデータで判定の場合分けを確かめ、実データでは validate との一致と、画面・検索の経路の整合を確かめる。
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteSummary } from "../components/ExplorePage";
import { ResourceDetail } from "../components/ResourceDetail";
import { notesForTopic } from "../components/TopicPages";
import { resourceHref } from "../router";
import { index, isPublic } from "./dataset";
import { isPublicNote, otherEvidenceOf, publicEvidenceOf, publicNotes } from "./explorePool";
import { noteRuleErrors, notePublicity, premisesOf } from "./notePublicity";
import { noteMatchesForQuery } from "./noteSearch";
import type { Evidence, KnowledgeNote, Level, Resource } from "./types";

const { validate } = createRequire(import.meta.url)("../../tools/validate-sample-data.js") as { validate: (d: unknown) => string[] };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ---- 最小のデータ ----
const res = (id: string, level: Level, free: boolean | null = true): Resource =>
  ({ id, url: `https://example.com/${id}`, title: id, type: "article", language: "ja", creator: { name: `creator-${id}`, kind: "x" }, topic_ids: [], summary_ja: "", published_at: null,
    patch_context: { stated_patch: null, basis: "unknown", era: "current" }, access: { free, login_required: false }, verification: { level, checked_at: "2026-11-08", method: "test" } }) as Resource;
const note = (id: string, status: KnowledgeNote["status"], extra: Partial<KnowledgeNote> = {}): KnowledgeNote =>
  ({ id, kind: "mechanic", statement_ja: id, topic_ids: [], status, patch_dependencies: [], last_checked_patch: null, ...extra }) as KnowledgeNote;
let seq = 0;
const ev = (note_id: string, resource_id: string, evidence_type: string, checked_level: Level, locator: Evidence["locator"] = { section: "s" }): Evidence =>
  ({ id: `ev-t${++seq}`, note_id, resource_id, evidence_type, locator, summary_ja: "", checked_level, checked_at: "2026-11-08" });
const resources = new Map([res("pub3", "L3"), res("pub2", "L2"), res("l0", "L0", null), res("notfree", "L3", false)].map((r) => [r.id, r]));
const judge = (n: KnowledgeNote, evidence: Evidence[], premises: KnowledgeNote[] = []) => notePublicity({ note: n, evidence, resourceById: resources, isPublicResource: isPublic, premises });

describe("P1 の公開判定（最小のデータ）", () => {
  it("1. 公開対象の資料の根拠だけで規則を満たすノートは公開する", () => {
    const n = note("a", "source_stated");
    expect(judge(n, [ev("a", "pub3", "source_fact", "L3")]).isPublic).toBe(true);
  });
  it("2. 公開対象でない資料（L0）の参考の根拠を足しても、公開のまま。その根拠は消さず、公開側にも入れない（昇格しない）", () => {
    const n = note("a", "derived");
    const l0 = ev("a", "l0", "hypothesis", "L0", null);
    const p = judge(n, [ev("a", "pub3", "derivation", "L3"), l0]);
    expect(p.isPublic).toBe(true);
    expect(p.otherEvidence).toEqual([l0]);
    expect(p.publicEvidence.map((e) => e.resource_id)).toEqual(["pub3"]);
    expect(l0.checked_level).toBe("L0");
  });
  it("3. 公開対象の資料の根拠が規則に足りなければ公開しない（強い根拠が公開対象でない資料にしかない場合を含む）", () => {
    const n = note("a", "source_stated");
    // 公開側は L2 だけ：source_stated には L3 以上の source_fact が要る
    expect(judge(n, [ev("a", "pub2", "source_fact", "L2"), ev("a", "notfree", "source_fact", "L3")]).isPublic).toBe(false);
    // 導出：辿れる計算根拠（L3 の derivation と所在）が公開対象でない資料にしかない
    const d = note("d", "derived");
    expect(judge(d, [ev("d", "pub3", "source_fact", "L3"), ev("d", "notfree", "derivation", "L3")]).isPublic).toBe(false);
  });
  it("4. 公開対象でない資料の根拠しかないノートは公開しない", () => {
    const p = judge(note("a", "empirical"), [ev("a", "l0", "empirical_claim", "L0", null)]);
    expect(p.isPublic).toBe(false);
    expect(p.reasons).toEqual(["通常公開の対象の資料の根拠がない"]);
  });
  it("5. 根拠がない・参照先の資料がない・確認レベルが資料を超える根拠は公開の根拠にしない", () => {
    expect(judge(note("a", "unverified"), []).isPublic).toBe(false);
    expect(judge(note("a", "source_stated"), [ev("a", "no-such", "source_fact", "L3")]).isPublic).toBe(false);
    // 資料は L2 なのに根拠が L3（データの不整合）
    expect(judge(note("a", "source_stated"), [ev("a", "pub2", "source_fact", "L3")]).isPublic).toBe(false);
  });
  it("6. 状態ごとの規則は変えない：反証の根拠が公開対象でない「対立あり」、ゲーム内検証の根拠がない last_checked_patch、弱い前提の導出は公開しない", () => {
    expect(judge(note("a", "disputed"), [ev("a", "pub3", "source_fact", "L3"), ev("a", "notfree", "counter", "L3")]).isPublic).toBe(false);
    expect(judge(note("a", "source_stated", { last_checked_patch: "26.21" }), [ev("a", "pub3", "source_fact", "L3")]).isPublic).toBe(false);
    expect(judge(note("d", "derived"), [ev("d", "pub3", "derivation", "L3", null)], [note("p", "empirical")]).isPublic).toBe(false);
    expect(judge(note("d", "derived"), [ev("d", "pub3", "derivation", "L3", null)], [note("p", "source_stated")]).isPublic).toBe(true);
    // 未確認（unverified）は規則上は根拠が要らないが、公開には公開対象の資料の根拠が1件以上要る
    expect(judge(note("u", "unverified"), [ev("u", "pub3", "hypothesis", "L3")]).isPublic).toBe(true);
  });
});

describe("P1 の公開判定（実データ）", () => {
  const notes = index.data.knowledge_notes;
  const premises = (id: string) => premisesOf(id, index.data.relations, index.noteById);

  it("ノートごとの規則は Node 側の検査（validate）と同じ結果になる（全ノート。規則の二重管理のずれを検出する）", () => {
    const fromValidate = validate(index.data);
    for (const n of notes) {
      const mine = noteRuleErrors(n, index.evidenceByNote.get(n.id) ?? [], premises(n.id));
      expect(mine, n.id).toEqual(fromValidate.filter((x) => x.startsWith(`${n.id}:`)));
    }
    // 根拠を1件ずつ外したデータでも一致する（規則の分岐を通す）
    for (const n of notes.filter((x) => (index.evidenceByNote.get(x.id) ?? []).length >= 1).slice(0, 60)) {
      const all = index.evidenceByNote.get(n.id)!;
      const drop = all[0];
      const copy = { ...index.data, evidence: index.data.evidence.filter((e) => e.id !== drop.id) };
      const v = validate(copy).filter((x) => x.startsWith(`${n.id}:`));
      expect(noteRuleErrors(n, all.slice(1), premises(n.id)), n.id).toEqual(v);
    }
  });

  it("kn-level2-minion-count・kn-level2-advantage は P1 で公開、kn-offense-as-defense は非公開のまま。公開対象でない資料の根拠は保存したまま判定に使わない", () => {
    expect(isPublicNote(index.noteById.get("kn-level2-minion-count")!)).toBe(true);
    expect(isPublicNote(index.noteById.get("kn-level2-advantage")!)).toBe(true);
    expect(isPublicNote(index.noteById.get("kn-offense-as-defense")!)).toBe(false);
    expect(otherEvidenceOf("kn-level2-minion-count").map((e) => [e.id, e.checked_level])).toEqual([["ev-009", "L0"]]);
    expect(otherEvidenceOf("kn-level2-advantage").map((e) => [e.id, e.checked_level])).toEqual([["ev-011", "L0"]]);
    expect(index.data.evidence.filter((e) => ["ev-009", "ev-011"].includes(e.id))).toHaveLength(2);
    // 公開したノートの公開根拠は、すべて公開対象の資料のもの
    for (const n of publicNotes) for (const e of publicEvidenceOf(n.id)) expect(isPublic(index.resourceById.get(e.resource_id)!)).toBe(true);
  });

  it("検索の索引に公開対象でない資料の根拠の要約を入れない（一致・順位に影響しない）", () => {
    // ev-009 の要約だけにある語（HTTP 403）・ev-011 の要約の語で、根拠の要約を理由に一致しない
    const evidenceBasis = (q: string, id: string) =>
      noteMatchesForQuery(q).matches.filter((m) => m.note.id === id).flatMap((m) => m.bases.flat()).filter((b) => b.kind === "field" && b.field === "evidence");
    expect(evidenceBasis("HTTP 403", "kn-level2-minion-count")).toEqual([]);
    // 根拠の要約での一致は、公開の根拠の要約にある語だけ（ev-011 の「1ウェーブ目でLv2に到達する手法」の語では一致しない）
    const pubSummary = publicEvidenceOf("kn-level2-advantage").map((e) => e.summary_ja.toLowerCase()).join(" ");
    for (const b of evidenceBasis("1ウェーブ目でLv2に到達する手法", "kn-level2-advantage")) expect(pubSummary).toContain(b.matched);
    expect(evidenceBasis("到達する手法", "kn-level2-advantage")).toEqual([]);
    // 公開の根拠の要約では一致する（索引から根拠そのものを外したわけではない）
    expect(evidenceBasis("必要体数", "kn-level2-minion-count").length).toBeGreaterThan(0);
  });

  it("新たに公開した2件は、ノート検索・Topic・資料の詳細から届く", () => {
    const ids = noteMatchesForQuery("Lv2 先行").matches.map((m) => m.note.id);
    expect(ids).toEqual(expect.arrayContaining(["kn-level2-minion-count", "kn-level2-advantage"]));
    const t = notesForTopic("level-2").direct.map((n) => n.id);
    expect(t).toEqual(expect.arrayContaining(["kn-level2-minion-count", "kn-level2-advantage"]));
  });

  it("資料の詳細：ノートの逆引きは同じ公開判定。通常の導線から公開対象でない資料へリンクしない。警告つきの直接アクセスは今のまま", () => {
    const pub = renderToStaticMarkup(<ResourceDetail id="res-riot-patch-26-1-en" />);
    expect(text(pub)).toContain("広く流通する");
    expect(pub).not.toContain(resourceHref("res-mobalytics-wave"));
    expect(text(pub)).toContain("未確認の参考情報あり");
    // 逆引きに出るノートは、すべて公開判定を満たす
    for (const r of index.resources) {
      const shown = [...new Set((index.evidenceByResource.get(r.id) ?? []).map((e) => e.note_id))].filter((id) => isPublicNote(index.noteById.get(id)!));
      const html = renderToStaticMarkup(<ResourceDetail id={r.id} />);
      if (shown.length === 0) expect(html).toContain("この資料に関連付けられた知識ノートはありません");
      // 公開対象の資料のページから、公開対象でない資料へのリンクは出ない
      if (isPublic(r)) for (const x of index.resources.filter((y) => !isPublic(y))) expect(html, r.id).not.toContain(`href="${resourceHref(x.id)}"`);
    }
    // 公開対象でない資料の直接アクセス：警告を出し、その資料を根拠にした公開ノートを「この資料」として示す
    const direct = renderToStaticMarkup(<ResourceDetail id="res-mobalytics-wave" />);
    expect(text(direct)).toContain("この資料は未確認の候補です");
    expect(text(direct)).toContain("この資料");
    expect(text(direct)).toContain("本文未確認（HTTP 403）");
  });

  it("根拠の件数は、ノートの詳細で表示する公開の根拠の数と同じ。公開対象でない資料の根拠は件数に入れず、存在だけを示す", () => {
    const s = text(renderToStaticMarkup(<NoteSummary note={index.noteById.get("kn-level2-minion-count")!} />));
    expect(s).toContain("根拠の資料 2件");
    expect(s).toContain("ほかに未確認の参考情報あり");
    const plain = text(renderToStaticMarkup(<NoteSummary note={index.noteById.get("kn-level2-xp")!} />));
    expect(plain).not.toContain("未確認の参考情報");
  });
});
