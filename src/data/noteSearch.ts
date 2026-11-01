// 検索画面の「関連する知識ノート」（資料の検索とは別枠）。
// 資料の検索（analyzeQuery）は、残りの語を公開資料の語彙で採否するため、知識ノートにしかない語（例：「Call for Help」「対角線」）を捨てる。
// ここでは Topic・発信者の取り出し（matchQueryUnits）だけを共有し、残りの語は公開ノートの記述で採否する。資料の検索結果は変えない。
// 一致は「候補に含めた理由」であり、質問への正しい答えであることは示さない（否定・条件の向き・立場は判定しない）。
import { containsTerm, expandLevelAbbr, matchQueryUnits, normalize, splitResidualTerms, type Unit } from "../search/search";
import { index } from "./dataset";
import { publicNotes } from "./explorePool";
import type { KnowledgeNote } from "./types";

/** 照合する記述の種類。exceptions・falsifiers は、主張と逆向きになりうる記述 */
export type NoteField = "statement" | "conditions" | "exceptions" | "falsifiers" | "notes" | "applicability" | "evidence" | "topicName";

export const NOTE_FIELD_LABELS: Record<NoteField, string> = {
  statement: "主張",
  conditions: "成立条件",
  exceptions: "例外",
  falsifiers: "反証の条件",
  notes: "補足",
  applicability: "時期の説明",
  evidence: "根拠の要約",
  topicName: "Topic名",
};

/** 主張と逆向き・限定になりうる記述。ここだけで一致した語は、主張の裏付けとして扱わない */
const OPPOSING_FIELDS: NoteField[] = ["exceptions", "falsifiers"];

export type NoteMatchBasis =
  | { kind: "topic"; topicId: string; matched: string; viaTopicId?: string }
  | { kind: "creator"; creator: string; matched: string }
  | { kind: "field"; field: NoteField; matched: string };

export interface NoteMatch {
  note: KnowledgeNote;
  /** 検索条件（units）ごとの一致の理由。空の配列はその条件に一致しなかったこと */
  bases: NoteMatchBasis[][];
  /** full：すべての検索条件に一致。partial：一部の条件だけに一致した関連候補 */
  tier: "full" | "partial";
  /** 語の一致が例外・反証の記述だけにある条件があるか（主張と逆向きの可能性） */
  opposingOnly: boolean;
}

export interface NoteSearchResult {
  /** 照合に使った条件（Topic・発信者・語）*/
  units: Unit[];
  /** 公開ノートのどこにもなく、ノートの照合に使わなかった語 */
  ignored: string[];
  matches: NoteMatch[];
  /**
   * 検索語にある、答えの向きを変えうる表現（ノートの主張の向きと合っているかは判定しない）。
   * negation：否定（〜ない・〜ずに・not）、condition：条件（〜とき・if）、stance：有利・不利の立場、side：使う側か対策する側か
   */
  cues: { negation: boolean; condition: boolean; stance: boolean; side: boolean };
  expandedQuery?: string;
}

const list = (xs: string[] | undefined) => (xs ?? []).map(normalize).join("\n");

interface NoteText {
  fields: Record<NoteField, string>;
  creators: string[];
}

const noteTexts = new Map<string, NoteText>(
  publicNotes.map((n) => {
    const ev = index.evidenceByNote.get(n.id) ?? [];
    const topicName = n.topic_ids
      .flatMap((id) => {
        const t = index.topicById.get(id);
        return t ? [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en] : [];
      })
      .map(normalize)
      .join("\n");
    return [
      n.id,
      {
        fields: {
          statement: normalize(n.statement_ja),
          conditions: list(n.conditions_ja),
          exceptions: list(n.exceptions_ja),
          falsifiers: list(n.falsifiers_ja),
          notes: normalize(n.notes_ja ?? ""),
          applicability: normalize(n.historical?.applicability_note_ja ?? ""),
          evidence: list(ev.map((e) => e.summary_ja)),
          topicName,
        },
        creators: [...new Set(ev.map((e) => index.resourceById.get(e.resource_id)?.creator.name).filter((c): c is string => !!c))],
      },
    ];
  }),
);

/** 公開ノートの語彙（残りの語の採否に使う）*/
const noteCorpus = [...noteTexts.values()].map((t) => Object.values(t.fields).join("\n")).join("\n");

const NEGATION = /ない|ません|なかった|べきでない|ずに|せず|やめ|控え|ダメ|だめ|\bnot\b|\bdon't\b|\bdont\b|\bavoid\b|\bnever\b|\bwithout\b|\bstop\b/;
// 「有利」は資料の検索では一般語として捨てるが、立場が逆のノートを答えと取り違えないよう、注意の対象にする
const STANCE = /有利|不利|勝って|負けて|リード|劣勢|優勢|\bahead\b|\bbehind\b|\bwinning\b|\blosing\b/;
const SIDE = /対策|カウンター|対処|使う側|使い方|使い手|\bcounter\b|\bvs\b|\bagainst\b/;
const CONDITION = /とき|時|場合|条件|なら|ならば|たら|例外|\bif\b|\bwhen\b|\bunless\b/;

