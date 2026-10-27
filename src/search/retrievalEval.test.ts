// Phase 0 の評価用質問を、実装した検索で実測する。
// 机上評価の到達数（37/38）は合格基準にしない。順位と到達状況を記録し、明らかな退行だけを検出する。
import { describe, expect, it } from "vitest";
import { search } from "./search";
import { EVAL_QUERIES } from "./evaluationQueries";

const measure = () =>
  EVAL_QUERIES.map((q) => {
    const r = search(q.query);
    const ids = r.hits.map((h) => h.resource.id);
    const ranks = q.expected.map((id) => ids.indexOf(id) + 1); // 0 = 未到達
    return {
      id: q.id,
      units: r.analysis.units.map((u) => `${u.kind}:${u.matched}`).join(", "),
      ignored: r.analysis.ignored.join(", "),
      hits: ids.length,
      complete: r.completeCount,
      ranks: ranks.map((n) => (n === 0 ? "-" : String(n))).join("/"),
      top3: ids.slice(0, 3).join(" "),
      reached: ranks.filter((n) => n > 0).length,
      top5: ranks.filter((n) => n > 0 && n <= 5).length,
      expected: q.expected.length,
    };
  });

describe("評価用質問の実測", () => {
  const rows = measure();

  it("結果を記録する（docs/retrieval-evaluation.md の Phase 1 実測に転記）", () => {
    if (process.env.PRINT_EVAL) console.table(rows);
    const expected = rows.reduce((a, r) => a + r.expected, 0);
    const reached = rows.reduce((a, r) => a + r.reached, 0);
    const top5 = rows.reduce((a, r) => a + r.top5, 0);
    if (process.env.PRINT_EVAL) console.log({ expected, reached, top5 });
    expect(expected).toBeGreaterThan(0);
  });

  it("該当資料がない Q04 では、すべての語に一致する資料を出さない", () => {
    expect(rows.find((r) => r.id === "Q04")!.complete).toBe(0);
  });
});
