// 知識の散策（試験）の画面と抽選対象の検査（実データ）
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { index, isPublic } from "../data/dataset";
import { decisionById, SHOWCASE_IDS } from "../data/decisions";
import { explorePool, exploreTopics, isPublicNote, publicNotes } from "../data/explorePool";
import { classify, exploreKey, pickAll, pickMany, pickNext, type PickResult } from "../lib/explore";
import { decisionHref, EXPLORE_ALL, exploreHref, noteHref, parseHash, resourceHref } from "../router";
import { ExploreCard, ExplorePage, ManySummary, NoteSummary } from "./ExplorePage";
import { NotePage } from "./NotePage";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("抽選対象", () => {
  it("公開の教材と試験表示の判断材料だけで、非公開・試験表示外のものを含まない", () => {
    const res = explorePool.filter((x) => x.kind === "resource");
    const dec = explorePool.filter((x) => x.kind === "decision");
    expect(res).toHaveLength(index.publicResources.length);
    for (const x of res) expect(isPublic(index.resourceById.get(x.id)!)).toBe(true);
    expect(dec.map((x) => x.id).sort()).toEqual([...SHOWCASE_IDS].sort());
    expect(dec.map((x) => x.id)).not.toContain("du-first-wave-aggro-release");
    for (const x of dec) for (const r of x.relatedIds ?? []) expect(SHOWCASE_IDS).toContain(r);
  });
  it("Topic を変えると近い候補が変わり、データの少ない Topic でも1件選べる", () => {
    const a = classify(explorePool, "freeze", index).near.map((x) => x.id);
    const b = classify(explorePool, "matchup", index).near.map((x) => x.id);
    expect(a).not.toEqual(b);
    const small = exploreTopics().find((t) => t.nearCount === 1)!;
    expect(small).toBeDefined();
    const r = pickNext({ items: explorePool, topicId: small.id, distance: 0, seen: [], graph: index, rng: seq([0.3]) })!;
    expect(r.group).toBe("near");
    const r2 = pickNext({ items: explorePool, topicId: small.id, distance: 0, seen: r.seen, graph: index, rng: seq([0.3]) })!;
    // 近い候補が1件だけなので、同じ1件を続けて出さず、別のグループ（中間）から出して知らせる
    expect(r2.item.id).not.toBe(r.item.id);
    expect(r2.fellBack).toBe(true);
    expect(r2.group).toBe("middle");
  });
});

