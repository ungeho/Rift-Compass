// 知識抽出バッチ（docs/experiments/knowledge-extraction-batch*.md）の記録から、KnowledgeNote・Evidence の「下書き」を作り、
// 人が確認した下書きを既存の検証（tools/validate-sample-data.js の validate）にかける。依存パッケージなし。
//
//   node tools/experiments/knowledge-drafts.js rows                          全行の件数と、原典ごとの正式資料の有無
//   node tools/experiments/knowledge-drafts.js draft 2:H15 3:R … [--out f]  指定した行の下書き（バッチ番号:行ID、または バッチ番号:原典の記号 で原典の全行）
//   node tools/experiments/knowledge-drafts.js check <reviewed.json>         確認済みの下書きを作業用のコピーに入れて検証する
//   node tools/experiments/knowledge-drafts.js apply <reviewed.json>         正式データへの反映の計画を表示する（読み取り専用。knowledge-apply.js）
//   node tools/experiments/knowledge-drafts.js apply <reviewed.json> --write --confirm-plan <計画のハッシュ>   計画どおりに書き込む
//
// 方針（自動で埋めない項目は推測せず review に残す）
// - 原典の URL・著者・公開日とパッチ・節・成立条件・関係の記述は、記録からそのまま写す
// - 正式資料（Resource）は URL で照合するだけ。未登録の原典を資料として登録しない（evidence.resource_id は null のまま）
// - status は常に "unverified" で下書きする。確認レベル（checked_level）は空のまま。どちらも人が決める（昇格させない）
// - kind・topic_ids は提案だけ（topic は Topic の名前・別名が記述に現れたもの）。採否は人が決める
// - 「同じ主張」「条件・著者が違う」などの関係の記述は、統合の提案・統合しない理由として示すだけで、ノートをまとめない
// - 件数の上限は設けない（指定した行をすべて処理する）
const fs = require("fs");
const path = require("path");
const { validate, NOTE_STATUSES, LEVELS } = require("../validate-sample-data");

const ROOT = path.join(__dirname, "..", "..");
const BATCH_FILE = (b) => path.join(ROOT, "docs", "experiments", `knowledge-extraction-batch${b}.md`);
const DATA_FILE = path.join(ROOT, "data", "sample-resources.json");
const NOTE_KINDS = ["mechanic", "principle", "decision", "hypothesis"];
const EVIDENCE_TYPES = ["source_fact", "empirical_claim", "hypothesis", "tactical_inference", "derivation", "in_game_test", "counter"];

const normUrl = (u) => u.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "").toLowerCase();
const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const plain = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();
const empty = (s) => !s || /^[—-]$/.test(s.trim());

