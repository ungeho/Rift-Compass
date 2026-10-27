// クライアントサイド検索（docs/retrieval-evaluation.md の方式B）。
// 検索対象：Resource のタイトル・発信者名・日本語紹介文、Topic の日英表示名・別名。
// Note 本文や動画区間は検索対象にしない（方式Cは採用しない）。
import { index as defaultIndex, LEVEL_ORDER, type DataIndex } from "../data/dataset";
import type { Resource, Topic } from "../data/types";

export function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isAscii = (s: string) => /^[\x20-\x7e]+$/.test(s);
const hasCjk = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

/** 空白の有無を問わずに一致させる正規表現（"level 2" と "level2"、"veigar v2" と "veigarv2"）。
 *  ASCII だけの語は英数字の途中では一致させない。複数形の s は許容する。 */
function termRegex(term: string): RegExp {
  const body = [...term.replace(/\s+/g, "")].map(escapeRe).join("\\s*");
  return isAscii(term) ? new RegExp(`(?<![a-z0-9])${body}s?(?![a-z0-9])`, "g") : new RegExp(body, "g");
}

const EN_STOPWORDS = new Set(
  // lol / league / legends はゲーム名そのものなので、主題の区別に使えない
  "a an the to of in on for and or is are was be how what why when where which who can do does should i my me you your it this that with from about after before vs many much more most get learn guide video videos lol league legends game".split(" "),
);
const JA_STOPWORDS = new Set(
  ["知りたい", "学びたい", "教えて", "理由", "方法", "条件", "どこ", "なに", "何", "なぜ", "とき", "場合", "解説", "違い", "仕組み", "仕組", "知識", "情報", "内容", "やり方", "動画", "記事", "資料", "今も", "利用", "できる", "する", "したい", "いい", "べき", "ある", "いる", "なる", "どう", "どれくらい", "どっち", "有利"],
);
// 発信者名のうち、単独では発信者を特定できない一般語
const GENERIC_CREATOR_WORDS = new Set(["official", "english", "wiki", "games", "channel", "lol", "league", "legends", "of", "the", "esports", "gg"]);

export type Unit =
  | { kind: "topic"; key: string; topic: Topic; matched: string }
  | { kind: "creator"; key: string; creators: Set<string>; matched: string }
  | { kind: "term"; key: string; matched: string };

export interface QueryAnalysis {
  units: Unit[];
  /** 資料中に一度も現れず、検索に使わなかった語 */
  ignored: string[];
}

interface Matcher {
  kind: "topic" | "creator";
  key: string;
  regex: RegExp;
  topic?: Topic;
  creators?: Set<string>;
}

interface Prepared {
  idx: DataIndex;
  matchers: Matcher[];
  corpus: string;
  fields: Map<string, { title: string; creator: string; summary: string; topicText: string }>;
}

const preparedCache = new WeakMap<DataIndex, Prepared>();

function topicTerms(t: Topic): string[] {
  return [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en].map(normalize);
}

