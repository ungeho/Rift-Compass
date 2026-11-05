import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { RuneDescription } from "./DataPages";
import { runeHighlights } from "../gamedata/runeHighlights";

type Props = ComponentProps<typeof RuneDescription>;
const official = JSON.parse(readFileSync("public/gamedata/ddragon/16.21.1/runes.json", "utf8")).runes as Props["rune"][];
const wiki = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/runes.json", "utf8")).runes as NonNullable<Props["wiki"]>[];
const tr = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/translations/ja/runes.json", "utf8"));
const render = (rune: Props["rune"], w = wiki.find(w => w.ddragon_id === rune.id), translation: Props["tr"] = tr) => renderToStaticMarkup(<RuneDescription rune={rune} wiki={w} tr={translation} version="16.21.1" />);

describe("rune explanation hierarchy", () => {
  it("separates Hail's trigger, attack types, count, expiry and CD, retaining source differences", () => {
    const r = official.find(r => r.id === 9923)!;
    const html = render(r);
    for (const t of ["敵チャンピオンに通常攻撃", "近接：+90%／遠隔：+60%", "自分の攻撃タイプ", "発動する攻撃を含め最大3回", "攻撃間隔が3秒以上", "10秒", "効果終了後にCD開始", "Attack resets", "モーションをキャンセル", "3秒の境界", "ゲーム内での実証とは別"]) expect(html).toContain(t);
    expect(html).toContain('class="rune-facts"');
    expect(html).toContain("覇道 ／ キーストーン");
    expect(html).toContain(r.long.en);
    expect(html).toContain(r.long.ja);
    expect(html).toContain("CC BY-SA 3.0");
    expect(html).toContain("AI");
    expect(html).toContain("未レビュー");
    expect(html).toContain('lang="en"');
    expect(html).not.toContain('item-effect-number');
  });
  it("limits individual arrangements to four exact versioned bilingual source texts", () => {
    const ids = [9923, 8369, 8010, 8345];
    expect(official.filter(r => runeHighlights(r.id, "16.21.1", r.long)).map(r => r.id).sort()).toEqual(ids.sort());
    for (const r of official.filter(r => ids.includes(r.id))) {
      expect(runeHighlights(r.id, "new", r.long)).toBeNull();
      expect(runeHighlights(r.id, "16.21.1", { ...r.long, en: "changed" })).toBeNull();
      expect(runeHighlights(r.id, "16.21.1", { ...r.long, ja: "changed" })).toBeNull();
      expect(render(r)).toContain("公式収録説明の整理");
    }
  });
  it("keeps unarranged runes' official text open and retains missing Wiki and missing fields as unknown", () => {
    const r = official.find(r => ![9923, 8369, 8010, 8345].includes(r.id))!;
    const html = renderToStaticMarkup(<RuneDescription rune={r} version="16.21.1" tr={null} />);
    expect(html).toContain('class="rune-official" open=""');
    expect(html).toContain(r.long.ja!);
    expect(html).toContain("Wikiの説明は未収録");
    expect(html).toContain("CDや条件が存在しないことを意味しません");
    expect(html).not.toContain("公式収録説明の整理");
  });
  it("retains zero metadata, progression basis, stale translation withholding and all Wiki paragraphs", () => {
    const r = official.find(r => r.id === 8369)!;
    const w = wiki.find(w => w.ddragon_id === r.id)!;
    const html = render(r, { ...w, parsed: { ...w.parsed, range: { ok: true, kind: "number", values: [0] } } }, { entries: {} });
    expect(html).toContain("25〜15（レベルに応じて）秒");
    expect(html).toContain("<dt>射程</dt><dd><strong>0</strong>");
    for (const text of Object.values(w.text!)) expect(html).toContain(text.plain);
    expect(html).toContain(w.source.url);
    expect(html).toContain("日本語訳はまだありません");
    const stale = { entries: { [w.name + "#description"]: { ja: "STALE", source_sha1: "old", plain_sha1: "old", status: "ai_translated_unreviewed" } } };
    const out = render(r, w, stale);
    expect(out).not.toContain("STALE");
    expect(out).toContain("古い訳は表示しません");
  });
});
