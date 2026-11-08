// 確認済みの下書き（decision.operations の形式）を、check の検証結果のとおりに正式データ（data/sample-resources.json）へ反映する。
// knowledge-drafts.js の `apply` コマンドから使う。依存パッケージなし。
//
// 方針
// - 反映する内容は check(reviewed, data, { withCopy: true }) の作業用のコピーだけ。ここで新しい判断はしない
// - 既定はプレビュー（読み取り専用）。書き込みは write と、プレビューで表示した計画のハッシュの一致が必要
// - 計画のハッシュは「正式データの SHA-256・入力の SHA-256・書き込む内容の SHA-256」から作る。どれかが変われば一致しない
// - 書式を保つため、ファイル全体を整形し直さない。新しいノート・根拠・関係は各配列の末尾に既存の書式で足し、
//   annotate_note は対象ノートの notes_ja・source_person の行だけを書き換える。最後に、書いた内容を読み直して作業用のコピーと同じ構造か確かめる
// - 許可する差分は、ノート・根拠・関係の末尾への追加と、既存ノートの notes_ja・source_person への追記だけ（それ以外の差分があれば拒否）
// - check のエラー、人の確認待ち（pending_human_review。文字列による検出で、人の本人確認ではない）、旧形式（decision.action）、decision のない行は拒否する
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
// 欄の順序に左右されない比較用の文字列
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((q) => [q, v[q]])) : v));
const ANNOTATABLE = ["notes_ja", "source_person"];
const ARRAYS = ["knowledge_notes", "evidence", "relations"];
// 新しいノートの欄の並び（既存データの並びに合わせる。ここにない欄は拒否する）
const NOTE_ORDER = ["id", "kind", "statement_ja", "topic_ids", "status", "conditions_ja", "exceptions_ja", "falsifiers_ja", "notes_ja", "historical", "source_person", "generalizability", "patch_dependencies", "last_checked_patch"];

/** 元のデータと作業用のコピーの差分を、許可した形だけに限って取り出す。許可しない差分は refusals に入れる */
function structuralDiff(data, copy) {
  const refusals = [];
  for (const k of Object.keys({ ...data, ...copy })) {
    if (ARRAYS.includes(k)) continue;
    if (canon(data[k]) !== canon(copy[k])) refusals.push(`${k} が変わる（反映できるのはノート・根拠・関係の追加と、補足への追記だけ）`);
  }
  const adds = {};
  const annotate = [];
  for (const k of ARRAYS) {
    const a = data[k] ?? [], b = copy[k] ?? [];
    if (b.length < a.length) refusals.push(`${k} の要素が減る（削除はしない）`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i].id !== b[i].id) {
        refusals.push(`${k} の ${i + 1} 番目が ${a[i].id} から ${b[i].id} に変わる（並べ替え・ID の変更はしない）`);
        break;
      }
      if (canon(a[i]) === canon(b[i])) continue;
      const changed = Object.keys({ ...a[i], ...b[i] }).filter((f) => canon(a[i][f]) !== canon(b[i][f]));
      const bad = changed.filter((f) => k !== "knowledge_notes" || !ANNOTATABLE.includes(f));
      if (bad.length) refusals.push(`${a[i].id} の ${bad.join("・")} が変わる（既存の欄は変えない）`);
      const notAppend = changed.filter((f) => ANNOTATABLE.includes(f) && a[i][f] !== undefined && !(typeof b[i][f] === "string" && b[i][f].startsWith(a[i][f])));
      if (notAppend.length) refusals.push(`${a[i].id} の ${notAppend.join("・")} が追記でない`);
      if (!bad.length) annotate.push({ id: a[i].id, fields: changed });
    }
    adds[k] = b.slice(a.length);
    const ids = new Set(a.map((x) => x.id));
    for (const x of adds[k]) {
      if (ids.has(x.id)) refusals.push(`${k} の id ${x.id} が重複する`);
      ids.add(x.id);
    }
  }
  for (const n of adds.knowledge_notes ?? []) {
    const extra = Object.keys(n).filter((f) => !NOTE_ORDER.includes(f));
    if (extra.length) refusals.push(`${n.id} に書式の決まっていない欄 ${extra.join("・")} がある`);
  }
  return { refusals, adds, annotate };
}

// 既存の書式：配列は ["a", "b"]、オブジェクトは { "k": v }（根拠・関係の1行の形）
const inline = (x) =>
  Array.isArray(x) ? "[" + x.map(inline).join(", ") + "]" : x && typeof x === "object" ? "{ " + Object.entries(x).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ") + " }" : JSON.stringify(x);
