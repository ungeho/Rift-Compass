import { useId } from "react";
import { skillBehaviorFor } from "../gamedata/skillBehavior";
import { wikiPlain, type WikiAbilityTemplate } from "../gamedata/wikiAbility";

const fieldLabel = (key: string) => key === "notes" ? "注記（notes）" : key === "tips" ? "補足（tips）" : `説明${key.slice(11) || "1"}（${key}）`;

export function SkillBehavior({ template }: { template: WikiAbilityTemplate }) {
  const heading = useId();
  const assessment = skillBehaviorFor(template);
  if (!assessment) return null;
  const { record, matches } = assessment;
  return <section className="skill-behavior" aria-labelledby={heading}>
    <h4 id={heading}>発動条件と状態変化</h4>
    <p className="muted">保存Wikiの記載をRift Compassが整理した補助表示です。戦術的推論・ゲーム内実証ではありません。対象パッチ・モードへの適合は未確認です。</p>
    {matches ? <ul className="skill-behavior-rules">{record.rows.map(row => <li key={row.label}>
      <h5>{row.label}</h5>
      <dl>
        <dt>条件</dt><dd>{row.condition}</dd>
        <dt>発火イベント</dt><dd>{row.event}</dd>
        <dt>結果</dt><dd>{row.result}</dd>
        <dt>制約・例外</dt><dd>{row.constraint}</dd>
      </dl>
      <p className="muted">根拠：{row.refs.map(fieldLabel).join("・")}（下の原文で照合できます）</p>
    </li>)}</ul> : <p className="notice">保存原典の更新・欠損・解析状態の変化により、この整理は再確認待ちです。以前の条件表は表示しません。通常の説明と原典を参照してください。</p>}
    <p className="muted">整理の照合日 {record.checked}・対象スナップショット {record.snapshot}。現在読み込んだ原典：更新 {template.source.last_modified ?? "不明"}／取得 {template.source.fetched_at}。これらの日時はゲームの対象パッチではありません。</p>
    <p className="muted">この整理は条件の全件抽出ではありません。ここにない上限・内部CD・コスト・リセット条件は「存在しない」とは判定していません。スキル個別の全文・数値・原典も参照してください。</p>
    <details>
      <summary>整理の根拠・詳細注記の原文を確認</summary>
      {Object.keys(record.sources).map(key => <div key={key}>
        <h5>{fieldLabel(key)}</h5>
        <p>{(template.text?.[key]?.plain ?? wikiPlain(template.params?.[key])) || "この項目は現在のデータに未収録です。"}</p>
        {template.params?.[key] && <details><summary>保存されたWiki記法を含む全文</summary><pre>{template.params[key]}</pre></details>}
      </div>)}
      <p className="muted">出典：<a href={template.source.url}>{template.title}</a>（League of Legends Wikiの寄稿者）。整理・翻訳・記法簡略化を含む改変。<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>。現行仕様としての正確性は未確認です。</p>
    </details>
  </section>;
}
