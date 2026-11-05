import type { WikiAbilityTemplate, ParsedValue } from "./wikiAbility";

/** The Wiki speed field can describe a missile or dash. Do not classify from
 * projectile presence, wall crossing, or movement words elsewhere in the skill. */
export function skillSpeedLabel(t: WikiAbilityTemplate, value: ParsedValue): string {
  const note = value.note?.trim().toLowerCase();
  if (note === "dash speed") return "ダッシュ速度";
  if (note === "homing missile speed") return "追尾弾の弾速";
  // Individually checked single-speed record; invalidate when either source field changes.
  if (t.title === "Template:Data Annie/Disintegrate" && t.source.last_modified === "Wed, 18 Feb 2026 20:26:40 GMT" && t.params?.speed === "1400" && value.kind === "number" && value.values.length === 1 && value.values[0] === 1400 && t.params?.description === "{{sbc|Active:}} '''Annie''' hurls a fireball at the target enemy that deals {{as|magic damage}}.") return "弾速";
  return "速度（種類未確認）";
}