describe("散策の画面", () => {
  it("URL で Topic と距離を持ち、範囲外の距離は 0〜100 に収める", () => {
    expect(parseHash(exploreHref("freeze", 70))).toEqual({ name: "explore", topic: "freeze", distance: 70, count: 20 });
    expect(parseHash("#/explore?d=250")).toEqual({ name: "explore", topic: "", distance: 100, count: 20 });
    expect(parseHash("#/explore")).toEqual({ name: "explore", topic: "", distance: 30, count: 20 });
    // 件数は 1・20・50・100 だけ。既定（20）は URL に書かず、既存の URL と同じ形
    expect(exploreHref("freeze", 70)).toBe("#/explore?topic=freeze&d=70");
    for (const n of [1, 50, 100] as const) expect(parseHash(exploreHref("freeze", 70, n))).toEqual({ name: "explore", topic: "freeze", distance: 70, count: n });
    // 不正値・空値・未指定は既定の20件
    for (const q of ["n=7", "n=", "n=abc", "n=-1", "n=1000", "n=0", ""]) {
      expect(parseHash(`#/explore?topic=freeze&d=70${q ? "&" + q : ""}`)).toEqual({ name: "explore", topic: "freeze", distance: 70, count: 20 });
    }
  });
  it("Topic・距離・ボタンがあり、割合と候補数を示す。Topic を選ぶまでボタンは押せない。おすすめとは書かない", () => {
    // 1件ずつ（従来の表示）
    const empty = renderToStaticMarkup(<ExplorePage topic="" distance={30} count={1} />);
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>別の知識を見る<\/button>/);
    const markup = renderToStaticMarkup(<ExplorePage topic="freeze" distance={50} count={1} />);
    expect(markup).toContain('<label for="explore-topic">');
    expect(markup).toContain('<label for="explore-distance">');
    expect(markup).toContain('type="range"');
    expect(text(markup)).toContain("抽選の割合：近い 25%・中間 50%・遠い 25%");
    expect(text(markup)).toMatch(/候補：近い \d+件・中間 \d+件・遠い \d+件/);
    expect(markup).not.toMatch(/<button[^>]*disabled/);
    // 「おすすめや正しさの判定ではありません」という否定の説明以外に、おすすめ・最適とは書かない
    expect(text(markup)).not.toMatch(/おすすめ(?!や正しさの判定ではありません)|最適/);
  });
  it("教材と判断材料を区別し、正しい詳細へリンクする。表示対象外の id は出さない", () => {
    const base = { group: "near" as const, fellBack: false, cycled: false, seen: [] };
    const r = index.publicResources[0];
    const rm = renderToStaticMarkup(<ExploreCard result={{ ...base, item: { kind: "resource", id: r.id, topicIds: r.topic_ids } } as PickResult} topicLabel="X" />);
    expect(text(rm)).toContain("教材");
    expect(rm).toContain(`href="${resourceHref(r.id)}"`);
    const u = decisionById("du-trade-checklist")!;
    const dm = renderToStaticMarkup(<ExploreCard result={{ ...base, group: "far", item: { kind: "decision", id: u.id, topicIds: u.topic_ids } } as PickResult} topicLabel="X" />);
    expect(text(dm)).toContain("判断材料（試験）");
    expect(dm).toContain(`href="${decisionHref(u.id)}"`);
    expect(text(dm)).toContain("「原典の主張」と「AI の解釈」に分けて");
    expect(text(dm)).toContain("内容が無関係という意味ではありません");
    for (const bad of [{ kind: "decision" as const, id: "du-first-wave-aggro-release" }, { kind: "resource" as const, id: "no-such-id" }]) {
      const m = renderToStaticMarkup(<ExploreCard result={{ ...base, item: { ...bad, topicIds: [] } } as PickResult} topicLabel="X" />);
      expect(text(m)).toContain("この知識は表示の対象にありません");
    }
  });
});

describe("候補切れ・切り替えの知らせ", () => {
  const base = { item: { kind: "resource" as const, id: index.publicResources[0].id, topicIds: [] }, seen: [] };
  const notice = (r: Partial<PickResult>) => text(renderToStaticMarkup(<ExploreCard result={{ ...base, group: "middle", fellBack: false, cycled: false, ...r } as PickResult} topicLabel="X" />));
  it("一巡・別グループへの切り替え・その両方を、それぞれ1つの知らせで示す", () => {
    expect(notice({ cycled: true })).toContain("最初から表示し直しています");
    expect(notice({ fellBack: true })).toContain("選んだ距離に当たる候補がないため、「中間」の候補から");
    const both = notice({ cycled: true, fellBack: true });
    expect(both).toContain("選んだ距離の候補は直前に表示した1件だけなので、「中間」の候補から");
    expect(both).not.toContain("最初から表示し直しています");
  });
});

