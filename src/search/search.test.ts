import { describe, expect, it } from "vitest";
import { index, isPublic } from "../data/dataset";
import { analyzeQuery, applyFilters, normalize, search } from "./search";

const ids = (q: string, filters = {}) => search(q, filters).hits.map((h) => h.resource.id);

describe("正規化", () => {
  it("全角・大文字・空白を揃える", () => {
    expect(normalize("　ＬＶ２先行　 ")).toBe("lv2先行");
    expect(normalize("How  To\tFreeze")).toBe("how to freeze");
  });
});

describe("1. 日英の Topic 別名から同じ資料に到達できる", () => {
  it.each([
    ["Lv2先行", "res-wiki-experience"],
    ["レベル2先行", "res-wiki-experience"],
    ["level 2 spike", "res-wiki-experience"],
    ["フリーズ", "res-dignitas-freeze-advanced"],
    ["freezing", "res-dignitas-freeze-advanced"],
    ["ミニオンのタゲ", "res-wiki-minion"],
    ["minion aggro", "res-wiki-minion"],
    ["ヘイスト", "res-wiki-haste"],
    ["CDR", "res-wiki-haste"],
  ])("「%s」で %s に到達する", (q, expected) => {
    expect(ids(q)).toContain(expected);
  });

  it("空白の有無を問わない（level2 / level 2 spike）", () => {
    expect(ids("lvl2")).toContain("res-wiki-experience");
  });

  it("英字の別名は単語の途中では一致しない（「B」や「CD」の誤一致防止）", () => {
    const units = analyzeQuery("abcdef").units;
    expect(units.filter((u) => u.kind === "topic")).toHaveLength(0);
  });

  it("大分類と具体的な Topic が同じ別名を持たない（同じ長さの一致では大分類が採用され、必須条件にならないため）", () => {
    const owners = new Map<string, Set<string>>();
    for (const t of index.data.topics) {
      for (const term of [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en].map(normalize)) {
        if (!owners.has(term)) owners.set(term, new Set());
        owners.get(term)!.add(t.kind);
      }
    }
    const shared = [...owners].filter(([, kinds]) => kinds.has("category") && kinds.has("concept")).map(([term]) => term);
    expect(shared).toEqual([]);
  });

  it.each([
    ["CDトラッキング", "jungle-tracking"],
    ["レーンをイーブンに保つ", "playing-from-behind"],
  ])("「%s」は %s に一致しない（誤一致しやすい別名を外した）", (q, topicId) => {
    const units = analyzeQuery(q).units;
    expect(units.some((u) => u.kind === "topic" && u.topic.id === topicId)).toBe(false);
  });
});

describe("2. 発信者名で検索できる", () => {
  it("VeigarV2（表記ゆれ：Veigar v2）", () => {
    const a = ids("VeigarV2");
    const b = ids("veigar v2");
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.every((id) => index.resourceById.get(id)!.creator.name === "Veigar v2")).toBe(true);
    expect(b).toEqual(a);
  });

  it("Dopa は公式チャンネルと非公式翻訳の両方に一致し、それらを Dopa を題材にした第三者の資料より上に出す", () => {
    const hits = search("Dopa").hits;
    const creators = hits.map((h) => h.resource.creator.name);
    // goru は Phase 4B で追加した、Dopa の講義・解説動画の日本語字幕版の投稿者
    expect(new Set(creators)).toEqual(new Set(["Official dopa", "Dopa English", "Alliyan LoL Channel", "goru"]));
    const firstThirdParty = creators.findIndex((c) => c !== "Official dopa" && c !== "Dopa English");
    expect(creators.slice(firstThirdParty).every((c) => c === "Alliyan LoL Channel" || c === "goru")).toBe(true);
  });
});

describe("3. 複数の検索語", () => {
  it("発信者＋Topic で、両方に一致する資料が先頭に来る", () => {
    const r = search("VeigarV2 リコール");
    expect(r.hits[0].resource.id).toBe("res-yt-veigarv2-recall-timer");
    expect(r.hits[0].complete).toBe(true);
    expect(r.hits.filter((h) => h.complete).map((h) => h.resource.id)).toEqual(
      expect.arrayContaining(["res-yt-veigarv2-recall-timer", "res-yt-veigarv2-coaching-ruu"]),
    );
  });

  it("日英混在の入力", () => {
    expect(ids("Dopa インベード")[0]).toBe("res-yt-dopaenglish-teacher-2");
  });
});

