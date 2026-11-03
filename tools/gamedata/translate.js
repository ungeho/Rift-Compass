#!/usr/bin/env node
// 英語 Wiki の説明文の日本語訳の管理（依存パッケージなし）。訳は取り込み時に作って保存し、閲覧のたびには作らない。
//
//   node tools/gamedata/translate.js worklist <キー,...> [--out <file>]  訳す原文の一覧（未解決の記法が残るものは「保留」）
//   node tools/gamedata/translate.js import <file>                      訳を取り込む（訳した原文の sha1 と英文の plain_sha1 の両方があり、現在と一致するものだけ）
//   node tools/gamedata/translate.js check                              全部の訳を検査（数・用語・記法）
//   node tools/gamedata/translate.js status [--domain abilities|items|runes|tips|all]  訳の件数（訳済み・保留・未訳・古い）
//   node tools/gamedata/translate.js next <件数> [--chars <英文の上限>] [--out <file>] [--domain …]  次に訳す原文（訳が有効なもの・保留を除く）
//   node tools/gamedata/translate.js bind-plain <worklist>              訳の元にした英文（worklist の plain）が現在の英文と同じ訳にだけ plain_sha1 を記録する
//
// 訳の有効：Wiki の原文の sha1（source_sha1）と、訳の対象にした英文の sha1（plain_sha1）の両方が現在と一致するときだけ。
// 原文が同じでも解析の修正で英文が変わったら、訳は「古い」になり表示しない（再確認が要る）。
//
// 訳は Wiki の原文（CC BY-SA 3.0）の改変。各ファイルに出典・寄稿者・ライセンス・翻訳者・確認状態を記録する。
// 訳には原文にない内容（推論・攻略の助言）を入れない。数・単位・条件・対象・時間は原文のまま。
"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1) + "\n"); };
const manifest = () => readJson(path.join(ROOT, "public/gamedata/manifest.json"));
const snapDir = () => path.join(ROOT, "public/gamedata/wiki", manifest().current.wiki_snapshot);
const glossary = () => readJson(path.join(ROOT, "src/gamedata/glossary.json"));
// キー：チャンピオンのキー（スキルの説明）、"items"（アイテムの効果の文）、"runes"（ルーンの説明）、"tips"（ゲームシステムの用語の定義）
const DOMAIN_KEYS = ["items", "runes", "tips"];
const trFile = (key) => (DOMAIN_KEYS.includes(key) ? path.join(snapDir(), "translations", "ja", `${key}.json`) : path.join(snapDir(), "translations", "ja", "abilities", `${key}.json`));
const today = () => new Date().toISOString().slice(0, 10);
const sha1 = (x) => crypto.createHash("sha1").update(x).digest("hex");
const abilityKeys = () => fs.readdirSync(path.join(snapDir(), "abilities")).map((f) => f.replace(/\.json$/, "")).sort((a, b) => Number(a) - Number(b));
/** 訳の対象のキー（domain：abilities・items・runes・all）*/
const keysOf = (domain = "all") => [...(domain === "all" || domain === "abilities" ? abilityKeys() : []), ...DOMAIN_KEYS.filter((k) => domain === "all" || domain === k)];
const domainOf = (key) => (DOMAIN_KEYS.includes(key) ? key : "abilities");

/**
 * 訳の対象。id は「キー|題名|項目」
 * - スキル：Template:Data <チャンピオン>/<技> の description*（blurb は description の要約なので対象外）
 * - アイテム："items|<アイテム名>|<効果のキー>"（Module:ItemData の effects の description。description2 以降は "<効果のキー>.description2"、文字列だけの効果はその文字列）と "items|<アイテム名>|limit"（制限の文）
 * - ルーン："runes|<ルーン名>|<項目>"（Template:Rune data の description*）
 * - 用語："tips|<用語>|<項目>"（Template:Tip data/<用語> の description*・interrupts・reduction・resist・removal）
 */
