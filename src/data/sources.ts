import type { Topic } from "./types";

export interface Source {
  id: string;
  name: string;
  url: string;
  kind: "website" | "youtube";
  description_ja: string;
  languages: string[];
  aliases: string[];
  topic_ids: string[];
  collection_ids: string[];
  coverage_ja: string;
  presence: { status: "unconfirmed" | "checked"; checked_at: string | null; basis_ja: string };
  candidate_count: number;
  unregistered_count: number;
  excluded_count: number;
  inferred_topic_ids: string[];
  resource_ids: string[];
}
export interface SourceCandidate {
  key: string;
  url: string;
  title: string | null;
  type: string;
  language: string;
  published_at: string | null;
  discovered_at: string | null;
  metadata_state: "url_only" | "metadata";
  review: { checked_at: string | null; checked_by: string | null; method: string } | null;
  topic_ids: string[];
  roles: string[];
  triage: { status: string; reason: string };
  registered: boolean;
  resource_id: string | null;
  registered_at?: string | null;
  notes_ja?: string | null;
}
export interface SourcesIndex { schema_version: number; sources: Source[]; unassigned: SourceCandidate[] }
export interface SourceFile { source_id: string; candidates: SourceCandidate[] }
export const SOURCE_KINDS = { website: "サイト", youtube: "YouTube" };
export const SOURCE_LANGUAGES: Record<string, string> = { ja: "日本語", en: "英語", ko: "韓国語", unknown: "言語未確認" };
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().trim();
const matches = (q: string, text: string) => normalize(q).split(/\s+/).filter(Boolean).every((term) => normalize(text).includes(term));
function topicText(ids: string[], topics: Topic[]): string {
  const wanted = new Set(ids);
  return topics.filter((t) => wanted.has(t.id)).flatMap((t) => [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en]).join(" ");
}
export function filterSources(sources: Source[], filters: { q: string; kind: string; lang: string }, topics: Topic[]): Source[] {
  return sources.filter((s) => (!filters.kind || s.kind === filters.kind) && (!filters.lang || s.languages.includes(filters.lang)) &&
    matches(filters.q, [s.name, s.description_ja, ...s.aliases, topicText([...s.topic_ids, ...s.inferred_topic_ids], topics)].join(" ")));
}
export type CandidateFilter = "unregistered" | "hold" | "registered" | "excluded" | "all";
export function filterSourceCandidates(candidates: SourceCandidate[], q: string, filter: CandidateFilter, topics: Topic[]): SourceCandidate[] {
  return candidates.filter((c) => {
    const status = c.triage.status;
    const included = filter === "all" || (filter === "unregistered" ? !c.registered && status !== "excluded" : filter === "registered" ? c.registered : status === filter);
    return included && matches(q, [c.title || c.url, topicText(c.topic_ids, topics)].join(" "));
  });
}
export async function fetchSourcesFile<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}sources/${file}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