describe("まとめて抽選（20・50・100件）", () => {
  it("件数の選択欄があり、既定は20件。ボタンは件数を示し、Topic を選ぶまで押せない。段階的に表示すると説明する", () => {
    const empty = text(renderToStaticMarkup(<ExplorePage topic="" distance={30} />));
    expect(empty).toContain("1回に表示する件数");
    const markup = renderToStaticMarkup(<ExplorePage topic="freeze" distance={30} />);
    expect(markup).toContain('<label for="explore-count">');
    expect(markup).toMatch(/<option value="20" selected="">20件<\/option>/);
    for (const n of ["1件ずつ", "50件", "100件"]) expect(text(markup)).toContain(n);
    expect(markup).toMatch(/<button[^>]*>20件を抽選する<\/button>/);
    expect(text(markup)).toContain("20件ずつ表示します");
    expect(renderToStaticMarkup(<ExplorePage topic="" distance={30} count={100} />)).toMatch(/<button[^>]*disabled=""[^>]*>100件を抽選する<\/button>/);
  });

  it("実データ：どの Topic・距離・件数でも、重複なしで、割合が0の距離の候補を使わない", () => {
    const rng = seq([0.13, 0.57, 0.91, 0.33, 0.71]);
    for (const t of exploreTopics()) {
      for (const d of [0, 30, 50, 100]) {
        for (const n of [1, 20, 50, 100]) {
          const r = pickMany({ items: explorePool, topicId: t.id, distance: d, count: n, graph: index, rng });
          const ks = r.picks.map((p) => exploreKey(p.item));
          expect(new Set(ks).size).toBe(ks.length);
          expect(ks.length).toBeLessThanOrEqual(n);
          for (const p of r.picks) expect(r.eligible).toContain(p.group);
          const avail = r.eligible.reduce((m, g) => m + r.breakdown[g].available, 0);
          expect(ks.length).toBe(Math.min(n, avail));
        }
      }
    }
    // 全体（107件）でも100件を重複なしに選べる
    const all = pickMany({ items: explorePool, topicId: "freeze", distance: 50, count: 100, graph: index, rng });
    expect(explorePool.length).toBeGreaterThanOrEqual(100);
    expect(new Set(all.picks.map((p) => exploreKey(p.item))).size).toBe(all.picks.length);
  });

  it("候補が足りないときは、表示した件数・対象の距離・使わなかった距離を示し、重複で埋めないと書く", () => {
    const r = pickMany({ items: explorePool, topicId: "freeze", distance: 0, count: 100, graph: index, rng: seq([0.4]) });
    expect(r.short).toBe(true);
    const m = text(renderToStaticMarkup(<ManySummary many={r} />));
    expect(m).toContain(`100件を抽選し、${r.picks.length}件を表示します`);
    expect(m).toContain(`選んだ距離で抽選の対象になる候補（近い）は合計 ${r.picks.length}件`);
    expect(m).toContain("割合が0%の「中間」「遠い」の候補や、同じ知識の重複で件数を埋めていません");
  });

  it("配り直したときは、割合どおりの配分と実際の件数を示す", () => {
    const fake = {
      requested: 20,
      picks: [],
      eligible: ["near", "middle", "far"],
      short: false,
      redistributed: true,
      breakdown: { near: { planned: 5, drawn: 9, available: 30 }, middle: { planned: 10, drawn: 3, available: 3 }, far: { planned: 5, drawn: 8, available: 30 } },
    } as Parameters<typeof ManySummary>[0]["many"];
    const m = text(renderToStaticMarkup(<ManySummary many={fake} />));
    expect(m).toContain("近い 9件・中間 3件・遠い 8件");
    expect(m).toContain("割合どおりの配分（近い 5件・中間 10件・遠い 5件）に対して候補が足りない距離があったため");
  });
});

