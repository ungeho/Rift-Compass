// 知識の散策（試験）。Topic と興味からの距離を選び、収録済みの教材と判断材料（試験）を表示する。
// 1件ずつ順に見る（pickNext）か、20・50・100件をまとめて抽選する（pickMany）。
// 抽選ロジックは lib/explore.ts、抽選対象は data/explorePool.ts。閲覧の記録はこの画面の状態にだけ持ち、保存・送信しない。
import { useMemo, useState } from "react";
import { index } from "../data/dataset";
import { decisionById } from "../data/decisions";
import { explorePool, exploreTopics } from "../data/explorePool";
import { classify, GROUPS, groupWeights, pickMany, pickNext, type ExploreGroup, type ManyPick, type ManyResult, type PickResult } from "../lib/explore";
import { DEFAULT_EXPLORE_COUNT, EXPLORE_COUNTS, exploreHref, replaceHash, type ExploreCount } from "../router";
import { DecisionCard } from "./DecisionPages";
import { ResourceCard } from "./ResourceCard";

const GROUP_LABELS: Record<ExploreGroup, string> = { near: "近い", middle: "中間", far: "遠い" };
/** まとめて抽選したときに、一度に描画する件数（多い件数でも段階的に表示する）*/
export const EXPLORE_PAGE_SIZE = 20;

const percent = (x: number) => `${Math.round(x * 100)}%`;

interface State {
  /** Topic・距離・件数の組。変わったら抽選の状態を捨てる */
  key: string;
  seen: string[];
  result: PickResult | null;
  many: ManyResult | null;
  shown: number;
}
const fresh = (key: string): State => ({ key, seen: [], result: null, many: null, shown: 0 });

