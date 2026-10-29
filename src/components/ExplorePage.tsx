// 知識の散策（試験）。Topic と興味からの距離を選び、収録済みの教材と判断材料（試験）を1件ずつ表示する。
// 抽選ロジックは lib/explore.ts、抽選対象は data/explorePool.ts。閲覧の記録はこの画面の状態にだけ持ち、保存・送信しない。
import { useMemo, useState } from "react";
import { index } from "../data/dataset";
import { decisionById } from "../data/decisions";
import { explorePool, exploreTopics } from "../data/explorePool";
import { classify, groupWeights, pickNext, type ExploreGroup, type PickResult } from "../lib/explore";
import { exploreHref, replaceHash } from "../router";
import { DecisionCard } from "./DecisionPages";
import { ResourceCard } from "./ResourceCard";

const GROUP_LABELS: Record<ExploreGroup, string> = { near: "近い", middle: "中間", far: "遠い" };

const percent = (x: number) => `${Math.round(x * 100)}%`;

export function ExplorePage({ topic, distance, rng = Math.random }: { topic: string; distance: number; rng?: () => number }) {
  const topics = useMemo(exploreTopics, []);
  const selected = topics.find((t) => t.id === topic);
  // Topic を変えたら表示済みの記録と表示中の知識を消す。画面を作り直さないので、キーボード操作の焦点は Topic の選択欄に残る
  const [state, setState] = useState<{ topic: string; seen: string[]; result: PickResult | null }>({ topic, seen: [], result: null });
  if (state.topic !== topic) setState({ topic, seen: [], result: null });
  const w = groupWeights(distance);
  const counts = useMemo(() => {
    if (!selected) return null;
    const c = classify(explorePool, selected.id, index);
    return { near: c.near.length, middle: c.middle.length, far: c.far.length };
  }, [selected]);

  const next = () => {
    if (!selected) return;
    const result = pickNext({ items: explorePool, topicId: selected.id, distance, seen: state.seen, graph: index, rng });
    setState({ topic, seen: result?.seen ?? state.seen, result });
  };

  return (
    <div className="detail explore-page">
      <h1>知識を散策する（試験）</h1>
      <p className="muted">
        興味のある Topic と、そこからの距離を選び、収録済みの教材と判断材料（試験）を1件ずつ表示します。おすすめや正しさの判定ではありません。近い・遠いは Topic の付き方による近似で、内容の近さを保証しません。閲覧の記録はこの画面を開いている間だけ使い、保存・送信しません。
      </p>

      <div className="explore-controls">
        <label htmlFor="explore-topic">興味のある Topic</label>
        <select id="explore-topic" value={selected?.id ?? ""} onChange={(e) => replaceHash(exploreHref(e.target.value, distance))}>
          <option value="">Topic を選んでください</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}（近い候補 {t.nearCount}件）
            </option>
          ))}
        </select>

        <label htmlFor="explore-distance">興味からの距離：{distance}</label>
        <input
          id="explore-distance"
          type="range"
          min={0}
          max={100}
          step={10}
          value={distance}
          aria-valuetext={`${distance}（近い ${percent(w.near)}・中間 ${percent(w.middle)}・遠い ${percent(w.far)}）`}
          onChange={(e) => replaceHash(exploreHref(selected?.id ?? "", Number(e.target.value)))}
        />
        <p className="muted explore-weights">
          抽選の割合：近い {percent(w.near)}・中間 {percent(w.middle)}・遠い {percent(w.far)}
          {counts && `（候補：近い ${counts.near}件・中間 ${counts.middle}件・遠い ${counts.far}件）`}
        </p>

        <button type="button" className="button" onClick={next} disabled={!selected}>
          別の知識を見る
        </button>
      </div>

      <div aria-live="polite">{selected && state.result && <ExploreCard result={state.result} topicLabel={index.topicById.get(selected.id)!.label_ja} />}</div>
      {selected && !state.result && <p className="muted">「別の知識を見る」を押すと、1件表示します。</p>}
    </div>
  );
}

export function ExploreCard({ result, topicLabel }: { result: PickResult; topicLabel: string }) {
  const { item, group } = result;
  const resource = item.kind === "resource" ? index.publicResources.find((r) => r.id === item.id) : undefined;
  const decision = item.kind === "decision" ? decisionById(item.id) : undefined;
  if (!resource && !decision) return <p>この知識は表示の対象にありません。</p>;
  return (
    <section className="explore-card" aria-label="表示中の知識">
      {result.cycled && !result.fellBack && <p className="notice">この条件の候補をすべて表示したので、最初から表示し直しています（直前の1件は除きます）。</p>}
      {result.cycled && result.fellBack && <p className="notice">選んだ距離の候補は直前に表示した1件だけなので、「{GROUP_LABELS[group]}」の候補から表示しています。</p>}
      {!result.cycled && result.fellBack && <p className="notice">選んだ距離に当たる候補がないため、「{GROUP_LABELS[group]}」の候補から表示しています。</p>}
      <p className="card-meta">
        <span className="badge">{resource ? "教材" : "判断材料（試験）"}</span> <span className="badge">距離：{GROUP_LABELS[group]}</span>
      </p>
      <p className="muted">{reasonText(result, topicLabel)}</p>
      {resource && <ResourceCard resource={resource} />}
      {decision && (
        <>
          <ul className="result-list">
            <DecisionCard u={decision} />
          </ul>
          <p className="muted">理由は詳細で「原典の主張」と「AI の解釈」に分けて表示しています。ゲーム内では検証していません。</p>
        </>
      )}
    </section>
  );
}

function reasonText(result: PickResult, topicLabel: string): string {
  if (result.group === "near") return `選んだ Topic「${topicLabel}」かその下位の Topic が付いています。`;
  if (result.group === "middle")
    return result.middleReason === "relation"
      ? "近い判断材料と、判断材料どうしの明示的な関係でつながっています。"
      : `「${topicLabel}」に近い Topic と、上位の Topic（大分類など）を共有しています。`;
  return `「${topicLabel}」との Topic の一致や明示的な関係はありません。Topic による近似で、内容が無関係という意味ではありません。`;
}
