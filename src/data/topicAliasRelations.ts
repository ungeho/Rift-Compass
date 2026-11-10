// 知識ノートの照合だけに使う、Topic の別名の意味の関係（2026-11-10）。
// Topic の別名（aliases_ja・aliases_en）には、同じ意味の表記・略称のほかに、Topic の具体例（下位概念）が混在している
// （例：「イグナイト」はサモナースペルの1つで、サモナースペル全体と同じ意味ではない）。
// ここには、具体例と確かめた別名だけを置く。Topic のデータ（data/sample-resources.json）は変えず、資料の検索・判断材料の照合にも使わない。
// ここにない別名は、従来どおり Topic と同じ意味として照合する。
import { normalize } from "../search/search";
import type { Topic } from "./types";

/**
 * Topic の具体例（下位概念）を表す別名のまとまり。aliases は、同じ具体例を指す、その Topic の登録済みの別名（日英の表記）で、
 * 互いに別表記として扱う（例：「カイト」と「kiting」）。同じ Topic のほかの具体例（例：「カイト」と「アタックムーブ」）は別のまとまりにする
 */
export interface NarrowerAliasConcept {
  topic_id: string;
  relation: "narrower";
  aliases: string[];
  /**
   * 同じ具体例を、ノートの記述で別の言い方で書いた表現（2026-11-10）。Topic の別名ではなく、検索語としては使わない。
   * 公開ノートの記述で確かめた表現だけを置き、一般語（例：「避ける」「スキル」）だけの短い表現は置かない
   */
  note_phrases?: string[];
}

/** 記述の言い換えとして登録できる表現の最短の長さ（一般語1語だけの表現を防ぐ） */
export const MIN_NOTE_PHRASE_LENGTH = 6;

export const TOPIC_ALIAS_RELATIONS: NarrowerAliasConcept[] = [
  // サモナースペルの具体的なスペル（対応する Topic はない）
  { topic_id: "summoner-spells", relation: "narrower", aliases: ["フラッシュ", "flash"] },
  { topic_id: "summoner-spells", relation: "narrower", aliases: ["イグナイト", "ignite"] },
  { topic_id: "summoner-spells", relation: "narrower", aliases: ["バリア", "barrier"] },
  { topic_id: "summoner-spells", relation: "narrower", aliases: ["イグゾースト", "exhaust"] },
  // 操作技術の具体的な技術（対応する Topic はない）。「引き撃ち」はカイトの和語
  { topic_id: "mechanics", relation: "narrower", aliases: ["カイト", "カイティング", "kiting", "引き撃ち"] },
  { topic_id: "mechanics", relation: "narrower", aliases: ["アタックムーブ", "attack move"] },
  { topic_id: "mechanics", relation: "narrower", aliases: ["スペーシング", "spacing"] },
  // 「スキルドッジ」の専用のノート（kn-skill-dodge-perpendicular）は「スキルショットを避ける」と書いている。
  // 別名ではなく記述の言い換えとして登録する（なければ専用のノートまで関連候補に移る）
  { topic_id: "mechanics", relation: "narrower", aliases: ["スキルドッジ"], note_phrases: ["スキルショットを避ける"] },
];

const key = (topicId: string, alias: string) => `${topicId}|${normalize(alias)}`;

/**
 * 関係のデータの誤り（なければ空の配列）。Topic が実在する・別名がその Topic の登録済みの別名である（表示名は不可）・
 * 同じ Topic と別名の組が2回以上現れない（正規化した表記で比べる）・関係の種類が既知である、を確かめる。
 * 記述の言い換え（note_phrases）は、どの Topic の表示名・別名とも違い、十分に長く（MIN_NOTE_PHRASE_LENGTH 文字以上）、重複しないこと
 */
export function validateTopicAliasRelations(topics: Topic[], relations: NarrowerAliasConcept[]): string[] {
  const errors: string[] = [];
  const byId = new Map(topics.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const topicWords = new Set(topics.flatMap((t) => [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en]).map(normalize));
  const phrases = new Set<string>();
  for (const r of relations) {
    for (const p of r.note_phrases ?? []) {
      const n = normalize(p);
      if (topicWords.has(n)) errors.push(`記述の言い換えが Topic の名前・別名と同じ：${r.topic_id} ${p}`);
      if ([...n].length < MIN_NOTE_PHRASE_LENGTH) errors.push(`記述の言い換えが短すぎる：${r.topic_id} ${p}`);
      if (phrases.has(n)) errors.push(`記述の言い換えが重複：${r.topic_id} ${p}`);
      phrases.add(n);
    }
    const t = byId.get(r.topic_id);
    if (!t) {
      errors.push(`不明な Topic：${r.topic_id}`);
      continue;
    }
    if (r.relation !== "narrower") errors.push(`未知の関係：${r.topic_id} ${r.relation}`);
    if (r.aliases.length === 0) errors.push(`別名がない：${r.topic_id}`);
    const aliases = new Set([...t.aliases_ja, ...t.aliases_en].map(normalize));
    const labels = new Set([t.label_ja, t.label_en].map(normalize));
    for (const a of r.aliases) {
      const n = normalize(a);
      if (labels.has(n)) errors.push(`表示名は対象にしない：${r.topic_id} ${a}`);
      else if (!aliases.has(n)) errors.push(`Topic の別名にない：${r.topic_id} ${a}`);
      if (seen.has(key(r.topic_id, a))) errors.push(`同じ Topic と別名の組が重複：${r.topic_id} ${a}`);
      seen.add(key(r.topic_id, a));
    }
  }
  return errors;
}

/** Topic と別名（正規化した表記）から、その別名が属する具体例のまとまりを引く表 */
export function aliasConceptIndex(relations: NarrowerAliasConcept[]): Map<string, NarrowerAliasConcept> {
  const m = new Map<string, NarrowerAliasConcept>();
  for (const r of relations) for (const a of r.aliases) m.set(key(r.topic_id, a), r);
  return m;
}

export const aliasConceptKey = key;
