// 知識抽出バッチ（docs/experiments/knowledge-extraction-batch*.md）の記録から、KnowledgeNote・Evidence の「下書き」を作り、
// 人が確認した下書きを既存の検証（tools/validate-sample-data.js の validate）にかける。依存パッケージなし。
//
//   node tools/experiments/knowledge-drafts.js rows                          全行の件数と、原典ごとの正式資料の有無
//   node tools/experiments/knowledge-drafts.js draft 2:H15 3:R … [--out f]  指定した行の下書き（バッチ番号:行ID、または バッチ番号:原典の記号 で原典の全行）
//   node tools/experiments/knowledge-drafts.js check <reviewed.json>         確認済みの下書きを作業用のコピーに入れて検証する
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

/**
 * 人が確認した下書き（decision を埋めたもの）を、作業用のコピーに入れて既存の検証にかける。公開データ（DATA_FILE）は変更しない。
 * decision：{ action: "new_note" | "add_evidence" | "skip", note?, evidence?, merge_into?, relations?: [{ to, type }], status_approved_by?, reviewed_by, reason_ja }
 */
function check(reviewed, data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))) {
  const copy = JSON.parse(JSON.stringify(data));
  const errors = [];
  const report = [];
  for (const d of reviewed) {
    const dec = d.decision;
    if (!dec) {
      report.push({ row: d.row, result: "未確認（decision なし）" });
      continue;
    }
    if (!dec.reviewed_by) errors.push(`${d.row}: reviewed_by がない（誰の判断かを残す）`);
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
  errors.push(...validate(copy));
  return { errors, report, added: { notes: copy.knowledge_notes.length - data.knowledge_notes.length, evidence: copy.evidence.length - data.evidence.length } };
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
  } else {
    console.error("使い方：rows | draft 2:H15 … [--out file] | check reviewed.json");
    process.exit(2);
  }
}