/** 1つのバッチの記録を、原典の表と各節の表に分けて読む（列は見出しの名前で対応させる）*/
function parseBatch(b, text = fs.readFileSync(BATCH_FILE(b), "utf8")) {
  const lines = text.split(/\r?\n/);
  const sources = new Map();
  const rows = [];
  let header = null;
  let section = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      header = null;
      continue;
    }
    if (!line.startsWith("|")) {
      header = null;
      continue;
    }
    const c = cells(line);
    if (c.every((x) => /^:?-+:?$/.test(x))) continue;
    if (!header) {
      header = c;
      continue;
    }
    const get = (...names) => {
      const i = header.findIndex((h) => names.includes(h));
      return i >= 0 ? c[i] : undefined;
    };
    if (header[0] === "#") {
      const src = get("原典") ?? "";
      const link = src.match(/\[([^\]]+)\]\((https?:[^)]+)\)/);
      sources.set(c[0], {
        letter: c[0],
        title: link ? link[1] : plain(src),
        url: link ? link[2] : null,
        author: plain(get("著者") ?? ""),
        published: plain(get("公開・パッチ", "言語・公開・パッチ") ?? ""),
        scope: plain(get("ロール・分野", "ロール・チャンピオン・分野") ?? ""),
        candidate_key: (get("候補キー（candidates.json・reviews.json）", "候補キー・資料 ID", "候補キー") ?? "").match(/`(https?:[^`]+)`/)?.[1] ?? null,
      });
      continue;
    }
    if (header[0] !== "ID" || !/^[A-Z]\d+$/.test(c[0])) continue;
    rows.push({
      batch: b,
      id: c[0],
      letter: c[0][0],
      heading: section,
      section: get("節") ?? null,
      claim: get("知識", "照合した記述") ?? "",
      type: get("種類") ?? null,
      conditions: get("条件・対象") ?? null,
      check: get("確認", "結果") ?? null,
      relations: get("関係", "第1回・第2回との関係", "第2回の該当") ?? null,
    });
  }
  return { sources, rows };
}

function loadAll() {
  const out = new Map();
  for (const b of [1, 2, 3]) out.set(b, parseBatch(b));
  return out;
}

function topicMatchers(data) {
  const ms = [];
  for (const t of data.topics) {
    for (const term of new Set([t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en].map((s) => s.normalize("NFKC").toLowerCase()))) {
      if ([...term].length < 2) continue;
      const ascii = /^[\x20-\x7e]+$/.test(term);
      const body = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      ms.push({ id: t.id, kind: t.kind, term, re: ascii ? new RegExp(`(?<![a-z0-9])${body}s?(?![a-z0-9])`) : new RegExp(body) });
    }
  }
  return ms;
}

/** 1行の下書き。自動で決められない項目は null にし、review に理由を書く */
function draftRow(row, source, data, ms = topicMatchers(data)) {
  const review = [];
  const resources = new Map(data.resources.map((r) => [normUrl(r.url), r]));
  const resource = source?.url ? resources.get(normUrl(source.url)) : undefined;
  const claim = plain(row.claim);
  const type = row.type ? plain(row.type) : null;
  const rel = row.relations ?? "";
  const check = row.check ? plain(row.check) : null;

  // 関係の記述から参照を拾う（kn-・du-・他の行）
  const refs = {
    notes: [...new Set(rel.match(/kn-[a-z0-9-]+/g) ?? [])],
    decisions: [...new Set(rel.match(/du-[a-z0-9-]+/g) ?? [])],
    rows: [...new Set(rel.replace(/`[^`]*`/g, "").match(/(?:第[123]回\s*)?(?<![A-Za-z0-9-])[A-Z]\d{1,2}(?![0-9])/g) ?? [])],
  };
  const flags = {
    same_author: /同じ著者/.test(rel),
    differs: /相違|条件の違い|食い違|対立/.test(rel + (check ?? "")),
    agrees: /一致|共通点|同方向|同じ仕様/.test(rel),
    outdated: /古い|食い違う|旧仕様/.test(check ?? "") || /古い/.test(type ?? ""),
    figure_unchecked: /図/.test((type ?? "") + (check ?? "")),
    spec_unverified: /仕様/.test(type ?? "") && !/^済|一致/.test(check ?? ""),
  };

  // 原典と正式資料
  if (!source) review.push({ field: "source", reason: `原典 ${row.letter} が原典の表にない` });
  if (!resource) {
    review.push({ field: "evidence.resource_id", reason: "原典が正式資料（Resource）に未登録。根拠を付けるには、人が正式資料にするか（確認レベル L2 以上・無料アクセスの確認）を判断する。自動では登録しない" });
  }

  // 種類 → evidence_type・kind の提案（決めない）
  const official = resource && /riot|wiki/i.test(resource.creator?.name ?? "");
  let evidenceType = null;
  let kind = null;
  if (type && /^著者|^AI/.test(type)) evidenceType = /AI/.test(type) ? null : "empirical_claim";
  if (type && /仕様/.test(type)) {
    evidenceType = official ? "source_fact" : "empirical_claim";
    kind = "mechanic";
  }
  if (!type) review.push({ field: "kind・evidence_type", reason: "記録に種類の列がない（照合の表）。照合先の資料と種類を人が決める" });
  else if (!evidenceType) review.push({ field: "evidence_type", reason: `種類「${type}」から根拠の種類を決められない（AI の整理は原典の主張ではない）` });
  if (!kind) review.push({ field: "kind", reason: "principle・decision・hypothesis のどれかを人が決める（記録の種類からは区別できない）" });

  // Topic の提案
  const text = claim.normalize("NFKC").toLowerCase();
  const topics = [...new Set(ms.filter((m) => m.kind !== "category" && m.re.test(text)).map((m) => m.id))];
  review.push({ field: "topic_ids", reason: topics.length ? `記述に Topic の名前・別名が現れたものを提案：${topics.join("・")}。採否は人が決める` : "記述から Topic を提案できない" });

  // パッチ・時期
  const patches = [...new Set([...(source?.published ?? "").matchAll(/パッチ\s?(\d{1,2}\.\d{1,2})/g)].map((m) => m[1]).concat([...(type ?? "").matchAll(/V(\d{2}\.\d{2})/g)].map((m) => m[1])))];
  if (flags.outdated) review.push({ field: "historical", reason: `確認の記述「${check}」：現行の仕様と食い違う・古い可能性。historical（current_applicability）を人が決める` });
  if (flags.figure_unchecked) review.push({ field: "statement_ja", reason: "図・映像を確認していない記述がある。図に依存する部分は確認済みにしない" });
  if (flags.spec_unverified) review.push({ field: "status", reason: "原典の仕様説明で、公式・Wiki との照合が済んでいない" });

  // 既存の知識との重なり（統合するかは人が決める）
  const referenced = refs.notes.filter((id) => data.knowledge_notes.some((n) => n.id === id));
  const sameResource = resource ? [...new Set(data.evidence.filter((e) => e.resource_id === resource.id).map((e) => e.note_id))] : [];
  if (referenced.length) review.push({ field: "merge", reason: `関係の記述にある既存ノート：${referenced.join("・")}。根拠の追加で済むか、別ノートかを人が決める` });
  if (sameResource.length) review.push({ field: "merge", reason: `同じ資料を根拠にする既存ノート：${sameResource.join("・")}。この行が既に登録済みでないかを確かめる` });
  if (flags.differs) review.push({ field: "merge", reason: "関係・確認の記述に「相違・条件の違い・食い違い」がある。条件・数値・著者・パッチの違いを残すため、無条件に統合しない" });
  if (flags.same_author) review.push({ field: "evidence", reason: "同じ著者の記述は独立した裏付けにしない" });

  const key = `b${row.batch}-${row.id.toLowerCase()}`;
  return {
    row: `第${row.batch}回 ${row.id}`,
    source: source
      ? { letter: source.letter, title: source.title, url: source.url, author: source.author, published: source.published, candidate_key: source.candidate_key, resource_id: resource?.id ?? null, resource_level: resource?.verification.level ?? null }
      : null,
    record: { heading: row.heading, section: row.section, type, conditions: row.conditions, check, relations: row.relations },
    refs,
    flags,
    note: {
      id: `kn-draft-${key}`,
      kind,
      statement_ja: claim,
      topic_ids: [],
      status: "unverified",
      ...(empty(row.conditions ?? "") || /^一般$/.test(row.conditions ?? "") ? {} : { conditions_ja: [plain(row.conditions)] }),
      ...(source?.author ? { source_person: source.author.replace(/（.*$/, "") } : {}),
      patch_dependencies: patches,
      last_checked_patch: null,
    },
    evidence: {
      id: `ev-draft-${key}`,
      note_id: `kn-draft-${key}`,
      resource_id: resource?.id ?? null,
      evidence_type: evidenceType,
      locator: row.section && !empty(row.section) ? { section: plain(row.section) } : null,
      summary_ja: claim,
      checked_level: null,
      checked_at: null,
    },
    suggested: { topic_ids: topics },
    review,
  };
}