describe("4. 検索と絞り込みの組み合わせ", () => {
  it("freeze ＋ 動画 だけ", () => {
    const r = ids("freeze", { type: "video" });
    expect(r).toEqual(["res-yt-veigarv2-faker-waves"]);
  });

  it("freeze ＋ 英語 ＋ L3", () => {
    const r = search("freeze", { lang: "en", level: "L3" }).hits.map((h) => h.resource);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.language === "en" && x.verification.level === "L3")).toBe(true);
  });

  it("Topic の絞り込みは下位 Topic の資料も含む", () => {
    const r = ids("", { topic: "wave-management" });
    expect(r).toContain("res-dignitas-freeze-advanced"); // freeze は wave-management の下位
  });

  it("韓国語の原典は言語指定で絞り込める", () => {
    expect(ids("", { lang: "ko" }).sort()).toEqual(["res-yt-dopa-official-invade", "res-yt-dopa-official-teacher-snowball"]);
  });
});

describe("5. L0・無料未確認の資料は通常の一覧・検索に出ない", () => {
  const hidden = index.resources.filter((r) => !isPublic(r)).map((r) => r.id);

  it("非公開の資料が実データに存在する（前提）", () => {
    expect(hidden).toEqual(expect.arrayContaining(["res-mobalytics-wave", "res-sheep-level2-2026"]));
  });

  it.each(["", "wave management", "ウェーブ管理", "Mobalytics", "Lv2先行", "Sheep Esports", "level 2"])("「%s」", (q) => {
    const r = ids(q);
    for (const id of hidden) expect(r).not.toContain(id);
  });

  it("データからは削除していない（Phase 4B で34件追加して72件、Phase 5A で3件追加して75件）", () => {
    expect(index.resources).toHaveLength(75);
    expect(index.publicResources).toHaveLength(73);
  });

  it("絞り込みでも出ない", () => {
    expect(applyFilters(index.publicResources, { level: "L0" })).toHaveLength(0);
  });
});

describe("10. 該当資料がない検索で、無関係な結果を出さない", () => {
  it.each(["ザヤとラカンのシナジー", "qwertyuiop", "ドラゴンソウルの効果", "おすすめのマウス"])("「%s」は0件", (q) => {
    const r = search(q);
    expect(r.hits).toHaveLength(0);
  });

  it("使わなかった語を利用者に返す", () => {
    expect(search("qwertyuiop").analysis.ignored).toContain("qwertyuiop");
  });

  // Phase 4B で Dopa のウェーブ管理の資料を追加したため、該当資料がない例を Dopa のルーン選択に替えた
  it("Dopa のルーン選択の資料は存在しないため、すべての語に一致する結果は0件", () => {
    const r = search("Dopaの古いルーン選択を学びたい");
    expect(r.completeCount).toBe(0);
    expect(r.hits.every((h) => !h.complete)).toBe(true);
  });

  it("空の検索は公開対象の全件を返す", () => {
    expect(ids("")).toHaveLength(73);
  });
});

describe("Phase 2B：既存資料への到達（P03・P10）", () => {
  it("P03：「ミニオンに狙われる」で Minion の Wiki と VeigarV2 のミニオンアグロ動画に到達し、候補は膨らまない", () => {
    const r = search("相手チャンピオンを殴るとミニオンに狙われるのはどういう条件？");
    const top3 = r.hits.slice(0, 3).map((h) => h.resource.id);
    expect(top3).toEqual(expect.arrayContaining(["res-wiki-minion", "res-yt-veigarv2-minion-aggro"]));
    expect(r.hits.length).toBeLessThanOrEqual(5);
  });

  it("「狙われる」単独（ガンクの文脈）ではミニオンアグロに一致しない", () => {
    const units = analyzeQuery("ジャングラーにガンクで狙われる").units;
    expect(units.some((u) => u.kind === "topic" && u.topic.id === "minion-aggro")).toBe(false);
  });

  it("P10：フラッシュの CD の質問で Flash の Wiki が1位・条件に一致", () => {
    const r = search("フラッシュのクールダウンは、昔と今でどう変わった？");
    expect(r.hits[0]).toMatchObject({ resource: { id: "res-wiki-flash" }, match: "full" });
  });
});

describe("レビュー指摘1：未知語を含む検索を「条件に一致」と表示しない", () => {
  it.each([
    ["VeigarV2 ダメージ計算", "ダメージ計算"],
    ["VeigarV2 まったく存在しない知識", "存在"],
    ["ウェーブ管理 未知の技能", "未知"],
  ])("「%s」", (q, unknown) => {
    const r = search(q);
    expect(r.analysis.ignored.join(" ")).toContain(unknown);
    expect(r.completeCount).toBe(0);
    expect(r.hits.length).toBeGreaterThan(0);
    // 認識できた条件にはすべて一致しているが、「条件に一致」ではなく「認識できた条件に一致」
    expect(r.hits.every((h) => h.match !== "full" && !h.complete)).toBe(true);
    expect(r.hits.some((h) => h.match === "recognized")).toBe(true);
  });

  it("未知語がない検索は「条件に一致」になる", () => {
    const r = search("VeigarV2 リコール");
    expect(r.hits[0].match).toBe("full");
  });
});

