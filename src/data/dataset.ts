// 正本の JSON を読み込み、表示・検索用の索引をアプリ内で派生生成する（JSON 自体は変更しない）。
import raw from "../../data/sample-resources.json";
import type { Dataset, Evidence, KnowledgeNote, Level, Resource, Topic } from "./types";

export const LEVEL_ORDER: Level[] = ["L0", "L1", "L2", "L3", "L4"];

export function levelAtLeast(level: Level, min: Level): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(min);
}

/** 通常の公開一覧・検索の対象：無料アクセスを確認済み、かつ確認レベル L2 以上 */
export function isPublic(r: Resource): boolean {
  return r.access.free === true && levelAtLeast(r.verification.level, "L2");
}

export interface DataIndex {
  data: Dataset;
  resources: Resource[];
  publicResources: Resource[];
  resourceById: Map<string, Resource>;
  topicById: Map<string, Topic>;
  childrenOf: Map<string, Topic[]>;
  noteById: Map<string, KnowledgeNote>;
  evidenceByResource: Map<string, Evidence[]>;
  evidenceByNote: Map<string, Evidence[]>;
  translationsOf: Map<string, Resource[]>;
  /** topic 自身とその子孫（循環があっても止まる）*/
  descendants(topicId: string): Set<string>;
  /** topic の祖先（循環があっても止まる）*/
  ancestors(topicId: string): Set<string>;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

export function buildIndex(data: Dataset): DataIndex {
  const topicById = new Map(data.topics.map((t) => [t.id, t]));
  const childrenOf = new Map<string, Topic[]>();
  for (const t of data.topics) for (const p of t.parent_ids) if (p !== t.id) push(childrenOf, p, t);

  const evidenceByResource = new Map<string, Evidence[]>();
  const evidenceByNote = new Map<string, Evidence[]>();
  for (const e of data.evidence) {
    push(evidenceByResource, e.resource_id, e);
    push(evidenceByNote, e.note_id, e);
  }
  const translationsOf = new Map<string, Resource[]>();
  for (const r of data.resources) if (r.derived_from) push(translationsOf, r.derived_from, r);

  const walk = (start: string, next: (id: string) => string[]) => {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...next(id));
    }
    return seen;
  };
  const descCache = new Map<string, Set<string>>();

  return {
    data,
    resources: data.resources,
    publicResources: data.resources.filter(isPublic),
    resourceById: new Map(data.resources.map((r) => [r.id, r])),
    topicById,
    childrenOf,
    noteById: new Map(data.knowledge_notes.map((n) => [n.id, n])),
    evidenceByResource,
    evidenceByNote,
    translationsOf,
    descendants(topicId) {
      let s = descCache.get(topicId);
      if (!s) {
        s = walk(topicId, (id) => (childrenOf.get(id) ?? []).map((t) => t.id));
        descCache.set(topicId, s);
      }
      return s;
    },
    ancestors(topicId) {
      return walk(topicId, (id) => topicById.get(id)?.parent_ids ?? []);
    },
  };
}

export const index = buildIndex(raw as unknown as Dataset);
