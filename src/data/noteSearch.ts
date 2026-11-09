// 検索画面の「関連する知識ノート」（資料の検索とは別枠）。
// 資料の検索（analyzeQuery）は、残りの語を公開資料の語彙で採否するため、知識ノートにしかない語（例：「Call for Help」「対角線」）を捨てる。
// ここでは Topic・発信者の取り出し（matchQueryUnits）だけを共有し、残りの語は公開ノートの記述で採否する。資料の検索結果は変えない。
// 一致は「候補に含めた理由」であり、質問への正しい答えであることは示さない（否定・条件の向き・立場は判定しない）。
import { containsTerm, expandLevelAbbr, matchQueryUnits, normalize, splitResidualTerms, type Unit } from "../search/search";
import { index } from "./dataset";
import { publicEvidenceOf, publicNotes } from "./explorePool";
import { KIND_LABELS } from "./labels";
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
  | { kind: "field"; field: NoteField; matched: string }
  /**
   * 照合用の同義の表記（MATCH_SYNONYM_GROUPS）による一致（2026-11-10）。matched は検索語の表記、noteTerm はノートの記述で一致した表記。
   * 直接の一致（kind: "field"）とは別に記録し、主張・成立条件での直接の一致の数（statementHitCount）には数えない
   */
  | { kind: "synonym"; field: NoteField; matched: string; noteTerm: string }
  /** ノートの種類（kind）による一致。大分類の Topic として取り出した語が、種類の表示名（KIND_LABELS）と同じときだけ */
  | { kind: "noteKind"; noteKind: KnowledgeNote["kind"]; matched: string };

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

/**
 * 知識ノートの並び順にだけ使う同義語（2026-11-09）。照合・一致の集合・一致の理由には使わない。
 * 同じ Topic の別名であることとは別に、意味が同じと確かめた語だけを置く
 * （「アタックムーブ」「スペーシング」「スタッターステップ」などは関連する技術で、同義語ではない）
 */
const RANK_SYNONYM_GROUPS: string[][] = [["カイト", "カイティング", "kiting"]].map((g) => g.map(normalize));

/** 検索語の同義語（自分を除く）。グループにない語は空 */
export function rankSynonymsOf(term: string): string[] {
  const t = normalize(term);
  return RANK_SYNONYM_GROUPS.find((g) => g.includes(t))?.filter((w) => w !== t) ?? [];
}

/**
 * 照合に使う同義の表記（2026-11-10）。並び順だけに使う RANK_SYNONYM_GROUPS とは別。
 * 同じ Topic の別名をすべて同義とはしない（例：Topic「クールダウン」の別名「クールタイム」「スキル切れ」、
 * 下位の「スキルヘイスト」「CDR」は含めない）。意味が同じ表記の組だけを置く。
 * 使うのは、ノートが検索の対象（ほかの具体的な条件）にも主張・成立条件で直接一致するときだけ（synonymBasesAllowed）
 */
const MATCH_SYNONYM_GROUPS: string[][] = [["CD", "クールダウン"]];

/** 検索語の照合用の同義の表記（自分を除く）。照合用の normalized と表示用の display */
export function matchSynonymsOf(term: string): { normalized: string; display: string }[] {
  const t = normalize(term);
  const g = MATCH_SYNONYM_GROUPS.find((xs) => xs.some((w) => normalize(w) === t));
  return g ? g.filter((w) => normalize(w) !== t).map((w) => ({ normalized: normalize(w), display: w })) : [];
}

const list = (xs: string[] | undefined) => (xs ?? []).map(normalize).join("\n");

interface NoteText {
  fields: Record<NoteField, string>;
  creators: string[];
}

