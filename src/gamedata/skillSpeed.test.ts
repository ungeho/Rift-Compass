import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { skillSpeedLabel } from "./skillSpeed";
import type { WikiAbilityFile, WikiAbilityTemplate, ParsedValue } from "./wikiAbility";
const load = (key: string, name: string) => (JSON.parse(readFileSync(`public/gamedata/wiki/2026-11-02/abilities/${key}.json`, "utf8")) as WikiAbilityFile).templates.find(t => t.name === name)!;
const label = (t: WikiAbilityTemplate) => skillSpeedLabel(t, t.parsed!.speed);
describe("speed semantics", () => {
 it("uses the checked Annie Q record without treating projectile=true as sufficient", () => {
  const t = load("1", "Disintegrate"); expect(label(t)).toBe("弾速");
  expect(label({ ...t, source: { ...t.source, last_modified: "new" } })).toBe("速度（種類未確認）");
  expect(label({ ...t, title: "Other", params: { ...t.params, projectile: "True" } })).toBe("速度（種類未確認）");
  expect(label({ ...t, params: { ...t.params, speed: "1500" } })).toBe("速度（種類未確認）");
 });
 it("distinguishes explicit dash, homing missile and mixed movement speeds", () => {
  expect(label(load("106", "Stormbringer"))).toBe("ダッシュ速度");
  expect(label(load("154", "Elastic Slingshot"))).toBe("ダッシュ速度");
  expect(label(load("81", "Arcane Shift"))).toBe("追尾弾の弾速");
  expect(label(load("120", "Onslaught of Shadows"))).toBe("速度（種類未確認）");
 });
 it("does not classify leap, wall crossing, blink or zero using appearance or missing notes", () => {
  const t = load("1", "Disintegrate");
  for (const note of [undefined, "leap", "crosses walls", "blink", "Both dash and missile speed"]) expect(skillSpeedLabel({ ...t, title: "Other" }, { ok: true, kind: "number", values: [0], note } as ParsedValue)).toBe("速度（種類未確認）");
 });
});
