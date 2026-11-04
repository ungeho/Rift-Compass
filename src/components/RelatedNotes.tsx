// 検索画面の「関連する知識ノート」。資料の検索結果とは別枠で、件数にも含めない。
// 一致は候補に含めた理由であり、質問への答えであることは示さない。
import { index } from "../data/dataset";
import { NOTE_FIELD_LABELS, noteMatchesForQuery, type NoteMatch, type NoteMatchBasis } from "../data/noteSearch";
import { plainText } from "../lib/plainText";
import { NoteSummary } from "./ExplorePage";
import { useState } from "react";
import { revealTopicItems } from "./TopicTabs";
import type { NoteSearchResult } from "../data/noteSearch";

const topicLabel = (id: string) => index.topicById.get(id)?.label_ja ?? id;

function basisText(b: NoteMatchBasis): string {
  if (b.kind === "topic") return `Topic「${topicLabel(b.topicId)}」${b.viaTopicId ? `›「${topicLabel(b.viaTopicId)}」` : ""}`;
  if (b.kind === "creator") return `根拠の発信者「${b.creator}」`;
  return NOTE_FIELD_LABELS[b.field];
}

/** 検索条件ごとに「「語」：一致した箇所」を並べる。一致しなかった条件は「一致なし」と示す */
function matchLine(m: NoteMatch, matched: string[]): string {
  return m.bases
    .map((bs, i) => `「${matched[i]}」：${bs.length > 0 ? [...new Set(bs.map(basisText))].join("・") : "一致なし"}`)
    .join(" ／ ");
}

function NoteMatchCard({ m, matched }: { m: NoteMatch; matched: string[] }) {
  const n = m.note;
  return (
    <li className="note-match">
      {m.tier === "partial" && (
        <p className="card-meta">
          <span className="badge">一部の条件だけに一致（関連候補）</span>
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
  return (
    <details className="comparison-details related-notes" open>
      <summary>
        検索語に一致した知識ノート <span className="badge">知識ノート</span>：{full.length}件
        {partial.length > 0 && `（ほかに一部一致の関連候補 ${partial.length}件）`}
      </summary>
      <p className="muted">
        資料の検索結果とは別に、根拠のある公開の知識ノートの主張・成立条件・例外・Topic の名前と、根拠の要約を検索語で照合したものです。
        「一致」は候補に含めた理由で、ノートがその質問に正しく答えていることを示しません。上の件数には含みません。現行で適用できない（旧仕様の）ノートは後ろに並べます。
        {r.expandedQuery && <>略記は読み替えて照合しています（照合に使った検索語：{r.expandedQuery}）。</>}
      </p>
      {r.cues.negation && (
        <p className="notice">検索語に否定の表現があります。ノートの主張が検索語と同じ向きかどうかは判定していません。主張・成立条件・例外を確かめてください。</p>
      )}
      {r.cues.stance && <p className="notice">検索語に有利・不利の表現があります。ノートが前提とする立場（有利な側か不利な側か）が知りたい状況と同じかは判定していません。</p>}
      {r.cues.side && <p className="notice">検索語に「対策」「使う側」などの表現があります。ノートが使う側・対策する側のどちらの視点で書かれているかは判定していません。</p>}
      {!r.cues.negation && r.cues.condition && <p className="muted">検索語に条件の表現があります。各ノートの成立条件と例外が、知りたい状況に合うかを確かめてください。</p>}
      {r.ignored.length > 0 && <p className="muted">知識ノートに見つからず、ノートの照合に使わなかった語：{r.ignored.join("、")}</p>}
      {full.length > 0 && (
        <NoteMatches key={`full-${q}`} matches={full} matched={matched} />
      )}
      {partial.length > 0 && (
        <details className="related-notes-partial">
          <summary>一部の条件だけに一致した関連候補：{partial.length}件</summary>
          <NoteMatches key={`partial-${q}`} matches={partial} matched={matched} />
        </details>
      )}
    </details>
  );
}