describe("知識ノートを散策の対象にする", () => {
  const notes = index.data.knowledge_notes;
  const poolNotes = explorePool.filter((x) => x.kind === "note");

  it("公開対象の資料の根拠だけで根拠状態の規則（validate）を満たすノートだけを対象にする（P1。件数はデータから決める）", () => {
    // 期待値は実装（notePublicity.ts）を使わず、Node 側の検査（tools/validate-sample-data.js）で独立に求める：
    // そのノートの根拠を公開対象の資料のものだけにしたデータで、そのノートの規則の誤りがなく、公開対象の資料の根拠が1件以上ある
    const { validate } = createRequire(import.meta.url)("../../tools/validate-sample-data.js") as { validate: (d: unknown) => string[] };
    const pubEv = (id: string) => index.data.evidence.filter((e) => e.note_id === id && isPublic(index.resourceById.get(e.resource_id)!));
    const expected = notes.filter((n) => {
      if (pubEv(n.id).length === 0) return false;
      const copy = { ...index.data, evidence: index.data.evidence.filter((e) => e.note_id !== n.id || isPublic(index.resourceById.get(e.resource_id)!)) };
      return validate(copy).every((x) => !x.startsWith(`${n.id}:`));
    });
    expect(poolNotes.map((x) => x.id).sort()).toEqual(expected.map((n) => n.id).sort());
    expect(publicNotes).toHaveLength(expected.length);
    // 根拠のないノートは対象外。公開対象でない資料の根拠を含んでも、公開対象の資料の根拠だけで規則を満たすノートは対象（P1）
    expect(isPublicNote(index.noteById.get("kn-offense-as-defense")!)).toBe(false);
    expect(isPublicNote(index.noteById.get("kn-level2-minion-count")!)).toBe(true);
    expect(isPublicNote(index.noteById.get("kn-level2-advantage")!)).toBe(true);
    // P0（根拠の資料がすべて公開対象）との差は、この2件の追加だけ（意図しない公開・非公開の変化がない）
    const p0 = notes.filter((n) => {
      const ev = index.data.evidence.filter((e) => e.note_id === n.id);
      return ev.length > 0 && ev.every((e) => isPublic(index.resourceById.get(e.resource_id)!));
    });
    const p1 = new Set(publicNotes.map((n) => n.id));
    expect(p0.filter((n) => !p1.has(n.id))).toEqual([]);
    expect([...p1].filter((id) => !p0.some((n) => n.id === id)).sort()).toEqual(["kn-level2-advantage", "kn-level2-minion-count"]);
    // 2026-11-08 のローム収録のパイロットで12件、同日のスプリットプッシュの収録で11件、2026-11-09 のカイティングの収録で9件、公開対象の資料だけを根拠にするノートを追加（P0・P1 の両方で対象）
    expect(p0).toHaveLength(247);
    expect(publicNotes).toHaveLength(249);
    // 追加した6件はすべて対象
    for (const id of ["kn-diagonal-objective-trade", "kn-diagonal-trade-exceptions", "kn-turret-plates-permanent-261", "kn-turret-plates-fell-14min-pre-261", "kn-objective-prep-1min", "kn-immobile-mage-not-alone"]) {
      expect(poolNotes.map((x) => x.id)).toContain(id);
    }
    // 散策の対象全体で、同じ種類・ID の重複はない
    const keys = explorePool.map((x) => exploreKey(x));
    expect(new Set(keys).size).toBe(keys.length);
    expect(explorePool).toHaveLength(index.publicResources.length + SHOWCASE_IDS.length + expected.length);
    // 関係は公開するノートどうしだけ
    for (const x of poolNotes) for (const r of x.relatedIds ?? []) expect(poolNotes.map((y) => y.id)).toContain(r);
  });

  it("Topic の候補数にノートを含め、まとめて抽選しても重複しない", () => {
    const t = exploreTopics().find((x) => x.id === "cat-macro")!;
    expect(t.nearCount).toBe(classify(explorePool, "cat-macro", index).near.length);
    const r = pickMany({ items: explorePool, topicId: "cat-macro", distance: 50, count: 100, graph: index, rng: seq([0.21, 0.77, 0.43]) });
    const ks = r.picks.map((p) => exploreKey(p.item));
    expect(new Set(ks).size).toBe(ks.length);
    expect(r.picks.some((p) => p.item.kind === "note")).toBe(true);
  });

  it("一覧のカード：知識ノートと区別し、主張・種類・状態・ゲーム内未検証・時期の注意・詳細へのリンクを示す", () => {
    const base = { group: "near" as const, fellBack: false, cycled: false, seen: [] };
    const card = (id: string) => text(renderToStaticMarkup(<ExploreCard result={{ ...base, item: { kind: "note", id, topicIds: [] } } as PickResult} topicLabel="X" />));
    const html = renderToStaticMarkup(<ExploreCard result={{ ...base, item: { kind: "note", id: "kn-turret-plates-fell-14min-pre-261", topicIds: [] } } as PickResult} topicLabel="X" />);
    expect(html).toContain(`href="${noteHref("kn-turret-plates-fell-14min-pre-261")}"`);
    const old = card("kn-turret-plates-fell-14min-pre-261");
    for (const s of ["知識ノート", "仕様", "資料に記載あり", "パッチ26.1より前は", "ゲーム内での検証：未実施", "現行では適用できない（仕様変更）", "詳細と根拠を見る"]) expect(old).toContain(s);
    const cur = card("kn-turret-plates-permanent-261");
    expect(cur).toContain("時期：26.1");
    expect(cur).toContain("現行環境への適用可能性：未確認");
    expect(cur).not.toContain("現行環境でも確認済み");
    const emp = card("kn-diagonal-objective-trade");
    expect(emp).toContain("経験則・解説者の主張");
    expect(emp).toContain("根拠の資料 3件");
    // 公開しないノートは出さない
    expect(card("kn-offense-as-defense")).toContain("この知識は表示の対象にありません");
  });

  it("詳細（#/note/<id>）：URL で開け、NoteCard で根拠の資料と確認箇所へ進め、関係するノートへつながる", () => {
    expect(parseHash(noteHref("kn-diagonal-objective-trade"))).toEqual({ name: "note", id: "kn-diagonal-objective-trade" });
    const html = renderToStaticMarkup(<NotePage id="kn-diagonal-objective-trade" />);
    const t = text(html);
    for (const r of ["res-lg-xcppa", "res-lg-jdgrp", "res-lg-pdvmw"]) expect(html).toContain(`href="${resourceHref(r)}"`);
    expect(t).toContain("オブジェクトの確保の根拠にする"); // 確認箇所
    expect(t).toContain("ゲーム内での検証：未実施");
    expect(t).toContain("同じ著者（がりある）で、独立した裏付けではない");
    expect(html).toContain(`href="${noteHref("kn-diagonal-trade-exceptions")}"`);
    expect(t).toContain("成立条件・例外");
    // 旧仕様のノート：現行の仕様として表示しない
    const old = text(renderToStaticMarkup(<NotePage id="kn-turret-plates-fell-14min-pre-261" />));
    expect(old).toContain("現行では適用できない（仕様変更）");
    // P1 で公開したノート：公開対象の資料の根拠だけを示し、公開対象でない資料へはリンクしない（存在だけを知らせる）
    const mc = renderToStaticMarkup(<NotePage id="kn-level2-minion-count" />);
    for (const r of ["res-riot-patch-26-1-en", "res-wiki-minion"]) expect(mc).toContain(`href="${resourceHref(r)}"`);
    expect(mc).not.toContain(resourceHref("res-mobalytics-wave"));
    expect(mc).not.toContain("mobalytics");
    expect(mc).not.toContain("Mobalytics");
    expect(text(mc)).toContain("未確認の参考情報あり：通常公開の対象ではない資料に基づく記録が1件あります");
    // 流通する目安との一致は、確定的な主張（本文）から分け、未確認の参考情報として示す
    expect(text(mc)).not.toMatch(/Lv2に達する。s*広く流通する/);
    expect(text(mc)).toContain("未確認の参考情報：この計算の結果は、広く流通する");
    const adv = renderToStaticMarkup(<NotePage id="kn-level2-advantage" />);
    expect(adv).toContain(`href="${resourceHref("res-metabot-trading-2026")}"`);
    expect(adv).not.toContain(resourceHref("res-sheep-level2-2026"));
    expect(adv).not.toContain("Sheep Esports");
    expect(text(adv)).not.toContain("1ウェーブ目でLv2に到達する手法");
    // 公開しないノート・存在しない ID は出さない
    for (const id of ["kn-offense-as-defense", "no-such-note"]) {
      expect(text(renderToStaticMarkup(<NotePage id={id} />))).toContain("知識ノートが見つかりません");
    }
  });
});

