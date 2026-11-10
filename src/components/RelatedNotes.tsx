// 検索画面の「関連する知識ノート」。資料の検索結果とは別枠で、件数にも含めない。
// 一致は候補に含めた理由であり、質問への答えであることは示さない。
import { index } from "../data/dataset";
import { KIND_LABELS } from "../data/labels";
import { isBroaderTopicOnly, isCounterRequest, NOTE_FIELD_LABELS, noteMatchesForQuery, type NoteMatch, type NoteMatchBasis } from "../data/noteSearch";
import { plainText } from "../lib/plainText";
import { NoteSummary } from "./ExplorePage";
import { useState } from "react";
import { revealTopicItems } from "./TopicTabs";
import type { NoteSearchResult } from "../data/noteSearch";

const topicLabel = (id: string) => index.topicById.get(id)?.label_ja ?? id;

function basisText(b: NoteMatchBasis): string {
  if (b.kind === "topic") return `Topic「${topicLabel(b.topicId)}」${b.viaTopicId ? `›「${topicLabel(b.viaTopicId)}」` : ""}`;
  if (b.kind === "creator") return `根拠の発信者「${b.creator}」`;
  if (b.kind === "noteKind") return `ノートの種類「${KIND_LABELS[b.noteKind]}」`;
  // 照合用の同義の表記による一致：検索語とは別の表記でノートに書かれていたことを示す（2026-11-10）
  if (b.kind === "synonym") return `${NOTE_FIELD_LABELS[b.field]}（同義の表記「${b.noteTerm}」）`;
  // 具体例の別の表記による一致（例：「カイト」で検索して「カイティング」）（2026-11-10）
  if (b.kind === "conceptVariant") return `${NOTE_FIELD_LABELS[b.field]}（同じものの別の表記「${b.noteTerm}」）`;
  // 同じ具体例を記述で別の言い方で書いた表現による一致（例：「スキルドッジ」で検索して「スキルショットを避ける」）（2026-11-10）
  if (b.kind === "conceptPhrase") return `${NOTE_FIELD_LABELS[b.field]}（同じことを表す記述「${b.notePhrase}」）`;
  return NOTE_FIELD_LABELS[b.field];
}

/**
 * 検索条件ごとに「「語」：一致した箇所」を並べる。一致しなかった条件は「一致なし」と示す。
 * 具体例の語（例：「イグナイト」）の条件が上位の Topic との関係だけのときは、記述にその語がないことを示す（2026-11-10）
 */
function matchLine(m: NoteMatch, matched: string[]): string {
  return m.bases
    .map((bs, i) => {
      if (bs.length === 0) return `「${matched[i]}」：一致なし`;
      const reasons = [...new Set(bs.map(basisText))].join("・");
      if (m.broaderUnits?.includes(i)) return `「${matched[i]}」：上位の ${reasons}が付いているだけ（記述に「${matched[i]}」はありません）`;
      return `「${matched[i]}」：${reasons}`;
    })
    .join(" ／ ");
}

function NoteMatchCard({ m, matched }: { m: NoteMatch; matched: string[] }) {
  const n = m.note;
  return (
    <li className="note-match">
      {m.tier === "partial" && (
        <p className="card-meta">
          <span className="badge">{isBroaderTopicOnly(m) ? "上位の Topic との関係だけ（関連候補）" : "一部の条件だけに一致（関連候補）"}</span>
        </p>
      )}
      <NoteSummary note={n} />
      {n.conditions_ja && n.conditions_ja.length > 0 && (
        <div className="muted note-scope">
          成立条件：
          <ul>
            {n.conditions_ja.map((c) => (
              <li key={c}>{plainText(c)}</li>
            ))}
          </ul>
        </div>
      )}
      {n.exceptions_ja && n.exceptions_ja.length > 0 && (
        <div className="muted note-scope">
          例外：
          <ul>
            {n.exceptions_ja.map((c) => (
              <li key={c}>{plainText(c)}</li>
            ))}
          </ul>
        </div>
      )}
      {m.opposingOnly && <p className="notice">一致した語の一部は、例外・反証の条件の記述にだけあります。この主張とは逆向き・限定の内容に一致している可能性があります。</p>}
      <p className="muted match-basis">一致：{matchLine(m, matched)}</p>
    </li>
  );
}

function NoteMatches({ matches, matched }: { matches: NoteMatch[]; matched: string[] }) {
  const [shown, setShown] = useState(20);
  return <><ul className="result-list">{matches.slice(0, shown).map((m) => <NoteMatchCard key={m.note.id} m={m} matched={matched} />)}</ul>
    {shown < matches.length && <button className="button" onClick={(e) => revealTopicItems(e.currentTarget, shown, () => setShown(shown + 20))}>知識ノートをさらに{Math.min(20, matches.length - shown)}件表示する（残り {matches.length - shown}件）</button>}</>;
}