const noteTexts = new Map<string, NoteText>(
  publicNotes.map((n) => {
    // 根拠の要約・発信者は、公開対象の資料の根拠だけ（公開対象でない資料の記述で一致・順位が変わらないように）
    const ev = publicEvidenceOf(n.id);
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
const SIDE = /対策|対抗|カウンター|対処|される側|使う側|使い方|使い手|\bcounter\b|\bvs\b|\bagainst\b/;
/**
 * 対策する側の情報を求める表現（2026-11-09）。並び順の補助（counterTargetMatch）だけに使い、照合の条件・注意（cues.side）とは別。
 * 「使い方」「使う側」は使う側の表現なので含めない。Topic・発信者として取り出した語（例：Topic「対面対策」「カウンターピック」）では働かせない
 */
const COUNTER_REQUEST = /対策|対抗|カウンター|対処|される側|\bcounter\b|\bagainst\b/;
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

/**
 * 大分類の Topic として取り出した語が、ノートの種類の表示名（KIND_LABELS。例：mechanic は「仕様」）と同じか（2026-11-09）。
 * 例：「スマイトの仕様」の「仕様」は大分類「ゲームの基本仕様」の別名で、種類が「仕様」のノートは、その Topic の下になくても一致する。
 * 大分類の別名をすべて種類と同じ意味にはしない（「基礎」「メカニクス」は表示名ではないので対象外）。
 * 語として残った「判断」「仮説」なども、大分類の Topic ではないので対象外。種類はノートの分類で、ゲーム内での検証ではない
 */
function isKindLabelMatch(u: Unit, n: KnowledgeNote): boolean {
  return u.kind === "topic" && u.topic.kind === "category" && normalize(KIND_LABELS[n.kind]) === normalize(u.matched);
}

/**
 * ノートの主張・成立条件に、検索の対象と結び付いた対策の記述があるか（2026-11-09）。並び順にだけ使い、一致の集合・理由は変えない。
 * 結び付きは、対象の語（検索条件の語と、その明示的な同義語）を含む「〜される側」「〜への対策」「〜の対策」か、
 * 「対策側」と書いたうえで対象の語も主張・成立条件にあり、その対象の Topic が直接付いているノートだけ。
 * Topic に付いているだけ（例：多くの技術を含む「操作技術」、広い「マッチアップ」）では結び付きとみなさない。
 * 例外・反証・補足・根拠の要約にある相手側の記述は見ない。判定できないノートは加点しない
 */
/** 検索語のうち Topic・発信者として取り出されずに残った部分に、対策を求める表現があるか（並び順の補助を働かせる条件） */
export function isCounterRequest(query: string): boolean {
  return COUNTER_REQUEST.test(matchQueryUnits(expandLevelAbbr(query)).residual);
}

export function counterTargetMatch(m: NoteMatch, units: Unit[]): boolean {
  const t = noteTexts.get(m.note.id);
  if (!t) return false;
  const text = `${t.fields.statement}\n${t.fields.conditions}`;
  return units.some((u, i) => {
    if (u.kind === "creator" || m.bases[i].length === 0) return false;
    if (u.kind === "topic" && u.topic.kind === "category") return false;
    const words = [normalize(u.matched), ...rankSynonymsOf(u.matched)];
    if (words.some((w) => text.includes(`${w}される側`) || text.includes(`${w}への対策`) || text.includes(`${w}の対策`))) return true;
    return u.kind === "topic" && m.note.topic_ids.includes(u.topic.id) && text.includes("対策側") && words.some((w) => containsTerm(text, w));
  });
}

const FIELD_ORDER: NoteField[] = ["statement", "conditions", "exceptions", "falsifiers", "notes", "applicability", "evidence", "topicName"];

const isStatementLevel = (f: NoteField) => f === "statement" || f === "conditions";

/**
 * 照合用の同義の表記で、検索の対象の根拠にしない語（2026-11-10）。何の CD かを特定しない語だけを明示する。
 * 立場を表す語（相手・敵・味方・自分）は、多くのノートで別の文脈（相手のタワー・相手のトップなど）に現れ、
 * 「スキル」は CD の対象を特定しない（「スキルにも当たりやすい」と通常攻撃の CD のように、別の文脈で結び付く）。
 * ノートの出現数による判定は使わない（無関係なノートの追加で判定が反転するため）。検索条件からは除かない
 */
const GENERIC_TARGET_WORDS = new Set(["相手", "敵", "味方", "自分", "スキル"].map(normalize));

/** 検索の対象の根拠にできる語か（GENERIC_TARGET_WORDS でない語） */
export function isTargetSpecific(term: string): boolean {
  return !GENERIC_TARGET_WORDS.has(normalize(term));
}

/**
 * 検索条件 i に照合用の同義の表記を使ってよいか（2026-11-10）。ノートが、ほかの具体的な条件（検索の対象）に、
 * 主張・成立条件の記述で直接一致しているときだけ。同義の表記による一致そのもの・大分類の Topic・発信者・
 * Topic が付いているだけの一致・何の CD かを特定しない語（GENERIC_TARGET_WORDS。例：「相手」「スキル」）は、対象の根拠にしない。対象のない検索（例：「CD」「クールダウン」だけ）では使わない
 */
export function synonymBasesAllowed(units: Unit[], directBases: NoteMatchBasis[][], i: number): boolean {
  return units.some(
    (v, j) =>
      j !== i &&
      v.kind !== "creator" &&
      !(v.kind === "topic" && v.topic.kind === "category") &&
      isTargetSpecific(v.matched) &&
      directBases[j].some((b) => b.kind === "field" && isStatementLevel(b.field)),
  );
}

function fieldBases(t: NoteText, matched: string): NoteMatchBasis[] {
  return FIELD_ORDER.filter((f) => containsTerm(t.fields[f], matched)).map((field) => ({ kind: "field", field, matched }));
}

/**
 * 検索語に一致する公開の知識ノート。公開しないノート（isPublicNote でないもの）は対象にしない。
 * 照合：Topic は付いている Topic（下位の Topic を含む）か記述、発信者は根拠の資料の発信者、語はノートの記述。
 * 大分類の Topic の語が種類の表示名と同じときは、その種類のノートにも一致する（isKindLabelMatch）。
 * 「CD」「クールダウン」は、ノートが検索の対象にも直接一致するときだけ、もう一方の表記でも同じ条件に一致する（MATCH_SYNONYM_GROUPS・synonymBasesAllowed）。
 * 並び順：すべての条件に一致したもの → 一部だけ一致したもの。それぞれ、現行で適用できないもの（旧仕様）を後ろにする。
 * 対策を求める検索では、検索の対象と結び付いた対策の記述があるものを先にする（counterTargetMatch）。
 * そのうえで、主張・成立条件で直接一致した条件が多いものを先にする（statementHitCount。照合用の同義の表記による一致は数えない）。
 * 同じなら、同義語（並び順用・照合用）を含めて主張・成立条件で一致した条件が多いものを先にする（statementHitCountWithSynonyms）。同じならデータの順
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
      // 日本語の複合語（例：「タワープレート」）は、ノートの記述にある2語に分けられるときだけ、2語として照合する。
      // 分けた語にも、分けない語と同じ一般語の規則（splitResidualTerms）を当てる（2026-11-09）。
      // 例：「カイトの練習方法」の「方法」は、「カイトの練習の方法」と同じく条件にしない
      const parts = splitCompound(term);
      if (parts) parts.filter((p) => splitResidualTerms(p).length > 0).forEach(push);
      else ignored.push(term);
    }
  }
  const cues = { negation: NEGATION.test(q), condition: CONDITION.test(q), stance: STANCE.test(q), side: SIDE.test(q) };
  const result: NoteSearchResult = { units, ignored, matches: [], cues, ...(expanded !== q ? { expandedQuery: expanded } : {}) };
  if (units.length === 0) return result;
  // 照合用の同義の表記は、検索条件ごとに1回だけ求める（ノートごとには求めない）
  const unitSynonyms = units.map((u) => (u.kind === "creator" ? [] : matchSynonymsOf(u.matched)));
  const anySynonym = unitSynonyms.some((s) => s.length > 0);

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
          ...(isKindLabelMatch(u, n) ? [{ kind: "noteKind" as const, noteKind: n.kind, matched: u.matched }] : []),
        ];
      }
      if (u.kind === "creator") return t.creators.filter((c) => u.creators.has(c)).map((creator) => ({ kind: "creator", creator, matched: u.matched }));
      return fieldBases(t, u.matched);
    });
    // 照合用の同義の表記：同じ条件への一致として加える（条件の数は増やさない）。直接一致した記述の種類には重ねない
    if (anySynonym) {
      unitSynonyms.forEach((syns, i) => {
        if (syns.length === 0 || !synonymBasesAllowed(units, bases, i)) return;
        const u = units[i];
        for (const s of syns) {
          for (const f of FIELD_ORDER) {
            if (u.kind === "topic" && f === "topicName") continue;
            if (bases[i].some((b) => (b.kind === "field" || b.kind === "synonym") && b.field === f)) continue;
            if (containsTerm(t.fields[f], s.normalized)) bases[i].push({ kind: "synonym", field: f, matched: u.matched, noteTerm: s.display });
          }
        }
      });
    }
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
    // Topic の名前（例：チャンピオン名）でも、ノートに Topic が付いておらず、名前が例外・反証の記述にだけあるときは同じ扱い
    const opposingOnly = bases.some(
      (b, i) => units[i].kind !== "creator" && b.length > 0 && b.every((x) => (x.kind === "field" || x.kind === "synonym") && OPPOSING_FIELDS.includes(x.field)),
    );
    result.matches.push({ note: n, bases, tier: full ? "full" : "partial", opposingOnly });
  }
  const rank = (m: NoteMatch) => (m.tier === "full" ? 0 : 2) + (m.note.historical?.current_applicability === "superseded" ? 1 : 0);
  const statementHits = new Map(result.matches.map((m) => [m, statementHitCount(m)]));
  const synonymHits = new Map(result.matches.map((m) => [m, statementHitCountWithSynonyms(m, units)]));
  // 対策を求める表現が、Topic・発信者として取り出されずに残った部分にあるときだけ、対象と結び付いた対策の記述を持つノートを先にする
  const counterRequest = COUNTER_REQUEST.test(residual);
  const counterHits = new Map(result.matches.map((m) => [m, counterRequest && counterTargetMatch(m, units) ? 1 : 0]));
  // 安定ソート：段・旧仕様が同じなら、対象と結び付いた対策の記述があるもの（対策を求める検索だけ）を先に。
  // 次に、主張・成立条件で検索語そのものが一致した条件が多いものを先に。
  // 同じなら、同義語を含めて一致した条件が多いものを先に（同義語は直接の一致より優先しない）。それも同じならデータの順
  result.matches.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      counterHits.get(b)! - counterHits.get(a)! ||
      statementHits.get(b)! - statementHits.get(a)! ||
      synonymHits.get(b)! - synonymHits.get(a)!,
  );
  return result;
}

/**
 * 主張・成立条件で、検索語そのものか、その同義語（並び順用の rankSynonymsOf、照合用の同義の表記による一致）が一致した検索条件の数。並び順にだけ使う。
 * 一致した条件だけを対象にし、1つの条件に同義語がいくつあっても1と数える。補足・根拠・例外・反証での同義語は数えない
 */
export function statementHitCountWithSynonyms(m: NoteMatch, units: Unit[]): number {
  const t = noteTexts.get(m.note.id);
  return m.bases.filter((bs, i) => {
    if (bs.length === 0) return false;
    // 直接の一致と、照合用の同義の表記（kind: "synonym"）による一致。どちらも同じ1条件として数える
    if (bs.some((b) => (b.kind === "field" || b.kind === "synonym") && isStatementLevel(b.field))) return true;
    const u = units[i];
    if (!t || u.kind === "creator") return false;
    return rankSynonymsOf(u.matched).some((w) => containsTerm(t.fields.statement, w) || containsTerm(t.fields.conditions, w));
  }).length;
}

/**
 * 主張・成立条件で一致した検索条件の数。1つの条件が主張と成立条件の両方にあっても1と数える。
 * Topic が付いているだけ・根拠の要約・補足・例外・反証での一致と、照合用の同義の表記による一致（kind: "synonym"）は数えない
 * （例：「カイト」は Topic「操作技術」の別名なので、操作技術のノートはすべて一致する。主張にカイトがあるノートを先にする）
 */
export function statementHitCount(m: NoteMatch): number {
  return m.bases.filter((bs) => bs.some((b) => b.kind === "field" && (b.field === "statement" || b.field === "conditions"))).length;
}
