import { describe, expect, it } from "vitest";
import { homeHref, parseHash, resourceHref, topicHref } from "./router";

describe("URL（リロード・共有での再表示）", () => {
  it("検索語と絞り込みを往復できる", () => {
    const href = homeHref("Lv2先行 & level 2", { lang: "ja", topic: "level-2" });
    expect(parseHash(href)).toEqual({ name: "home", q: "Lv2先行 & level 2", filters: { lang: "ja", topic: "level-2" } });
  });

  it("資料詳細・Topic", () => {
    expect(parseHash(resourceHref("res-wiki-jax"))).toEqual({ name: "resource", id: "res-wiki-jax" });
    expect(parseHash(topicHref("level-2"))).toEqual({ name: "topic", id: "level-2" });
    expect(parseHash("#/topics")).toEqual({ name: "topics" });
  });

  it("空・不明なパスは一覧", () => {
    expect(parseHash("")).toEqual({ name: "home", q: "", filters: {} });
    expect(parseHash("#/unknown")).toEqual({ name: "home", q: "", filters: {} });
  });
});
