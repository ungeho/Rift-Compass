import { describe, expect, it } from "vitest";
import questions from "../../data/experiments/note-questions.json";
import { analyzeQuery, search } from "../search/search";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import { noteMatchesForQuery } from "./noteSearch";

interface NoteQuestion {
  id: string;
  text: string;
  primary: string[];
  acceptable: string[];
  traps: string[];
  expected_none: boolean;
  requires_cue?: "negation" | "condition" | "stance" | "side";
  lexical_only?: string[];
  known_limitation_ja?: string;
  never?: string[];
  note_only_terms?: string[];
}
const QS = questions.questions as NoteQuestion[];
const publicIds = new Set(publicNotes.map((n) => n.id));

describe("知識ノートの検索（評価用の質問：data/experiments/note-questions.json）", () => {
  it("質問の ID は重複せず、参照するノートはすべて実在する。答え・関連・取り違えには公開ノートだけを使う", () => {
    expect(new Set(QS.map((q) => q.id)).size).toBe(QS.length);
    for (const q of QS) {
      for (const id of [...q.primary, ...q.acceptable, ...q.traps, ...(q.lexical_only ?? [])]) expect(publicIds.has(id), `${q.id} ${id}`).toBe(true);
      for (const id of q.never ?? []) {
        expect(index.noteById.has(id), `${q.id} ${id}`).toBe(true);
        expect(publicIds.has(id), `${q.id} ${id}`).toBe(false);
      }
      expect(q.expected_none).toBe(q.primary.length === 0);
    }
  });

  for (const q of QS) {
    it(`${q.id}：${q.text}`, () => {
      const r = noteMatchesForQuery(q.text);
      const ids = r.matches.map((m) => m.note.id);
      const full = r.matches.filter((m) => m.tier === "full").map((m) => m.note.id);
      // 公開しないノートは、どの検索にも出さない
      for (const id of ids) expect(publicIds.has(id)).toBe(true);
      for (const id of q.never ?? []) expect(ids).not.toContain(id);
      if (q.requires_cue) expect(r.cues[q.requires_cue]).toBe(true);
      if (q.expected_none) {
        // 答えのない質問：すべての条件に一致するノートがないか、否定の注意を出したうえで関連ノートだけが一致する
        // 語だけの一致（lexical_only）は、既知の限界として理由を記録したものに限る
        if (q.lexical_only) expect(q.known_limitation_ja).toBeTruthy();
        const lexical = full.filter((id) => q.lexical_only?.includes(id));
        const others = full.filter((id) => !q.lexical_only?.includes(id));
        if (others.length > 0) {
          expect(q.requires_cue).toBeDefined();
          for (const id of others) expect(q.acceptable).toContain(id);
        }
        expect(lexical).toEqual(q.lexical_only?.filter((id) => full.includes(id)) ?? []);
        return;
      }
      for (const id of q.primary) expect(full, `primary ${id}`).toContain(id);
      expect([...q.primary, ...q.acceptable]).toContain(full[0]);
      const lastPrimary = Math.max(...q.primary.map((id) => ids.indexOf(id)));
      for (const trap of q.traps) {
        const at = ids.indexOf(trap);
        if (at >= 0) expect(at, `trap ${trap}`).toBeGreaterThan(lastPrimary);
      }
      // 資料の検索では捨てられる語を、ノートの照合では使う
      for (const term of q.note_only_terms ?? []) {
        expect(analyzeQuery(q.text).ignored).toContain(term);
        expect(r.units.map((u) => u.matched)).toContain(term);
      }
    });
  }
});