const noteBlock = (n, eol) => `    {${eol}` + NOTE_ORDER.filter((f) => n[f] !== undefined).map((f) => `      ${JSON.stringify(f)}: ${inline(n[f])}`).join(`,${eol}`) + `${eol}    }`;

/** 元のテキストに、許可した差分だけを書き足したテキストを作る（全体を整形し直さない） */
function renderText(text, diff) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (eol === "\r\n" && /[^\r]\n/.test(text)) throw new Error("改行コードが混在している（書式を保てないので反映しない）");
  const unique = (t, needle, what) => {
    const i = t.indexOf(needle);
    if (i < 0 || t.indexOf(needle, i + 1) >= 0) throw new Error(`${what} の位置を一意に特定できない（書式を保てないので反映しない）`);
    return i;
  };
  let t = text;
  // annotate_note：対象ノートのブロックの中の、その欄の行だけを書き換える（なければ source_person か patch_dependencies の前に入れる）
  const notesStart = unique(t, `${eol}  "knowledge_notes": [${eol}`, "knowledge_notes");
  const notesEnd = unique(t, `${eol}  ],${eol}  "evidence": [`, "knowledge_notes の終わり");
  for (const { note, fields } of diff.annotateNotes) {
    const idLine = `${eol}      "id": ${JSON.stringify(note.id)},${eol}`;
    const at = unique(t.slice(notesStart, notesEnd), idLine, `ノート ${note.id}`) + notesStart;
    const end = t.indexOf(`${eol}    }`, at + idLine.length);
    let block = t.slice(at, end);
    for (const f of fields) {
      const line = (v) => `${eol}      ${JSON.stringify(f)}: ${JSON.stringify(v)},`;
      const re = new RegExp(`${eol}      ${JSON.stringify(f).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: "(?:[^"\\\\]|\\\\.)*",`);
      const m = block.match(re);
      if (m) {
        if (block.indexOf(m[0]) !== block.lastIndexOf(m[0])) throw new Error(`${note.id} の ${f} の行が一意でない`);
        block = block.replace(m[0], line(note[f]));
      } else {
        const before = [`${eol}      "source_person":`, `${eol}      "generalizability":`, `${eol}      "patch_dependencies":`].find((s) => block.includes(s) && s !== `${eol}      ${JSON.stringify(f)}:`);
        if (!before) throw new Error(`${note.id} に ${f} を入れる位置がない`);
        block = block.replace(before, line(note[f]) + before);
      }
    }
    t = t.slice(0, at) + block + t.slice(end);
  }
  // 追加：各配列の末尾に、既存の書式で足す
  const append = (marker, what, items) => {
    if (!items.length) return;
    const i = unique(t, marker, what);
    t = t.slice(0, i) + `,${eol}` + items.join(`,${eol}`) + t.slice(i);
  };
  append(`${eol}  ],${eol}  "evidence": [`, "knowledge_notes の終わり", diff.adds.knowledge_notes.map((n) => noteBlock(n, eol)));
  append(`${eol}  ],${eol}  "relations": [`, "evidence の終わり", diff.adds.evidence.map((e) => "    " + inline(e)));
  const relEnd = t.lastIndexOf(`${eol}  ]${eol}}`);
  if (relEnd < 0 || relEnd !== t.indexOf(`${eol}  ]${eol}}`)) throw new Error("relations の終わりの位置を一意に特定できない");
  if (diff.adds.relations.length) t = t.slice(0, relEnd) + `,${eol}` + diff.adds.relations.map((r) => "    " + inline(r)).join(`,${eol}`) + t.slice(relEnd);
  return t;
}

/**
 * 反映の計画を作る（読み取り専用）。check の結果を使い、書き込む内容のテキストまで作る
 * @returns {{ ok, refusals, errors, pending_human_review, report, summary, hashes: { data, reviewed, output, plan }, text?, copy? }}
 */