/** "2:H15"（1行）または "2:H"（その原典の全行）の形の指定から下書きを作る。原典1件を正式資料にしたあと、その原典の行をまとめて処理できる */
function draft(specs, data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")), all = loadAll()) {
  const ms = topicMatchers(data);
  return specs.flatMap((spec) => {
    const [b, id] = spec.split(":");
    const batch = all.get(Number(b));
    const rows = /^[A-Z]$/.test(id ?? "") ? (batch?.rows.filter((r) => r.letter === id) ?? []) : (batch?.rows.filter((r) => r.id === id) ?? []);
    if (rows.length === 0) throw new Error(`行がない：${spec}`);
    return rows.map((row) => draftRow(row, batch.sources.get(row.letter), data, ms));
  });
}

// 関係の種類（既存データ・画面の表示名と同じ7種）。operations の形式では、これ以外をエラーにする
const RELATION_TYPES = ["reason_for", "condition_of", "refines", "prerequisite", "applies_to", "generalizes", "context_of"];
const OPERATION_ACTIONS = ["new_note", "add_evidence", "annotate_note", "merged", "skip"];
// 確認者の欄が「人の確認待ち」を示す値か（文字列があることと、人が承認したことを区別して報告する。エラーにはしない）
const pendingHuman = (s) => typeof s === "string" && /確認待ち|AI の提案|AI（|pending/i.test(s);

