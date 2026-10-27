// データ由来の説明文に含まれる内部用語を、一般の利用者向けの言い方に置き換える（表示専用。正本は変更しない）。
import { index } from "../data/dataset";

const REPLACEMENTS: [RegExp, string][] = [
  [/valid_until は null/g, "終了時期は空欄"],
  [/valid_from/g, "開始時期"],
  [/valid_until/g, "終了時期"],
  [/\bNote\b/g, "ノート"],
  [/\bEvidence\b/g, "根拠"],
  [/WebFetch/g, "AIによるページ取得"],
];

/** 資料IDは資料名に、ノートIDは「関連する知識ノート」に置き換える */
function replaceIds(s: string): string {
  return s
    .replace(/\bres-[a-z0-9-]+/g, (id) => {
      const r = index.resourceById.get(id);
      return r?.title ? `「${r.title}」` : "別の資料";
    })
    .replace(/\bkn-[a-z0-9-]+/g, (id) => {
      const n = index.noteById.get(id);
      return n ? `関連する知識ノート「${n.statement_ja.slice(0, 24)}${n.statement_ja.length > 24 ? "…" : ""}」` : "関連する知識ノート";
    });
}

export function plainText(s: string): string {
  let out = replaceIds(s);
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to);
  return out;
}