describe("レビュー指摘2：複数概念の順位と部分一致", () => {
  it("Dopa のルーン選択の資料はないので、条件に一致する資料は0件・候補は概念ごとに分かれる", () => {
    const r = search("Dopaの古いルーン選択を学びたい");
    expect(r.hits.filter((h) => h.match !== "partial")).toHaveLength(0);
    // どの候補も、Dopa とルーン選択の両方には一致していない
    expect(r.hits.every((h) => h.matchedKeys.length === 1)).toBe(true);
  });

  // 「ルーン」「ビルド」「サモスペ」「アイテム」は、以前は大分類（ビルド・ルーン・サモスペ）の別名として一致し、
  // 必須条件にならないため、発信者の資料がすべて「条件に一致」になっていた
  it.each(["Dopa ルーン", "Dopa ビルド", "Dopa サモスペ", "Dopa アイテム", "Dopa runes", "Dopa summoners", "Dopa build"])(
    "「%s」は、ルーン・ビルドを扱わない Dopa の資料を条件に一致にしない",
    (q) => {
      const r = search(q);
      expect(r.completeCount).toBe(0);
      expect(r.hits.some((h) => h.resource.creator.name === "Official dopa")).toBe(true);
    },
  );

  it.each([
    ["VeigarV2 ビルド", ["res-yt-veigarv2-veigar-guide-s16", "res-yt-veigarv2-pro-items"]],
    ["VeigarV2 ルーン", ["res-yt-veigarv2-veigar-guide-s16"]],
    ["VeigarV2 サモスペ", ["res-yt-veigarv2-veigar-guide-s16", "res-yt-veigarv2-jungle-decisions"]],
  ])("「%s」は、その主題を扱う VeigarV2 の資料だけが条件に一致する", (q, expected) => {
    const full = search(q).hits.filter((h) => h.complete).map((h) => h.resource.id);
    expect(full.sort()).toEqual([...expected].sort());
  });

  it("Q07 のベイガーのガイドは、ビルド（具体的な Topic）に一致したまま1位に出る", () => {
    const r = search("特定チャンピオンの対面別ビルドを知りたい（ベイガー）");
    expect(r.hits[0].resource.id).toBe("res-yt-veigarv2-veigar-guide-s16");
    expect(r.hits[0].match).not.toBe("partial");
  });

  it("Dopa のウェーブ管理は条件に一致する1件だけを出し、ほかの候補は概念ごとに分かれる", () => {
    for (const q of ["Dopa ウェーブ管理", "Dopaの古いウェーブ管理を学びたい"]) {
      const r = search(q);
      expect(r.hits.filter((h) => h.match !== "partial").map((h) => h.resource.id)).toEqual(["res-yt-goru-dopa-fizz-ep2"]);
      // 候補はどれも、Dopa とウェーブ管理の両方には一致していない
      expect(r.hits.filter((h) => h.match === "partial").every((h) => h.matchedKeys.length === 1)).toBe(true);
    }
  });

  it("「日本語でLoLの基本を知りたい」は Riot 公式の日本語の遊び方が1位で条件に一致", () => {
    const r = search("日本語でLoLの基本を知りたい");
    expect(r.hits[0].resource.id).toBe("res-riot-how-to-play-ja");
    expect(r.hits[0].match).toBe("full");
  });

  it("大分類（lane）だけに一致する資料は関連候補に入れない", () => {
    const r = search("how to freeze a lane");
    const freezeKey = r.analysis.units.find((u) => u.kind === "topic" && u.topic.id === "freeze")!.key;
    expect(r.hits.every((h) => h.matchedKeys.includes(freezeKey))).toBe(true);
  });

  it("発信者を題材にした第三者の資料も、発信者名で見つかる", () => {
    // Phase 4B で Dopa の日本語字幕版（発信者は翻訳者の goru）も同じ条件に一致するようになったため、先頭とは限らない
    const full = search("Dopa TF 解説 日本語").hits.filter((h) => h.match === "full").map((h) => h.resource.id);
    expect(full).toContain("res-yt-alliyan-dopa-tf-2019");
  });

  it("大分類の別名（「対面」）がタイトルにある資料は、その大分類を付けた資料と同じく一致として扱う", () => {
    // res-lg-wftjm には「対面」の大分類（レーニング）以下の Topic がないが、タイトルが「対面がロームに行った時に…」
    expect(ids("対面")).toContain("res-lg-wftjm");
    expect(ids("対面がロームしたら追いかけるべき？")[0]).toBe("res-lg-wftjm");
  });

  it("日本語の語はひらがなで区切る（「いつ導入された」→「導入」）", () => {
    const units = analyzeQuery("トリンケットはいつ導入された？").units.map((u) => u.matched);
    expect(units).toContain("導入");
  });
});
