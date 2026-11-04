import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChampionDataBody, type TranslationFile } from "../components/ChampionData";
import type { DDragonChampion } from "./champion";
import type { WikiAbilityFile } from "./wikiAbility";
import { wikiUpdatedDate } from "./wikiDate";

describe("Wiki更新日時の表示", () => {
  it.each([null, undefined, ""])("欠損 %s は不明", value => {
    expect(wikiUpdatedDate(value)).toBe("不明");
  });
  it.each([
    ["2026-11-04", "2026-11-04"],
    ["2026-11-04T12:34:56.789Z", "2026-11-04"],
    ["2026-11-04T12:34Z", "2026-11-04"],
    ["Fri, 18 Jul 2025 21:06:25 GMT", "2025-07-18"],
    ["Thu, 29 Feb 2024 23:59:59 GMT", "2024-02-29"],
    ["2024-02-29T00:00:00Z", "2024-02-29"],
    ["2000-02-29", "2000-02-29"],
    ["2026-11-04T23:30:00-05:00", "2026-11-05"],
    ["2026-11-04T00:30:00+09:00", "2026-11-03"],
    ["2026-11-04T00:30:00+0900", "2026-11-03"],
  ])("正常値 %s は従来と同じUTC日付", (value, expected) => {
    expect(wikiUpdatedDate(value)).toBe(expected);
    expect(wikiUpdatedDate(value)).toBe(new Date(value).toISOString().slice(0, 10));
  });
  it.each([
    " ", "\t\n", "changed", "0", "2026-13-01", "2026-00-01", "2026-11-00",
    "2026-11-31", "2025-02-29", "2026-02-30", "1900-02-29",
    "2026-11-04T25:00:00Z", "2026-11-04T12:60:00Z", "2026-11-04T00:00:00+25:00",
    "Tue, 31 Nov 2026 00:00:00 GMT", "Sat, 29 Feb 2025 00:00:00 GMT",
    "Mon, 18 Jul 2025 21:06:25 GMT", "Wed, 04 Foo 2026 00:00:00 GMT",
    0, false, {}, [],
  ])("不正値 %s を補正・暗黙変換せず区別する", value => {
    expect(wikiUpdatedDate(value)).toBe("更新日時不正");
  });
});

const root = join(__dirname, "../../public/gamedata");
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8"));
const manifest = read<{ current: { ddragon: string; wiki_snapshot: string } }>("manifest.json");
const snapshot = manifest.current.wiki_snapshot;

describe("スキル表示の日付回帰", () => {
  it("保存済みHTTP日時の正常な表示を変更しない", () => {
    let checked = 0;
    for (const file of readdirSync(join(root, `wiki/${snapshot}/abilities`))) {
      if (!file.endsWith(".json")) continue;
      for (const t of read<WikiAbilityFile>(`wiki/${snapshot}/abilities/${file}`).templates) {
        if (t.source.status !== 200 || t.redirect_to || !t.source.last_modified) continue;
        expect(wikiUpdatedDate(t.source.last_modified), t.title).toBe(new Date(t.source.last_modified).toISOString().slice(0, 10));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each(["changed", " ", "2026-11-31", "2025-02-29", "2026-02-30"])("%sでも他スキル・原文・出典を失わず、元データも変更しない", value => {
    const file = read<WikiAbilityFile>(`wiki/${snapshot}/abilities/1.json`);
    const passive = file.templates.find(t => t.slot === "I")!;
    passive.source.last_modified = value;
    const before = JSON.stringify(file);
    const dd = read<DDragonChampion>(`ddragon/${manifest.current.ddragon}/champions/Annie.json`);
    const translations = read<TranslationFile>(`wiki/${snapshot}/translations/ja/abilities/1.json`);
    const html = renderToStaticMarkup(<ChampionDataBody data={{
      version: manifest.current.ddragon, dd, wiki: null, prev: null, knownIssues: [], patch: null,
      abilities: { snapshot, file }, translations,
    }} />);
    expect(html).toContain("更新 更新日時不正");
    expect(html).toContain(`title="${value}"`);
    for (const name of ["Pyromania", "Disintegrate", "Incinerate", "Molten Shield", "Tibbers"]) expect(html).toContain(name);
    expect(html).toContain(`href="${passive.source.url}"`);
    expect(html).toContain("Annie generates a stack of Pyromania");
    expect(html).toContain("この整理は再確認待ち");
    expect(html).not.toContain("画面を読み込めませんでした");
    expect(JSON.stringify(file)).toBe(before);
  });
});
