import { describe, expect, it } from "vitest";
import questions from "../../data/experiments/note-questions.json";
import { analyzeQuery, search } from "../search/search";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import { ambiguousNameInText, containsTerm, normalize } from "../search/search";
import { MIN_NOTE_PHRASE_LENGTH, TOPIC_ALIAS_RELATIONS, validateTopicAliasRelations, type NarrowerAliasConcept } from "./topicAliasRelations";
import { counterTargetMatch, isBroaderTopicOnly, isCounterRequest, isTargetSpecific, labelOnlyTopicQuery, narrowerConceptOf, matchSynonymsOf, noteMatchesForQuery, rankSynonymsOf, statementHitCount, statementHitCountWithSynonyms, synonymBasesAllowed, type NoteMatch } from "./noteSearch";

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
    for (const q of ["ヴォイドグラブ", "コンディション", "タワーのプレートは、今も14分で落ちる？", "カイティング", "kiting", "カイト", "フラッシュのクールダウン", "ジャックスEのCD", "サモナースペル", "クールダウン", "操作技術・フィジカル", "ローム", "イグナイト", "フラッシュ", "カイト", "アタックムーブ", "引き撃ち", "barrier", "ナー", "フェイ", "パイク"]) {
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
      // Topic の表示名だけの検索だけ、対策の次に、その Topic（下位を含む）が付いたものを先にする（2026-11-10）
      const label = labelOnlyTopicQuery(normalize(q), units, noteMatchesForQuery(q).ignored);
      const att = (m: NoteMatch) => (label && m.bases[0].some((b) => b.kind === "topic") ? 1 : 0);
      for (let i = 1; i < ms.length; i++) {
        const [a, b] = [ms[i - 1], ms[i]];
        // 全条件一致が先、同じ段では旧仕様が後ろ（従来どおり）
        expect(a.tier === "partial" && b.tier === "full", q).toBe(false);
        if (a.tier !== b.tier) continue;
        expect(sup(a) - sup(b), `${q} ${a.note.id} ${b.note.id}`).toBeLessThanOrEqual(0);
        if (sup(a) !== sup(b)) continue;
        expect(ctr(a), `${q} ${a.note.id} ${b.note.id}`).toBeGreaterThanOrEqual(ctr(b));
        if (ctr(a) !== ctr(b)) continue;
        expect(att(a), `${q} ${a.note.id} ${b.note.id}`).toBeGreaterThanOrEqual(att(b));
        if (att(a) !== att(b)) continue;
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
    // 並び順用の同義語は理由に足さない。2026-11-10 からは、具体例の別の表記（topicAliasRelations.ts）による一致を「conceptVariant」として別に記録する
    // （「カイティング」の記述はなく、「カイト」が主張・補足などにある）。記述そのものの一致（field）・照合用の同義の表記（synonym）とは区別する
    const kt = kiting.matches.find((m) => m.note.id === "kn-kite-timing")!.bases;
    expect(kt[0][0]).toEqual({ kind: "topic", topicId: "mechanics", matched: "カイティング" });
    expect(kt[0].slice(1).length).toBeGreaterThan(0);
    expect(kt[0].slice(1).every((b) => b.kind === "conceptVariant" && b.noteTerm === "カイト" && b.matched === "カイティング")).toBe(true);

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

  it("Topic の正式な表示名だけの検索では、その Topic（下位を含む）が付いたノートを、名前に触れているだけのノートより先にする（2026-11-10）", () => {
    const ids = (q: string) => noteMatchesForQuery(q).matches.map((m) => m.note.id);
    const isLabelOnly = (q: string) => {
      const r = noteMatchesForQuery(q);
      return labelOnlyTopicQuery(normalize(q), r.units, r.ignored);
    };
    // 発動する：表示名（日本語・英語）そのもの。前後の空白は正規化で除く
    for (const q of ["サモナースペル", "クールダウン", "操作技術・フィジカル", "Summoner spells", "Cooldown", "ローム", "ウェーブ管理", "ヘカリム", "リコール", "サモナースペル　"]) expect(isLabelOnly(q), q).toBe(true);
    // 発動しない：別名・表示名を含む複数語の検索・無視した語や一般語・視点の語が残る検索・大分類
    for (const q of ["フラッシュ", "イグナイト", "サモスペ", "CD", "クールタイム", "カイト", "引き撃ち", "フィジカル", "フラッシュのクールダウン", "カイトの練習方法", "カイトへの対抗策",
      "サモナースペルの基本仕様", "サモナースペル 基本", "サモナースペルとは", "クールダウン管理", "CD クールダウン", "有利なときのリコール", "フリーズしないほうがいいとき", "ロームの対策", "基礎", "メカニクス", "仕様"]) expect(isLabelOnly(q), q).toBe(false);

    // 並び順：従来のキー（段・旧仕様・対策・主張の一致数・同義語を含む一致数・データの順）に、表示名だけの検索でだけ「Topic が付いている」を対策の次に加えた順と同じ
    const order = new Map(publicNotes.map((n, i) => [n.id, i]));
    const expected = (q: string) => {
      const r = noteMatchesForQuery(q);
      const label = labelOnlyTopicQuery(normalize(q), r.units, r.ignored);
      const key = (m: NoteMatch) => [
        (m.tier === "full" ? 0 : 2) + (m.note.historical?.current_applicability === "superseded" ? 1 : 0),
        isCounterRequest(q) && counterTargetMatch(m, r.units) ? 0 : 1,
        label && m.bases[0].some((b) => b.kind === "topic") ? 0 : 1,
        -statementHitCount(m),
        -statementHitCountWithSynonyms(m, r.units),
        order.get(m.note.id)!,
      ];
      const cmp = (a: number[], b: number[]) => a.reduce((d, x, i) => d || x - b[i], 0);
      return [...r.matches].sort((a, b) => cmp(key(a), key(b))).map((m) => m.note.id);
    };
    const labels = index.data.topics.filter((t) => t.kind !== "category").flatMap((t) => [t.label_ja, t.label_en]);
    const aliases = index.data.topics.flatMap((t) => t.aliases_ja);
    for (const q of [...labels, ...aliases, "フラッシュのクールダウン", "カイトの練習方法", "カイトへの対抗策", "サモナースペルの基本仕様", "有利なときのリコール", "CD クールダウン", "ミニオンに狙われないで敵を殴る", "ジャックスのEの対策", "Call for Help トレード", "通常攻撃のクールダウン"]) {
      expect(ids(q), q).toEqual(expected(q));
    }

    // サモナースペル（N46）：Topic が付いたノートが先。名前に触れているだけのノート（Topic なし）は後ろ。一致の集合・段は変えない
    const ss = noteMatchesForQuery("サモナースペル");
    expect(ss.units.map((u) => u.kind)).toEqual(["topic"]);
    expect([ss.matches.filter((m) => m.tier === "full").length, ss.matches.filter((m) => m.tier === "partial").length]).toEqual([11, 0]);
    expect(ids("サモナースペル").slice(0, 7)).toEqual(["kn-engage-when-flash-down", "kn-stealth-break-actions", "kn-flash-cd", "kn-smite-damage-261", "kn-dive-summoner-check", "kn-dive-flash-out-of-range", "kn-split-push-tp-pattern"]);
    for (const m of ss.matches.slice(0, 7)) expect(m.note.topic_ids, m.note.id).toContain("summoner-spells");
    for (const m of ss.matches.slice(7)) {
      expect(m.note.topic_ids, m.note.id).not.toContain("summoner-spells");
      // 名前に触れているだけ：Topic による一致はなく、主張に名前がある
      expect(m.bases[0].some((b) => b.kind === "topic"), m.note.id).toBe(false);
      expect(m.bases[0].some((b) => b.kind === "field" && b.field === "statement"), m.note.id).toBe(true);
    }
    // 別名・複数語の検索は、主張での一致を優先する従来の順（フラッシュの CD は全条件一致の1位のまま）
    expect(ids("フラッシュ")[0]).toBe("kn-flash-cd");
    expect(ids("フラッシュのクールダウン")[0]).toBe("kn-flash-cd");
    expect(ids("カイト").slice(0, 2)).toEqual(["kn-kite-timing", "kn-kite-vs-stutter-step"]);

    // ロームでは、Topic「ローム」が付いたノートを先にする（ウェーブの話でロームに触れたノートより先）
    expect(ids("ローム").slice(0, 4)).toEqual(["kn-learning-order-after-wave", "kn-roam-definition-cost", "kn-roam-roles", "kn-roam-immobile-mage"]);
    expect(ids("ヘカリム")[0]).toBe("kn-hecarim-w-drain");
    // ウェーブ管理：ミニオンのアグロのノート（Topic が付いている）は残り、1位になる
    expect(ids("ウェーブ管理")[0]).toBe("kn-minion-aggro-call-for-help");
    // 操作技術・フィジカル：一致したノートはすべて Topic が付いているので、従来の順と同じ
    expect(noteMatchesForQuery("操作技術・フィジカル").matches.every((m) => m.bases[0].some((b) => b.kind === "topic"))).toBe(true);

    // クールダウン：未検証の仮説のノート（6〜8秒の踏み込める時間）が3位に上がる。Topic「クールダウン」が直接付いているため。
    // 関連性の順であって検証状態ではない：種類・検証状態はノートのまま（画面のカードで「仮説」「未検証の仮説」と示す）
    const cd = noteMatchesForQuery("クールダウン");
    const tw = cd.matches.find((m) => m.note.id === "kn-trade-window-6-8s")!;
    expect(ids("クールダウン").indexOf("kn-trade-window-6-8s")).toBe(2);
    expect(tw.note.topic_ids).toContain("cooldown");
    expect(tw.bases[0]).toEqual([{ kind: "topic", topicId: "cooldown", matched: "クールダウン" }]);
    expect([tw.note.kind, tw.note.status, tw.tier]).toEqual(["hypothesis", "unverified", "full"]);
    expect(ids("クールダウン").slice(0, 2)).toEqual(["kn-cooldown-window", "kn-trade-on-key-cd"]);
    // このテストだけ時間制限を 15 秒にする（全体の既定 5 秒は変えない。2026-11-10）：全 Topic の表示名・別名（約770語）を検索し、期待する順を求め直すため重い。
    // 手元で約 1.7 秒。GitHub Actions では手元の約 2.9 倍かかった（Run #54：手元 約 2.1 秒 → 6,099ms で失敗）ため、約 5 秒と見込み、その約 3 倍の余裕を取る
  }, 15_000);

  it("Topic の具体例として確かめた別名の関係データ（topicAliasRelations.ts）：実在する Topic の登録済みの別名だけ、重複・矛盾なし（2026-11-10）", () => {
    expect(validateTopicAliasRelations(index.data.topics, TOPIC_ALIAS_RELATIONS)).toEqual([]);
    // 対象は、サモナースペルと操作技術の具体例だけ（2026-11-10 にスキルドッジを、記述の言い換えとともに追加）
    expect(TOPIC_ALIAS_RELATIONS.flatMap((r) => r.aliases).sort()).toEqual(["attack move", "barrier", "exhaust", "flash", "ignite", "kiting", "spacing", "アタックムーブ", "イグゾースト", "イグナイト", "カイティング", "カイト", "スキルドッジ", "スペーシング", "バリア", "フラッシュ", "引き撃ち"].sort());
    const bad = (rs: NarrowerAliasConcept[]) => validateTopicAliasRelations(index.data.topics, rs);
    // 記述の言い換えは、スキルドッジの「スキルショットを避ける」だけ
    expect(TOPIC_ALIAS_RELATIONS.filter((r) => r.note_phrases).map((r) => [r.aliases, r.note_phrases])).toEqual([[["スキルドッジ"], ["スキルショットを避ける"]]]);
    // 記述の言い換えは、Topic の名前・別名と同じ表現・短い一般語・重複を拒否する
    expect(bad([{ topic_id: "mechanics", relation: "narrower", aliases: ["スペーシング"], note_phrases: ["カイト"] }])).toEqual(["記述の言い換えが Topic の名前・別名と同じ：mechanics カイト", "記述の言い換えが短すぎる：mechanics カイト"]);
    expect(bad([{ topic_id: "mechanics", relation: "narrower", aliases: ["スペーシング"], note_phrases: ["避ける"] }])).toEqual(["記述の言い換えが短すぎる：mechanics 避ける"]);
    expect(MIN_NOTE_PHRASE_LENGTH).toBeGreaterThan([..."スキル"].length);
    expect(bad([{ topic_id: "mechanics", relation: "narrower", aliases: ["スペーシング"], note_phrases: ["間合いを管理する"] }, { topic_id: "mechanics", relation: "narrower", aliases: ["アタックムーブ"], note_phrases: ["間合いを管理する"] }])).toEqual(["記述の言い換えが重複：mechanics 間合いを管理する"]);
    expect(bad([{ topic_id: "no-such-topic", relation: "narrower", aliases: ["フラッシュ"] }])).toEqual(["不明な Topic：no-such-topic"]);
    // 対象の Topic にない別名（ほかの Topic の別名を含む）・表示名は拒否する
    expect(bad([{ topic_id: "summoner-spells", relation: "narrower", aliases: ["スマイト"] }])).toEqual(["Topic の別名にない：summoner-spells スマイト"]);
    expect(bad([{ topic_id: "summoner-spells", relation: "narrower", aliases: ["カイト"] }])).toEqual(["Topic の別名にない：summoner-spells カイト"]);
    expect(bad([{ topic_id: "summoner-spells", relation: "narrower", aliases: ["サモナースペル"] }])).toEqual(["表示名は対象にしない：summoner-spells サモナースペル"]);
    // 同じ Topic と別名の組（正規化して比べる）を2回登録できない（矛盾した分類・まとまりの重なりを防ぐ）
    expect(bad([{ topic_id: "summoner-spells", relation: "narrower", aliases: ["flash"] }, { topic_id: "summoner-spells", relation: "narrower", aliases: ["Flash", "ignite"] }])).toEqual(["同じ Topic と別名の組が重複：summoner-spells Flash"]);
    expect(bad([{ topic_id: "summoner-spells", relation: "related" as "narrower", aliases: ["バリア"] }])).toEqual(["未知の関係：summoner-spells related"]);
    // 同じ語がほかの Topic にも登録されうる：Topic と別名の組で引くので、ほかの Topic の同じ語には広がらない
    expect(bad([{ topic_id: "crowd-control", relation: "narrower", aliases: ["ブラインド"] }, { topic_id: "aa-negation", relation: "narrower", aliases: ["ブラインド"] }])).toEqual([]);
  });

  it("具体例の別名で検索したとき、上位の Topic が付いているだけのノートは全条件一致にせず関連候補にする。候補の集合は変えない（2026-11-10）", () => {
    const res = (q: string) => noteMatchesForQuery(q);
    const tierOf = (q: string, tier: "full" | "partial") => res(q).matches.filter((m) => m.tier === tier).map((m) => m.note.id);
    // 照合の条件は従来どおり上位の Topic（matchQueryUnits は変えない）。具体例かどうかは知識ノートの側で判定する
    for (const r of TOPIC_ALIAS_RELATIONS) for (const a of r.aliases) {
      const u = res(a).units;
      expect(u.map((x) => (x.kind === "topic" ? x.topic.id : x.kind)), a).toEqual([r.topic_id]);
      expect(narrowerConceptOf(u[0]), a).toBe(r);
    }
    // 未分類の別名・表示名・保留した語は対象にしない（従来どおり、関連候補へ移さない）
    for (const q of ["サモスペ", "summoners", "フィジカル", "mechanical skill", "サモナースペル", "操作技術・フィジカル", "CD", "ブラインド", "トリンケット", "ビルド"]) {
      const r = res(q);
      expect(r.units.map((u) => narrowerConceptOf(u)), q).toEqual([undefined]);
      expect(r.matches.some((m) => m.broaderUnits || m.bases.flat().some((b) => b.kind === "conceptVariant")), q).toBe(false);
      expect(r.matches.every((m) => m.tier === "full"), q).toBe(true);
    }

    // イグナイト：記述にイグナイトがある2件だけが全条件一致。サモナースペルが付いているだけの6件は関連候補（消さない）
    expect(tierOf("イグナイト", "full")).toEqual(["kn-stealth-break-actions", "kn-standard-reveal-not-stealth"]);
    expect([...tierOf("イグナイト", "partial")].sort()).toEqual(["kn-flash-cd", "kn-engage-when-flash-down", "kn-smite-damage-261", "kn-dive-summoner-check", "kn-dive-flash-out-of-range", "kn-split-push-tp-pattern"].sort());
    for (const m of res("イグナイト").matches.filter((x) => x.tier === "partial")) {
      expect(isBroaderTopicOnly(m), m.note.id).toBe(true);
      expect(m.broaderUnits).toEqual([0]);
      expect(m.bases[0].every((b) => b.kind === "topic" && b.topicId === "summoner-spells"), m.note.id).toBe(true);
    }
    // 英語の表記（ignite・barrier）も同じ具体例。「barrier」はノートの「バリア」で全条件一致になる
    expect(tierOf("ignite", "full")).toEqual(["kn-stealth-break-actions"]);
    expect(tierOf("barrier", "full")).toEqual(tierOf("バリア", "full"));
    expect(res("barrier").matches.find((m) => m.note.id === "kn-dive-summoner-check")!.bases[0]).toContainEqual({ kind: "conceptVariant", field: "statement", matched: "barrier", noteTerm: "バリア" });
    // フラッシュ：直接の一致は全条件一致のまま（flash-cd が1位）。フラッシュに触れないスマイト・テレポートのノートだけが関連候補
    expect(res("フラッシュ").matches[0].note.id).toBe("kn-flash-cd");
    expect(tierOf("フラッシュ", "partial")).toEqual(["kn-smite-damage-261", "kn-split-push-tp-pattern"]);
    // カイト：同じ具体例の表記（カイト・カイティング・kiting・引き撃ち）は同じ9件が全条件一致。操作技術全般のノートは関連候補
    const kite9 = [...tierOf("カイト", "full")].sort();
    expect(kite9).toHaveLength(9);
    for (const q of ["カイティング", "kiting", "引き撃ち"]) expect([...tierOf(q, "full")].sort(), q).toEqual(kite9);
    expect(tierOf("カイト", "partial")).toContain("kn-skill-three-layers");
    expect(res("引き撃ち").matches.find((m) => m.note.id === "kn-kite-timing")!.bases[0].some((b) => b.kind === "conceptVariant" && b.noteTerm === "カイト")).toBe(true);
    // アタックムーブ・スペーシングは、カイトとは別の具体例（カイトの記述だけでは一致しない）
    expect(tierOf("アタックムーブ", "full")).toEqual(["kn-attack-move-settings", "kn-attack-move-brush-tower", "kn-attack-move-click", "kn-kite-practice-drill"]);
    expect(tierOf("アタックムーブ", "partial")).toContain("kn-kite-timing");
    expect(tierOf("スペーシング", "full")).toEqual(["kn-right-click-core-physical", "kn-spacing-range-advantage"]);

    // 複合の検索：上位の Topic だけで全条件一致にしない。対象に直接一致するノートは全条件一致のまま（案D・案F・案A を壊さない）
    expect(tierOf("フラッシュのクールダウン", "full")).toEqual(["kn-flash-cd", "kn-engage-when-flash-down", "kn-roam-prerequisites"]);
    expect(tierOf("イグナイトの仕様", "full")).toEqual(["kn-stealth-break-actions", "kn-standard-reveal-not-stealth"]);
    expect(tierOf("フラッシュの仕様", "partial")).toContain("kn-smite-damage-261");
    expect(tierOf("カイトへの対抗策", "full").slice(0, 2)).toEqual(["kn-anti-kite-tools", "kn-anti-kite-terrain"]);
    expect(tierOf("カイトの練習方法", "full")).toEqual(["kn-kite-learning-champions", "kn-kite-practice-drill"]);
    expect(tierOf("カイトの練習方法", "partial")).toContain("kn-cs-practice-rules");
    // Topic の表示名だけの検索（C3L1v）は対象外
    expect(tierOf("サモナースペル", "partial")).toEqual([]);

    // 規則：対象の語・複合の検索・すべての Topic の別名と表示名で、
    // 関連候補へ移ったノートは、その条件が上位の Topic だけで、記述に同じ具体例のどの表記もない。条件が1つの検索の関連候補はこの理由のものだけ
    const queries = [...new Set([...TOPIC_ALIAS_RELATIONS.flatMap((r) => r.aliases), ...index.data.topics.flatMap((t) => [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en]), "フラッシュのクールダウン", "イグナイトのダメージ", "カイティング 攻撃速度", "バリアとフラッシュ", "フラッシュが落ちている相手に仕掛けるべき？"])];
    for (const q of queries) {
      const r = res(q);
      for (const m of r.matches) {
        expect(publicIds.has(m.note.id), q).toBe(true);
        for (const i of m.broaderUnits ?? []) {
          expect(narrowerConceptOf(r.units[i]), `${q} ${m.note.id}`).toBeDefined();
          expect(m.bases[i].every((b) => b.kind === "topic"), `${q} ${m.note.id}`).toBe(true);
          expect(m.tier, `${q} ${m.note.id}`).toBe("partial");
        }
        // 別の表記の一致は、その具体例のまとまりの語だけ（ほかの Topic・ほかの具体例には広げない）
        m.bases.forEach((bs, i) => {
          for (const b of bs) {
            if (b.kind !== "conceptVariant") continue;
            const c = narrowerConceptOf(r.units[i]);
            expect(c?.aliases.map(normalize), `${q} ${m.note.id}`).toContain(normalize(b.noteTerm));
            expect(m.note.topic_ids.some((id) => id === c!.topic_id || index.descendants(c!.topic_id).has(id)), `${q} ${m.note.id}`).toBe(true);
          }
        });
        const opposing = m.bases.some((bs, i) => r.units[i].kind !== "creator" && bs.length > 0 && bs.every((b) => (b.kind === "field" || b.kind === "synonym") && ["exceptions", "falsifiers"].includes(b.field)));
        expect(m.opposingOnly, `${q} ${m.note.id}`).toBe(opposing);
      }
      if (r.units.length === 1) for (const m of r.matches.filter((x) => x.tier === "partial")) expect(isBroaderTopicOnly(m), `${q} ${m.note.id}`).toBe(true);
    }
  });

  it("スキルドッジ：記述の言い換え「スキルショットを避ける」で専用のノートを全条件一致にし、操作技術が付いているだけのノートは関連候補にする（2026-11-10）", () => {
    const res = (q: string) => noteMatchesForQuery(q);
    const tierOf = (q: string, tier: "full" | "partial") => res(q).matches.filter((m) => m.tier === tier).map((m) => m.note.id);
    const sd = res("スキルドッジ");
    // 記述に「スキルドッジ」がある1件と、言い換えがある専用のノートの2件だけが全条件一致。候補の合計は従来の41件のまま
    expect(tierOf("スキルドッジ", "full")).toEqual(["kn-right-click-core-physical", "kn-skill-dodge-perpendicular"]);
    expect(sd.matches).toHaveLength(41);
    expect(sd.matches.filter((m) => m.tier === "partial").every(isBroaderTopicOnly)).toBe(true);
    // 一致の理由：直接の一致は記述（field）、専用のノートは言い換え（conceptPhrase、記述の種類つき）。別名の表記違い（conceptVariant）とは区別する
    expect(sd.matches[0].bases[0].some((b) => b.kind === "field" && b.field === "statement")).toBe(true);
    const ded = sd.matches.find((m) => m.note.id === "kn-skill-dodge-perpendicular")!;
    expect(ded.bases[0]).toEqual([
      { kind: "topic", topicId: "mechanics", matched: "スキルドッジ" },
      { kind: "conceptPhrase", field: "statement", matched: "スキルドッジ", notePhrase: "スキルショットを避ける" },
    ]);
    expect(ded.broaderUnits).toBeUndefined();
    // 練習方法：専用のノート（練習の手順を含む）が全条件一致。操作技術が付いているだけのノートは全条件一致にしない
    expect(tierOf("スキルドッジの練習方法", "full")).toContain("kn-skill-dodge-perpendicular");
    expect(tierOf("スキルドッジの練習方法", "full")).not.toContain("kn-cs-practice-rules");
    // 言い換えの表現そのものでの検索は、別名ではないので従来どおり（語の照合。Topic の条件にはしない）
    expect(res("スキルショットを避ける").units.every((u) => u.kind === "term")).toBe(true);
    expect(tierOf("スキルショットを避ける", "full")[0]).toBe("kn-skill-dodge-perpendicular");
    // 一般語だけ（「避ける」「スキル」）や、ほかの具体例（カイト・アタックムーブ・スペーシング）には言い換えを使わない
    for (const q of ["カイト", "カイティング", "kiting", "アタックムーブ", "スペーシング", "カイトの練習方法", "カイトへの対抗策", "操作技術・フィジカル", "避ける", "スキル"]) {
      expect(res(q).matches.some((m) => m.bases.flat().some((b) => b.kind === "conceptPhrase")), q).toBe(false);
    }
    expect(tierOf("カイト", "partial")).toContain("kn-skill-dodge-perpendicular");
    expect(tierOf("アタックムーブ", "partial")).toContain("kn-skill-dodge-perpendicular");
    // 言い換えは、その Topic が付いたノートだけに記録する（Topic が付いていないノートを候補に足さない）
    for (const q of ["スキルドッジ", "スキルドッジの練習方法"]) {
      for (const m of res(q).matches) if (m.bases.flat().some((b) => b.kind === "conceptPhrase")) expect(m.note.topic_ids, `${q} ${m.note.id}`).toContain("mechanics");
    }
  });

  it("年代の指定（「2013年」）：主張・成立条件に書かれた年代とだけ照合し、資料の日付・あいまいな語は使わない（2026-11-10）", () => {
    const res = (q: string) => noteMatchesForQuery(q);
    const tierOf = (q: string, tier: "full" | "partial") => res(q).matches.filter((m) => m.tier === tier).map((m) => m.note.id);
    // 2013年：主張の「2013-11-20」（V3.14）に一致する歴史的なノートだけが全条件一致。年代の表現と記述の種類を記録する
    const y13 = res("2013年のピンクワード");
    expect(y13.units.map((u) => u.matched)).toEqual(["ピンクワード", "2013年"]);
    expect(y13.ignored).toEqual([]);
    expect(tierOf("2013年のピンクワード", "full")).toEqual(["kn-hist-ward-limit-v3-14"]);
    expect(y13.matches[0].bases[1]).toEqual([{ kind: "year", field: "statement", matched: "2013年", noteText: "2013-11-20" }]);
    // 現行のコントロールワードのノートは、2013年の仕様として全条件一致にしない（候補からは消さない）
    for (const id of ["kn-control-ward-reveals", "kn-control-ward-not-invisible", "kn-control-ward-periodic-scan", "kn-ward-item-true-sight-wards-only"]) {
      const m = y13.matches.find((x) => x.note.id === id)!;
      expect(m.tier, id).toBe("partial");
      expect(m.bases[1], id).toEqual([]);
    }
    expect(y13.matches.map((m) => m.note.id).sort()).toEqual(res("ピンクワード").matches.map((m) => m.note.id).sort());
    // 2014年：「2014年1月時点」の主張のノートだけ。「Preseason 2014」のような名前・「2000手前」のような数は年代として扱わない
    expect(tierOf("2014年のワード", "full")).toEqual(["kn-hist-ward-full-duration-2014"]);
    expect(tierOf("2014年のワード", "partial")).toContain("kn-hist-ward-limit-v3-14");
    expect(tierOf("2013年", "full")).toEqual(["kn-hist-ward-limit-v3-14"]);
    expect(tierOf("2014年", "full")).toEqual(["kn-hist-ward-full-duration-2014"]);
    expect(res("2000年").yearsNotUsed).toEqual(["2000年"]);
    // 補足・根拠の要約の資料の日付（「2022年の記事」「2026-10-27」など）には一致させない
    expect(tierOf("2022年のファーストウェーブ", "full")).toEqual(["kn-first-wave-melee-trim"]);
    for (const id of ["kn-spacing-range-advantage", "kn-aa-interval-from-attack-speed", "kn-attack-move-settings", "kn-as-steroid-practice"]) expect(res("2022年").matches.map((m) => m.note.id), id).not.toContain(id);
    expect(tierOf("2025年の攻撃速度上限", "full")).toEqual(["kn-as-cap-3003"]);
    // 主張・成立条件にその年代を書いたノートがない年は照合に使わず、そのことを記録する（現行のノートを関連候補に落とさない）
    const y26 = res("2026年のコントロールワード");
    expect(y26.yearsNotUsed).toEqual(["2026年"]);
    expect(y26.units.map((u) => u.matched)).toEqual(res("コントロールワード").units.map((u) => u.matched));
    expect(tierOf("2026年のコントロールワード", "full")).toEqual(tierOf("コントロールワード", "full"));
    // あいまいな時代の語は、年・パッチに変換せず、使わなかったことを記録する（照合の結果は語がない検索と同じ）
    for (const [q, w] of [["昔のピンクワード", "昔"], ["今のピンクワード", "今"], ["旧ピンクワード", "旧"]]) {
      const r = res(q);
      expect(r.eraWordsNotUsed, q).toEqual([w]);
      expect(r.matches.map((m) => [m.note.id, m.tier]), q).toEqual(res("ピンクワード").matches.map((m) => [m.note.id, m.tier]));
    }
    // 照合に使った語（Topic の別名「旧仕様」など）に含まれる字は、あいまいな語として示さない
    expect(res("旧仕様のクールダウン").eraWordsNotUsed).toBeUndefined();
    // 年代の指定のない検索・年の語を含まない検索は従来どおり
    for (const q of ["ピンクワード", "コントロールワード", "control ward", "ビジョンワード", "スキルドッジ", "サモナースペル"]) {
      const r = res(q);
      expect(r.yearsNotUsed, q).toBeUndefined();
      expect(r.matches.some((m) => m.bases.flat().some((b) => b.kind === "year")), q).toBe(false);
    }
  });

  it("曖昧なチャンピオン名（ambiguousNames.json）は、記述でも検索語の解析と同じ規則で照合し、ほかのカタカナ語の一部には一致させない（2026-11-10）", () => {
    // 規則：前後が別のカタカナに続く一致は採らず、affixes の語（例：ミッド）との連結は採る。曖昧な名前でなければ判定しない（undefined）
    expect(ambiguousNameInText(normalize("サモナースペル"), "ナー")).toBe(false);
    expect(ambiguousNameInText(normalize("ミッドレーナー"), "ナー")).toBe(false);
    expect(ambiguousNameInText(normalize("レナータ・グラスク"), "ナー")).toBe(false);
    expect(ambiguousNameInText(normalize("（ケネン・ナー）"), "ナー")).toBe(true);
    expect(ambiguousNameInText(normalize("アーリーゲーム"), "アーリ")).toBe(false);
    expect(ambiguousNameInText(normalize("アーリのQ"), "アーリ")).toBe(true);
    expect(ambiguousNameInText(normalize("ミッドアーリ"), "アーリ")).toBe(true);
    expect(ambiguousNameInText(normalize("ツイステッド・フェイト"), "フェイ")).toBe(false);
    expect(ambiguousNameInText(normalize("ジンクス"), "ジン")).toBe(false);
    expect(ambiguousNameInText(normalize("パワースパイク"), "パイク")).toBe(false);
    expect(ambiguousNameInText(normalize("サモナースペル"), "フラッシュ")).toBeUndefined();
    // 資料の検索などが使う containsTerm（部分一致）は変えない
    expect(containsTerm(normalize("サモナースペル"), "ナー")).toBe(true);

    const res = (q: string) => noteMatchesForQuery(q);
    const ids = (q: string) => res(q).matches.map((m) => m.note.id);
    // ナー：「ケネン・ナー」と書いたノートだけ。「サモナースペル」「サモナーズリフト」「レーナー」「レナータ」だけのノートは一致しない
    expect(ids("ナー")).toEqual(["kn-as-steroid-practice"]);
    expect(res("ナー").matches[0].bases[0]).toEqual([{ kind: "field", field: "statement", matched: "ナー" }]);
    for (const id of ["kn-engage-when-flash-down", "kn-cc-suppression", "kn-role-quest-support-current", "kn-midlaner-block-invade", "kn-dive-speed", "kn-resurrection-priority"]) expect(ids("ナー"), id).not.toContain(id);
    expect(ids("ナーの通常攻撃")).toEqual(["kn-as-steroid-practice"]);
    expect(res("ミッドナー").matches.filter((m) => m.tier === "full")).toEqual([]);
    // 記述の種類が違っても同じ規則：根拠の要約（フェイ・ケイン）、補足（パイク）、主張（パイク）
    expect(ids("フェイ")).toEqual(["kn-immobile-mage-not-alone"]);
    expect(res("フェイ").matches[0].bases[0]).toEqual([{ kind: "field", field: "evidence", matched: "フェイ" }]);
    expect(ids("ケイン")).toEqual(["kn-dive-champions"]);
    expect(ids("パイク")).not.toContain("kn-side-or-teamfight-strength");
    expect(ids("パイク")).toEqual(expect.arrayContaining(["kn-pyke-w-camouflage", "kn-camouflage-indicators", "kn-detection-levels"]));
    expect(res("パイク").matches.find((m) => m.note.id === "kn-camouflage-indicators")!.bases[0]).toEqual([{ kind: "field", field: "notes", matched: "パイク" }]);
    // Topic が直接付いたノートの一致は残す（ジン：Topic とノートの記述「ジン」）。「ジンクス」だけのノートは一致しない
    expect(ids("ジン")).toEqual(["kn-stealthed-traps-reveal"]);
    expect(res("ジン").matches[0].bases[0].some((b) => b.kind === "topic")).toBe(true);
    expect(ids("ジン")).not.toContain("kn-as-cap-3003");
    expect(ids("ゼリ")).toEqual(["kn-as-cap-3003"]);
    // 新しい同義語は推測しない：英語名・ほかの語は従来どおり
    expect(res("Gnar").matches).toEqual([]);
    expect(res("ナーフ").ignored).toEqual(["ナーフ"]);
    expect(res("アーリーゲーム").units).toEqual([]);
    // 曖昧な名前ではない検索は従来どおり（サモナースペルは11件の全条件一致のまま）
    expect(res("サモナースペル").matches.filter((m) => m.tier === "full")).toHaveLength(11);
  });

  it("空の検索語・ノートにない語だけの検索では何も出さない", () => {
    expect(noteMatchesForQuery("").matches).toEqual([]);
    // 「バロン」は 2026-11-02 から tol2 のアタックムーブのノートにある語になったので、ノートにない語の例を「アタカン」にする
    const r = noteMatchesForQuery("アタカン");
    expect(r.matches).toEqual([]);
    expect(r.ignored).toContain("アタカン");
  });
});
