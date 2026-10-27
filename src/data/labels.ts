// 表示用ラベル。L3 や source_stated を「ゲーム仕様として検証済み」と読める文言にしないこと。
import type { KnowledgeNote, Level, NoteStatus } from "./types";

export const LANGUAGE_LABELS: Record<string, string> = { ja: "日本語", en: "英語", ko: "韓国語" };

export const TYPE_LABELS: Record<string, string> = {
  wiki: "Wiki",
  official: "公式",
  patch_notes: "パッチノート",
  patch_notes_archive: "パッチ履歴（Wiki）",
  article: "記事",
  video: "動画",
};

export const LEVEL_LABELS: Record<Level, { short: string; description: string }> = {
  L0: { short: "L0 未確認", description: "URL候補のみ。取得できず、内容もタイトルも確認していません。" },
  L1: { short: "L1 実在のみ", description: "URLの実在だけを確認しています。" },
  L2: { short: "L2 メタデータ確認", description: "タイトル・発信者・公開日などを確認。本文（動画本編）は未確認です。" },
  L3: { short: "L3 AIが本文を確認", description: "AIが本文を取得し、要約経由で記述を確認した段階です。資料の確認であり、ゲーム内での検証ではありません。" },
  L4: { short: "L4 人が本文を確認", description: "人が本文・該当区間を確認しています。ゲーム内での検証とは別です。" },
};

export const CREATOR_KIND_LABELS: Record<string, string> = {
  official: "公式",
  community_wiki: "コミュニティWiki",
  media: "メディア",
  coach: "コーチ",
  pro_player: "プロ・元プロ",
  streamer: "配信者",
  fan_translator: "非公式翻訳",
};

export const BASIS_LABELS: Record<string, string> = {
  stated: "資料に明記",
  inferred_from_date: "公開日からの推定",
  inferred_from_original_date: "原典の公開日からの推定",
  unknown: "不明",
};

export function eraLabel(era: string): string {
  const m = /^season(\d+)$/.exec(era);
  if (m) return `シーズン${m[1]}`;
  const range = /^season(\d+)-(\d+)$/.exec(era);
  if (range) return `シーズン${range[1]}〜${range[2]}`;
  const fixed: Record<string, string> = {
    current: "現行（Wiki等の最新版）",
    current_with_history: "現行＋過去の履歴",
    "preseason-2014": "プレシーズン2014",
    unknown: "不明",
  };
  return fixed[era] ?? era;
}

/** valid_from / valid_until に入るパッチ・シーズン表記 */
export function periodLabel(value: string): string {
  return /^season/.test(value) ? eraLabel(value) : value;
}

export const STATUS_LABELS: Record<NoteStatus, { label: string; description: string; tone: string }> = {
  source_stated: { label: "資料に記載あり", description: "資料にそう書かれていることを確認しました。ゲーム内では未検証です。", tone: "stated" },
  derived: { label: "導出（計算・論理）", description: "資料の値や記述から計算・論理で導いたものです。ゲーム内では未検証です。", tone: "derived" },
  tactical_inference: { label: "戦術的な推論", description: "仕様から行動を推論したものです。前提にない試合状況では成り立たない場合があります。", tone: "inference" },
  empirical: { label: "経験則・解説者の主張", description: "解説者の経験や観察に基づく主張です。", tone: "empirical" },
  unverified: { label: "未検証", description: "十分な根拠を確認していません。", tone: "unverified" },
  disputed: { label: "対立する見解あり", description: "反対の根拠や見解があります。", tone: "disputed" },
};

export const KIND_LABELS: Record<KnowledgeNote["kind"], string> = {
  mechanic: "仕様",
  principle: "原理",
  decision: "判断",
  hypothesis: "仮説",
};

/** status と kind を合わせた見出し（例：未検証の仮説）*/
export function noteHeading(note: KnowledgeNote): string {
  if (note.status === "unverified" && note.kind === "hypothesis") return "未検証の仮説";
  return STATUS_LABELS[note.status].label;
}

export const APPLICABILITY_LABELS: Record<NonNullable<KnowledgeNote["historical"]>["current_applicability"], string> = {
  applicable: "現行環境でも確認済み",
  likely_applicable: "現行でも成り立つ可能性が高い（未検証）",
  unknown: "現行環境への適用可能性：未確認",
  superseded: "現行では適用できない（仕様変更）",
};

export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  source_fact: "資料の記述",
  derivation: "導出の根拠",
  tactical_inference: "推論の前提",
  empirical_claim: "解説者の主張",
  hypothesis: "仮説の手がかり",
  counter: "反対の根拠",
  in_game_test: "ゲーム内検証",
};

export function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
