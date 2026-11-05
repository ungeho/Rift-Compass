import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillNumbers } from "./SkillNumbers";
import type { WikiAbilityFile, WikiAbilityTemplate } from "../gamedata/wikiAbility";
const annie = JSON.parse(readFileSync("public/gamedata/wiki/2026-11-02/abilities/1.json", "utf8")) as WikiAbilityFile;
describe("skill numeric hierarchy", () => {
 it("keeps Annie Q's magic damage distinct from AP scaling and preserves rank values", () => {
  const t = annie.templates.find(t => t.slot === "Q")!;
  const html = renderToStaticMarkup(<SkillNumbers template={t} />);
  for (const text of ["魔法ダメージ", "基礎値・段階別の値", "80/125/170/215/260", "スケーリング元・係数", "(+ 80% AP)"]) expect(html).toContain(text);
 });
 it("does not infer a damage type from AD/AP coefficients; keeps zero and unknown separate", () => {
  const t: WikiAbilityTemplate = { ...annie.templates[0], parsed: { cooldown: { ok: true, kind: "number", values: [0], note: "Condition" } }, leveling: [{ field: "leveling", label: "Effect", raw: "", base: null, ratios: [{percent: 50, of: "AD"}], reason: "unknown" }] };
  const html = renderToStaticMarkup(<SkillNumbers template={t} />);
  expect(html).toContain("<strong>0</strong>"); expect(html).toContain("Condition"); expect(html).toContain("未解析"); expect(html).toContain("(+ 50% AD)");
  expect(html).not.toContain("物理ダメージ"); expect(html).not.toContain("魔法ダメージ");
 });
 it("keeps multiple effects, named damage types and unparsed coefficients independently", () => {
  const t: WikiAbilityTemplate = { ...annie.templates[0], parsed: {}, leveling: ["physical", "true"].map((type, i) => ({field:"leveling",label:"Stage "+i,raw:"",base:{ok:true,kind:"number",values:[i]},ratios:[{percent:null,of:"HP",raw:"unparsed"}],calc:{stage:"not_computable",damage_type:type as "physical" | "true",base_basis:"other",missing:["condition"]}})) };
  const html = renderToStaticMarkup(<SkillNumbers template={t} />);
  for (const text of ["Stage 0", "Stage 1", "物理ダメージ", "確定ダメージ", "未解析", "condition"]) expect(html).toContain(text);
 });
});

it("omits automatic monotonicity prose but keeps coefficients and variable meanings", () => {
 const t = annie.templates.find(t => t.slot === "Q")!;
 const html = renderToStaticMarkup(<SkillNumbers template={t} />);
 expect(html).toContain("(+ 80% AP)"); expect(html).toContain("AP＝魔力");
 expect(html).not.toContain("大きいほど"); expect(html).not.toContain("式から導ける性質");
 expect(html).toContain("弾速</dt><dd><strong>1400</strong>");
});
