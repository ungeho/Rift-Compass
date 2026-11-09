import { describe, expect, it } from "vitest";
import questions from "../../data/experiments/note-questions.json";
import { analyzeQuery, search } from "../search/search";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import { containsTerm, normalize } from "../search/search";
import { noteMatchesForQuery, rankSynonymsOf, statementHitCount, statementHitCountWithSynonyms, type NoteMatch } from "./noteSearch";

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
    for (const q of ["ヴォイドグラブ", "コンディション", "タワーのプレートは、今も14分で落ちる？", "カイティング", "kiting", "カイト"]) {
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
    // 2026-11-08 のローム収録で、主張に「マナ・CD」と「フラッシュ」の両方を含む kn-roam-prerequisites が加わった（ロームの前の確認として語の一致は正しい）
    expect(flash.matches.filter((m) => m.tier === "full").map((m) => m.note.id)).toEqual(["kn-flash-cd", "kn-engage-when-flash-down", "kn-roam-prerequisites"]);
    // 他のノートへの参照文（補足）にだけ語が現れるノートは、すべての条件に一致させない（ローム収録の監査 M1：補足の「重要な CD（フラッシュなど）」で偶然に完全一致していた）
    expect(flash.matches.find((m) => m.note.id === "kn-roam-timing-windows")?.tier).not.toBe("full");
    expect(flash.matches.some((m) => m.tier === "partial")).toBe(true);
  });

  it("旧仕様（現行では適用できない）のノートは、同じ段の後ろに並べる", () => {
    const ids = noteMatchesForQuery("プレート").matches.map((m) => m.note.id);
    expect(ids.indexOf("kn-turret-plates-permanent-261")).toBeLessThan(ids.indexOf("kn-turret-plates-fell-14min-pre-261"));
  });

  it("段・旧仕様が同じなら、主張・成立条件で一致した条件が多いノートを先にし、同じなら同義語を含めた数、それも同じならデータの順（2026-11-09）", () => {
    const order = new Map(publicNotes.map((n, i) => [n.id, i]));
    const sup = (m: NoteMatch) => (m.note.historical?.current_applicability === "superseded" ? 1 : 0);
    const queries = [...QS.map((q) => q.text), "カイト", "カイティング", "kiting", "アタックムーブ", "サモナースペル", "プレート", "スロウ", "シャコ", "ローム"];
    for (const q of queries) {
      const { matches: ms, units } = noteMatchesForQuery(q);
      const syn = (m: NoteMatch) => statementHitCountWithSynonyms(m, units);
      for (let i = 1; i < ms.length; i++) {
        const [a, b] = [ms[i - 1], ms[i]];
        // 全条件一致が先、同じ段では旧仕様が後ろ（従来どおり）
        expect(a.tier === "partial" && b.tier === "full", q).toBe(false);
        if (a.tier !== b.tier) continue;
        expect(sup(a) - sup(b), `${q} ${a.note.id} ${b.note.id}`).toBeLessThanOrEqual(0);
        if (sup(a) !== sup(b)) continue;
        expect(statementHitCount(a), `${q} ${a.note.id} ${b.note.id}`).toBeGreaterThanOrEqual(statementHitCount(b));
        if (statementHitCount(a) !== statementHitCount(b)) continue;
        // 直接の一致が同じなら、同義語を含めた数
        expect(syn(a), `${q} ${a.note.id} ${b.note.id}`).toBeGreaterThanOrEqual(syn(b));
        // 同点はデータの順（安定ソート）
        if (syn(a) === syn(b)) expect(order.get(a.note.id)!, q).toBeLessThan(order.get(b.note.id)!);
      }
      expect(noteMatchesForQuery(q).matches.map((m) => m.note.id)).toEqual(ms.map((m) => m.note.id));
    }
    // 「カイト」は Topic「操作技術」の別名：主張・成立条件にカイトがあるノートが、Topic だけで一致したノートより先
    const kite = noteMatchesForQuery("カイト").matches;
    const firstTopicOnly = kite.findIndex((m) => statementHitCount(m) === 0);
    expect(firstTopicOnly).toBeGreaterThan(0);
    expect(kite.slice(firstTopicOnly).every((m) => statementHitCount(m) === 0)).toBe(true);
    expect(kite.slice(0, firstTopicOnly).map((m) => m.note.id)).toContain("kn-anti-kite-tools");
    // 1つの条件が主張と成立条件の両方にあっても1と数える（kn-anti-kite-tools は「カイト」が主張・成立条件の両方にある）
    const tools = kite.find((m) => m.note.id === "kn-anti-kite-tools")!;
    expect(tools.bases[0].filter((b) => b.kind === "field").map((b) => (b as { field: string }).field)).toEqual(expect.arrayContaining(["statement", "conditions"]));
    expect(statementHitCount(tools)).toBe(1);
    // 補足・根拠の要約・Topic だけの一致は数えない
    expect(statementHitCount({ ...tools, bases: [[{ kind: "topic", topicId: "mechanics", matched: "カイト" }, { kind: "field", field: "notes", matched: "カイト" }, { kind: "field", field: "evidence", matched: "カイト" }]] })).toBe(0);
  });

  it("並び順だけに使う同義語（カイト・カイティング・kiting）：一致の集合・理由は変えず、直接の一致を先にする（2026-11-09）", () => {
    const KITE = ["kn-kite-timing", "kn-kite-vs-stutter-step", "kn-kite-learning-champions", "kn-kite-stats", "kn-anti-kite-tools", "kn-anti-kite-terrain", "kn-kite-practice-drill"];
    // グループは明示した3語だけ。同じ Topic（操作技術）の別名でも、関連する技術は同義語にしない
    expect(rankSynonymsOf("カイト")).toEqual(["カイティング", "kiting"]);
    expect(rankSynonymsOf("Kiting")).toEqual(["カイト", "カイティング"]);
    for (const w of ["kite", "kites", "アタックムーブ", "スペーシング", "スタッターステップ", "オーブウォーク", "フィジカル", "引き撃ち"]) expect(rankSynonymsOf(w), w).toEqual([]);
    // 英語の kiting は単語として照合する（kite・kites には一致しない）
    expect(containsTerm(normalize("kite kites kited"), "kiting")).toBe(false);

    const kite = noteMatchesForQuery("カイト"), kiting = noteMatchesForQuery("カイティング"), en = noteMatchesForQuery("kiting");
    const ids = (r: typeof kite) => r.matches.map((m) => m.note.id);
    // 一致の集合・段・理由・逆向きの印は同義語で変わらない（3語とも同じ Topic の別名なので、同じ集合になる）
    for (const r of [kiting, en]) {
      expect([...ids(r)].sort()).toEqual([...ids(kite)].sort());
      for (const m of r.matches) {
        const k = kite.matches.find((x) => x.note.id === m.note.id)!;
        expect([m.tier, m.opposingOnly]).toEqual([k.tier, k.opposingOnly]);
      }
    }
    // 入力語・一致の理由は書き換えない（同義語で一致した語を理由に足さない）
    expect(kiting.units.map((u) => u.matched)).toEqual(["カイティング"]);
    expect(en.units.map((u) => u.matched)).toEqual(["kiting"]);
    expect(kiting.expandedQuery).toBeUndefined();
    expect(kiting.matches.find((m) => m.note.id === "kn-kite-timing")!.bases).toEqual([[{ kind: "topic", topicId: "mechanics", matched: "カイティング" }]]);

    // カイト：従来どおり主張にカイトがある7件が1〜7位。同義語（カイティング）だけのノートは8位
    expect(ids(kite).slice(0, 7)).toEqual(KITE);
    expect(ids(kite)[7]).toBe("kn-right-click-core-physical");
    // カイティング：主張にカイティングをそのまま含む2件が先（直接の一致は同義語より先）、続いて同義語で一致した残りの6件
    expect(ids(kiting).slice(0, 2)).toEqual(["kn-right-click-core-physical", "kn-kite-vs-stutter-step"]);
    expect([...ids(kiting).slice(2, 8)].sort()).toEqual(KITE.filter((id) => id !== "kn-kite-vs-stutter-step").sort());
    for (const m of kiting.matches.slice(2, 8)) expect([statementHitCount(m), statementHitCountWithSynonyms(m, kiting.units)]).toEqual([0, 1]);
    // kiting：主張に kiting そのものはないので、同義語で一致した8件がデータの順で先
    expect([...ids(en).slice(0, 8)].sort()).toEqual([...KITE, "kn-right-click-core-physical"].sort());
    expect(statementHitCountWithSynonyms(en.matches[8], en.units)).toBe(0);
    // カイティングへの対抗策：対抗策のノートが Topic だけの一致（39・40位）より前に来る
    const anti = ids(noteMatchesForQuery("カイティングへの対抗策"));
    for (const id of ["kn-anti-kite-tools", "kn-anti-kite-terrain"]) expect(anti.indexOf(id)).toBeLessThan(8);

    // 同義語を重ねても、1つの条件は1と数える（同じ Topic の別名はもともと1つの条件にまとまる）
    for (const q of ["カイト カイティング kiting", "kite kiting", "カイティングとスタッターステップの違い"]) {
      const r = noteMatchesForQuery(q);
      for (const m of r.matches) {
        expect(statementHitCountWithSynonyms(m, r.units)).toBeLessThanOrEqual(r.matches[0].bases.length);
        expect(statementHitCountWithSynonyms(m, r.units)).toBeGreaterThanOrEqual(statementHitCount(m));
      }
    }
    expect(noteMatchesForQuery("カイト カイティング kiting").units).toHaveLength(1);
    // 補足・根拠などの同義語は数えない（kn-attack-move-settings は補足に資料 ID の res-loltheory-kiting があるが、主張にカイトはない）
    const am = en.matches.find((m) => m.note.id === "kn-attack-move-settings")!;
    expect(am.bases[0].some((b) => b.kind === "field" && b.field === "notes")).toBe(true);
    expect(statementHitCountWithSynonyms(am, en.units)).toBe(0);
    // グループにない語の検索では、同義語を含めた数は直接の数と同じ（並び順は変わらない）
    for (const q of ["アタックムーブ", "スペーシング", "スタッターステップ", "kite", "kites", "サモナースペル"]) {
      const r = noteMatchesForQuery(q);
      for (const m of r.matches) expect(statementHitCountWithSynonyms(m, r.units), `${q} ${m.note.id}`).toBe(statementHitCount(m));
    }
  });

  it("大分類の Topic の語がノートの種類の表示名（仕様）と同じときだけ、種類でも一致する（2026-11-09）", () => {
    const basesOf = (r: ReturnType<typeof noteMatchesForQuery>, id: string) => r.matches.find((m) => m.note.id === id)?.bases;
    // 「スマイトの仕様」：検索条件は変えない（大分類「仕様」＋語「スマイト」）
    const smite = noteMatchesForQuery("スマイトの仕様");
    expect(smite.units.map((u) => [u.kind, u.matched, u.kind === "topic" ? u.topic.id : ""])).toEqual([["topic", "仕様", "cat-basics"], ["term", "スマイト", ""]]);
    expect(smite.ignored).toEqual([]);
    const full = smite.matches.filter((m) => m.tier === "full");
    expect(full[0].note.id).toBe("kn-smite-damage-261");
    // スマイトのダメージのノートは基本仕様の Topic の下になく、「仕様」には種類だけで一致する（Topic の一致とは記録しない）
    expect(basesOf(smite, "kn-smite-damage-261")).toEqual([
      [{ kind: "noteKind", noteKind: "mechanic", matched: "仕様" }],
      [{ kind: "field", field: "statement", matched: "スマイト" }],
    ]);
    const sm = full[0];
    expect(sm.opposingOnly).toBe(false);
    // 種類の一致は、主張・成立条件の一致として数えない
    expect(statementHitCount(sm)).toBe(1);
    expect(statementHitCountWithSynonyms(sm, smite.units)).toBe(1);
    // 基本仕様の下の Topic で一致したノートは、Topic の一致も残る
    expect(basesOf(smite, "kn-role-quest-jungle-current")![0]).toContainEqual({ kind: "topic", topicId: "cat-basics", matched: "仕様", viaTopicId: "role-quests" });

    // 「フラッシュの仕様」：kn-flash-cd が一部一致から全条件一致の1位になる。「仕様」の理由は種類
    const flash = noteMatchesForQuery("フラッシュの仕様");
    const flashFull = flash.matches.filter((m) => m.tier === "full");
    expect(flashFull[0].note.id).toBe("kn-flash-cd");
    const ki = flash.units.findIndex((u) => u.matched === "仕様");
    expect(flashFull[0].bases[ki]).toEqual([{ kind: "noteKind", noteKind: "mechanic", matched: "仕様" }]);

    // 「タワーの仕様」：全条件一致は25件から29件。増えた4件は種類だけで「仕様」に一致した仕様のノート
    const tower = noteMatchesForQuery("タワーの仕様");
    const towerFull = tower.matches.filter((m) => m.tier === "full");
    const ti = tower.units.findIndex((u) => u.matched === "仕様");
    const kindOnly = towerFull.filter((m) => m.bases[ti].every((b) => b.kind === "noteKind"));
    expect(towerFull).toHaveLength(29);
    expect(kindOnly.map((m) => m.note.id).sort()).toEqual(["kn-homeguard-261", "kn-inhibitor-no-reinforced", "kn-invisible-counters", "kn-malzahar-voidlings"]);

    // 種類の一致は、大分類の Topic の語で、ノートの種類の表示名と同じときだけ。種類が違うノートには付けない
    for (const q of ["スマイトの仕様", "フラッシュの仕様", "タワーの仕様", "仕様変更"]) {
      const r = noteMatchesForQuery(q);
      for (const m of r.matches)
        m.bases.forEach((bs, i) => {
          for (const b of bs.filter((x) => x.kind === "noteKind")) {
            const u = r.units[i];
            expect(u.kind === "topic" && u.topic.kind === "category", `${q} ${m.note.id}`).toBe(true);
            expect(b).toEqual({ kind: "noteKind", noteKind: "mechanic", matched: "仕様" });
            expect(m.note.kind).toBe("mechanic");
          }
        });
    }
    // 大分類だけの検索は、種類で一致しても出さない（具体的な条件が必要という規則は変えない）
    expect(noteMatchesForQuery("仕様").matches).toEqual([]);
    expect(noteMatchesForQuery("ゲームの基本仕様").matches).toEqual([]);
    // 表示名でない大分類の別名（基礎・メカニクス・mechanics）、語として残る種類の名前（判断・仮説）、別の Topic（旧仕様）、
    // ロール・時期の大分類には、種類の一致を付けない
    for (const q of ["スマイトの基礎", "フラッシュのメカニクス", "smite mechanics", "判断", "ウェーブの判断", "カイトの判断", "仮説", "トレードの仮説", "旧仕様のタワープレート", "現行のタワープレート", "ミッド カイト", "旧シーズン ステルス", "カイト", "カイティング", "kiting", "カイトの練習方法"]) {
      const r = noteMatchesForQuery(q);
      expect(r.matches.flatMap((m) => m.bases.flat()).filter((b) => b.kind === "noteKind"), q).toEqual([]);
    }
    expect(noteMatchesForQuery("スマイトの基礎").matches.map((m) => m.note.id)).not.toContain("kn-smite-damage-261");
  });

  it("複合語を分けた語にも一般語の規則を当てる：「〜練習方法」は「〜の練習」と同じ条件になる（2026-11-09）", () => {
    const sig = (q: string) => {
      const r = noteMatchesForQuery(q);
      return JSON.stringify({ units: r.units.map((u) => u.key), ignored: r.ignored, matches: r.matches.map((m) => [m.note.id, m.tier, m.bases]) });
    };
    // 「方法」は一般語なので、複合語から分けても条件にしない。助詞で区切った入力・空白で区切った入力と、条件も結果も同じ
    for (const [a, ...same] of [
      ["カイトの練習方法", "カイトの練習", "カイト 練習"],
      ["カイティングの練習方法", "カイティングの練習"],
      ["アタックムーブの練習方法", "アタックムーブの練習"],
      ["CSの練習方法", "CSの練習"],
      ["練習方法", "練習の方法"],
    ]) {
      expect(noteMatchesForQuery(a).units.map((u) => u.matched)).not.toContain("方法");
      for (const b of same) expect(sig(a), `${a} = ${b}`).toBe(sig(b));
    }
    const kite = noteMatchesForQuery("カイトの練習方法");
    expect(kite.units.map((u) => [u.kind, u.matched])).toEqual([["topic", "カイト"], ["term", "練習"]]);
    const ids = kite.matches.map((m) => m.note.id);
    expect(kite.matches.find((m) => m.note.id === "kn-kite-practice-drill")?.tier).toBe("full");
    expect(ids.indexOf("kn-kite-practice-drill")).toBeLessThan(ids.indexOf("kn-cs-practice-rules"));
    // 一般語を含まない複合語は従来どおり2語に分ける。Topic の別名・ノートにある語そのものは分けない
    expect(noteMatchesForQuery("タワープレート").units.map((u) => u.matched)).toEqual(["タワー", "プレート"]);
    expect(noteMatchesForQuery("上達方法").units.map((u) => [u.kind, u.matched])).toEqual([["topic", "上達方法"]]);
    expect(noteMatchesForQuery("学習方法").units.map((u) => [u.kind, u.matched])).toEqual([["term", "学習方法"]]);
    // 分けた2語がどちらも一般語なら、条件にしない（単独の一般語と同じく、無視した語にも出さない）
    const both = noteMatchesForQuery("方法理由");
    expect(both.units).toEqual([]);
    expect(both.ignored).toEqual([]);
    expect(both.matches).toEqual([]);
  });

  it("空の検索語・ノートにない語だけの検索では何も出さない", () => {
    expect(noteMatchesForQuery("").matches).toEqual([]);
    // 「バロン」は 2026-11-02 から tol2 のアタックムーブのノートにある語になったので、ノートにない語の例を「アタカン」にする
    const r = noteMatchesForQuery("アタカン");
    expect(r.matches).toEqual([]);
    expect(r.ignored).toContain("アタカン");
  });
});
