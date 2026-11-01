import { describe, expect, it } from "vitest";
import { search } from "../search/search";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";
import { KNOWLEDGE_ENTRANCES } from "./questionEntrances";

const publicIds = new Set(publicNotes.map((n) => n.id));

describe("知りたいことから探す：ウェーブ操作以外の入口（KNOWLEDGE_ENTRANCES）", () => {
  it("質問は重複せず、6つ以上の分野に広がり、すべての質問に期待する到達先が1つ以上ある", () => {
    expect(new Set(KNOWLEDGE_ENTRANCES.map((e) => e.question_ja)).size).toBe(KNOWLEDGE_ENTRANCES.length);
    expect(new Set(KNOWLEDGE_ENTRANCES.map((e) => e.area_ja)).size).toBeGreaterThanOrEqual(6);
    for (const e of KNOWLEDGE_ENTRANCES) expect(Object.keys(e.expect).length, e.question_ja).toBeGreaterThan(0);
  });

  for (const e of KNOWLEDGE_ENTRANCES) {
    it(`到達：${e.question_ja}`, () => {
      const res = search(e.question_ja);
      const notes = noteMatchesForQuery(e.question_ja);
      const full = notes.matches.filter((m) => m.tier === "full").map((m) => m.note.id);
      const all = notes.matches.map((m) => m.note.id);
      if (e.expect.first_resource) {
        expect(res.hits[0]?.resource.id).toBe(e.expect.first_resource);
        expect(res.hits[0]?.match).not.toBe("partial");
        expect(index.publicResources.some((r) => r.id === e.expect.first_resource)).toBe(true);
      }
      for (const id of e.expect.resources_top5 ?? []) expect(res.hits.slice(0, 5).map((h) => h.resource.id)).toContain(id);
      if (e.expect.first_note) {
        expect(publicIds.has(e.expect.first_note)).toBe(true);
        expect(full[0]).toBe(e.expect.first_note);
      }
      for (const id of e.expect.notes ?? []) expect(full).toContain(id);
      const target = e.expect.first_note ? all.indexOf(e.expect.first_note) : -1;
      for (const id of e.must_not_precede ?? []) {
        const at = all.indexOf(id);
        if (at >= 0) expect(at, id).toBeGreaterThan(target);
      }
      for (const id of e.must_not_full ?? []) expect(full).not.toContain(id);
    });
  }
});
