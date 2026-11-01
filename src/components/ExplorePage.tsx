// 知識の散策（試験）。Topic と興味からの距離を選び、収録済みの教材と判断材料（試験）を表示する。
// 1件ずつ順に見る（pickNext）か、20・50・100件をまとめて抽選する（pickMany）。
// 「すべて」（topic=all）は Topic からの距離を使わず、全体から抽選する（pickAll）。
// 抽選ロジックは lib/explore.ts、抽選対象は data/explorePool.ts。閲覧の記録はこの画面の状態にだけ持ち、保存・送信しない。
import { useMemo, useState } from "react";
import { index } from "../data/dataset";
import { decisionById } from "../data/decisions";
import { explorePool, exploreTopics, isPublicNote } from "../data/explorePool";
import { APPLICABILITY_LABELS, KIND_LABELS, noteHeading, periodLabel } from "../data/labels";
import type { Evidence, KnowledgeNote } from "../data/types";
import { plainText } from "../lib/plainText";
import { classify, exploreKey, GROUPS, groupWeights, pickAll, pickMany, pickNext, type AllResult, type ExploreGroup, type ExploreItem, type ManyPick, type ManyResult, type PickResult } from "../lib/explore";
import { DEFAULT_EXPLORE_COUNT, EXPLORE_ALL, EXPLORE_COUNTS, exploreHref, noteHref, replaceHash, type ExploreCount } from "../router";
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
  /** 「すべて」の抽選結果（1件ずつのときは1件） */
  all: AllResult | null;
  shown: number;
}
const fresh = (key: string): State => ({ key, seen: [], result: null, many: null, all: null, shown: 0 });

const KIND_NAMES: Record<ExploreItem["kind"], string> = { resource: "教材", decision: "判断材料", note: "知識ノート" };
const kindLine = (items: ExploreItem[]) => (Object.keys(KIND_NAMES) as ExploreItem["kind"][]).map((k) => `${KIND_NAMES[k]} ${items.filter((x) => x.kind === k).length}件`).join("・");

