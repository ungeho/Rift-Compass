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
    expect(new Set(creators)).toEqual(new Set(["Official dopa", "Dopa English", "Alliyan LoL Channel"]));
    expect(creators.at(-1)).toBe("Alliyan LoL Channel");
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

  it("データからは削除していない（38件のまま）", () => {
    expect(index.resources).toHaveLength(38);
    expect(index.publicResources).toHaveLength(36);
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

  it("Dopa のウェーブ管理資料は存在しないため、すべての語に一致する結果は0件", () => {
    const r = search("Dopaの古いウェーブ管理を学びたい");
    expect(r.completeCount).toBe(0);
    expect(r.hits.every((h) => !h.complete)).toBe(true);
  });

  it("空の検索は公開対象の全件を返す", () => {
    expect(ids("")).toHaveLength(36);
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
  it("Dopa のウェーブ管理資料はないので、条件に一致する資料は0件・候補は概念ごとに分かれる", () => {
    for (const q of ["Dopa ウェーブ管理", "Dopaの古いウェーブ管理を学びたい"]) {
      const r = search(q);
      expect(r.hits.filter((h) => h.match !== "partial")).toHaveLength(0);
      // どの候補も、Dopa とウェーブ管理の両方には一致していない
      expect(r.hits.every((h) => h.matchedKeys.length === 1)).toBe(true);
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
    expect(search("Dopa TF 解説 日本語").hits[0]).toMatchObject({ resource: { id: "res-yt-alliyan-dopa-tf-2019" }, match: "full" });
  });

  it("日本語の語はひらがなで区切る（「いつ導入された」→「導入」）", () => {
    const units = analyzeQuery("トリンケットはいつ導入された？").units.map((u) => u.matched);
    expect(units).toContain("導入");
  });
});