function prepare(idx: DataIndex): Prepared {
  const cached = preparedCache.get(idx);
  if (cached) return cached;

  const matchers: Matcher[] = [];
  for (const t of idx.data.topics) {
    for (const term of new Set(topicTerms(t))) {
      if ([...term].length < 2) continue; // 「B」のような1文字の別名は誤一致が多いため使わない
      matchers.push({ kind: "topic", key: term, regex: termRegex(term), topic: t });
    }
  }
  const creatorKeys = new Map<string, Set<string>>();
  const addKey = (key: string, name: string) => {
    if ([...key].length < 3 && isAscii(key)) return;
    if (!creatorKeys.has(key)) creatorKeys.set(key, new Set());
    creatorKeys.get(key)!.add(name);
  };
  for (const r of idx.publicResources) {
    const name = r.creator.name;
    const parts = normalize(name).split(/[()（）]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      addKey(part.replace(/\s+/g, ""), name);
      const words = part.split(/\s+/);
      if (words.length > 1) for (const w of words) if (!GENERIC_CREATOR_WORDS.has(w)) addKey(w, name);
    }
  }
  for (const [key, creators] of creatorKeys) {
    if (GENERIC_CREATOR_WORDS.has(key)) continue;
    matchers.push({ kind: "creator", key, regex: termRegex(key), creators });
  }

  const fields = new Map<string, { title: string; creator: string; summary: string; topicText: string }>();
  for (const r of idx.publicResources) {
    const topicText = r.topic_ids.flatMap((id) => { const t = idx.topicById.get(id); return t ? topicTerms(t) : []; }).join(" ");
    fields.set(r.id, { title: normalize(r.title ?? ""), creator: normalize(r.creator.name), summary: normalize(r.summary_ja), topicText });
  }
  const corpus = [...fields.values()].map((f) => `${f.title} ${f.creator} ${f.summary} ${f.topicText}`).join("\n");

  const p = { idx, matchers, corpus, fields };
  preparedCache.set(idx, p);
  return p;
}