describe("散策の「すべて」（Topic を限定しない）", () => {
  it("URL で共有でき、予約語 all は Topic の ID と重ならない", () => {
    expect(EXPLORE_ALL).toBe("all");
    expect(index.data.topics.some((t) => t.id === EXPLORE_ALL)).toBe(false);
    expect(parseHash(exploreHref(EXPLORE_ALL, 30, 50))).toEqual({ name: "explore", topic: "all", distance: 30, count: 50 });
    expect(exploreHref(EXPLORE_ALL, 30)).toBe("#/explore?topic=all&d=30");
  });
  it("画面：「すべて」を選べ、距離のスライダーを出さず、上部で一度だけ説明と種類ごとの件数を示す", () => {
    const html = renderToStaticMarkup(<ExplorePage topic="all" distance={30} />);
    const t = text(html);
    expect(html).toMatch(/<option value="all" selected="">すべて（Topic を限定しない・\d+件）<\/option>/);
    expect(html).not.toContain('id="explore-distance"');
    expect(t).not.toContain("興味からの距離");
    expect(t).toContain("Topic を限定せず、全体から抽選します。距離（近い・中間・遠い）は使いません");
    expect(t).not.toContain("抽選の割合：近い");
    const res = explorePool.filter((x) => x.kind === "resource").length;
    const dec = explorePool.filter((x) => x.kind === "decision").length;
    const nts = explorePool.filter((x) => x.kind === "note").length;
    expect(t).toContain(`対象：${explorePool.length}件。教材 ${res}件・判断材料 ${dec}件・知識ノート ${nts}件`);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>20件を抽選する/);
    expect(t).toContain("全体からまとめて表示します");
    // 特定の Topic の画面は従来どおり（割合を示し、スライダーは有効）
    const topicHtml = renderToStaticMarkup(<ExplorePage topic="freeze" distance={30} />);
    expect(text(topicHtml)).toContain("抽選の割合：近い");
    expect(topicHtml).toMatch(/<input[^>]*id="explore-distance"/);
    expect(topicHtml).not.toMatch(/<input[^>]*id="explore-distance"[^>]*disabled=""/);
    expect(text(topicHtml)).toContain("興味からの距離：30");
  });
  it("「すべて」から個別の Topic に戻すと、URL に残した距離をそのまま使う", () => {
    const html = renderToStaticMarkup(<ExplorePage topic="all" distance={70} count={50} />);
    // Topic の選択肢を変えたときの URL は、距離と件数を保つ
    expect(exploreHref("freeze", 70, 50)).toBe("#/explore?topic=freeze&d=70&n=50");
    expect(parseHash(exploreHref(EXPLORE_ALL, 70, 50))).toEqual({ name: "explore", topic: "all", distance: 70, count: 50 });
    expect(text(html)).not.toContain("興味からの距離");
    expect(text(renderToStaticMarkup(<ExplorePage topic="freeze" distance={70} count={50} />))).toContain("興味からの距離：70");
  });
  it("実データ：全体から100件を重複なしで選び、教材・判断材料・知識ノートが含まれる。距離は作らない", () => {
    const r = pickAll({ items: explorePool, count: 100, rng: seq([0.11, 0.62, 0.37, 0.88, 0.05]) });
    expect(r.picks).toHaveLength(Math.min(100, explorePool.length));
    expect(new Set(r.picks.map(exploreKey)).size).toBe(r.picks.length);
    for (const k of ["resource", "decision", "note"]) expect(r.picks.some((x) => x.kind === k)).toBe(true);
    const all = pickAll({ items: explorePool, count: explorePool.length + 50, rng: seq([0.3]) });
    expect(all.picks).toHaveLength(explorePool.length);
    expect(all.short).toBe(true);
    // 「すべて」のカードは距離も選んだ理由も繰り返さない。種類・詳細へのリンクなどカード固有の情報は残す
    for (const item of r.picks.slice(0, 30)) {
      const c = text(renderToStaticMarkup(<ExploreCard result={{ item, group: "near", fellBack: false, cycled: false, seen: [] }} topicLabel="" scope="all" />));
      expect(c).not.toContain("全体から選びました");
      // 距離のバッジ・距離の切り替えの注意を出さない（知識ノートの本文に「距離」という語があるのは構わない）
      expect(c).not.toContain("距離：");
      expect(c).not.toContain("選んだ距離");
      expect(c).toMatch(/教材|判断材料（試験）|知識ノート/);
    }
  });
});