export function ExplorePage({ topic, distance, count = DEFAULT_EXPLORE_COUNT, rng = Math.random }: { topic: string; distance: number; count?: ExploreCount; rng?: () => number }) {
  const topics = useMemo(exploreTopics, []);
  const isAll = topic === EXPLORE_ALL;
  const selected = isAll ? undefined : topics.find((t) => t.id === topic);
  const ready = isAll || selected !== undefined;
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
    if (isAll) {
      if (single) {
        const all = pickAll({ items: explorePool, count: 1, rng, exclude: state.seen });
        const base = all.cycled ? state.seen.slice(-1).filter(() => explorePool.length > 1) : state.seen;
        setState({ ...state, all, seen: [...base, ...all.picks.map((x) => exploreKey(x))] });
      } else {
        const all = pickAll({ items: explorePool, count, rng });
        setState({ ...state, all, shown: Math.min(EXPLORE_PAGE_SIZE, all.picks.length) });
      }
      return;
    }
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
        興味のある Topic と、そこからの距離を選び、収録済みの教材・判断材料（試験）・知識ノートを表示します。1回に1件ずつ、または20・50・100件をまとめて抽選できます。おすすめや正しさの判定ではありません。近い・遠いは Topic の付き方による近似で、内容の近さを保証しません。閲覧の記録はこの画面を開いている間だけ使い、保存・送信しません。
      </p>

      <div className="explore-controls">
        <label htmlFor="explore-topic">興味のある Topic</label>
        <select id="explore-topic" value={isAll ? EXPLORE_ALL : (selected?.id ?? "")} onChange={(e) => replaceHash(exploreHref(e.target.value, distance, count))}>
          <option value="">Topic を選んでください</option>
          <option value={EXPLORE_ALL}>すべて（Topic を限定しない・{explorePool.length}件）</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}（近い候補 {t.nearCount}件）
            </option>
          ))}
        </select>

        {/* 「すべて」では距離を使わないので、スライダーを出さず、ここで一度だけ説明する（URL の d はそのまま残し、個別の Topic に戻したときに使う）*/}
        {isAll ? (
          <p className="muted explore-weights">
            Topic を限定せず、全体から抽選します。距離（近い・中間・遠い）は使いません（対象：{explorePool.length}件。{kindLine(explorePool)}）。
          </p>
        ) : (
          <>
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
          </>
        )}

        <label htmlFor="explore-count">1回に表示する件数</label>
        <select id="explore-count" value={count} onChange={(e) => replaceHash(exploreHref(isAll ? EXPLORE_ALL : (selected?.id ?? ""), distance, Number(e.target.value) as ExploreCount))}>
          {EXPLORE_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1件ずつ" : `${n}件`}
            </option>
          ))}
        </select>

        <button type="button" className="button" onClick={draw} disabled={!ready}>
          {single ? "別の知識を見る" : state.many || state.all ? "もう一度抽選する" : `${count}件を抽選する`}
        </button>
      </div>

      {isAll && <AllView state={state} count={count} single={single} more={() => setState({ ...state, shown: Math.min(state.shown + EXPLORE_PAGE_SIZE, state.all!.picks.length) })} />}
      {!isAll && single && (
        <>
          <div aria-live="polite">{selected && state.result && <ExploreCard result={state.result} topicLabel={topicLabel} />}</div>
          {selected && !state.result && <p className="muted">「別の知識を見る」を押すと、1件表示します。</p>}
        </>
      )}
      {!isAll && !single && selected && (
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

/** 「すべて」の結果。距離の代わりに、種類ごとの件数と、件数が足りないときの理由を示す */
function AllView({ state, count, single, more }: { state: State; count: number; single: boolean; more: () => void }) {
  const all = state.all;
  if (!all) return <p className="muted">{single ? "「別の知識を見る」を押すと、全体から1件表示します。" : `「${count}件を抽選する」を押すと、全体からまとめて表示します（${EXPLORE_PAGE_SIZE}件ずつ表示します）。`}</p>;
  if (single) {
    const item = all.picks[0];
    return (
      <div aria-live="polite">
        {all.cycled && <p className="notice">すべての候補を表示したので、最初から表示し直しています（直前の1件は除きます）。</p>}
        {item && <ExploreCard result={asAllResult(item)} topicLabel="" scope="all" />}
      </div>
    );
  }
  return (
    <>
      <div aria-live="polite">
        <section className="explore-summary" aria-label="抽選の結果">
          <p>
            {all.requested}件を全体から抽選し、{all.picks.length}件を表示します（{kindLine(all.picks)}）。同じ知識は重複させていません。
          </p>
          {all.short && <p className="notice">散策の対象は全体で {all.available}件なので、{all.picks.length}件だけ表示しています。同じ知識の重複で件数を埋めていません。</p>}
        </section>
      </div>
      {all.picks.length > 0 && (
        <>
          <ol className="explore-list">
            {all.picks.slice(0, state.shown).map((x) => (
              <li key={`${x.kind}:${x.id}`}>
                <ExploreCard result={asAllResult(x)} topicLabel="" scope="all" />
              </li>
            ))}
          </ol>
          {state.shown < all.picks.length && (
            <button type="button" className="button" onClick={more}>
              さらに{Math.min(EXPLORE_PAGE_SIZE, all.picks.length - state.shown)}件表示する（残り {all.picks.length - state.shown}件）
            </button>
          )}
        </>
      )}
    </>
  );
}

/** 「すべて」の1件を ExploreCard に渡す形にする（group は使わない。scope="all" のカードは距離と選んだ理由を表示しない。説明は画面上部で一度だけ）*/
const asAllResult = (item: ExploreItem): PickResult => ({ item, group: "near", fellBack: false, cycled: false, seen: [] });

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

export function ExploreCard({ result, topicLabel, scope = "topic" }: { result: PickResult; topicLabel: string; scope?: "topic" | "all" }) {
  const { item, group } = result;
  const resource = item.kind === "resource" ? index.publicResources.find((r) => r.id === item.id) : undefined;
  const decision = item.kind === "decision" ? decisionById(item.id) : undefined;
  const noteRaw = item.kind === "note" ? index.noteById.get(item.id) : undefined;
  const note = noteRaw && isPublicNote(noteRaw) ? noteRaw : undefined;
  if (!resource && !decision && !note) return <p>この知識は表示の対象にありません。</p>;
  return (
    <section className="explore-card" aria-label="表示中の知識">
      {result.cycled && !result.fellBack && <p className="notice">この条件の候補をすべて表示したので、最初から表示し直しています（直前の1件は除きます）。</p>}
      {result.cycled && result.fellBack && <p className="notice">選んだ距離の候補は直前に表示した1件だけなので、「{GROUP_LABELS[group]}」の候補から表示しています。</p>}
      {!result.cycled && result.fellBack && <p className="notice">選んだ距離に当たる候補がないため、「{GROUP_LABELS[group]}」の候補から表示しています。</p>}
      <p className="card-meta">
        <span className="badge">{resource ? "教材" : decision ? "判断材料（試験）" : "知識ノート"}</span> {scope === "topic" && <span className="badge">距離：{GROUP_LABELS[group]}</span>}
      </p>
      {scope === "topic" && <p className="muted">{reasonText(result, topicLabel)}</p>}
      {resource && <ResourceCard resource={resource} />}
      {note && <NoteSummary note={note} />}
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
      ? result.item.kind === "note"
        ? "近い知識ノートと、知識ノートどうしの明示的な関係でつながっています。"
        : "近い判断材料と、判断材料どうしの明示的な関係でつながっています。"
      : `「${topicLabel}」に近い Topic と、上位の Topic（大分類など）を共有しています。`;
  return `「${topicLabel}」との Topic の一致や明示的な関係はありません。Topic による近似で、内容が無関係という意味ではありません。`;
}

/** 散策の一覧に出す知識ノートの簡潔なカード。詳細（根拠・成立条件）は #/note/<id> の NoteCard で表示する */
export function NoteSummary({ note, evidence = index.evidenceByNote.get(note.id) ?? [] }: { note: KnowledgeNote; evidence?: Evidence[] }) {
  const h = note.historical;
  const gameTested = evidence.some((e) => e.evidence_type === "in_game_test") && note.last_checked_patch;
  return (
    <div className="note-summary">
      <p className="card-meta">
        <span className="badge">{KIND_LABELS[note.kind]}</span> <span className="badge">{noteHeading(note)}</span>
      </p>
      <p className="note-statement">{plainText(note.statement_ja)}</p>
      <p className="muted">
        ゲーム内での検証：{gameTested ? `パッチ ${note.last_checked_patch} で検証` : "未実施"}・根拠の資料 {evidence.length}件
      </p>
      {h && (
        <p className={h.current_applicability === "superseded" ? "notice" : "muted"}>
          時期：{h.valid_from ? periodLabel(h.valid_from) : "限定なし"}
          {h.valid_until ? `〜${periodLabel(h.valid_until)}` : ""}。{APPLICABILITY_LABELS[h.current_applicability]}
        </p>
      )}
      <p>
        <a href={noteHref(note.id)}>詳細と根拠を見る</a>
      </p>
    </div>
  );
}