export function analyzeQuery(query: string, idx: DataIndex = defaultIndex): QueryAnalysis {
  const p = prepare(idx);
  const q = normalize(query);
  if (!q) return { units: [], ignored: [] };

  // 1. Topic の別名と発信者名を、長い一致から順に重ならないように採用する
  const candidates: { m: Matcher; start: number; end: number; text: string }[] = [];
  for (const m of p.matchers) {
    for (const hit of q.matchAll(m.regex)) {
      candidates.push({ m, start: hit.index!, end: hit.index! + hit[0].length, text: hit[0] });
    }
  }
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || (a.m.kind === "creator" ? -1 : 1));
  const taken: boolean[] = new Array(q.length).fill(false);
  const units: Unit[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (taken.slice(c.start, c.end).some(Boolean)) continue;
    for (let i = c.start; i < c.end; i++) taken[i] = true;
    const unitKey = c.m.kind === "topic" ? `topic:${c.m.topic!.id}` : `creator:${[...c.m.creators!].sort().join("|")}`;
    if (seen.has(unitKey)) continue;
    seen.add(unitKey);
    units.push(c.m.kind === "topic"
      ? { kind: "topic", key: unitKey, topic: c.m.topic!, matched: c.text }
      : { kind: "creator", key: unitKey, creators: c.m.creators!, matched: c.text });
  }

  // 2. 残りの語。資料中に実在する語だけを検索語にする（無関係な語で結果を水増ししない）
  const residual = [...q].map((ch, i) => (taken[i] ? " " : ch)).join("");
  const ignored: string[] = [];
  for (const chunk of residual.split(/[\s、。，．,.!?？！「」『』()（）[\]・/:;"'〜~]+/)) {
    // 日本語はひらがな（助詞・送り仮名・活用語尾）で区切り、漢字・カタカナ・英数字の並びを語とみなす
    // 例：「いつ導入された」→「導入」、「真似していい」→「真似」
    const terms = hasCjk(chunk) ? chunk.split(/[぀-ゟ]+/) : [chunk];
    for (const term of terms) {
      if ([...term].length < 2 || EN_STOPWORDS.has(term) || JA_STOPWORDS.has(term)) continue;
      const key = `term:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (p.corpus.includes(term)) units.push({ kind: "term", key, matched: term });
      else ignored.push(term);
    }
  }
  return { units, ignored };
}

function unitScore(r: Resource, u: Unit, p: Prepared): number {
  if (u.kind === "topic") {
    const category = u.topic.kind === "category";
    let s = 0;
    if (r.topic_ids.includes(u.topic.id)) s = category ? 4 : 10;
    else if (r.topic_ids.some((id) => p.idx.descendants(u.topic.id).has(id))) s = category ? 3 : 6;
    // 別名そのもの（例：「トリンケット」）がタイトルや紹介文にある資料を、同じ Topic の中で上にする
    const f = p.fields.get(r.id);
    if (s > 0 && f && (f.title.includes(u.matched) || f.summary.includes(u.matched))) s += 3;
    return s;
  }
  const f = p.fields.get(r.id);
  if (u.kind === "creator") {
    if (u.creators.has(r.creator.name)) return 12;
    // その発信者を題材にした第三者の資料（例：Dopa のプレイを解説した日本語動画）
    return f && (f.title.includes(u.matched) || f.summary.includes(u.matched)) ? 6 : 0;
  }
  if (!f) return 0;
  const t = u.matched;
  const s = Math.max(f.title.includes(t) ? 6 : 0, f.creator.includes(t) ? 8 : 0, f.topicText.includes(t) ? 5 : 0, f.summary.includes(t) ? 3 : 0);
  return s * termWeight(t, p);
}

/** 多くの資料に現れる語ほど、主題を区別する力が弱いので重みを下げる */
function termWeight(term: string, p: Prepared): number {
  const df = docFrequency(term, p);
  const n = p.fields.size;
  return df <= 3 ? 1 : df <= n / 4 ? 0.7 : 0.4;
}

function docFrequency(term: string, p: Prepared): number {
  let df = 0;
  for (const f of p.fields.values()) if (`${f.title} ${f.creator} ${f.summary} ${f.topicText}`.includes(term)) df++;
  return df;
}

function unitPriority(u: Unit, p: Prepared): number {
  if (!isSpecific(u, p)) return 0;
  return u.kind === "creator" ? 3 : u.kind === "topic" ? 2 : 1;
}

/** 大分類の Topic や、資料の1/4を超えて現れる語は「一般的な条件」とみなす */
function isSpecific(u: Unit, p: Prepared): boolean {
  if (u.kind === "topic") return u.topic.kind !== "category";
  if (u.kind === "creator") return true;
  return docFrequency(u.matched, p) <= p.fields.size / 4;
}

export interface Filters {
  lang?: string;
  type?: string;
  topic?: string;
  creator?: string;
  era?: string;
  level?: string;
}

export const FILTER_KEYS = ["lang", "type", "topic", "creator", "era", "level"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export function applyFilters(resources: Resource[], filters: Filters, idx: DataIndex = defaultIndex): Resource[] {
  const topicSet = filters.topic ? idx.descendants(filters.topic) : null;
  return resources.filter((r) =>
    (!filters.lang || r.language === filters.lang) &&
    (!filters.type || r.type === filters.type) &&
    (!topicSet || r.topic_ids.some((id) => topicSet.has(id))) &&
    (!filters.creator || r.creator.name === filters.creator) &&
    (!filters.era || r.patch_context.era === filters.era) &&
    (!filters.level || r.verification.level === filters.level),
  );
}

/**
 * full       … 認識したすべての概念に一致し、使えなかった語もない（＝検索条件に一致）
 * recognized … 認識したすべての概念に一致したが、資料中にない語が残っている（その語は条件に含めていない）
 * partial    … 一部の概念にだけ一致した関連候補
 */
export type MatchKind = "full" | "recognized" | "partial";

export interface Hit {
  resource: Resource;
  score: number;
  matchedUnits: number;
  /** 一致した概念（Unit.key）*/
  matchedKeys: string[];
  match: MatchKind;
  /** match === "full" と同じ。互換のため残す */
  complete: boolean;
}

export interface SearchResult {
  analysis: QueryAnalysis;
  /** full / recognized を先に、partial を後に並べる */
  hits: Hit[];
  /** 検索条件に一致した資料（match === "full"）の数 */
  completeCount: number;
  /** 「条件に一致」の判定で必須とした概念（Unit.key）。表示で、どの条件が未一致かを示すために使う */
  requiredKeys: string[];
  /** 絞り込み前の公開対象件数 */
  totalPublic: number;
}

export function search(query: string, filters: Filters = {}, idx: DataIndex = defaultIndex): SearchResult {
  const p = prepare(idx);
  const pool = applyFilters(idx.publicResources, filters, idx);
  const analysis = analyzeQuery(query, idx);
  const { units } = analysis;
  const totalPublic = idx.publicResources.length;

  if (!normalize(query)) {
    const hits = pool.map((resource): Hit => ({ resource, score: 0, matchedUnits: 0, matchedKeys: [], match: "full", complete: true }));
    return { analysis, hits, completeCount: hits.length, totalPublic, requiredKeys: [] };
  }
  if (units.length === 0) return { analysis, hits: [], completeCount: 0, totalPublic, requiredKeys: [] };
  // 資料中にない語（主題とみられる語）があり、認識できたのが一般語だけの場合は、
  // 主題と無関係な資料を一般語の一致だけで出さない（例：「ドラゴンソウルの効果」の「効果」）
  if (analysis.ignored.length > 0 && units.every((u) => u.kind === "term")) {
    return { analysis, hits: [], completeCount: 0, totalPublic, requiredKeys: [] };
  }

  // 条件に一致：具体的な概念（大分類の Topic や、資料の1/4を超えて現れる語ではないもの）にすべて一致した資料。
  //   一般的な概念は必須にせず、一致すれば順位を上げるだけにする（具体的な概念がない検索では全概念を必須にする）。
  // 関連候補：具体的な概念の一部にだけ一致した資料。一般的な概念だけの一致（「lane」だけなど）は候補にしない。
  const specificUnits = units.filter((u) => isSpecific(u, p));
  const required = new Set((specificUnits.length > 0 ? specificUnits : units).map((u) => u.key));
  const priorityOf = new Map(units.map((u) => [u.key, unitPriority(u, p)]));
  const hits: Hit[] = [];
  for (const resource of pool) {
    let score = 0;
    const matchedKeys: string[] = [];
    for (const u of units) {
      const s = unitScore(resource, u, p);
      if (s > 0) {
        score += s;
        matchedKeys.push(u.key);
      }
    }
    const matchedRequired = matchedKeys.filter((k) => required.has(k)).length;
    if (matchedRequired === 0) continue;
    const all = matchedRequired === required.size;
    const match: MatchKind = all ? (analysis.ignored.length === 0 ? "full" : "recognized") : "partial";
    hits.push({ resource, score, matchedUnits: matchedKeys.length, matchedKeys, match, complete: match === "full" });
  }
  const rank = (h: Hit) => (h.match === "partial" ? 1 : 0);
  // 関連候補は、より具体的な概念（発信者 > Topic > 語）に一致したものを先にする
  const priority = (h: Hit) => (h.match === "partial" ? Math.max(...h.matchedKeys.map((k) => priorityOf.get(k) ?? 0)) : 0);
  hits.sort((a, b) =>
    rank(a) - rank(b) ||
    priority(b) - priority(a) ||
    b.matchedUnits - a.matchedUnits ||
    b.score - a.score ||
    LEVEL_ORDER.indexOf(b.resource.verification.level) - LEVEL_ORDER.indexOf(a.resource.verification.level) ||
    (a.resource.title ?? "").localeCompare(b.resource.title ?? ""),
  );
  return { analysis, hits, completeCount: hits.filter((h) => h.complete).length, totalPublic, requiredKeys: [...required] };
}

/** 絞り込み候補ごとの件数（その項目以外の条件を適用した結果で数える）*/
export function facetCounts(query: string, filters: Filters, key: FilterKey, idx: DataIndex = defaultIndex): Map<string, number> {
  const rest = { ...filters, [key]: undefined };
  const counts = new Map<string, number>();
  for (const { resource: r } of search(query, rest, idx).hits) {
    const values =
      key === "lang" ? [r.language]
      : key === "type" ? [r.type]
      : key === "creator" ? [r.creator.name]
      : key === "era" ? [r.patch_context.era]
      : key === "level" ? [r.verification.level]
      : [...new Set(r.topic_ids.flatMap((id) => [...idx.ancestors(id)]))];
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}
