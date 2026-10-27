// data/sample-resources.json（schema 0.1.1）の型。定義は docs/knowledge-model.md を参照。

export type Level = "L0" | "L1" | "L2" | "L3" | "L4";

export interface Topic {
  id: string;
  kind: "category" | "concept";
  parent_ids: string[];
  label_ja: string;
  label_en: string;
  aliases_ja: string[];
  aliases_en: string[];
}

export interface Segment {
  start_sec: number;
  label: string;
  source: string;
}

export interface Resource {
  id: string;
  url: string;
  title: string | null;
  type: string;
  language: string;
  creator: { name: string; kind: string; channel_url?: string };
  topic_ids: string[];
  summary_ja: string;
  published_at: string | null;
  published_at_note?: string;
  updated_at?: string;
  last_edited_at?: string;
  patch_context: { stated_patch: string | null; basis: string; era: string };
  access: { free: boolean | null; login_required: boolean | null; notes?: string };
  verification: { level: Level; checked_at: string; method: string; notes?: string };
  duration_sec?: number;
  segments?: Segment[];
  derived_from?: string;
  translation?: { kind: string; affiliated_with_original: boolean; method_stated: string };
}

export type NoteStatus = "source_stated" | "derived" | "tactical_inference" | "empirical" | "unverified" | "disputed";
export type NoteKind = "mechanic" | "principle" | "decision" | "hypothesis";

export interface KnowledgeNote {
  id: string;
  kind: NoteKind;
  statement_ja: string;
  topic_ids: string[];
  status: NoteStatus;
  patch_dependencies: string[];
  last_checked_patch: string | null;
  conditions_ja?: string[];
  exceptions_ja?: string[];
  falsifiers_ja?: string[];
  notes_ja?: string;
  historical?: {
    valid_from: string | null;
    valid_until: string | null;
    current_applicability: "applicable" | "likely_applicable" | "unknown" | "superseded";
    applicability_note_ja?: string;
  };
  source_person?: string;
  generalizability?: string;
}

export interface Evidence {
  id: string;
  note_id: string;
  resource_id: string;
  evidence_type: string;
  locator: { section?: string; start_sec?: number; label?: string } | null;
  summary_ja: string;
  checked_level: Level;
  checked_at: string;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface Dataset {
  schema_version: string;
  generated_at: string;
  research_context: { current_patch_at_research: string; [key: string]: unknown };
  topics: Topic[];
  resources: Resource[];
  knowledge_notes: KnowledgeNote[];
  evidence: Evidence[];
  relations: Relation[];
}