/**
 * 人が確認した下書き（decision を埋めたもの）を、作業用のコピーに入れて既存の検証にかける。公開データ（DATA_FILE）は変更しない。
 *
 * 旧形式（1行に1つの判断。動作は変えていない）：
 *   decision：{ action: "new_note" | "add_evidence" | "skip", note?, evidence?, merge_into?, relations?: [{ to, type }], status_approved_by?, reviewed_by, reason_ja }
 *
 * operations の形式（1行に複数の明示的な操作。書いた順に実行する）：
 *   decision：{ reviewed_by, operations: [操作, …] }
 *   - { action: "new_note", note, evidence: [根拠, …], relations?: [{ to, type } | { from, to, type }], status_approved_by?, merges_rows?: [行], merge_reason_ja? }
 *       根拠の1件目は、その行の下書きの根拠を土台にする（資料・節・要約を引き継ぐ）。別の資料の根拠は、id・resource_id・evidence_type・
 *       checked_level・locator・summary_ja をすべて書く（行の原典の節・要約を別の資料に引き継がない）。
 *   - { action: "add_evidence", merge_into, evidence, allow_same_resource?, reason_ja }  既存ノート（またはそれより前の操作で作ったノート）に根拠を足す。
 *       同じノート・同じ資料の根拠が既にあれば、旧形式と違い、黙って飛ばさずエラーにする（allow_same_resource で別の箇所と明示したときだけ足す）
 *   - { action: "annotate_note", note_id, notes_append_ja?, source_person_add?, reason_ja }  既存ノートの補足（notes_ja）と source_person に追記するだけ。
 *       主張・status・成立条件・根拠の確認レベルなど、ほかの欄は変えられない
 *   - { action: "merged", into, reason_ja, conditions_handling_ja? }  この行を、別の行の new_note（merges_rows にこの行を書いたもの）に統合した
 *   - { action: "skip", reason_ja }
 * 第3引数 { withCopy: true } で、検証に使った作業用のコピーを結果の copy に含める（中身の確認用。公開データには書かない）。
 * 実行順：操作は行の順・操作の順に実行する。add_evidence・annotate_note の対象は、既存ノートか、それより前の操作で作ったノートだけ。
 * 関係（relations）と統合（merged）の対応は、すべての操作の後にまとめて確かめる（同じ一括の中の後のノートを参照できる）。
 */