/** ノートの語彙にない日本語の語を、どちらもノートの語彙にある2語（各2文字以上）に分ける。分けられなければ undefined */
function splitCompound(term: string): [string, string] | undefined {
  const cs = [...term];
  if (!/[぀-ヿ㐀-鿿]/.test(term) || cs.length < 4) return undefined;
  for (let i = 2; i <= cs.length - 2; i++) {
    const a = cs.slice(0, i).join(""), b = cs.slice(i).join("");
    if (containsTerm(noteCorpus, a) && containsTerm(noteCorpus, b)) return [a, b];
  }
  return undefined;
}

const FIELD_ORDER: NoteField[] = ["statement", "conditions", "exceptions", "falsifiers", "notes", "applicability", "evidence", "topicName"];

function fieldBases(t: NoteText, matched: string): NoteMatchBasis[] {
  return FIELD_ORDER.filter((f) => containsTerm(t.fields[f], matched)).map((field) => ({ kind: "field", field, matched }));
}

/**
 * 検索語に一致する公開の知識ノート。公開しないノート（isPublicNote でないもの）は対象にしない。
 * 照合：Topic は付いている Topic（下位の Topic を含む）か記述、発信者は根拠の資料の発信者、語はノートの記述。
 * 並び順：すべての条件に一致したもの → 一部だけ一致したもの。それぞれ、現行で適用できないもの（旧仕様）を後ろにする
 */
export function noteMatchesForQuery(query: string): NoteSearchResult {
  const q = normalize(query);
  const expanded = expandLevelAbbr(query);
  const { units: base, residual } = matchQueryUnits(expanded);
  const units: Unit[] = [...base];
  const ignored: string[] = [];
  const seen = new Set<string>();
  const push = (term: string) => {
    if (seen.has(term)) return;
    seen.add(term);
    units.push({ kind: "term", key: `term:${term}`, matched: term });
  };
  for (const term of splitResidualTerms(residual)) {
    // 「対策」「使う側」などの視点の語は、注意（cues.side）で扱い、照合の条件にしない
    // （ノートの本文に「対策側：」と書いたノートだけが残り、仕様のノートが落ちるのを防ぐ）
    if (SIDE.test(term)) continue;
    if (containsTerm(noteCorpus, term)) push(term);
    else {
      // 日本語の複合語（例：「タワープレート」）は、ノートの記述にある2語に分けられるときだけ、2語として照合する
      const parts = splitCompound(term);
      if (parts) parts.forEach(push);
      else ignored.push(term);
    }
  }
  const cues = { negation: NEGATION.test(q), condition: CONDITION.test(q), stance: STANCE.test(q), side: SIDE.test(q) };
  const result: NoteSearchResult = { units, ignored, matches: [], cues, ...(expanded !== q ? { expandedQuery: expanded } : {}) };
  if (units.length === 0) return result;

  for (const n of publicNotes) {
    const t = noteTexts.get(n.id)!;
    const bases = units.map((u): NoteMatchBasis[] => {
      if (u.kind === "topic") {
        const direct = n.topic_ids.includes(u.topic.id);
        const via = n.topic_ids.filter((id) => id !== u.topic.id && index.descendants(u.topic.id).has(id));
        return [
          ...(direct ? [{ kind: "topic" as const, topicId: u.topic.id, matched: u.matched }] : []),
          ...via.map((id) => ({ kind: "topic" as const, topicId: u.topic.id, matched: u.matched, viaTopicId: id })),
          ...fieldBases(t, u.matched).filter((b) => b.kind === "field" && b.field !== "topicName"),
        ];
      }
      if (u.kind === "creator") return t.creators.filter((c) => u.creators.has(c)).map((creator) => ({ kind: "creator", creator, matched: u.matched }));
      return fieldBases(t, u.matched);
    });
    const hit = bases.filter((b) => b.length > 0).length;
    if (hit === 0) continue;
    // 具体的な条件（大分類以外の Topic・語・発信者）に1つ以上一致しないものは出さない（大分類だけの一致は広すぎるので、「マクロ」だけの検索では出さない）
    const specific = units.some((u, i) => bases[i].length > 0 && !(u.kind === "topic" && u.topic.kind === "category"));
    if (!specific) continue;
    const full = hit === units.length;
    // 一部一致は、条件が2つ以上あり、その半分以上に一致し、さらに「具体的な Topic に一致」か「2つ以上の条件に一致」したものだけ
    // （「相手」のような一般的な1語だけの偶然の一致で候補を増やさない）
    const topicHit = units.some((u, i) => u.kind === "topic" && u.topic.kind !== "category" && bases[i].length > 0);
    if (!full && (units.length < 2 || hit * 2 < units.length || (!topicHit && hit < 2))) continue;
    const opposingOnly = bases.some(
      (b, i) => units[i].kind === "term" && b.length > 0 && b.every((x) => x.kind === "field" && OPPOSING_FIELDS.includes(x.field)),
    );
    result.matches.push({ note: n, bases, tier: full ? "full" : "partial", opposingOnly });
  }
  const rank = (m: NoteMatch) => (m.tier === "full" ? 0 : 2) + (m.note.historical?.current_applicability === "superseded" ? 1 : 0);
  result.matches.sort((a, b) => rank(a) - rank(b)); // 安定ソート：同じ順位ではデータの順
  return result;
}