function fieldsOf(key) {
  if (key === "items") {
    const out = [];
    for (const it of readJson(path.join(snapDir(), "items.json")).items) {
      for (const [field, v] of Object.entries(it.effect_text || {})) {
        if (!v || !v.plain || !v.source_sha1) continue;
        out.push({ id: `items|${it.name}|${field}`, key, title: it.name, field, sha1: v.source_sha1, plainSha1: v.plain_sha1 || sha1(v.plain), plain: v.plain, residual: v.residual, name: v.name || null });
      }
      // 制限の文（Module:ItemData/getter の p.limit）。フィールド名は limit
      const v = it.limit_text;
      if (v && v.plain && v.source_sha1) out.push({ id: `items|${it.name}|limit`, key, title: it.name, field: "limit", sha1: v.source_sha1, plainSha1: v.plain_sha1 || sha1(v.plain), plain: v.plain, residual: v.residual, name: null });
    }
    return out;
  }
  if (key === "tips") {
    // Template:Tip data/<用語> の説明・中断・効果時間の短縮・無効・解除
    const f = path.join(snapDir(), "tips.json");
    const out = [];
    for (const t of fs.existsSync(f) ? readJson(f).tips : []) {
      for (const [field, v] of Object.entries(t.text || {})) {
        if (!v || !v.plain) continue;
        out.push({ id: `tips|${t.name}|${field}`, key, title: t.name, field, sha1: v.source_sha1, plainSha1: v.plain_sha1 || sha1(v.plain), plain: v.plain, residual: v.residual });
      }
    }
    return out;
  }
  if (key === "runes") {
    const out = [];
    for (const r of readJson(path.join(snapDir(), "runes.json")).runes) {
      for (const [field, v] of Object.entries(r.text || {})) {
        if (!/^description/.test(field) || !v || !v.plain) continue;
        out.push({ id: `runes|${r.name}|${field}`, key, title: r.name, field, sha1: v.source_sha1, plainSha1: v.plain_sha1 || sha1(v.plain), plain: v.plain, residual: v.residual });
      }
    }
    return out;
  }
  const f = readJson(path.join(snapDir(), "abilities", `${key}.json`));
  const out = [];
  for (const t of f.templates) {
    if (t.source.status !== 200 || t.redirect_to || !t.text) continue;
    for (const [field, v] of Object.entries(t.text)) {
      if (!/^description/.test(field)) continue; // blurb は description の要約なので訳の対象にしない
      out.push({ id: `${key}|${t.title}|${field}`, key, title: t.title, field, sha1: v.source_sha1, plainSha1: v.plain_sha1 || sha1(v.plain), plain: v.plain, residual: v.residual });
    }
  }
  return out;
}

/** Data Dragon の全チャンピオンのスキル名（英語、長い順）。用語の照合から除くため */
let SKILL_NAMES = null;
function skillNames() {
  if (SKILL_NAMES) return SKILL_NAMES;
  const dir = path.join(ROOT, "public/gamedata/ddragon", manifest().current.ddragon, "champions");
  const set = new Set();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const c = readJson(path.join(dir, f));
    for (const s of [c.passive, ...(c.spells || [])]) if (s && s.name && s.name.en && /\s/.test(s.name.en)) set.add(s.name.en);
  }
  SKILL_NAMES = [...set].sort((a, b) => b.length - a.length);
  return SKILL_NAMES;
}

const numbers = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).map((x) => String(Number(x)));