function check(reviewed, data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")), { withCopy = false } = {}) {
  const copy = JSON.parse(JSON.stringify(data));
  const errors = [];
  const report = [];
  const pending = [];
  const deferredRelations = [];
  const merges = []; // { row, into, from: "merged" | "merges_rows" }
  const conditionChecks = [];
  for (const d of reviewed) {
    const dec = d.decision;
    if (!dec) {
      report.push({ row: d.row, result: "未確認（decision なし）" });
      continue;
    }
    if (!dec.reviewed_by) errors.push(`${d.row}: reviewed_by がない（誰の判断かを残す）`);
    else if (pendingHuman(dec.reviewed_by)) pending.push(`${d.row}: reviewed_by「${dec.reviewed_by}」`);
    if (dec.operations !== undefined) {
      if (dec.action !== undefined) errors.push(`${d.row}: action と operations を同時に書かない`);
      if (!Array.isArray(dec.operations) || dec.operations.length === 0) {
        errors.push(`${d.row}: operations が空`);
        continue;
      }
      runOperations(d, dec.operations, { copy, data, errors, report, pending, deferredRelations, merges, conditionChecks });
      continue;
    }
    if (dec.action === "skip") {
      report.push({ row: d.row, result: `登録しない：${dec.reason_ja}` });
      continue;
    }
    const ev = { ...d.evidence, ...(dec.evidence ?? {}) };
    if (!ev.resource_id) errors.push(`${d.row}: 根拠の資料がない（未登録の原典は登録しない）`);
    if (!EVIDENCE_TYPES.includes(ev.evidence_type)) errors.push(`${d.row}: evidence_type ${ev.evidence_type} を決めていない`);
    if (!LEVELS.includes(ev.checked_level)) errors.push(`${d.row}: checked_level ${ev.checked_level} を決めていない`);
    if (dec.action === "add_evidence") {
      if (!copy.knowledge_notes.some((n) => n.id === dec.merge_into)) errors.push(`${d.row}: merge_into ${dec.merge_into} が既存ノートにない`);
      // 同じノートに同じ資料の根拠が既にあれば、節の書き方が違っても追加しない（同じ記述の二重登録を防ぐ）。別の箇所の根拠なら allow_same_resource を明示する
      const dup = copy.evidence.find((e) => e.note_id === dec.merge_into && e.resource_id === ev.resource_id);
      if (dup && !dec.allow_same_resource) {
        report.push({ row: d.row, result: `既に登録済みの可能性（${dup.id}：同じノート・同じ資料）。追加しない` });
        continue;
      }
      copy.evidence.push({ ...ev, note_id: dec.merge_into });
      report.push({ row: d.row, result: `既存ノート ${dec.merge_into} に根拠を追加` });
      continue;
    }
    const note = { ...d.note, ...(dec.note ?? {}) };
    if (!NOTE_KINDS.includes(note.kind)) errors.push(`${d.row}: kind ${note.kind} を決めていない`);
    if (note.topic_ids.length === 0) errors.push(`${d.row}: topic_ids を決めていない`);
    if (note.status !== "unverified" && !dec.status_approved_by) errors.push(`${d.row}: status を ${note.status} にするには status_approved_by が要る（下書きは unverified）`);
    if (!NOTE_STATUSES.includes(note.status)) errors.push(`${d.row}: unknown status ${note.status}`);
    if (copy.knowledge_notes.some((n) => n.statement_ja === note.statement_ja)) errors.push(`${d.row}: 同じ主張のノートが既にある`);
    copy.knowledge_notes.push(note);
    copy.evidence.push({ ...ev, note_id: note.id });
    for (const [i, r] of (dec.relations ?? []).entries()) copy.relations.push({ id: `rel-draft-${note.id.replace(/^kn-/, "")}-${i + 1}`, from: note.id, to: r.to, type: r.type });
    report.push({ row: d.row, result: `新しいノート ${note.id}` });
  }
  finishOperations({ copy, errors, deferredRelations, merges, conditionChecks });
  errors.push(...validate(copy));
  return {
    errors,
    report,
    added: { notes: copy.knowledge_notes.length - data.knowledge_notes.length, evidence: copy.evidence.length - data.evidence.length },
    added_relations: copy.relations.length - data.relations.length,
    // 確認者の欄が「人の確認待ち」の行。文字列があっても人の承認とは扱わない（正式に登録する前に人が確かめる）
    pending_human_review: pending,
    // テスト・確認用：検証に使った作業用のコピー（withCopy のときだけ。公開データではない）
    ...(withCopy ? { copy } : {}),
  };
}