export function RelatedNotes({ q, result }: { q: string; result?: NoteSearchResult }) {
  const r = result ?? noteMatchesForQuery(q);
  if (r.matches.length === 0) return null;
  const matched = r.units.map((u) => u.matched);
  const full = r.matches.filter((m) => m.tier === "full");
  const partial = r.matches.filter((m) => m.tier === "partial");
  // 関連候補の内訳：一部の条件に一致しなかったもの／すべての条件に一致したが、具体例の条件が上位の Topic との関係だけのもの（2026-11-10）
  const broader = partial.filter(isBroaderTopicOnly).length;
  const someMissing = partial.length - broader;
  const partialLabel =
    broader === 0 ? `一部の条件だけに一致した関連候補：${partial.length}件`
    : someMissing === 0 ? `上位の Topic との関係だけの関連候補：${partial.length}件`
    : `関連候補：${partial.length}件（一部の条件だけに一致 ${someMissing}件・上位の Topic との関係だけ ${broader}件）`;
  return (
    <details className="comparison-details related-notes" open>
      <summary>
        検索語に一致した知識ノート <span className="badge">知識ノート</span>：{full.length}件
        {partial.length > 0 && (broader === 0 ? `（ほかに一部一致の関連候補 ${partial.length}件）` : `（ほかに関連候補 ${partial.length}件）`)}
      </summary>
      <p className="muted">
        資料の検索結果とは別に、検索語に一致した公開の知識ノートを表示します（上の件数には含みません）。
        「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません。並び順も答えの正しさを示しません。
        {r.expandedQuery && <>略記は読み替えて照合しています（照合に使った検索語：{r.expandedQuery}）。</>}
      </p>
      {/* 照合と並び順の詳しい説明は、最初は閉じておく（2026-11-09） */}
      <details className="related-notes-help">
        <summary>検索条件・並び順の説明</summary>
        <ul className="muted">
          <li>根拠のある公開の知識ノートの主張・成立条件・例外・Topic の名前と、根拠の要約を検索語で照合します。各ノートの「一致：」に、検索条件ごとに一致した箇所を示します。</li>
          <li>すべての条件に一致したノートを先に出し、一部の条件だけに一致したノートは「関連候補」として後ろの閉じた欄に出します。</li>
          <li>現行で適用できない（旧仕様の）ノートは、同じ区分の中で後ろに並べます。</li>
          <li>主張・成立条件に検索語があるノートを、Topic・補足などだけで一致したノートより先に並べます。</li>
          <li>ただし、検索語が Topic の正式な名前だけ（例：「サモナースペル」「クールダウン」）のときは、その Topic（下位の Topic を含む）が付いたノートを、名前に触れているだけのノートより先に並べます。別名（例：「フラッシュ」「CD」「カイト」）や、ほかの語を含む検索では、主張・成立条件への一致を優先します。Topic が付いていることは、内容の正しさやゲーム内での検証を示しません。</li>
          <li>「イグナイト」「フラッシュ」「カイト」「アタックムーブ」など、広い Topic（サモナースペル・操作技術）の具体例として確かめた語で検索したときは、その語か同じものの別の表記（例：「カイト」と「カイティング」）が記述にあるノートだけを、その条件に一致したものとします。上位の Topic が付いているだけのノートは、1語の検索でも「上位の Topic との関係だけ」の関連候補として後ろの閉じた欄に出します。「スキルドッジ」は、確かめた記述の言い換え「スキルショットを避ける」も同じことを表すものとして扱い、「同じことを表す記述」と示します（別名の表記違いとは区別します）。</li>
          <li>「カイト」「カイティング」「kiting」は同じ意味の語として、主張・成立条件にある同義語も並び順にだけ使います（検索語そのものの一致より後ろ、一致の理由には含めません）。</li>
          <li>「CD」と「クールダウン」は、検索の対象（例：「フラッシュ」。「相手」「スキル」は除く）も主張・成立条件にあるノートでだけ同じ語として照合し、「同義の表記」と示します（表記どおりの一致が先。1語だけの検索では使いません）。</li>
          <li>「仕様」のように、大分類の Topic の語がノートの種類の名前と同じときは、その種類のノートも一致として扱い、「ノートの種類」と示します（種類はノートの分類で、ゲーム内での検証ではありません）。</li>
          <li>検索語に「対策」「対抗策」などの表現があり、検索の対象と結び付いた対策の記述（例：「カイトされる側」）がノートの主張・成立条件にあるときは、同じ一致の区分の中でそのノートを先に並べることがあります（立場や内容が正しいかは判定していません）。</li>
        </ul>
      </details>
      {r.cues.negation && (
        <p className="notice">検索語に否定の表現があります。ノートの主張が検索語と同じ向きかどうかは判定していません。主張・成立条件・例外を確かめてください。</p>
      )}
      {r.cues.stance && <p className="notice">検索語に有利・不利の表現があります。ノートが前提とする立場（有利な側か不利な側か）が知りたい状況と同じかは判定していません。</p>}
      {r.cues.side && (
        <p className="notice">
          検索語に、対策する側・使う側の視点に関わる表現があります。
          {isCounterRequest(q)
            ? "検索の対象と結び付いた明示的な対策の記述は並び順の参考にしますが、ノートの視点や答えの正しさを判定するものではありません。"
            : "ノートが使う側・対策する側のどちらの視点で書かれているかは判定していません（並び順にも使っていません）。"}
        </p>
      )}
      {!r.cues.negation && r.cues.condition && <p className="muted">検索語に条件の表現があります。各ノートの成立条件と例外が、知りたい状況に合うかを確かめてください。</p>}
      {r.ignored.length > 0 && <p className="muted">知識ノートに見つからず、ノートの照合に使わなかった語：{r.ignored.join("、")}</p>}
      {full.length > 0 && (
        <NoteMatches key={`full-${q}`} matches={full} matched={matched} />
      )}
      {partial.length > 0 && (
        <details className="related-notes-partial">
          <summary>{partialLabel}</summary>
          <NoteMatches key={`partial-${q}`} matches={partial} matched={matched} />
        </details>
      )}
    </details>
  );
}