/** 訳の検査：原文の数がすべて訳にある、訳に原文にない数がない、用語集の対応、記法が残っていない */
function checkOne(plain, ja) {
  const problems = [];
  const src = numbers(plain), dst = numbers(ja);
  for (const n of new Set(src)) if (!dst.includes(n)) problems.push(`数 ${n} が訳にない`);
  for (const n of new Set(dst)) if (!src.includes(n)) problems.push(`訳に原文にない数 ${n}`);
  // 用語集の順（長い・具体的な語が先：true sight は sight より先）で照合し、照合した部分は後の短い語の照合から除く
  // スキル名（例：Shield of Durand＝デュランドの守り）の中の語は用語の照合から除く（公式の日本語名に用語が含まれないため）
  let rest = plain;
  for (const name of skillNames()) if (rest.includes(name)) rest = rest.split(name).join(" ");
  for (const term of glossary().terms) {
    const re = new RegExp(term.en, "gi");
    const m = rest.match(re);
    if (!m) continue;
    if (!ja.includes(term.ja)) problems.push(`用語「${term.ja}」がない（原文：${m[0]}）`);
    rest = rest.replace(re, " ");
  }
  if (/\{\{|\}\}|⟦|\b[a-z_]+\d*\s*=/.test(ja)) problems.push("記法が残っている");
  // 否定（できる／できない）：原文に否定があれば、訳にも否定の表現が要る（逆向きの訳の検出。意味の正しさは保証しない）
  if (NEG_EN.test(plain) && !NEG_JA.test(ja)) problems.push("原文の否定（not・cannot・no など）が訳にない");
  return problems;
}

/** 否定の表現（検査用の近似）*/
const NEG_EN = /\b(cannot|not|no|unable|never|without|neither|nor|none|unaffected)\b|n't\b/i;
const NEG_JA = /ない|なかっ|なけれ|なく|ず|不可|なし|無|せず|できな|ません|除く|以外|受けない|影響しない|妨げ/;

function worklist(keys, out) {
  const items = keys.flatMap((k) => fieldsOf(k));
  const todo = items.filter((x) => !x.residual).map(({ id, sha1, plainSha1, plain }) => ({ id, sha1, plain_sha1: plainSha1, plain }));
  const withheld = items.filter((x) => x.residual).map(({ id, sha1, plainSha1, plain }) => ({ id, sha1, plain_sha1: plainSha1, plain }));
  const res = { generated_at: today(), todo, withheld };
  if (out) writeJson(out, res);
  console.log(`訳す原文 ${todo.length}件、保留 ${withheld.length}件（未解決の記法）`);
  return res;
}

/**
 * 取り込めない理由（取り込めるなら null）。訳した原文の source_sha1 と、訳した英文の plain_sha1 の両方を必須にし、
 * どちらかがない・現在と違うときは取り込まない（英文が変わった後に古い訳へ新しい sha1 が付くのを防ぐ）
 */
function importRejection(cur, tr) {
  if (!cur) return "見つからない";
  if (!tr.sha1) return "訳した原文の sha1（source_sha1）がない";
  if (!tr.plain_sha1) return "訳した英文の sha1（plain_sha1）がない";
  if (cur.sha1 !== tr.sha1) return "原文が変わった";
  if (cur.plainSha1 !== tr.plain_sha1) return "英文（解析の結果）が変わった";
  if (cur.residual) return "保留の原文は訳さない";
  return null;
}