describe("知識ノートの検索の規則", () => {
  it("資料の検索結果を変えない（ノートの照合は資料の検索とは別に行う）", () => {
    for (const q of ["ヴォイドグラブ", "コンディション", "タワーのプレートは、今も14分で落ちる？"]) {
      const before = search(q);
      noteMatchesForQuery(q);
      expect(search(q).hits.map((h) => h.resource.id)).toEqual(before.hits.map((h) => h.resource.id));
    }
  });

  it("どの公開ノートも、自分の主張の言葉で検索すれば見つかる（非公開のノートは主張の言葉でも出ない）", () => {
    for (const n of index.data.knowledge_notes) {
      const ids = noteMatchesForQuery(n.statement_ja.slice(0, 12)).matches.map((m) => m.note.id);
      if (publicIds.has(n.id)) continue;
      expect(ids).not.toContain(n.id);
    }
    // 公開ノートの到達：評価の質問か、Topic の名前のどちらかで、すべての公開ノートに届く
    const reached = new Set<string>();
    for (const q of QS) for (const m of noteMatchesForQuery(q.text).matches) reached.add(m.note.id);
    for (const n of publicNotes) {
      for (const t of n.topic_ids) {
        const label = index.topicById.get(t)?.label_ja;
        if (label) for (const m of noteMatchesForQuery(label).matches) if (m.tier === "full") reached.add(m.note.id);
      }
    }
    expect([...publicIds].filter((id) => !reached.has(id))).toEqual([]);
  });

  it("語の一致が例外・反証の記述だけにあるときは、主張と逆向きの可能性として印を付ける", () => {
    const r = noteMatchesForQuery("ヴォイドグラブ");
    const m = r.matches.find((x) => x.note.id === "kn-diagonal-trade-exceptions")!;
    // 例外のノートは主張自体にヴォイドグラブを含むので、逆向きの印は付けない
    expect(m.opposingOnly).toBe(false);
    const aa = noteMatchesForQuery("エズリアル").matches.find((x) => x.note.id === "kn-vs-aa-negation-decision");
    expect(aa?.opposingOnly).toBe(true);
  });

  it("否定・条件の表現を検出する（「避ける」は回避の意味なので否定に含めない）", () => {
    expect(noteMatchesForQuery("フリーズしないほうがいい").cues.negation).toBe(true);
    expect(noteMatchesForQuery("when should I not freeze").cues.negation).toBe(true);
    expect(noteMatchesForQuery("ジャックスのEは塔の攻撃も避ける？").cues.negation).toBe(false);
    expect(noteMatchesForQuery("AA無効化されたらどうする").cues.condition).toBe(true);
    expect(noteMatchesForQuery("Call for Helpを受けずにトレード").cues.negation).toBe(true);
    expect(noteMatchesForQuery("不利なときのフリーズ").cues.stance).toBe(true);
    expect(noteMatchesForQuery("how to play when behind").cues.stance).toBe(true);
    expect(noteMatchesForQuery("ジャックスのEの対策").cues.side).toBe(true);
    expect(noteMatchesForQuery("ジャックスのE").cues).toEqual({ negation: false, condition: false, stance: false, side: false });
  });

  it("一部の条件だけの一致は関連候補として分け、一般的な1語だけの偶然の一致では出さない", () => {
    const r = noteMatchesForQuery("スキルを外した相手");
    expect(r.matches.filter((m) => m.tier === "partial")).toEqual([]);
    const flash = noteMatchesForQuery("フラッシュ CD");
    expect(flash.matches.filter((m) => m.tier === "full").map((m) => m.note.id)).toEqual(["kn-flash-cd", "kn-engage-when-flash-down"]);
    expect(flash.matches.some((m) => m.tier === "partial")).toBe(true);
  });

  it("旧仕様（現行では適用できない）のノートは、同じ段の後ろに並べる", () => {
    const ids = noteMatchesForQuery("プレート").matches.map((m) => m.note.id);
    expect(ids.indexOf("kn-turret-plates-permanent-261")).toBeLessThan(ids.indexOf("kn-turret-plates-fell-14min-pre-261"));
  });

  it("空の検索語・ノートにない語だけの検索では何も出さない", () => {
    expect(noteMatchesForQuery("").matches).toEqual([]);
    const r = noteMatchesForQuery("バロン");
    expect(r.matches).toEqual([]);
    expect(r.ignored).toContain("バロン");
  });
});
