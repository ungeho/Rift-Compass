import { describe, expect, it } from "vitest";
import { index } from "../data/dataset";
import { externalSearchUrls, youtubeAt } from "./links";

describe("Phase 3A：外部検索の URL", () => {
  const params = (url: string) => new URL(url).searchParams;

  it("日本語の質問を、League of Legends を添えてそのまま渡す", () => {
    const u = externalSearchUrls("ドラゴンソウルの種類ごとの効果を詳しく知りたい。")!;
    expect(new URL(u.google).origin + new URL(u.google).pathname).toBe("https://www.google.com/search");
    expect(params(u.google).get("q")).toBe("ドラゴンソウルの種類ごとの効果を詳しく知りたい。 League of Legends");
    expect(new URL(u.youtube).origin + new URL(u.youtube).pathname).toBe("https://www.youtube.com/results");
    expect(params(u.youtube).get("search_query")).toBe("ドラゴンソウルの種類ごとの効果を詳しく知りたい。 League of Legends");
  });

  it("英語・記号（& ? # + / % = 引用符）を含んでも壊れず、ほかのパラメータが混ざらない", () => {
    const q = `Ahri vs Veigar & "item build" ? #mid +100% a/b=c`;
    const u = externalSearchUrls(q)!;
    expect([...params(u.google).keys()]).toEqual(["q"]);
    expect(params(u.google).get("q")).toBe(`${q} League of Legends`);
    expect([...params(u.youtube).keys()]).toEqual(["search_query"]);
    expect(params(u.youtube).get("search_query")).toBe(`${q} League of Legends`);
    expect(new URL(u.google).hash).toBe("");
  });

  it("LoL を示す語が既にあれば重ねない。空白は整理する", () => {
    expect(params(externalSearchUrls("  how   to freeze  LoL ")!.google).get("q")).toBe("how to freeze LoL");
    expect(params(externalSearchUrls("League of Legends baron timer")!.google).get("q")).toBe("League of Legends baron timer");
    // 「lol」を含む別の単語では重ねる判定にしない
    expect(params(externalSearchUrls("lollipop")!.google).get("q")).toBe("lollipop League of Legends");
  });

  it("空・空白だけの検索語では URL を作らない", () => {
    expect(externalSearchUrls("")).toBeNull();
    expect(externalSearchUrls("   　")).toBeNull();
  });
});

describe("7. YouTube の開始時間付き URL", () => {
  it("既存のクエリ（v=）を保ったまま t を付ける", () => {
    expect(youtubeAt("https://www.youtube.com/watch?v=5IJY0fD_02s", 134)).toBe("https://www.youtube.com/watch?v=5IJY0fD_02s&t=134s");
  });

  it("既存の t は置き換え、ほかのクエリは残す", () => {
    expect(youtubeAt("https://www.youtube.com/watch?v=abc&list=PL1&t=10s", 75)).toBe("https://www.youtube.com/watch?v=abc&list=PL1&t=75s");
  });

  it("youtu.be の短縮 URL にも付けられる", () => {
    expect(youtubeAt("https://youtu.be/abc", 0)).toBe("https://youtu.be/abc?t=0s");
  });

  it("小数や負の値は整数の秒に丸める", () => {
    expect(youtubeAt("https://youtu.be/abc", 12.9)).toBe("https://youtu.be/abc?t=12s");
    expect(youtubeAt("https://youtu.be/abc", -5)).toBe("https://youtu.be/abc?t=0s");
  });

  it("YouTube 以外・不正な URL は null", () => {
    expect(youtubeAt("https://wiki.leagueoflegends.com/en-us/Flash", 10)).toBeNull();
    expect(youtubeAt("https://notyoutube.com/watch?v=x", 10)).toBeNull();
    expect(youtubeAt("not a url", 10)).toBeNull();
  });

  it("実データのすべての動画区間で、元の動画 ID を保った URL を作れる", () => {
    for (const r of index.resources) {
      for (const s of r.segments ?? []) {
        const href = youtubeAt(r.url, s.start_sec)!;
        const u = new URL(href);
        expect(u.searchParams.get("v")).toBe(new URL(r.url).searchParams.get("v"));
        expect(u.searchParams.get("t")).toBe(`${s.start_sec}s`);
      }
    }
  });
});