function importFile(file) {
  const input = readJson(file);
  const meta = input.meta || {};
  const byKey = new Map();
  let ok = 0, rejected = 0;
  for (const tr of input.translations) {
    const [key, title, field] = tr.id.split("|");
    const cur = fieldsOf(key).find((x) => x.title === title && x.field === field);
    const why = importRejection(cur, tr);
    if (why) { console.log(`${why}：${tr.id}`); rejected++; continue; }
    // 訳さずに保留する（例：英文の抽出に欠けがあり、推測でしか訳せない）。理由を記録し、next の対象から外す
    if (tr.withhold) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ title, field, sha1: tr.sha1, plainSha1: cur.plainSha1, withhold: tr.withhold });
      ok++;
      continue;
    }
    const problems = checkOne(cur.plain, tr.ja);
    if (problems.length && !tr.allow) { console.log(`検査で不合格：${tr.id}：${problems.join("・")}`); rejected++; continue; }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ title, field, sha1: tr.sha1, plainSha1: cur.plainSha1, ja: tr.ja, problems, allowReason: tr.allow_reason || null });
    ok++;
  }
  for (const [key, list] of byKey) {
    const f = fs.existsSync(trFile(key)) ? readJson(trFile(key)) : null;
    const entries = f ? f.entries : {};
    // 保留：未解決の記法（residual_markup）は毎回作り直し、それ以外の理由の保留は原文と英文が同じ間は残す
    const curById = new Map(fieldsOf(key).map((x) => [`${x.title}#${x.field}`, x]));
    const withheld = {};
    for (const [id, w] of Object.entries((f && f.withheld) || {})) {
      const c = curById.get(id);
      if (w.reason !== "residual_markup" && c && c.sha1 === w.source_sha1 && c.plainSha1 === w.plain_sha1) withheld[id] = w;
    }
    for (const x of curById.values()) if (x.residual) withheld[`${x.title}#${x.field}`] = { source_sha1: x.sha1, reason: "residual_markup" };
    for (const x of list) {
      if (x.withhold) {
        withheld[`${x.title}#${x.field}`] = { source_sha1: x.sha1, plain_sha1: x.plainSha1, reason: x.withhold, withheld_at: today() };
        delete entries[`${x.title}#${x.field}`];
        continue;
      }
      entries[`${x.title}#${x.field}`] = {
        source_sha1: x.sha1,
        plain_sha1: x.plainSha1,
        ja: x.ja,
        status: "ai_translated_unreviewed",
        translated_at: today(),
        ...(x.problems.length ? { check_notes: x.problems, ...(x.allowReason ? { allow_reason: x.allowReason } : {}) } : {}),
      };
    }
    writeJson(trFile(key), {
      license: { name: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/", attribution: "League of Legends Wiki（wiki.leagueoflegends.com）の寄稿者", modification: "英語の原文（記法を簡略化したもの）を日本語に翻訳した" },
      translator: meta.translator || "AI（Claude Opus 5.5）",
      method: meta.method || "会話の中での翻訳。用語集（src/gamedata/glossary.json）と検査（数・用語・記法）を通したもの",
      review: "未レビュー（人による確認なし）",
      glossary_version: glossary().version,
      snapshot: manifest().current.wiki_snapshot,
      entries,
      withheld,
    });
  }
  console.log(`取り込み ${ok}件、取り込まなかったもの ${rejected}件`);
}

/** 訳が現在の原文と英文の両方に対応しているか（plain_sha1 のない古い形式の訳は、bind-plain で確かめるまで無効）*/
const valid = (e, cur) => e.source_sha1 === cur.sha1 && e.plain_sha1 === cur.plainSha1;

/** plain_sha1 のない訳に、訳の元の英文（worklist）が現在の英文と同じときだけ plain_sha1 を記録する */
function bindPlain(file) {
  const wl = readJson(file);
  const src = new Map([...(wl.todo || []), ...(wl.withheld || [])].map((x) => [x.id, x]));
  let bound = 0, changed = 0, skipped = 0;
  const dir = path.join(snapDir(), "translations", "ja", "abilities");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const key = f.replace(/\.json$/, "");
    const tr = readJson(path.join(dir, f));
    const cur = new Map(fieldsOf(key).map((x) => [`${x.title}#${x.field}`, x]));
    let dirty = false;
    for (const [id, e] of Object.entries(tr.entries)) {
      if (e.plain_sha1) continue;
      const c = cur.get(id);
      const w = c && src.get(c.id);
      if (!c || !w || w.sha1 !== e.source_sha1) { skipped++; continue; }
      if (w.plain !== c.plain) { changed++; console.log(`英文が変わった（訳は無効のまま）：${key} ${id}`); continue; }
      e.plain_sha1 = c.plainSha1;
      bound++;
      dirty = true;
    }
    if (dirty) writeJson(path.join(dir, f), tr);
  }
  console.log(`plain_sha1 を記録 ${bound}件、英文が変わった ${changed}件、worklist にない ${skipped}件`);
}

/**
 * 次に訳す原文（全チャンピオン、キーの数の順）。訳が有効なものと保留（未解決の記法）は除く。
 * 取り込んだ分は次の next で除かれるので、中断しても未処理の分から再開できる。
 */
