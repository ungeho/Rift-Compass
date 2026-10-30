// Phase 5D：判断材料（試験）の一覧と詳細。
// 検索や推奨はしない。Topic による明示的な絞り込みと、出典・確認範囲の確認だけを提供する。
import { useEffect } from "react";
import { index } from "../data/dataset";
import {
  comparisons, comparisonsForUnit, criteriaCheckedAt, criteriaForUnit, sideWaveCheckedAt, waveTechniqueCheckedAt, criterionOf, decisionById, decisionsCheckedAt, diagramsForUnit, decisionsForTopic, exampleOf, examplesForQuery, examplesForUnit, isNone, QUESTION_ENTRANCES,
  isShowcased, locatorOf, NONE_PARTIAL, referencingDecisions, RELATION_LABELS, ROLE_LABELS, showcaseDecisions, showcaseTopicIds, sourceById, VERDICT_LABELS,
  type DecisionComparison, type DecisionCriterion, type DecisionDiagram, type DecisionEvidence, type DecisionExample, type DecisionUnit,
} from "../data/decisions";
import { formatSeconds, KIND_LABELS, STATUS_LABELS } from "../data/labels";
import type { NoteStatus } from "../data/types";
import { youtubeAt } from "../lib/links";
import { decisionHref, decisionsHref, homeHref, resourceHref } from "../router";
import { ExternalLink, LevelBadge, TopicChips } from "./common";

export function DecisionNotice() {
  return (
    <p className="notice" role="note">
      判断材料（試験）は、解説者の記事・動画から AI が取り出した判断の記録です。どれも解説者の経験則・主張で、ゲーム内では検証していません。
      自動で選んだ答えや推奨ではありません。あなたの状況に当てはまるかは、状況・成立条件・原典で確かめてください。
    </p>
  );
}

function StatusBadges({ u }: { u: DecisionUnit }) {
  const status = STATUS_LABELS[u.proposed_status as NoteStatus];
  return (
    <div className="card-meta">
      <span className="badge">判断材料（試験）</span>
      <span className="badge">{KIND_LABELS[u.kind]}</span>
      {status && <span className={`badge status status-${status.tone}`}>{status.label}・ゲーム内で未検証</span>}
    </div>
  );
}

function authorsOf(u: DecisionUnit): string {
  return [...new Set(u.evidence.map((e) => sourceById.get(e.source)?.author ?? "出典不明"))].join("、");
}

function coverageOf(u: DecisionUnit): string {
  const all = u.evidence.map((e) => sourceById.get(e.source)?.coverage.status);
  return all.every((c) => c === "full") ? "出典の全体を確認" : "出典の一部だけを確認・未読の範囲あり";
}

function scopeText(u: DecisionUnit): string {
  const roles = u.scope.roles.map((r) => ROLE_LABELS[r] ?? r).join("・");
  const extra = [u.scope.champions, u.scope.matchup].filter((s) => s && !isNone(s));
  return [roles, ...extra].filter(Boolean).join("／");
}

export function DecisionCard({ u }: { u: DecisionUnit }) {
  return (
    <li className="card decision-card">
      <StatusBadges u={u} />
      <h3 className="card-title">
        <a href={decisionHref(u.id)}>{u.statement_ja}</a>
      </h3>
      <p className="card-summary">
        <span className="muted">状況：</span>
        {u.problem_ja}
      </p>
      {criteriaForUnit(u.id).length > 0 && (
        <p className="card-summary">
          <span className="badge">具体的な目安 {criteriaForUnit(u.id).length}件</span>{" "}
          <span className="muted">
            {criteriaForUnit(u.id).map((c) => c.value_ja).join("／")}（時期と前提は詳細で確認）
          </span>
        </p>
      )}
      <p className="card-creator">
        対象：{scopeText(u)}
        <br />
        出典：{authorsOf(u)}（{coverageOf(u)}）
      </p>
      <TopicChips ids={u.topic_ids.filter((t) => index.topicById.has(t))} />
    </li>
  );
}