describe("知識ノートの表示の一貫性", () => {
  it("ゲーム内で検証した根拠が将来加わったら、未実施と固定表示しない", () => {
    const n = index.noteById.get("kn-turret-plates-permanent-261")!;
    const tested = text(renderToStaticMarkup(<NoteSummary note={{ ...n, last_checked_patch: "26.21" }} evidence={[{ id: "ev-x", note_id: n.id, resource_id: "res-riot-patch-26-1-en", evidence_type: "in_game_test", locator: null, summary_ja: "x", checked_level: "L3", checked_at: "2026-11-01" }]} />));
    expect(tested).toContain("ゲーム内での検証：パッチ 26.21 で検証");
    expect(text(renderToStaticMarkup(<NoteSummary note={n} />))).toContain("ゲーム内での検証：未実施");
  });
  it("公開の条件は、散策・詳細・関係するノートのリンクで同じ", () => {
    const pool = new Set(explorePool.filter((x) => x.kind === "note").map((x) => x.id));
    for (const n of index.data.knowledge_notes) {
      const shown = !text(renderToStaticMarkup(<NotePage id={n.id} />)).includes("知識ノートが見つかりません");
      expect(shown).toBe(pool.has(n.id));
      if (!shown) continue;
      const html = renderToStaticMarkup(<NotePage id={n.id} />);
      for (const m of html.matchAll(/href="#\/note\/([^"]+)"/g)) expect(pool.has(decodeURIComponent(m[1]))).toBe(true);
    }
  });
});
