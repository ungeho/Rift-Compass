import { describe, expect, it } from "vitest";
import questions from "../../data/experiments/note-questions.json";
import { analyzeQuery, search } from "../search/search";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import { containsTerm, normalize } from "../search/search";
import { counterTargetMatch, isCounterRequest, isTargetSpecific, matchSynonymsOf, noteMatchesForQuery, rankSynonymsOf, statementHitCount, statementHitCountWithSynonyms, synonymBasesAllowed, type NoteMatch } from "./noteSearch";

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
    for (const q of ["ヴォイドグラブ", "コンディション", "タワーのプレートは、今も14分で落ちる？", "カイティング", "kiting", "カイト", "フラッシュのクールダウン", "ジャックスEのCD"]) {
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
    const queries = [...QS.map((q) => q.text), "カイト", "カイティング", "kiting", "アタックムーブ", "サモナースペル", "プレート", "スロウ", "シャコ", "ローム", "ゼドのRの対策", "CCへの対策", "対面対策"];
    for (const q of queries) {
      const { matches: ms, units } = noteMatchesForQuery(q);
      const syn = (m: NoteMatch) => statementHitCountWithSynonyms(m, units);
      // 対策を求める検索だけ、旧仕様の次に、対象と結び付いた対策の記述があるものを先にする
      const ctr = (m: NoteMatch) => (isCounterRequest(q) && counterTargetMatch(m, units) ? 1 : 0);
      for (let i = 1; i < ms.length; i++) {
        const [a, b] = [ms[i - 1], ms[i]];
        // 全条件一致が先、同じ段では旧仕様が後ろ（従来どおり）
        expect(a.tier === "partial" && b.tier === "full", q).toBe(false);
        if (a.tier !== b.tier) continue;
        expect(sup(a) - sup(b), `${q} ${a.note.id} ${b.note.id}`).toBeLessThanOrEqual(0);
        if (sup(a) !== sup(b)) continue;
        expect(ctr(a), `${q} ${a.note.id} ${b.note.id}`).toBeGreaterThanOrEqual(ctr(b));
        if (ctr(a) !== ctr(b)) continue;
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

  it("対策を求める検索では、検索の対象と結び付いた対策の記述があるノートを同じ段の中で先にする。一致の集合は変えない（2026-11-09）", () => {
    const ids = (q: string) => noteMatchesForQuery(q).matches.map((m) => m.note.id);
    const tiers = (q: string) => noteMatchesForQuery(q).matches.map((m) => `${m.note.id}:${m.tier}`).sort();
    const anti = ["kn-anti-kite-tools", "kn-anti-kite-terrain"];
    // カイトされる側の対抗手段のノートが1・2位。言い方（対抗策・対策・カウンター・される側）が違っても同じ
    for (const [q, plain] of [
      ["カイトへの対抗策", "カイト"],
      ["カイト対策", "カイト"],
      ["カイトへのカウンター", "カイト"],
      ["カイトされる側の立ち回り", "カイト"],
      ["カイティングへの対抗策", "カイティング"],
      ["カイティング対策", "カイティング"],
    ]) {
      const r = noteMatchesForQuery(q);
      expect(r.cues.side, q).toBe(true);
      expect(r.units.map((u) => u.matched), q).toEqual([plain]);
      expect(ids(q).slice(0, 2), q).toEqual(anti);
      // 並び順だけを変える：一致の集合と段は、対策の表現のない検索と同じ
      expect(tiers(q), q).toEqual(tiers(plain));
    }
    // 「対抗策」は照合の条件にも、ノートに見つからなかった語にもしない（「対策」と同じ扱い）
    expect(noteMatchesForQuery("カイトへの対抗策").ignored).toEqual([]);
    // 評価の質問の順位（N21・N36・N39・N41）
    expect(ids("カイトへの対抗策").slice(0, 7)).toEqual([...anti, "kn-kite-timing", "kn-kite-vs-stutter-step", "kn-kite-learning-champions", "kn-kite-stats", "kn-kite-practice-drill"]);
    expect(ids("カイティングへの対抗策").slice(0, 4)).toEqual([...anti, "kn-right-click-core-physical", "kn-kite-vs-stutter-step"]);
    expect(ids("ジャックスのEの対策").slice(0, 2)).toEqual(["kn-jax-e-mechanic", "kn-vs-aa-negation-decision"]);
    expect(ids("カイトの練習方法").slice(0, 2)).toEqual(["kn-kite-learning-champions", "kn-kite-practice-drill"]);

    // 対象の違う対策のノートは上げない
    // 「CCへの対策」：Mordekaiser の R・カイトへの対策は CC に触れるが、CC への対策ではない
    const cc = noteMatchesForQuery("CCへの対策");
    expect(cc.matches.filter((m) => counterTargetMatch(m, cc.units))).toEqual([]);
    expect(ids("CCへの対策").slice(0, 3)).toEqual(["kn-dive-from-behind-wave", "kn-dive-hp-squishy", "kn-dive-champions"]);
    // 「ゼドのRの対策」：ゼドの対策側のノートは1位。カイトへの対策は、補足の例にゼドがあるだけなので最後のまま
    const zed = noteMatchesForQuery("ゼドのRの対策");
    expect(zed.matches.filter((m) => counterTargetMatch(m, zed.units)).map((m) => m.note.id)).toEqual(["kn-zed-r-zhonya-timing"]);
    expect(ids("ゼドのRの対策")[0]).toBe("kn-zed-r-zhonya-timing");
    expect(ids("ゼドのRの対策").at(-1)).toBe("kn-anti-kite-tools");
    // Topic（操作技術）に付いているだけのノートは、結び付いた対策とみなさない
    const kite = noteMatchesForQuery("カイトへの対抗策");
    expect(kite.matches.filter((m) => counterTargetMatch(m, kite.units)).map((m) => m.note.id)).toEqual(anti);

    // 対策を求める表現がない検索・Topic の名前だけの検索では、並び順を変えない（注意 cues.side とは別の処理）
    for (const q of ["カイトへの対抗策", "カイト対策", "カイトされる側の立ち回り", "CCへの対策", "ゼドのRの対策"]) expect(isCounterRequest(q), q).toBe(true);
    for (const q of ["カイトの使い方", "ゼドのRの使い方", "対面対策", "カウンターピック", "カイト", "カイトの練習方法"]) expect(isCounterRequest(q), q).toBe(false);
    expect(noteMatchesForQuery("カイトの使い方").cues.side).toBe(true);
    expect(ids("カイトの使い方")).toEqual(ids("カイト"));
    expect(ids("ゼドのRの使い方")[0]).toBe("kn-zed-r-mark");
    for (const q of ["対面対策", "カウンターピック"]) {
      const r = noteMatchesForQuery(q);
      expect(r.cues.side, q).toBe(true);
      expect(r.units.map((u) => u.kind), q).toEqual(["topic"]);
      expect(ids(q)[0], q).toBe("kn-dive-stasis-pools");
    }
    expect(ids("カイト").slice(0, 2)).toEqual(["kn-kite-timing", "kn-kite-vs-stutter-step"]);
    expect(ids("カイティング")[0]).toBe("kn-right-click-core-physical");
    expect(ids("kiting")[0]).toBe("kn-right-click-core-physical");
    expect(ids("スマイトの仕様")[0]).toBe("kn-smite-damage-261");
    expect(ids("スマイトを使わずに")[0]).toBe("kn-smite-damage-261");
    expect(ids("フラッシュがない相手には仕掛けない")[0]).toBe("kn-engage-when-flash-down");
  });

  it("照合用の同義の表記（CD・クールダウン）：検索の対象にも主張・成立条件で直接一致したノートでだけ、同じ条件の一致として扱う（2026-11-10）", () => {
    const ids = (r: ReturnType<typeof noteMatchesForQuery>, tier?: "full" | "partial") => r.matches.filter((m) => !tier || m.tier === tier).map((m) => m.note.id);
    const synonymBases = (r: ReturnType<typeof noteMatchesForQuery>) => r.matches.flatMap((m) => m.bases.flat()).filter((b) => b.kind === "synonym");
    // グループは CD とクールダウンの1組だけ。同じ Topic の別名・下位の Topic の語は同義にしない。並び順用の同義語とも別
    expect(matchSynonymsOf("CD")).toEqual([{ normalized: "クールダウン", display: "クールダウン" }]);
    expect(matchSynonymsOf("クールダウン")).toEqual([{ normalized: "cd", display: "CD" }]);
    for (const w of ["クールタイム", "スキル切れ", "CDR", "クールダウン短縮", "スキルヘイスト", "ヘイスト", "攻撃速度", "カイト", "kiting"]) expect(matchSynonymsOf(w), w).toEqual([]);
    expect(rankSynonymsOf("CD")).toEqual([]);
    // 英字の CD は単語として照合する（CDR・CDN・ACD には一致しない）
    for (const t of ["cdr", "cdn", "acd", "cd2"]) expect(containsTerm(t, "cd"), t).toBe(false);
    for (const t of ["cd中", "cd 300秒", "基本cdは"]) expect(containsTerm(t, "cd"), t).toBe(true);

    // フラッシュ：本文は「CD」。クールダウンの表記でも全条件一致の1位になり、条件の数は増えない
    const cd = noteMatchesForQuery("フラッシュのCD"), cooldown = noteMatchesForQuery("フラッシュのクールダウン");
    expect(cooldown.units.map((u) => u.key).sort()).toEqual(cd.units.map((u) => u.key).sort());
    expect(cooldown.units).toHaveLength(2);
    expect(ids(cd, "full")[0]).toBe("kn-flash-cd");
    expect(ids(cooldown, "full")[0]).toBe("kn-flash-cd");
    expect([...ids(cooldown, "full")].sort()).toEqual([...ids(cd, "full")].sort());
    // 一致の理由：入力した表記（matched）・ノートの表記（noteTerm）・記述の種類（field）を、直接の一致と区別して記録する
    const flash = cooldown.matches.find((m) => m.note.id === "kn-flash-cd")!;
    const ci = cooldown.units.findIndex((u) => u.matched === "クールダウン");
    expect(flash.bases[ci]).toEqual([
      { kind: "synonym", field: "statement", matched: "クールダウン", noteTerm: "CD" },
      { kind: "synonym", field: "evidence", matched: "クールダウン", noteTerm: "CD" },
    ]);
    // 同義の表記の一致は、主張・成立条件での直接の一致の数に入れない（並び順用の同義語を含めた数には入れる）
    expect([statementHitCount(flash), statementHitCountWithSynonyms(flash, cooldown.units)]).toEqual([1, 2]);
    // 「CD」と書いた検索では、本文の CD は直接の一致のまま
    expect(cd.matches.find((m) => m.note.id === "kn-flash-cd")!.bases.flat().some((b) => b.kind === "synonym")).toBe(false);

    // ジャックスE：「E」は1文字なので条件にしない。クールダウンの表記でも全条件一致の1位
    for (const q of ["ジャックスEのCD", "ジャックスEのクールダウン"]) {
      const r = noteMatchesForQuery(q);
      expect(r.units, q).toHaveLength(2);
      expect(ids(r, "full")[0], q).toBe("kn-jax-e-mechanic");
    }

    // 表記違いの組：全条件一致の集合が同じ（並び順は直接の一致を先にするので、同じとは限らない）
    for (const [a, b] of [["相手の主要スキルのCD", "相手の主要スキルのクールダウン"], ["ヘイストでCDはどう変わる", "ヘイストでクールダウンはどう変わる"], ["フラッシュ CD 300秒", "フラッシュ クールダウン 300秒"]]) {
      expect([...ids(noteMatchesForQuery(b), "full")].sort(), b).toEqual([...ids(noteMatchesForQuery(a), "full")].sort());
    }
    // 通常攻撃：対象（通常攻撃）が主張にあるノートは、どちらの表記でも全条件一致
    const aaCd = noteMatchesForQuery("通常攻撃のCD"), aaCooldown = noteMatchesForQuery("通常攻撃のクールダウン");
    for (const id of ["kn-aa-interval-from-attack-speed", "kn-kite-timing", "kn-aa-five-components", "kn-aa-as-a-skill"]) {
      expect(ids(aaCd, "full"), id).toContain(id);
      expect(ids(aaCooldown, "full"), id).toContain(id);
    }
    // 同じ段・同じ上位の条件なら、表記どおりの一致を先にする（同義の表記の一致は主張・成立条件での直接の一致の数に入らない）
    for (const q of ["フラッシュのクールダウン", "通常攻撃のクールダウン", "テレポートのクールダウン", "エズリアルQのCD", "ヘイストでクールダウンはどう変わる"]) {
      const r = noteMatchesForQuery(q);
      const key = (m: NoteMatch) => [(m.tier === "full" ? 0 : 2) + (m.note.historical?.current_applicability === "superseded" ? 1 : 0), isCounterRequest(q) && counterTargetMatch(m, r.units) ? 0 : 1];
      for (let i = 1; i < r.matches.length; i++) {
        const [a, b] = [r.matches[i - 1], r.matches[i]];
        if (JSON.stringify(key(a)) === JSON.stringify(key(b))) expect(statementHitCount(a), `${q} ${a.note.id} ${b.note.id}`).toBeGreaterThanOrEqual(statementHitCount(b));
      }
    }

    // 何の CD かを特定しない語（相手・敵・味方・自分・スキル）は対象の根拠にしない：相手のタワー・トップなど別の文脈の語と、自分側の CD が結び付かない。
    // 明示した語の一覧で判定し、ノートの出現数は使わない（無関係なノートが増えても判定が変わらない）
    for (const w of ["相手", "敵", "味方", "自分", "スキル"]) expect(isTargetSpecific(w), w).toBe(false);
    for (const w of ["フラッシュ", "ジャックス", "通常攻撃", "テレポート", "主要スキル", "エズリアル"]) expect(isTargetSpecific(w), w).toBe(true);
    // 「スキル」：同義の表記では全条件一致に上げない。表記どおりの一致（「スキルのCD」の本文の CD）はそのまま
    expect(synonymBases(noteMatchesForQuery("スキルのクールダウン"))).toEqual([]);
    const skillCd = noteMatchesForQuery("スキルのCD");
    expect(skillCd.matches.filter((m) => m.bases.flat().some((b) => b.kind === "synonym")).every((m) => m.bases[skillCd.units.findIndex((u) => u.matched === "cd")].some((b) => b.kind !== "synonym"))).toBe(true);
    expect(ids(skillCd, "full")).toEqual(expect.arrayContaining(["kn-jax-e-mechanic", "kn-kite-timing", "kn-cooldown-window"]));
    for (const q of ["相手のクールダウン", "相手のスキルのクールダウン"]) {
      const r = noteMatchesForQuery(q);
      for (const id of ["kn-roam-prerequisites", "kn-split-pusher-traits", "kn-split-push-failures", "kn-engage-when-flash-down"]) {
        const m = r.matches.find((x) => x.note.id === id);
        expect(m?.tier, `${q} ${id}`).not.toBe("full");
        expect(m?.bases.flat().some((b) => b.kind === "synonym") ?? false, `${q} ${id}`).toBe(false);
      }
    }

    // 対象のない検索・グループにない語：同義の表記を使わず、従来の照合のまま
    for (const q of ["CD", "クールダウン", "CD クールダウン", "CDR", "クールダウン短縮", "クールタイム", "フラッシュのクールタイム", "スキルヘイスト", "攻撃速度", "CDN"]) {
      expect(synonymBases(noteMatchesForQuery(q)), q).toEqual([]);
    }
    expect(noteMatchesForQuery("CD クールダウン").units).toHaveLength(1);
    expect(ids(noteMatchesForQuery("CDR"))).toEqual(["kn-cooldown-window"]);
    expect(ids(noteMatchesForQuery("フラッシュのクールタイム"), "full")).toEqual([]);
    // 対象の根拠にしないもの：Topic が付いているだけ（イグナイト・サモナースペル・旧仕様）、大分類（仕様）
    for (const q of ["イグナイトのクールダウン", "旧仕様のクールダウン", "クールダウンの仕様"]) {
      const r = noteMatchesForQuery(q);
      expect(ids(r, "full"), q).not.toContain("kn-flash-cd");
      expect(r.matches.find((m) => m.note.id === "kn-flash-cd")?.bases.flat().some((b) => b.kind === "synonym") ?? false, q).toBe(false);
    }

    // 同義の表記の一致は、ほかの具体的な条件への主張・成立条件での直接の一致があるときだけ。逆向きの印は同義の表記の一致にも当てる
    for (const q of ["フラッシュのクールダウン", "通常攻撃のクールダウン", "クールダウン中の相手に仕掛けるべきか", "テレポートのクールダウン", "エズリアルQのCD", "スキルのCD"]) {
      const r = noteMatchesForQuery(q);
      for (const m of r.matches) {
        m.bases.forEach((bs, i) => {
          if (bs.some((b) => b.kind === "synonym")) expect(synonymBasesAllowed(r.units, m.bases, i), `${q} ${m.note.id}`).toBe(true);
        });
        const opposing = m.bases.some((bs, i) => r.units[i].kind !== "creator" && bs.length > 0 && bs.every((b) => (b.kind === "field" || b.kind === "synonym") && ["exceptions", "falsifiers"].includes(b.field)));
        expect(m.opposingOnly, `${q} ${m.note.id}`).toBe(opposing);
        expect(publicIds.has(m.note.id)).toBe(true);
      }
    }
  });

  it("空の検索語・ノートにない語だけの検索では何も出さない", () => {
    expect(noteMatchesForQuery("").matches).toEqual([]);
    // 「バロン」は 2026-11-02 から tol2 のアタックムーブのノートにある語になったので、ノートにない語の例を「アタカン」にする
    const r = noteMatchesForQuery("アタカン");
    expect(r.matches).toEqual([]);
    expect(r.ignored).toContain("アタカン");
  });
});
