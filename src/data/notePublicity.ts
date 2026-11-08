// 知識ノートの公開判定（P1）。純粋な関数で、検索・散策・Topic・ノートの詳細・資料の詳細が同じ判定を使う。
//
// P1：通常公開の対象の資料（isPublic）に紐づく根拠だけを使い、既存の根拠状態の規則
// （tools/validate-sample-data.js の validate のノートごとの規則）を満たすかで判定する。
// - 規則そのものは変えない（緩めない）。P0 との違いは、規則の評価に使う根拠の集合だけ
// - 公開対象でない資料の根拠は、保存データから消さず、昇格もさせない。判定に使わないだけ
// - 公開しても、ノートのすべての主張が確かめられたとは扱わない（根拠はノート全体を指す）
//
// ここで決める根拠の集合：
// - publicEvidence：判定・画面の根拠の一覧・検索の索引・根拠の件数に使う
// - otherEvidence：公開対象でない資料（または参照の不整合）の根拠。存在だけを知らせ、内容・資料へのリンクは通常の画面に出さない
import type { Evidence, KnowledgeNote, Level, Relation, Resource } from "./types";

const LEVELS: Level[] = ["L0", "L1", "L2", "L3", "L4"];
const NOTE_STATUSES = ["source_stated", "derived", "tactical_inference", "empirical", "unverified", "disputed"];
/** 前提の関係（validate と同じ） */
export const PREMISE_RELATIONS = ["reason_for", "prerequisite"];

const strong = (e: Evidence) => e.checked_level === "L3" || e.checked_level === "L4";

/**
 * ノートごとの根拠状態の規則（tools/validate-sample-data.js:73-95 を写したもの。文言も同じ）。
 * evidence に渡した根拠の集合だけで評価する。premises は、このノートへの前提の関係（reason_for・prerequisite）の元のノート。
 * 規則を変えるときは validate と同時に変える（notePublicity.test.ts で、全ノートについて validate と同じ結果になることを確かめている）
 */
export function noteRuleErrors(note: KnowledgeNote, evidence: Evidence[], premises: KnowledgeNote[]): string[] {
  const errors: string[] = [];
  const n = note;
  if (!NOTE_STATUSES.includes(n.status)) return [`${n.id}: unknown status ${n.status}`];
  const has = (type: string) => evidence.some((e) => e.evidence_type === type && strong(e));
  if (n.status !== "unverified" && evidence.length === 0) errors.push(`${n.id}: status ${n.status} requires evidence, none found`);
  if (n.status === "source_stated" && !has("source_fact")) errors.push(`${n.id}: source_stated needs L3+ source_fact`);
  if (n.status === "derived") {
    if (!has("derivation")) errors.push(`${n.id}: derived needs L3+ derivation`);
    const traceable = evidence.some((e) => e.evidence_type === "derivation" && strong(e) && e.locator);
    if (premises.length === 0 && !traceable) errors.push(`${n.id}: derived has no traceable basis (no premise note and no derivation evidence with locator)`);
    for (const p of premises) if (!["source_stated", "derived"].includes(p.status)) errors.push(`${n.id}: derived from weak premise ${p.id}`);
  }
  if (n.status === "tactical_inference" && !has("tactical_inference")) errors.push(`${n.id}: tactical_inference needs L3+ tactical_inference evidence`);
  if (n.status === "empirical" && !evidence.some((e) => e.evidence_type === "empirical_claim")) errors.push(`${n.id}: empirical needs empirical_claim evidence`);
  if (n.status === "disputed" && !evidence.some((e) => e.evidence_type === "counter")) errors.push(`${n.id}: disputed needs counter evidence`);
  if (n.last_checked_patch && !evidence.some((e) => e.evidence_type === "in_game_test")) errors.push(`${n.id}: last_checked_patch set without in_game_test evidence`);
  if (n.historical && n.historical.valid_until && !n.historical.valid_from) errors.push(`${n.id}: valid_until without valid_from`);
  return errors;
}

export interface NotePublicityInput {
  note: KnowledgeNote;
  /** 保存されているこのノートの根拠すべて */
  evidence: Evidence[];
  resourceById: Map<string, Resource>;
  /** 通常公開の対象の資料か（dataset.ts の isPublic） */
  isPublicResource: (r: Resource) => boolean;
  /** このノートへの前提の関係の元のノート（公開かどうかは問わない。validate と同じ） */
  premises: KnowledgeNote[];
}

export interface NotePublicity {
  isPublic: boolean;
  /** 公開対象の資料の根拠（判定・表示・索引・件数に使う） */
  publicEvidence: Evidence[];
  /** 公開対象でない資料の根拠・参照の不整合な根拠（保存はするが、判定・索引・件数に使わない） */
  otherEvidence: Evidence[];
  /** 非公開の理由（公開のときは空） */
  reasons: string[];
}

/**
 * 根拠を、通常公開の対象の資料のものとそれ以外に分ける。
 * 資料が存在しない・公開対象でない・根拠の確認レベルが資料の確認レベルを超える（データの不整合）ものは公開側に入れない
 */
export function splitEvidence(evidence: Evidence[], resourceById: Map<string, Resource>, isPublicResource: (r: Resource) => boolean) {
  const publicEvidence: Evidence[] = [];
  const otherEvidence: Evidence[] = [];
  for (const e of evidence) {
    const r = resourceById.get(e.resource_id);
    const ok = r !== undefined && isPublicResource(r) && LEVELS.indexOf(e.checked_level) >= 0 && LEVELS.indexOf(e.checked_level) <= LEVELS.indexOf(r.verification.level);
    (ok ? publicEvidence : otherEvidence).push(e);
  }
  return { publicEvidence, otherEvidence };
}

/** P1 の公開判定：公開対象の資料の根拠が1件以上あり、その根拠だけで根拠状態の規則を満たす */
export function notePublicity({ note, evidence, resourceById, isPublicResource, premises }: NotePublicityInput): NotePublicity {
  const { publicEvidence, otherEvidence } = splitEvidence(evidence, resourceById, isPublicResource);
  const reasons = publicEvidence.length === 0 ? [evidence.length === 0 ? "根拠がない" : "通常公開の対象の資料の根拠がない"] : noteRuleErrors(note, publicEvidence, premises);
  return { isPublic: reasons.length === 0, publicEvidence, otherEvidence, reasons };
}

/** このノートへの前提の関係の元のノート（validate の premises と同じ） */
export function premisesOf(noteId: string, relations: Relation[], noteById: Map<string, KnowledgeNote>): KnowledgeNote[] {
  return relations
    .filter((r) => r.to === noteId && PREMISE_RELATIONS.includes(r.type))
    .map((r) => noteById.get(r.from))
    .filter((n): n is KnowledgeNote => n !== undefined);
}