/** 具体的な目安1件。数値だけでなく、対象・見る方法・前提・出典を必ず一緒に出す */
function CriterionView({ c, showUnit }: { c: DecisionCriterion; showUnit?: boolean }) {
  const s = sourceById.get(c.source);
  const r = s?.resource_id ? index.resourceById.get(s.resource_id) : undefined;
  const unit = c.unit_id && isShowcased(c.unit_id) ? decisionById(c.unit_id) : undefined;
  return (
    <li className="criterion">
      <p className="criterion-value">
        <span className="muted">{c.about_ja}：</span>
        <strong>{c.value_ja}</strong>
      </p>
      <dl className="info">
        <dt>対象</dt>
        <dd>{c.target_ja}</dd>
        <dt>見る方法</dt>
        <dd>{c.observe_ja}</dd>
        <dt>前提・状況</dt>
        <dd>{c.context_ja}</dd>
        <dt>出典</dt>
        <dd>
          {s ? s.author : c.source}
          {r && (
            <>
              ：<a href={resourceHref(r.id)}>{r.title}</a>
            </>
          )}
          {s && <div className="muted">公開日：{s.published}</div>}
          <div className="muted">
            確認箇所：{c.locator}（{c.basis === "source" ? "原典の記述" : "AI の整理"}
            {s ? `・${s.coverage.status === "full" ? "出典の全体を確認" : "出典の一部だけを確認"}` : ""}）
          </div>
          {s && (
            <ExternalLink href={s.url}>原典を開く</ExternalLink>
          )}
          {showUnit && unit && (
            <div>
              判断材料：<a href={decisionHref(unit.id)}>{unit.statement_ja}</a>
            </div>
          )}
        </dd>
      </dl>
    </li>
  );
}

