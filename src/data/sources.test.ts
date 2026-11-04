import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { index } from "./dataset";
import { fetchSourcesFile, filterSources, filterSourceCandidates, type SourcesIndex, type SourceFile } from "./sources";
import { parseHash, sourceHref, sourcesHref } from "../router";
import { safeExternalUrl } from "../lib/links";
const catalog = JSON.parse(readFileSync("public/sources/index.json", "utf8")) as SourcesIndex;
const file = JSON.parse(readFileSync("public/sources/lolgaren.json", "utf8")) as SourceFile;

describe("情報源の検索・ルーティング", () => {
  it("ベースパス下の指定ファイルだけを読み、HTTP失敗を呼び出し元へ返す", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ sources: [] }) }).mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(fetchSourcesFile("index.json")).resolves.toEqual({ sources: [] });
      expect(fetch).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}sources/index.json`);
      await expect(fetchSourcesFile("wardex.json")).rejects.toThrow("HTTP 404");
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
  it("名前・別名・日英Topicと、種別・言語のAND条件で絞り込む", () => {
    const find = (q: string, kind = "", lang = "") => filterSources(catalog.sources, { q, kind, lang }, index.data.topics);
    expect(find("Ｗａｒｄｅｘ").map((s) => s.id)).toEqual(["wardex"]);
    expect(find("@howchallelol").map((s) => s.id)).toEqual(["yt-gariaru"]);
    expect(find("freeze").some((s) => s.id === "lolgaren")).toBe(true);
    expect(find("フリーズ").some((s) => s.id === "lolgaren")).toBe(true);
    expect(find("", "youtube", "en").every((s) => s.kind === "youtube" && s.languages.includes("en"))).toBe(true);
    expect(find("Wardex", "youtube")).toHaveLength(0);
    expect(find("", "", "unknown").map((s) => s.id)).toEqual(["wardex", "yt-dopagod", "yt-pont-lol"]);
  });
  it("一覧の条件と日本語検索をURL共有でき、詳細IDを安全に符号化する", () => {
    expect(parseHash(sourcesHref("視界 調査", "youtube", "ja"))).toEqual({ name: "sources", q: "視界 調査", kind: "youtube", lang: "ja" });
    expect(parseHash(sourceHref("yt-gariaru"))).toEqual({ name: "source", id: "yt-gariaru" });
    expect(parseHash("#/sources?kind=invalid&lang=invalid")).toEqual({ name: "sources", q: "", kind: "", lang: "" });
    expect(sourceHref("a/b")).toBe("#/source/a%2Fb");
  });
  it("保留を未収録に含め、対象外は別区分。全件の区分にもアクセスできる", () => {
    const cs = file.candidates, topics = index.data.topics;
    const normal = filterSourceCandidates(cs, "", "unregistered", topics);
    expect(normal.every((c) => !c.registered && c.triage.status !== "excluded")).toBe(true);
    expect(normal.some((c) => c.triage.status === "hold")).toBe(true);
    expect(filterSourceCandidates(cs, "", "all", topics)).toHaveLength(cs.length);
    expect(filterSourceCandidates(cs, "", "excluded", topics).every((c) => c.triage.status === "excluded")).toBe(true);
    expect(filterSourceCandidates(cs, "", "registered", topics).length).toBeGreaterThan(0);
    expect(filterSourceCandidates(cs, "存在しない題名123xyz", "all", topics)).toHaveLength(0);
  });
  it("外部リンクにはhttp(s)だけを許可し、認証情報・スクリプト・相対URLを拒否する", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "https://u:p@example.com", "/test"]) expect(safeExternalUrl(url)).toBeNull();
    expect(safeExternalUrl("https://wardex.app/")).toBe("https://wardex.app/");
  });
});