function planApply({ reviewedText, dataText, check }) {
  const refusals = [];
  let reviewed;
  try {
    reviewed = JSON.parse(reviewedText);
  } catch (e) {
    return { ok: false, refusals: [`入力の JSON を読めない：${e.message}`], errors: [], pending_human_review: [], report: [], summary: null, hashes: { data: sha256(dataText), reviewed: sha256(reviewedText), output: null, plan: null } };
  }
  if (!Array.isArray(reviewed) || reviewed.length === 0) refusals.push("入力が下書きの配列でない、または空");
  for (const d of Array.isArray(reviewed) ? reviewed : []) {
    if (!d.decision) refusals.push(`${d.row}: decision がない（処理を決めていない行があるので反映しない）`);
    else if (d.decision.operations === undefined) refusals.push(`${d.row}: 旧形式（decision.action）は apply しない（operations の形式で書く。旧形式を推測で変換しない）`);
  }
  const data = JSON.parse(dataText);
  const r = refusals.length ? { errors: [], pending_human_review: [], report: [], copy: null } : check(reviewed, data, { withCopy: true });
  if (r.errors.length) refusals.push(`check のエラー ${r.errors.length} 件`);
  if (r.pending_human_review.length) refusals.push(`人の確認待ち ${r.pending_human_review.length} 件（reviewed_by・status_approved_by の値。文字列で検出しているだけで、人の確認を保証するものではない）`);
  let text = null, summary = null;
  if (r.copy && !r.errors.length) {
    const diff = structuralDiff(data, r.copy);
    refusals.push(...diff.refusals);
    summary = {
      add: Object.fromEntries(ARRAYS.map((k) => [k, diff.adds[k].map((x) => x.id)])),
      annotate: diff.annotate,
    };
    if (!diff.refusals.length) {
      try {
        text = renderText(dataText, { adds: diff.adds, annotateNotes: diff.annotate.map((a) => ({ note: r.copy.knowledge_notes.find((n) => n.id === a.id), fields: a.fields })) });
        if (canon(JSON.parse(text)) !== canon(r.copy)) refusals.push("書き込む内容が作業用のコピーと一致しない");
      } catch (e) {
        refusals.push(e.message);
        text = null;
      }
    }
  }
  const hashes = { data: sha256(dataText), reviewed: sha256(reviewedText), output: text ? sha256(text) : null };
  hashes.plan = text ? sha256(`${hashes.data}\n${hashes.reviewed}\n${hashes.output}`) : null;
  return { ok: refusals.length === 0, refusals, errors: r.errors, pending_human_review: r.pending_human_review, report: r.report, summary, hashes, text, copy: r.copy };
}

/**
 * 計画を書き込む。プレビューで表示した計画のハッシュ（confirmPlan）と一致するときだけ書く。
 * ロック（同じディレクトリの .apply.lock を排他的に作る）→ 再計画 → 同じディレクトリの一時ファイルに書いて読み直す → 直前に元のファイルのハッシュを再確認 → rename で置き換える。
 * hooks はテスト用：afterTempWrite は一時ファイルを書いた直後（直前の再確認の前）、beforeRename は置き換えの直前に呼ぶ。
 */
function applyWrite({ reviewedFile, dataFile, confirmPlan, check, hooks = {} }) {
  if (!confirmPlan) return { ok: false, refusals: ["書き込みには、プレビューで表示した計画のハッシュ（--confirm-plan）が要る"] };
  const lock = path.join(path.dirname(dataFile), `.${path.basename(dataFile)}.apply.lock`);
  let fd;
  try {
    fd = fs.openSync(lock, "wx");
  } catch (e) {
    return { ok: false, refusals: [`ほかの apply が実行中か、前回のロックが残っている（${lock}）。残っているだけなら、実行中のものがないことを確かめてから消す`] };
  }
  const tmp = path.join(path.dirname(dataFile), `.${path.basename(dataFile)}.apply-${process.pid}-${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    const dataText = fs.readFileSync(dataFile, "utf8");
    const plan = planApply({ reviewedText: fs.readFileSync(reviewedFile, "utf8"), dataText, check });
    if (!plan.ok) return { ok: false, refusals: plan.refusals, plan };
    if (plan.hashes.plan !== confirmPlan) return { ok: false, refusals: ["計画のハッシュが一致しない（プレビューの後に正式データ・入力・書き込む内容のどれかが変わった）。もう一度プレビューする"], plan };
    fs.writeFileSync(tmp, plan.text, { encoding: "utf8", flag: "wx" });
    hooks.afterTempWrite?.();
    const written = fs.readFileSync(tmp, "utf8");
    if (sha256(written) !== plan.hashes.output || canon(JSON.parse(written)) !== canon(plan.copy)) throw new Error("一時ファイルの内容が計画と一致しない");
    if (sha256(fs.readFileSync(dataFile, "utf8")) !== plan.hashes.data) throw new Error("書き込みの直前に正式データが変わった");
    hooks.beforeRename?.();
    fs.renameSync(tmp, dataFile);
    return { ok: true, refusals: [], plan };
  } catch (e) {
    return { ok: false, refusals: [`書き込みに失敗した（正式データは置き換えていない）：${e.message}`] };
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    try { fs.closeSync(fd); fs.rmSync(lock, { force: true }); } catch {}
  }
}

module.exports = { planApply, applyWrite, structuralDiff, renderText, sha256, canon };