/** operations の形式の1行を実行する（作業用のコピーだけを変える） */
function runOperations(d, ops, ctx) {
  const { copy, data, errors, report, pending, deferredRelations, merges, conditionChecks } = ctx;
  const err = (i, msg) => errors.push(`${d.row} 操作${i + 1}: ${msg}`);
  const noteIds = () => new Set(copy.knowledge_notes.map((n) => n.id));
  const evIds = () => new Set(copy.evidence.map((e) => e.id));
  const resources = new Map(copy.resources.map((r) => [r.id, r]));
  const checkEvidence = (i, ev) => {
    if (!ev.id) err(i, "根拠の id がない");
    else if (evIds().has(ev.id)) err(i, `根拠の id ${ev.id} が既にある`);
    if (!ev.resource_id) err(i, "根拠の資料がない（未登録の原典は登録しない）");
    else if (!resources.has(ev.resource_id)) err(i, `資料 ${ev.resource_id} が正式資料にない`);
    if (!EVIDENCE_TYPES.includes(ev.evidence_type)) err(i, `evidence_type ${ev.evidence_type} を決めていない`);
    if (!LEVELS.includes(ev.checked_level)) err(i, `checked_level ${ev.checked_level} を決めていない`);
    if (!ev.locator || !ev.locator.section) err(i, "根拠の位置（locator.section）がない");
    if (!ev.summary_ja) err(i, "根拠の要約（summary_ja）がない");
  };
  // 競合する操作：skip はほかの操作と並べない。1行を2つのノートに merged しない
  const acts = ops.map((o) => o?.action);
  if (acts.includes("skip") && ops.length > 1) errors.push(`${d.row}: skip とほかの操作を同時に書かない`);
  if (acts.filter((a) => a === "merged").length > 1) errors.push(`${d.row}: 1行を2つ以上のノートに merged しない（分けるなら new_note・add_evidence で書く）`);
  for (const [i, op] of ops.entries()) {
    if (!op || !OPERATION_ACTIONS.includes(op.action)) {
      err(i, `未知の操作 ${op?.action}（${OPERATION_ACTIONS.join("・")} のどれか）`);
      continue;
    }
    if (op.action === "skip") {
      if (!op.reason_ja) err(i, "skip の理由（reason_ja）がない");
      report.push({ row: d.row, result: `登録しない：${op.reason_ja}` });
      continue;
    }
    if (op.action === "merged") {
      if (!op.into) err(i, "merged の統合先（into）がない");
      if (!op.reason_ja) err(i, "統合の理由（reason_ja）がない");
      merges.push({ row: d.row, into: op.into, side: "merged", i });
      // 統合元の行の成立条件を、統合先が持っているか（または扱いを明示したか）を、すべての操作の後に確かめる
      if (d.note?.conditions_ja?.length) conditionChecks.push({ row: d.row, into: op.into, conditions: d.note.conditions_ja, handling: op.conditions_handling_ja, i });
      report.push({ row: d.row, result: `${op.into} に統合：${op.reason_ja}` });
      continue;
    }
    if (op.action === "annotate_note") {
      const n = copy.knowledge_notes.find((x) => x.id === op.note_id);
      if (!n || !data.knowledge_notes.some((x) => x.id === op.note_id)) {
        err(i, `annotate_note の対象 ${op.note_id} が既存ノートにない（この一括で作るノートは new_note に直接書く）`);
        continue;
      }
      const allowed = ["action", "note_id", "notes_append_ja", "source_person_add", "reason_ja"];
      const extra = Object.keys(op).filter((k) => !allowed.includes(k));
      if (extra.length) err(i, `annotate_note で変えられない欄：${extra.join("・")}（補足と source_person への追記だけ）`);
      if (!op.notes_append_ja && !op.source_person_add) err(i, "annotate_note に追記する内容がない");
      if (!op.reason_ja) err(i, "annotate_note の理由（reason_ja）がない");
      if (op.notes_append_ja) n.notes_ja = n.notes_ja ? `${n.notes_ja}${op.notes_append_ja}` : op.notes_append_ja;
      if (op.source_person_add) n.source_person = n.source_person ? `${n.source_person}・${op.source_person_add}` : op.source_person_add;
      report.push({ row: d.row, result: `既存ノート ${op.note_id} の補足に追記` });
      continue;
    }
    if (op.action === "add_evidence") {
      if (!noteIds().has(op.merge_into)) {
        err(i, `merge_into ${op.merge_into} が既存ノート・それより前に作ったノートにない`);
        continue;
      }
      const ev = { ...d.evidence, ...(op.evidence ?? {}), note_id: op.merge_into };
      if (op.evidence?.resource_id && op.evidence.resource_id !== d.evidence?.resource_id) for (const k of ["id", "locator", "summary_ja"]) if (!op.evidence[k]) err(i, `行の原典と違う資料の根拠は ${k} を書く（行の原典の値を引き継がない）`);
      checkEvidence(i, ev);
      const dup = copy.evidence.find((e) => e.note_id === op.merge_into && e.resource_id === ev.resource_id);
      if (dup && !op.allow_same_resource) {
        err(i, `${op.merge_into} に同じ資料の根拠 ${dup.id} が既にある（二重登録。別の箇所なら allow_same_resource を明示する）`);
        continue;
      }
      copy.evidence.push(ev);
      report.push({ row: d.row, result: `既存ノート ${op.merge_into} に根拠を追加（${ev.id}）` });
      continue;
    }
    // new_note
    const note = { ...d.note, ...(op.note ?? {}) };
    if (!note.id) err(i, "ノートの id がない");
    else if (noteIds().has(note.id)) err(i, `ノートの id ${note.id} が既にある`);
    if (!NOTE_KINDS.includes(note.kind)) err(i, `kind ${note.kind} を決めていない`);
    if (!Array.isArray(note.topic_ids) || note.topic_ids.length === 0) err(i, "topic_ids を決めていない");
    if (!NOTE_STATUSES.includes(note.status)) err(i, `unknown status ${note.status}`);
    if (note.status !== "unverified" && !op.status_approved_by) err(i, `status を ${note.status} にするには status_approved_by が要る（下書きは unverified）`);
    else if (note.status !== "unverified" && pendingHuman(op.status_approved_by)) pending.push(`${d.row}: status ${note.status} の承認「${op.status_approved_by}」`);
    if (copy.knowledge_notes.some((n) => n.statement_ja === note.statement_ja)) err(i, "同じ主張のノートが既にある");
    const evs = Array.isArray(op.evidence) ? op.evidence : op.evidence ? [op.evidence] : [];
    if (evs.length === 0) err(i, "new_note に根拠がない");
    const built = evs.map((e, k) => {
      const sameSource = k === 0 && (!e.resource_id || e.resource_id === d.evidence?.resource_id);
      if (!sameSource) for (const f of ["id", "resource_id", "locator", "summary_ja"]) if (!e[f]) err(i, `根拠${k + 1}：行の原典と違う資料（または2件目以降）の根拠は ${f} を書く`);
      return { ...(sameSource ? d.evidence : {}), ...e, note_id: note.id };
    });
    const seen = new Set();
    for (const [k, e] of built.entries()) {
      const key = `${e.resource_id}|${e.locator?.section ?? ""}`;
      if (seen.has(key)) err(i, `根拠${k + 1}：同じ資料・同じ位置の根拠が重複（${e.resource_id}）`);
      seen.add(key);
      if (built.slice(0, k).some((x) => x.id === e.id)) err(i, `根拠${k + 1}：id ${e.id} が重複`);
    }
    for (const e of built) checkEvidence(i, e);
    copy.knowledge_notes.push(note);
    copy.evidence.push(...built);
    for (const [k, r] of (op.relations ?? []).entries()) {
      const from = r.from ?? note.id;
      const to = r.to;
      if (from !== note.id && to !== note.id) err(i, `関係${k + 1}：このノート（${note.id}）を含まない関係は書けない`);
      deferredRelations.push({ row: d.row, i, rel: { id: r.id ?? `rel-draft-${note.id.replace(/^kn-/, "")}-${k + 1}`, from, to, type: r.type } });
    }
    for (const m of op.merges_rows ?? []) merges.push({ row: m, into: note.id, side: "merges_rows", by: d.row, i });
    if (op.merges_rows?.length && !op.merge_reason_ja) err(i, "merges_rows を書いたら統合の理由（merge_reason_ja）を書く");
    report.push({ row: d.row, result: `新しいノート ${note.id}（根拠${built.length}件${op.merges_rows?.length ? `、統合：${op.merges_rows.join("・")}` : ""}）` });
  }
}

