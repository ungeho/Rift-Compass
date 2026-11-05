import { skillSpeedLabel } from "../gamedata/skillSpeed";
import { fieldLabel, reasonLabel, showRatio, showValues, wikiPlain, type WikiAbilityTemplate } from "../gamedata/wikiAbility";
import { INPUT_LABELS, STAGE_LABELS } from "../gamedata/damage";

const variableMeanings: Record<string, string> = { ap: "AP＝魔力", ad: "AD＝合計攻撃力", "bonus ad": "増加AD＝基本攻撃力を含まない追加攻撃力", "bonus health": "増加HP＝追加体力" };
const damageLabel = { physical: "物理ダメージ", magic: "魔法ダメージ", true: "確定ダメージ" };
export function SkillNumbers({ template: t }: { template: WikiAbilityTemplate }) {
  const fields = Object.entries(t.parsed ?? {});
  const variables = [...new Set((t.leveling ?? []).flatMap(l => l.ratios.map(r => variableMeanings[r.of.toLowerCase()]).filter(Boolean)))];

  return <section className="skill-numbers">
    {fields.length > 0 && <dl className="skill-basic-values">{fields.map(([k, v]) => <div key={k}><dt>{k === "speed" ? skillSpeedLabel(t, v) : fieldLabel(k)}</dt><dd><strong>{showValues({ ...v, note: undefined })}</strong>{v.note && <span className="skill-value-note">{v.note}</span>}</dd></div>)}</dl>}
    {variables.length > 0 && <p className="muted skill-value-note">変数：{variables.join("／")}</p>}
    {!!t.leveling?.length && <><h4>効果の値とスケーリング <span>保存Wiki</span></h4><ul className="skill-effect-values">{t.leveling.map((l, i) => <li key={i}>
      <div className="skill-effect-title"><strong>{wikiPlain(l.label)}</strong>{l.calc?.damage_type && <span>{damageLabel[l.calc.damage_type]}</span>}</div>
      <dl><div><dt>基礎値・段階別の値</dt><dd>{l.base ? <strong>{showValues(l.base)}</strong> : <span className="muted">未解析（{reasonLabel(l.reason)}）</span>}</dd></div>
      {l.ratios.length > 0 && <div><dt>スケーリング元・係数</dt><dd>{l.ratios.map((r, j) => <span key={j} className="skill-ratio">{showRatio(r)}</span>)}</dd></div>}</dl>
      {l.calc && l.calc.stage !== "formula_parsed" && <p className="muted skill-value-note">{STAGE_LABELS[l.calc.stage]}{l.calc.stage === "computable" && l.calc.inputs?.length ? `（入力：${l.calc.inputs.map(x => INPUT_LABELS[x]).join("・")}）` : ""}{l.calc.stage === "not_computable" && l.calc.missing?.length ? `（${l.calc.missing.join("・")}）` : ""}</p>}
    </li>)}</ul><p className="muted skill-value-note">ダメージ種別とスケーリング元は別の項目です。AD・AP・HP等の係数からダメージ種別は推定していません。値の対象・条件は下の説明と原典を参照してください。</p></>}

  </section>;
}