function ComparisonView({ m }: { m: DecisionComparison }) {
  const note = m.related_note ? index.noteById.get(m.related_note) : undefined;
  return (
    <div className="comparison">
      <p>
        <span className="muted">共通する目的：</span>
        {m.goal_ja}
      </p>
      <h4>各資料の目安</h4>
      <ul className="criteria-list">
        {m.items.map((id) => {
          const c = criterionOf(id);
          return c ? <CriterionView key={id} c={c} showUnit /> : null;
        })}
      </ul>
      {note && (
        <p className="muted">
          正式データの知識ノート（{STATUS_LABELS[note.status].label}）：{note.statement_ja}
        </p>
      )}
      <h4>数値・基準の違い</h4>
      <ul>
        {m.differences_ja.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <h4>前提の違い</h4>
      <ul>
        {m.premise_differences_ja.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p>
        <span className={`badge ${m.verdict === "conflict" ? "status status-disputed" : ""}`}>{VERDICT_LABELS[m.verdict]}</span> {m.verdict_ja}
        <span className="muted">（この判定は AI の整理です）</span>
      </p>
      <h4>判断できない点</h4>
      <ul>
        {m.undetermined_ja.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

/** 知りたいことから探す：自然文の疑問から、試験表示の判断材料へ直接移動する（トップ画面と判断材料の一覧で共通）*/
export function QuestionEntrances() {
  return (
    <section className="question-entrances" aria-labelledby="question-entrances-heading">
      <h2 id="question-entrances-heading">知りたいことから探す</h2>
      <p className="muted">ウェーブ操作の判断材料（試験）に移動します。原典の主張と AI の整理を分けて表示し、ゲーム内では検証していません。</p>
      <ul className="chips">
        {QUESTION_ENTRANCES.map((e) => (
          <li key={e.unit_id}>
            <a className="chip" href={decisionHref(e.unit_id)}>
              {e.question_ja}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 検索画面で、検索語に一致した「判断材料の具体例」を案内する。教材（Resource）の検索結果とは別の種類のデータとして出し、件数にも含めない。
 * 具体例の出典が裏付けるのは、その具体例だけ（判断材料全体の出典ではない）。
 */
export function RelatedExamples({ q }: { q: string }) {
  const found = examplesForQuery(q);
  if (found.length === 0) return null;
  return (
    <section className="related-examples" aria-labelledby="related-examples-heading">
      <h3 id="related-examples-heading">
        関連する判断材料の具体例 <span className="badge">判断材料（試験）</span>
      </h3>
      <p className="muted">教材ではなく、判断材料に付けた、別の出典の具体例です。上の件数には含みません。</p>
      <ul className="result-list">
        {found.map((x) => {
          const u = decisionById(x.unit_id)!;
          const src = sourceById.get(x.evidence.source);
          return (
            <li key={x.id} className="card">
              <p className="card-title">
                <a href={decisionHref(u.id)}>{x.title_ja}</a>
              </p>
              <p className="card-creator">
                具体例の出典：{src?.author ?? x.evidence.source}。この出典が裏付けるのは、この具体例だけです。
              </p>
              <p>
                付いている判断材料：<a href={decisionHref(u.id)}>{u.statement_ja}</a>
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DecisionIndex({ topic, compare }: { topic: string; compare?: string }) {
  const t = topic ? index.topicById.get(topic) : undefined;
  const list = topic ? (t ? decisionsForTopic(topic) : []) : showcaseDecisions;
  const topicIds = showcaseTopicIds();
  return (
    <div className="detail">
      <h1>判断材料（試験）</h1>
      <DecisionNotice />
      <p className="muted">
        Phase 5B・5E・6B と発見性レビューで抽出した判断材料のうち、試験的に{showcaseDecisions.length}件を表示しています。教材の検索とは別の画面です。似た状況でも条件で結論が変わる材料（有利／不利、押す／押さない、過去のパッチ）を並べてあるので、状況と成立条件を比べてください。
      </p>

      {!topic && !compare && <QuestionEntrances />}

      <nav aria-label="Topic で絞り込む">
        <ul className="chips">
          <li>
            <a className="chip" href={decisionsHref()} aria-current={topic ? undefined : "page"}>
              すべて（{showcaseDecisions.length}）
            </a>
          </li>
          {topicIds.map((id) => (
            <li key={id}>
              <a className="chip" href={decisionsHref(id)} aria-current={id === topic ? "page" : undefined}>
                {index.topicById.get(id)!.label_ja}（{decisionsForTopic(id).length}）
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="comparisons-heading">
        <h2 id="comparisons-heading">資料間の比較（試験）</h2>
        <p className="muted">
          同じ目的について、資料ごとに数値や前提が違う目安を並べています。数値を平均したり、どれかを正しいと決めたりはしていません。数値は各資料の公開時期のもので、現行パッチでは確認しておらず、ゲーム内でも検証していません。
        </p>
        {compare && !comparisons.some((m) => m.id === compare) && <p className="empty">比較「{compare}」は登録されていません。</p>}
        {comparisons.map((m) => (
          <details key={m.id} className="comparison-details" open={m.id === compare}>
            <summary>
              {m.title_ja}（{m.items.length}件の目安）<span className="muted">— {VERDICT_LABELS[m.verdict]}</span>
            </summary>
            <ComparisonView m={m} />
          </details>
        ))}
      </section>

      {topic && (
        <h2>
          Topic「{t ? t.label_ja : topic}」の判断材料：{list.length}件
        </h2>
      )}
      {topic && !t && <p className="empty">Topic「{topic}」は登録されていません。</p>}
      {t && list.length === 0 && (
        <p className="empty">
          このTopicには、試験表示の判断材料はありません。
          <a href={homeHref("", { topic })}>このTopicの教材を探す</a>
        </p>
      )}
      {list.length > 0 && (
        <ul className="result-list">
          {list.map((u) => (
            <DecisionCard key={u.id} u={u} />
          ))}
        </ul>
      )}
      <p className="muted">
        抽出日 {decisionsCheckedAt}（Phase 5B）・{criteriaCheckedAt}（Phase 5E）・{sideWaveCheckedAt}（Phase 6B）・{waveTechniqueCheckedAt}（発見性レビュー）。選ばなかった判断材料と理由は、リポジトリの docs/experiments/decision-browse.md・decision-criteria.md・decision-showcase-expansion.md・side-wave-decisions.md・wave-discovery-review.md に記録しています。
      </p>
    </div>
  );
}

/** 「記載なし」の2種類を区別して表示する */
function Item({ text }: { text: string }) {
  if (!isNone(text)) return <li>{text}</li>;
  return (
    <li className="muted">
      {text}
      {text === NONE_PARTIAL && "。読んでいない範囲に書かれている可能性があります"}
    </li>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="note-list">
      <h3>{title}</h3>
      <ul>
        {items.map((s) => (
          <Item key={s} text={s} />
        ))}
      </ul>
    </div>
  );
}

function SourceList({ u }: { u: DecisionUnit }) {
  return (
    <ul className="decision-sources">
      {u.evidence.map((e, i) => (
        <SourceItem key={i} e={e} />
      ))}
    </ul>
  );
}

/** 出典1件（確認箇所・動画の該当時間へのリンク・確認の範囲）。判断材料の出典と、具体例の出典で共通 */
function SourceItem({ e, timeLinkShownAbove = false }: { e: DecisionEvidence; timeLinkShownAbove?: boolean }) {
  const s = sourceById.get(e.source);
  if (!s) return <li>出典の記録が見つかりません（{e.source}）</li>;
  const r = s.resource_id ? index.resourceById.get(s.resource_id) : undefined;
  const loc = locatorOf(e);
  // 開始秒は、実験データに記録がある場合だけリンクにする（字幕で確認した区間）
  const at = loc.startSec !== undefined ? youtubeAt(s.url, loc.startSec) : null;
  return (
    <li className="decision-source">
      <p>
        <strong>{s.author}</strong>
        {r ? (
          <>
            ：<a href={resourceHref(r.id)}>{r.title}</a>
          </>
        ) : (
          <span className="muted">（Rift Compass の資料一覧には未収録）</span>
        )}
      </p>
      <p className="open-original">
        <ExternalLink href={s.url} className="button">
          原典を開く
        </ExternalLink>
        <span className="muted url">{s.url}</span>
      </p>
      <dl className="info">
        <dt>確認箇所</dt>
        <dd>
          {loc.text}
          {at && loc.startSec !== undefined && !timeLinkShownAbove && (
            <>
              {" "}
              <ExternalLink href={at}>{formatSeconds(loc.startSec)}から</ExternalLink>
            </>
          )}
        </dd>
        <dt>確認の範囲</dt>
        <dd>
          {s.coverage.status === "full" ? "全体を確認" : "一部だけを確認"}
          {s.coverage.unread_ja && <div className="muted">未読：{s.coverage.unread_ja}</div>}
          <div className="muted">作業記録：{s.read}</div>
        </dd>
        <dt>確認レベル</dt>
        <dd>
          {e.checked_level === "L3" ? (
            <>
              <LevelBadge level="L3" /> <span className="muted">AI が原典の本文・字幕を読んで抽出した段階です。人による確認や、ゲーム内での検証ではありません。</span>
            </>
          ) : (
            e.checked_level
          )}
        </dd>
        <dt>公開日</dt>
        <dd>{s.published}</dd>
      </dl>
    </li>
  );
}

/** 具体例1件。原典の主張・仕様の記述・AI の整理・未確認事項を分け、具体例の出典は判断材料の出典とは別に出す */
/** 具体例の要素の id（直接リンクの移動先）*/
export const exampleAnchorId = (exampleId: string) => `example-${exampleId}`;

function ExampleView({ x }: { x: DecisionExample }) {
  const spec = x.spec_source ? sourceById.get(x.spec_source) : undefined;
  // 原典の該当時間へのリンクは、原典の主張のすぐ横に出す（出典カードでは重ねて出さない）
  const src = sourceById.get(x.evidence.source);
  const loc = locatorOf(x.evidence);
  const at = src && loc.startSec !== undefined ? youtubeAt(src.url, loc.startSec) : null;
  return (
    <article className="decision-example" id={exampleAnchorId(x.id)} tabIndex={-1} aria-labelledby={`${exampleAnchorId(x.id)}-title`}>
      <h3 id={`${exampleAnchorId(x.id)}-title`}>{x.title_ja}</h3>
      <ul className="reason-list">
        <li className="reason reason-source">
          <span className="badge">原典の主張</span> {x.source_ja}
          {at && loc.startSec !== undefined && (
            <>
              {" "}
              <ExternalLink href={at}>動画の{formatSeconds(loc.startSec)}から見る</ExternalLink>
            </>
          )}
        </li>
        {x.spec_ja && (
          <li className="reason reason-source">
            <span className="badge">仕様の記述</span> {x.spec_ja}
            {spec && (
              <>
                （<ExternalLink href={spec.url}>{spec.author}</ExternalLink>）
              </>
            )}
          </li>
        )}
        <li className="reason reason-ai">
          <span className="badge status status-inference">AI の整理</span> {x.ai_ja}
        </li>
      </ul>
      <ListSection title="未確認事項" items={x.unverified_ja} />
      <p className="muted">{x.scope_ja}</p>
      <ul className="decision-sources">
        <SourceItem e={x.evidence} timeLinkShownAbove={at !== null} />
      </ul>
    </article>
  );
}

/** 模式図（Phase 6C）。原典の説明をもとにしたオリジナルの図で、ゲーム内の結果を保証しない */
function DiagramView({ d }: { d: DecisionDiagram }) {
  return (
    <figure className="decision-diagram">
      <p className="muted">
        <span className="badge status status-inference">模式図</span> 原典の説明をもとに Rift Compass が作った図です（原典の画像ではありません）。距離・位置は正確ではなく、実際のゲーム内で同じ結果になることを保証しません。ゲーム内・現行パッチでは検証していません。
      </p>
      <dl className="info">
        <dt>比べているもの</dt>
        <dd>{d.compares_ja}</dd>
        <dt>図が成り立つ前提</dt>
        <dd>
          <ul>
            {d.premises_ja.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </dd>
      </dl>
      <img src={d.src} alt={d.alt} width={360} height={526} loading="lazy" />
      <h3>なぜそうなるか</h3>
      <ul className="reason-list">
        {d.why.map((r) => (
          <li key={r.text} className={`reason reason-${r.basis}`}>
            <span className={`badge ${r.basis === "ai" ? "status status-inference" : ""}`}>{r.basis === "source" ? "原典の説明" : "AI の整理"}</span> {r.text}
          </li>
        ))}
      </ul>
      <figcaption className="muted">
        対応する判断材料：この判断材料。出典：
        {d.sources.map((id, i) => {
          const s = sourceById.get(id);
          return (
            <span key={id}>
              {i > 0 && "・"}
              {s ? <ExternalLink href={s.url}>{s.author}</ExternalLink> : id}
            </span>
          );
        })}
        （確認箇所は「出典と確認範囲」）
      </figcaption>
    </figure>
  );
}

// 注記の先頭に「AI の整理：」がある記録もあるので、画面で付ける接頭辞と重ならないようにする（データは書き換えない）
const AI_NOTE_PREFIX = "AI の整理：";
const aiNote = (note: string) => AI_NOTE_PREFIX + (note.startsWith(AI_NOTE_PREFIX) ? note.slice(AI_NOTE_PREFIX.length) : note);

function Relations({ u }: { u: DecisionUnit }) {
  // 逆引き：この判断材料を参照している、試験表示の判断材料。こちらからも参照している相手は、上の一覧と重ねて出さない
  const referencedBy = referencingDecisions(u.id).filter((x) => !u.relations.some((r) => r.to === x.id));
  if (!u.relations.length && !referencedBy.length) return null;
  return (
    <section aria-labelledby="relations-heading">
      <h2 id="relations-heading">ほかの判断材料との関係</h2>
      <p className="muted">関係の数は、根拠の数ではありません。同じ著者の再説明は、独立した根拠として数えません。関係の説明は AI が整理したものです。</p>
      {u.relations.length > 0 && (
        <ul className="relation-list">
          {u.relations.map((rel, i) => {
            const other = isShowcased(rel.to) ? decisionById(rel.to) : undefined;
            return (
              <li key={i}>
                <span className="badge">{RELATION_LABELS[rel.type] ?? rel.type}</span>{" "}
                {other ? (
                  <a href={decisionHref(other.id)}>{other.statement_ja}</a>
                ) : (
                  <span className="muted">{rel.to.startsWith("phase5a-") ? "Phase 5A の記録にある判断の部品" : "試験表示の対象外の判断材料"}</span>
                )}
                {rel.note_ja && <div className="muted">{aiNote(rel.note_ja)}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {referencedBy.length > 0 && (
        <>
          <h3>この判断材料を参照している判断材料</h3>
          <p className="muted">
            相手の判断材料の側に、この判断材料との関係が記録されています。関係の種類と説明は、相手の判断材料の詳細で確認してください（ここでは逆向きの主張として扱いません）。
          </p>
          <ul className="relation-list">
            {referencedBy.map((x) => (
              <li key={x.id}>
                <a href={decisionHref(x.id)}>{x.statement_ja}</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function DecisionDetail({ id, example }: { id: string; example?: string }) {
  const u = decisionById(id);
  // ?example=… で開いたときは、その具体例の位置へ移動し、焦点を移す（キーボードでも移動先が分かるように）。
  // 別の判断材料の具体例や存在しない id なら、先頭から表示する（誤った位置へは移動しない）
  const target = u && example ? exampleOf(u.id, example) : undefined;
  useEffect(() => {
    const el = target ? document.getElementById(exampleAnchorId(target.id)) : null;
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.focus({ preventScroll: true });
      return;
    }
    // 移動先がない（指定なし・不正な id）ときは、前に移動した具体例に焦点を残さない
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.id.startsWith("example-")) active.blur();
    if (example) window.scrollTo(0, 0);
  }, [id, example, target]);
  const back = (
    <p className="back">
      <a href={decisionsHref()}>← 判断材料（試験）の一覧</a>
    </p>
  );
  if (!u) {
    return (
      <div className="detail">
        {back}
        <h1>判断材料が見つかりません</h1>
        <p>ID「{id}」の判断材料は、試験表示の対象にありません。</p>
      </div>
    );
  }
  return (
    <div className="detail">
      {back}
      <DecisionNotice />
      <header className="detail-header">
        <StatusBadges u={u} />
        <h1>{u.statement_ja}</h1>
        <p className="card-creator">出典：{authorsOf(u)}（{coverageOf(u)}）</p>
      </header>

      <section aria-labelledby="situation-heading">
        <h2 id="situation-heading">状況と行動</h2>
        <dl className="info">
          <dt>判断の対象</dt>
          <dd>{u.problem_ja}</dd>
          <dt>見る情報</dt>
          <dd>
            <ul>
              {u.observations_ja.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </dd>
          <dt>目的</dt>
          <dd>{u.goal_ja}</dd>
          <dt>行動</dt>
          <dd>{u.action_ja}</dd>
          <dt>対象</dt>
          <dd>
            ロール：{u.scope.roles.map((r) => ROLE_LABELS[r] ?? r).join("・")}
            <div>チャンピオン：{u.scope.champions}</div>
            <div>マッチアップ：{u.scope.matchup}</div>
          </dd>
        </dl>
      </section>

      <section aria-labelledby="reasons-heading">
        <h2 id="reasons-heading">理由</h2>
        <ul className="reason-list">
          {u.reasons.map((r) => (
            <li key={r.text} className={`reason reason-${r.basis}`}>
              <span className={`badge ${r.basis === "ai" ? "status status-inference" : ""}`}>{r.basis === "source" ? "原典の主張" : "AI の解釈"}</span> {r.text}
            </li>
          ))}
        </ul>
      </section>

      {diagramsForUnit(u.id).length > 0 && (
        <section aria-labelledby="diagram-heading">
          <h2 id="diagram-heading">図解（模式図）</h2>
          {diagramsForUnit(u.id).map((d) => (
            <DiagramView key={d.src} d={d} />
          ))}
        </section>
      )}

      <section aria-labelledby="conditions-heading">
        <h2 id="conditions-heading">条件・代替案・代償</h2>
        <ListSection title="成立条件" items={u.conditions_ja} />
        <ListSection title="例外" items={u.exceptions_ja} />
        <ListSection title="代替案" items={u.alternatives_ja} />
        <ListSection title="代償・リスク" items={u.costs_ja} />
      </section>

      {examplesForUnit(u.id).length > 0 && (
        <section aria-labelledby="examples-heading">
          <h2 id="examples-heading">具体例（別の出典）</h2>
          <p className="muted">上の判断材料とは別の出典の具体例です。具体例の出典が裏付けるのは、その具体例だけです。</p>
          {examplesForUnit(u.id).map((x) => (
            <ExampleView key={x.id} x={x} />
          ))}
        </section>
      )}

      <section aria-labelledby="patch-heading">
        <h2 id="patch-heading">パッチへの依存と未確認事項</h2>
        <p>{u.patch_dependency_ja}</p>
        <ListSection title="未確認事項" items={u.unknowns_ja} />
      </section>

      {criteriaForUnit(u.id).length > 0 && (
        <section aria-labelledby="criteria-heading">
          <h2 id="criteria-heading">具体的な目安</h2>
          <p className="muted">数値は原典の言い方のままで、資料の公開時期のものです。前提・状況が違えば当てはまらないことがあります。現行パッチでは確認しておらず、ゲーム内でも検証していません。</p>
          <ul className="criteria-list">
            {criteriaForUnit(u.id).map((c) => (
              <CriterionView key={c.id} c={c} />
            ))}
          </ul>
          {comparisonsForUnit(u.id).length > 0 && (
            <p>
              この目安を含む資料間の比較：
              {comparisonsForUnit(u.id).map((m) => (
                <a key={m.id} className="chip" href={decisionsHref("", m.id)}>
                  {m.title_ja}
                </a>
              ))}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading">出典と確認範囲</h2>
        <SourceList u={u} />
      </section>

      <Relations u={u} />

      <section aria-labelledby="topics-heading">
        <h2 id="topics-heading">関連 Topic</h2>
        <TopicChips ids={u.topic_ids.filter((t) => index.topicById.has(t))} />
      </section>
      <p className="muted">抽出日 {decisionsCheckedAt}。</p>
    </div>
  );
}