/** すべての操作の後に、関係と統合の対応をまとめて確かめる（作業用のコピーだけを変える） */
function finishOperations({ copy, errors, deferredRelations, merges, conditionChecks }) {
  const notes = new Set(copy.knowledge_notes.map((n) => n.id));
  for (const { row, i, rel } of deferredRelations) {
    const at = `${row} 操作${i + 1}`;
    if (!RELATION_TYPES.includes(rel.type)) errors.push(`${at}: 関係の種類 ${rel.type} は使えない（${RELATION_TYPES.join("・")}）`);
    if (!notes.has(rel.from)) errors.push(`${at}: 関係の元 ${rel.from} がない`);
    if (!notes.has(rel.to)) errors.push(`${at}: 関係の先 ${rel.to} がない`);
    if (rel.from === rel.to) errors.push(`${at}: 自分自身への関係`);
    if (copy.relations.some((x) => x.id === rel.id)) errors.push(`${at}: 関係の id ${rel.id} が既にある`);
    if (copy.relations.some((x) => x.from === rel.from && x.to === rel.to && x.type === rel.type)) errors.push(`${at}: 同じ関係（${rel.from} → ${rel.to}、${rel.type}）が既にある`);
    copy.relations.push(rel);
  }
  // 統合は両側の宣言が一致したときだけ認める（merged の行 ⇔ new_note の merges_rows）
  const merged = merges.filter((m) => m.side === "merged");
  const declared = merges.filter((m) => m.side === "merges_rows");
  for (const m of merged) {
    if (!notes.has(m.into)) errors.push(`${m.row} 操作${m.i + 1}: 統合先 ${m.into} がない`);
    else if (!declared.some((x) => x.row === m.row && x.into === m.into)) errors.push(`${m.row} 操作${m.i + 1}: 統合先 ${m.into} の new_note の merges_rows にこの行がない`);
  }
  for (const x of declared) if (!merged.some((m) => m.row === x.row && m.into === x.into)) errors.push(`${x.by} 操作${x.i + 1}: merges_rows の ${x.row} に、${x.into} への merged の判断がない`);
  // 統合元の成立条件を黙って捨てない：統合先の成立条件・例外・補足に含まれるか、扱いを明示する
  for (const c of conditionChecks) {
    const n = copy.knowledge_notes.find((x) => x.id === c.into);
    if (!n) continue;
    const text = [...(n.conditions_ja ?? []), ...(n.exceptions_ja ?? []), n.notes_ja ?? ""].join(" ");
    const missing = c.conditions.filter((s) => !text.includes(s));
    if (missing.length && !c.handling) errors.push(`${c.row} 操作${c.i + 1}: 統合元の成立条件「${missing.join("・")}」が ${c.into} にない（conditions_handling_ja に扱いを書く）`);
  }
}

