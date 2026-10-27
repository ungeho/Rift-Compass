import { describe, expect, it } from "vitest";
import { index } from "../data/dataset";
import { youtubeAt } from "./links";

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
