import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SKILL_BEHAVIORS, skillBehaviorFor } from "./skillBehavior";
import { SkillBehavior } from "../components/SkillBehavior";
import { ChampionDataBody, type TranslationFile } from "../components/ChampionData";
import type { WikiAbilityFile, WikiAbilityTemplate } from "./wikiAbility";
import type { DDragonChampion } from "./champion";

const read = <T,>(path: string): T => JSON.parse(readFileSync(join(__dirname, "../../", path), "utf8"));
const ability = (key: string) => read<WikiAbilityFile>(`public/gamedata/wiki/2026-11-02/abilities/${key}.json`);
const template = (key: string) => ability(key).templates.find(t => t.slot === "I")!;
const render = (t: WikiAbilityTemplate) => renderToStaticMarkup(<SkillBehavior template={t} />);
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("保存スキルの条件整理", () => {
  it.each(["1", "45", "92"])("%sの原典と全条件の根拠を照合でき、元データを変更しない", key => {
    const t = template(key);
    const before = JSON.stringify(t);
    const a = skillBehaviorFor(t)!;
    expect(a.matches).toBe(true);
    const html = render(t);
    for (const row of a.record.rows) {
      for (const field of [row.condition, row.event, row.result, row.constraint]) expect(html).toContain(escape(field));
      for (const ref of row.refs) expect(a.record.sources[ref]).toBeDefined();
    }
    for (const [key, source] of Object.entries(a.record.sources)) {
      expect(t.params![key]).toBe(source.raw);
      expect(html).toContain(escape(source.raw));
    }
    expect(html).toContain(`href="${escape(t.source.url)}"`);
    expect(html).toContain("対象パッチ・モードへの適合は未確認");
    expect(html).toContain("CC BY-SA 3.0");
    expect(JSON.stringify(t)).toBe(before);
  });

  it("Annieの命中／使用・上限・消費と命中順を区別する", () => {
    const html = render(template("1"));
    for (const text of ["Qが敵に命中／その他のスキルを使用", "4スタック", "全スタックを消費", "先にWが命中", "スペルシールド", "蘇生"]) expect(html).toContain(text);
  });
  it("Veigarのチャンピオン命中とテイクダウンを別の条件として示す", () => {
    const html = render(template("45"));
    for (const text of ["敵チャンピオンごとに1スタック", "5スタック", "ミニオン・モンスターへ拡張しない", "ダメージを与えたり"]) expect(html).toContain(text);
  });
  it("Rivenの使用・命中時消費・持続更新と対象例外を示す", () => {
    const html = render(template("92"));
    for (const text of ["上限3、持続6秒", "命中時に1スタックを消費", "消費でも持続時間が更新", "ワードに強化攻撃は発動しない"]) expect(html).toContain(text);
  });

  it.each(["raw", "missing", "plain", "hash", "residual", "modified", "slot", "url", "status", "redirect"])("%sの変更では以前の条件を表示せず再確認待ちにする", change => {
    const t = structuredClone(template("1"));
    if (change === "raw") t.params!.notes += " changed";
    if (change === "missing") delete t.params!.description;
    if (change === "plain") t.text!.description.plain += " changed";
    if (change === "hash") t.text!.description.plain_sha1 = "changed";
    if (change === "residual") t.text!.description.residual = true;
    if (change === "modified") t.source.last_modified = "changed";
    if (change === "slot") t.slot = "Q";
    if (change === "url") t.source.url += "changed";
    if (change === "status") t.source.status = 404;
    if (change === "redirect") t.redirect_to = "elsewhere";
    expect(skillBehaviorFor(t)?.matches).toBe(false);
    const html = render(t);
    expect(html).toContain("再確認待ち");
    expect(html).not.toContain("Qが敵に命中／その他のスキルを使用");
  });

  it("対象外や未収録には新しい条件を推測しない", () => {
    expect(SKILL_BEHAVIORS).toHaveLength(3);
    expect(render(template("266"))).toBe("");
    expect(render({ ...template("1"), title: "未収録スキル" })).toBe("");
  });

  it.each([["1", "Annie"], ["45", "Veigar"], ["92", "Riven"]])("%sの通常表示で日本語全文・英語全文・出典を維持する", (key, id) => {
    const file = ability(key);
    const translations = read<TranslationFile>(`public/gamedata/wiki/2026-11-02/translations/ja/abilities/${key}.json`);
    const dd = read<DDragonChampion>(`public/gamedata/ddragon/16.21.1/champions/${id}.json`);
    const html = renderToStaticMarkup(<ChampionDataBody data={{ version: "16.21.1", dd, wiki: null, prev: null, knownIssues: [], patch: null, abilities: { snapshot: "2026-11-02", file }, translations }} />);
    expect(html.match(/class="skill-behavior"/g)).toHaveLength(1);
    for (const t of file.templates) for (const [key, src] of Object.entries(t.text ?? {})) {
      if (!key.startsWith("description")) continue;
      expect(html).toContain(escape(src.plain));
      const tr = translations.entries[`${t.title}#${key}`];
      if (tr && !src.residual && tr.source_sha1 === src.source_sha1 && tr.plain_sha1 === src.plain_sha1) expect(html).toContain(escape(tr.ja));
    }
  });
});