module.exports = { parseBatch, loadAll, draftRow, draft, check, normUrl };

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
  const write = (v) => (out ? fs.writeFileSync(out, JSON.stringify(v, null, 1) + "\n") : console.log(JSON.stringify(v, null, 1)));
  if (cmd === "rows") {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const urls = new Set(data.resources.map((r) => normUrl(r.url)));
    for (const [b, { sources, rows }] of loadAll()) {
      console.log(`第${b}回：${rows.length}行`);
      for (const s of sources.values()) console.log(`  ${s.letter} ${rows.filter((r) => r.letter === s.letter).length}行 ${s.url && urls.has(normUrl(s.url)) ? "正式資料あり" : "正式資料なし"} ${s.title}`);
    }
  } else if (cmd === "draft") write(draft(args));
  else if (cmd === "check") {
    const r = check(JSON.parse(fs.readFileSync(args[0], "utf8")));
    console.log(JSON.stringify(r, null, 1));
    if (r.errors.length) process.exit(1);
  } else if (cmd === "apply") {
    const { planApply, applyWrite } = require("./knowledge-apply");
    const at = args.indexOf("--confirm-plan");
    const confirmPlan = at >= 0 ? args[at + 1] : null;
    const write = args.includes("--write");
    const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--confirm-plan");
    if (!file) {
      console.error("使い方：apply reviewed.json [--write --confirm-plan <計画のハッシュ>]");
      process.exit(2);
    }
    if (!write && confirmPlan) {
      console.error("--confirm-plan は --write と一緒に使う（プレビューは何も書き込まない）");
      process.exit(2);
    }
    if (write) {
      const r = applyWrite({ reviewedFile: file, dataFile: DATA_FILE, confirmPlan, check });
      console.log(JSON.stringify({ written: r.ok, data_file: path.relative(ROOT, DATA_FILE), refusals: r.refusals, plan_sha256: r.plan?.hashes.plan ?? null }, null, 1));
      process.exit(r.ok ? 0 : 1);
    }
    const p = planApply({ reviewedText: fs.readFileSync(file, "utf8"), dataText: fs.readFileSync(DATA_FILE, "utf8"), check });
    console.log(JSON.stringify({
      mode: "preview（何も書き込んでいない）",
      data_file: path.relative(ROOT, DATA_FILE),
      data_sha256: p.hashes.data,
      reviewed_sha256: p.hashes.reviewed,
      output_sha256: p.hashes.output,
      plan_sha256: p.hashes.plan,
      can_write: p.ok,
      refusals: p.refusals,
      errors: p.errors,
      pending_human_review: p.pending_human_review,
      add: p.summary?.add ?? null,
      annotate: p.summary?.annotate ?? null,
      report: p.report,
      next: p.ok ? `書き込むには：apply ${file} --write --confirm-plan ${p.hashes.plan}` : "書き込めない（refusals を見る）",
    }, null, 1));
    process.exit(p.ok ? 0 : 1);
  } else {
    console.error("使い方：rows | draft 2:H15 … [--out file] | check reviewed.json | apply reviewed.json [--write --confirm-plan <計画のハッシュ>]");
    process.exit(2);
  }
}