function next(limit, out, maxChars, domain = "all") {
  const keys = keysOf(domain);
  const todo = [];
  let chars = 0;
  outer: for (const k of keys) {
    const tr = fs.existsSync(trFile(k)) ? readJson(trFile(k)) : { entries: {} };
    for (const x of fieldsOf(k)) {
      if (x.residual) continue;
      const e = tr.entries[`${x.title}#${x.field}`];
      if (e && valid(e, x)) continue;
      const w = (tr.withheld || {})[`${x.title}#${x.field}`];
      if (w && w.reason !== "residual_markup" && w.source_sha1 === x.sha1 && w.plain_sha1 === x.plainSha1) continue;
      if (todo.length >= limit || (maxChars && todo.length && chars + x.plain.length > maxChars)) break outer;
      todo.push({ id: x.id, sha1: x.sha1, plain_sha1: x.plainSha1, plain: x.plain });
      chars += x.plain.length;
    }
  }
  const res = { generated_at: today(), todo, withheld: [] };
  if (out) writeJson(out, res);
  console.log(`次に訳す原文 ${todo.length}件（英文 ${chars}文字）`);
  return res;
}

function check() {
  let n = 0, bad = 0, stale = 0;
  for (const key of keysOf("all")) {
    if (!fs.existsSync(trFile(key))) continue;
    const tr = readJson(trFile(key));
    const cur = new Map(fieldsOf(key).map((x) => [`${x.title}#${x.field}`, x]));
    for (const [id, e] of Object.entries(tr.entries)) {
      n++;
      const c = cur.get(id);
      if (!c || !valid(e, c)) { stale++; continue; }
      const p = checkOne(c.plain, e.ja);
      if (p.length && !e.check_notes) { bad++; console.log(`${key} ${id}：${p.join("・")}`); }
    }
  }
  console.log(`訳 ${n}件、検査の不合格 ${bad}件、原文が変わった訳 ${stale}件`);
  return { n, bad, stale };
}

function status(domain = "abilities") {
  // 既定はスキルの説明（description_fields はこれまでの数え方と同じ）。--domain items・runes・all で切り替える
  const keys = keysOf(domain);
  let total = 0, residual = 0, translated = 0, stale = 0, reviewed = 0, manual = 0;
  for (const k of keys) {
    const fields = fieldsOf(k);
    total += fields.length;
    residual += fields.filter((x) => x.residual).length;
    if (fs.existsSync(trFile(k))) {
      const tr = readJson(trFile(k));
      for (const x of fields) {
        const e = tr.entries[`${x.title}#${x.field}`];
        if (e && valid(e, x)) {
          translated++;
          // 人による確認は status で別に管理する（検査の合格だけでは human_reviewed にしない）
          if (e.status === "human_reviewed") reviewed++;
        } else if (e) stale++;
        else {
          const w = (tr.withheld || {})[`${x.title}#${x.field}`];
          if (!x.residual && w && w.reason !== "residual_markup" && w.source_sha1 === x.sha1 && w.plain_sha1 === x.plainSha1) manual++;
        }
      }
    }
  }
  const res = { description_fields: total, translated, translated_ai_unreviewed: translated - reviewed, human_reviewed: reviewed, withheld_residual: residual, withheld_other: manual, not_yet: total - translated - residual - manual, stale, translated_rate: Number((translated / total).toFixed(4)) };
  console.log(JSON.stringify(res));
  return res;
}

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (cmd === "worklist") worklist(args[0].split(","), opt("--out"));
  else if (cmd === "import") importFile(args[0]);
  else if (cmd === "check") process.exitCode = check().bad ? 1 : 0;
  else if (cmd === "status") status(opt("--domain") || "abilities");
  else if (cmd === "bind-plain") bindPlain(args[0]);
  else if (cmd === "next") next(Number(args[0] || 60), opt("--out"), Number(opt("--chars") || 0), opt("--domain") || "all");
  else { console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 9).join("\n")); process.exitCode = 1; }
}
module.exports = { checkOne, fieldsOf, numbers, valid, importRejection, keysOf, domainOf };