export function ExplorePage({ topic, distance, count = DEFAULT_EXPLORE_COUNT, rng = Math.random }: { topic: string; distance: number; count?: ExploreCount; rng?: () => number }) {
  const topics = useMemo(exploreTopics, []);
  const selected = topics.find((t) => t.id === topic);
  // Topic・距離・件数のどれかを変えたら、表示済みの記録と表示中の知識を消す（古い抽選の結果を残さない）。
  // 画面を作り直さないので、キーボード操作の焦点は操作した欄に残る
  const key = `${topic}|${distance}|${count}`;
  const [state, setState] = useState<State>(() => fresh(key));
  if (state.key !== key) setState(fresh(key));
  const w = groupWeights(distance);
  const counts = useMemo(() => {
    if (!selected) return null;
    const c = classify(explorePool, selected.id, index);
    return { near: c.near.length, middle: c.middle.length, far: c.far.length };
  }, [selected]);
  const single = count === 1;

  const draw = () => {
    if (!selected) return;
    if (single) {
      const result = pickNext({ items: explorePool, topicId: selected.id, distance, seen: state.seen, graph: index, rng });
      setState({ ...state, seen: result?.seen ?? state.seen, result });
    } else {
      const many = pickMany({ items: explorePool, topicId: selected.id, distance, count, graph: index, rng });
      setState({ ...state, many, shown: Math.min(EXPLORE_PAGE_SIZE, many.picks.length) });
    }
  };
  const topicLabel = selected ? index.topicById.get(selected.id)!.label_ja : "";

  return (
    <div className="detail explore-page">
      <h1>知識を散策する（試験）</h1>
      <p className="muted">
        興味のある Topic と、そこからの距離を選び、収録済みの教材と判断材料（試験）を表示します。1回に1件ずつ、または20・50・100件をまとめて抽選できます。おすすめや正しさの判定ではありません。近い・遠いは Topic の付き方による近似で、内容の近さを保証しません。閲覧の記録はこの画面を開いている間だけ使い、保存・送信しません。
      </p>

      <div className="explore-controls">
        <label htmlFor="explore-topic">興味のある Topic</label>
        <select id="explore-topic" value={selected?.id ?? ""} onChange={(e) => replaceHash(exploreHref(e.target.value, distance, count))}>
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
          onChange={(e) => replaceHash(exploreHref(selected?.id ?? "", Number(e.target.value), count))}
        />
        <p className="muted explore-weights">
          抽選の割合：近い {percent(w.near)}・中間 {percent(w.middle)}・遠い {percent(w.far)}
          {counts && `（候補：近い ${counts.near}件・中間 ${counts.middle}件・遠い ${counts.far}件）`}
        </p>

        <label htmlFor="explore-count">1回に表示する件数</label>
        <select id="explore-count" value={count} onChange={(e) => replaceHash(exploreHref(selected?.id ?? "", distance, Number(e.target.value) as ExploreCount))}>
          {EXPLORE_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1件ずつ" : `${n}件`}
            </option>
          ))}
        </select>

        <button type="button" className="button" onClick={draw} disabled={!selected}>
          {single ? "別の知識を見る" : state.many ? "もう一度抽選する" : `${count}件を抽選する`}
        </button>
      </div>

      {single && (
        <>
          <div aria-live="polite">{selected && state.result && <ExploreCard result={state.result} topicLabel={topicLabel} />}</div>
          {selected && !state.result && <p className="muted">「別の知識を見る」を押すと、1件表示します。</p>}
        </>
      )}
      {!single && selected && (
        <>
          <div aria-live="polite">{state.many ? <ManySummary many={state.many} /> : <p className="muted">「{count}件を抽選する」を押すと、まとめて表示します（{EXPLORE_PAGE_SIZE}件ずつ表示します）。</p>}</div>
          {state.many && state.many.picks.length > 0 && (
            <>
              <ol className="explore-list">
                {state.many.picks.slice(0, state.shown).map((p) => (
                  <li key={`${p.item.kind}:${p.item.id}`}>
                    <ExploreCard result={asResult(p)} topicLabel={topicLabel} />
                  </li>
                ))}
              </ol>
              {state.shown < state.many.picks.length && (
                <button type="button" className="button" onClick={() => setState({ ...state, shown: Math.min(state.shown + EXPLORE_PAGE_SIZE, state.many!.picks.length) })}>
                  さらに{Math.min(EXPLORE_PAGE_SIZE, state.many.picks.length - state.shown)}件表示する（残り {state.many.picks.length - state.shown}件）
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const asResult = (p: ManyPick): PickResult => ({ item: p.item, group: p.group, middleReason: p.middleReason, fellBack: false, cycled: false, seen: [] });

/** まとめて抽選した結果の内訳と、件数が足りないときの理由 */
export function ManySummary({ many }: { many: ManyResult }) {
  const b = many.breakdown;
  const line = (f: (g: ExploreGroup) => number) => GROUPS.map((g) => `${GROUP_LABELS[g]} ${f(g)}件`).join("・");
  const eligibleAvailable = many.eligible.reduce((n, g) => n + b[g].available, 0);
  const excluded = GROUPS.filter((g) => !many.eligible.includes(g));
  return (
    <section className="explore-summary" aria-label="抽選の結果">
      <p>
        {many.requested}件を抽選し、{many.picks.length}件を表示します（{line((g) => b[g].drawn)}）。同じ知識は重複させていません。
      </p>
      {many.short && (
        <p className="notice">
          選んだ距離で抽選の対象になる候補（{many.eligible.map((g) => GROUP_LABELS[g]).join("・")}）は合計 {eligibleAvailable}件なので、{many.picks.length}件だけ表示しています。
          {excluded.length > 0 && `割合が0%の「${excluded.map((g) => GROUP_LABELS[g]).join("」「")}」の候補や、`}
          同じ知識の重複で件数を埋めていません。
        </p>
      )}
      {many.redistributed && (
        <p className="notice">
          割合どおりの配分（{line((g) => b[g].planned)}）に対して候補が足りない距離があったため、足りない分を、割合が0%でない別の距離の候補から選びました。
        </p>
      )}
    </section>
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
