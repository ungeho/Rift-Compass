// 英語 LoL Wiki（wiki.leagueoflegends.com/en-us）の網羅的な取り込み（依存パッケージなし）。
//
// 取得の条件（2026-11-02 に確認）
// - ライセンス：本文は CC BY-SA 3.0（siteinfo の rightsinfo）。画像は本文と同じライセンスとは限らない（Weird Gloop の Licensing）ので取得しない。
// - 再利用には、ページの URL による出典の表示と、改変部分の同じライセンスでの提供が要る。各ファイルの source に URL とライセンスを残す。
// - robots.txt は /*api.php を不許可にしている。api.php は使わず、ページの raw（/en-us/<ページ>?action=raw）を、
//   説明的な User-Agent・1.1秒の間隔・キャッシュつきで取得する。raw は revid を返さないので、Last-Modified（版の時刻）を記録する。
// - 記事の本文（説明文）は保存しない。記事はメタデータ・見出し・Infobox の引数だけを保存する（データのテンプレート・モジュールは値をそのまま保存する）。
//
// 原情報（raw）と、この道具が解釈した値（parsed）を分けて保存する。解釈できないものは unparsed に理由とともに残す。
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const L = require("./lib");

const SITE = "https://wiki.leagueoflegends.com/en-us/";
const UA = "RiftCompass/0.1 (static knowledge browser; https://github.com/ungeho/Rift-Compass)";
const LICENSE = { name: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/", attribution: "League of Legends Wiki（wiki.leagueoflegends.com）の各ページの寄稿者", note: "本文のライセンス。画像は対象外（取得しない）" };
const DELAY_MS = 1100;

const pageUrl = (title) => SITE + encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":");

// ---------------------------------------------------------------------------
// 取得（キャッシュつき・間隔をあける）
let last = 0;
async function fetchRaw(title, cacheDir) {
  const key = crypto.createHash("sha1").update(title).digest("hex");
  const file = cacheDir && path.join(cacheDir, key + ".json");
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const wait = last + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = pageUrl(title) + "?action=raw";
  let out;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.status === 429 || r.status >= 500) {
      // 429・5xx は回避せず、待って1回だけやり直し、だめなら取得失敗として記録する
      if (attempt === 0) { await new Promise((res) => setTimeout(res, 30000)); continue; }
      out = { title, url: pageUrl(title), status: r.status, last_modified: null, text: null, fetched_at: new Date().toISOString() };
      break;
    }
    out = { title, url: pageUrl(title), status: r.status, last_modified: r.headers.get("last-modified"), text: r.ok ? await r.text() : null, fetched_at: new Date().toISOString() };
    break;
  }
  if (file && (out.status === 200 || out.status === 404)) { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(out)); }
  return out;
}

// ---------------------------------------------------------------------------
// Lua：`local 名前 = 値` と `return 値`（値の中の名前は local を参照する）。L.parseLuaTable の拡張
function parseLuaChunk(src) {
  const env = {};
  // 1行のコメントだけを先に除く（長いコメント --[=[ ]=] はパーサが読み飛ばす）
  const body = src.replace(/^\s*--(?!\[=*\[)[^\n]*\n/gm, "\n");
  // local の定義を先に読み、return の値の中の名前を置き換えてから parseLuaTable に渡す
  const re = /^local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/gm;
  let m;
  const defs = [];
  while ((m = re.exec(body))) defs.push({ name: m[1], start: re.lastIndex, at: m.index });
  const retAt = body.search(/^return\b/m);
  if (retAt < 0) throw new Error("return がない");
  for (let k = 0; k < defs.length; k++) {
    const end = k + 1 < defs.length ? defs[k + 1].at : retAt;
    const expr = body.slice(defs[k].start, end).trim();
    env[defs[k].name] = L.parseLuaTable(substitute(expr, env));
  }
  return { env, value: L.parseLuaTable(substitute(body.slice(retAt), env)) };
}

/** 値の位置にある local の名前を JSON 相当の Lua の値に置き換える（文字列の中は置き換えない）*/
function substitute(expr, env) {
  const names = Object.keys(env);
  if (!names.length) return expr;
  let out = "", i = 0, q = null;
  while (i < expr.length) {
    const c = expr[i];
    if (q) { out += c; if (c === "\\") { out += expr[i + 1] ?? ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expr.slice(i, i + 80));
    if (w && (i === 0 || !/[A-Za-z0-9_]/.test(expr[i - 1]))) {
      if (Object.prototype.hasOwnProperty.call(env, w[0])) { out += toLua(env[w[0]]); i += w[0].length; continue; }
      out += w[0]; i += w[0].length; continue;
    }
    out += c; i++;
  }
  return out;
}
const toLua = (v) => (v === null ? "nil" : Array.isArray(v) ? "{" + v.map(toLua).join(",") + "}" : typeof v === "object" ? "{" + Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}]=${toLua(x)}`).join(",") + "}" : JSON.stringify(v));

// ---------------------------------------------------------------------------
// テンプレートの引数（最も外側のテンプレートの |名前 = 値）。入れ子の {{ }}・[[ ]] は値の中に残す
function templateParams(text, templatePattern) {
  let start = 0;
  if (templatePattern) {
    const m = templatePattern.exec(text);
    if (!m) return null;
    start = m.index;
  } else start = text.indexOf("{{");
  if (start < 0) return null;
  let depth = 0, i = start, seg = "", segs = [];
  for (; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; seg += two; i++; continue; }
    if (two === "}}" || two === "]]") {
      depth--;
      if (depth === 0) { segs.push(seg); break; }
      seg += two; i++; continue;
    }
    if (text[i] === "|" && depth === 1) { segs.push(seg); seg = ""; continue; }
    seg += text[i];
  }
  const params = {};
  for (const s of segs.slice(1)) {
    const eq = s.indexOf("=");
    if (eq < 0) continue;
    const k = s.slice(0, eq).trim();
    if (!k || /[{}[\]]/.test(k)) continue;
    params[k] = s.slice(eq + 1).trim();
  }
  return params;
}

/**
 * データのテンプレート（Template:Data <チャンピオン>/<技>、Template:Rune data <ルーン>）の引数。
 * 冒頭に {{#vardefine:名前|値}} で数値を定義し、本文で {{#var:名前}}・{{#expr:式}} を使うものがあるので、
 * 数だけの定義・参照・四則演算は先に置き換える（置き換えた変数は vars に残す）。
 * 引数は {{{{{1<noinclude>|Ability data</noinclude>}}}|…（呼び出しの本体）から読む。
 */
function dataTemplateParams(text) {
  const vars = {};
  for (const m of text.matchAll(/\{\{#vardefine:([^|{}]+)\|([^{}]*)\}\}/g)) vars[m[1].trim()] = m[2].trim();
  let t = text;
  for (let k = 0; k < 20; k++) {
    const before = t;
    t = t.replace(/\{\{#var:([^|{}]+)\}\}/g, (all, name) => (name.trim() in vars ? vars[name.trim()] : all));
    t = t.replace(/\{\{#expr:([^{}]*)\}\}/g, (all, e) => {
      const v = arith(e.replace(/\s+/g, " "));
      return v === null ? all : String(v);
    });
    if (t === before) break;
  }
  const call = /\{\{\{\{\{1<noinclude>\|[^<]*<\/noinclude>\}\}\}/.exec(t);
  if (!call) return { params: templateParams(t) || {}, vars };
  // 呼び出しの本体の中（深さ1）から、| で区切って最後の }} まで読む
  let depth = 1, seg = "", segs = [];
  for (let i = call.index + call[0].length; i < t.length; i++) {
    const two = t.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; seg += two; i++; continue; }
    if (two === "}}" || two === "]]") {
      depth--;
      if (depth === 0) { segs.push(seg); break; }
      seg += two; i++; continue;
    }
    if (t[i] === "|" && depth === 1) { segs.push(seg); seg = ""; continue; }
    seg += t[i];
  }
  const params = {};
  for (const s of segs) {
    const eq = s.indexOf("=");
    if (eq < 0) continue;
    const k = s.slice(0, eq).trim();
    if (!k || /[{}[\]]/.test(k)) continue;
    params[k] = s.slice(eq + 1).trim();
  }
  return { params, vars };
}

// ---------------------------------------------------------------------------
// 値の解釈：数・ランク別の値（a / b / c、{{ap|a|b|c}}、{{ap|a to b}}）。それ以外は理由つきで未解析
const NUM = /^-?\d+(?:\.\d+)?$/;
function parseValue(raw, ranks = 5) {
  if (raw == null) return { ok: false, reason: "empty" };
  let v = raw.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (v === "") return { ok: false, reason: "empty" };
  const fd = /^\{\{fd\|([-\d.]+)\}\}$/.exec(v);
  if (fd) v = fd[1];
  if (NUM.test(v)) return { ok: true, kind: "number", values: [Number(v)] };
  const slash = v.split(/\s*\/\s*/);
  if (slash.length > 1 && slash.every((x) => NUM.test(x))) return { ok: true, kind: "by_rank", values: slash.map(Number) };
  const ap = /^\{\{ap\|([^{}]*)\}\}$/.exec(v);
  if (ap) return apValues(ap[1], ranks);
  // 値全体が1つのテンプレートのとき（入れ子を含む）：pp・pplevel・dv・tt を読む
  const whole = outerTemplate(v);
  if (whole) {
    const name = whole.name.toLowerCase();
    if (name === "pp" || name === "pplevel") return parsePp(whole.args, name === "pplevel");
    if (name === "dv") {
      // 2つ以上の値（形態・条件ごと）。各値の説明（tt の2つ目の引数）をラベルとして残す
      const variants = [];
      for (const a of whole.args.filter((x) => !/^\s*[a-z0-9_]+\s*=/i.test(x))) {
        const inner = a.replace(/\{\{tip\|[^{}]*\}\}/g, "").trim();
        const tt = outerTemplate(inner);
        const value = tt && tt.name.toLowerCase() === "tt" ? tt.args[0] : inner;
        const label = tt && tt.name.toLowerCase() === "tt" ? plainText(tt.args[1] || "") : null;
        const p = parseValue(value, ranks);
        if (!p.ok) return { ok: false, reason: "dv_part_unparsed" };
        variants.push({ label, ...p });
      }
      if (variants.length) return { ok: true, kind: "variants", values: [], variants };
    }
    if (name === "tt" && whole.args.length >= 1) {
      const p = parseValue(whole.args[0], ranks);
      if (p.ok) return { ...p, note: plainText(whole.args[1] || "") || undefined };
    }
  }
  // 最小〜最大（例：400 - 1050）
  const mm = /^(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)$/.exec(v);
  if (mm) return { ok: true, kind: "min_max", values: [Number(mm[1]), Number(mm[2])] };
  // 値そのものが決まった語（none・global など）
  const kw = /^(none|global|self|instant|unlimited|varies|varied)$/i.exec(v);
  if (kw) return { ok: true, kind: "keyword", values: [], keyword: kw[1].toLowerCase() };
  const tpl = /\{\{\s*([^|{}]+)/.exec(v);
  // 表示用の記法だけのもの（{{tip|cr|icononly=true}} 310、{{tt|450|説明}}）は、記法を除いた値で読む（simplified を付ける）
  if (tpl && !simplifying) {
    const name = tpl[1].trim().toLowerCase();
    if (name === "tip" || name === "tt") {
      const s2 = v.replace(/\{\{tt\|([^|{}]*)\|[^{}]*\}\}/g, "$1").replace(/\{\{tip\|[^{}]*\}\}/g, "").trim();
      if (s2 && s2 !== v) {
        simplifying = true;
        const p = parseValue(s2, ranks);
        simplifying = false;
        if (p.ok) return { ...p, simplified: true };
      }
    }
  }
  if (tpl) return { ok: false, reason: `template:${tpl[1].trim().toLowerCase()}` };
  return { ok: false, reason: "text" };
}
let simplifying = false;

/**
 * {{ap|…}}（Template:Ability progression）の値。Wiki の説明（Template:Ability progression/doc、2026-04-11 版）に従う：
 * - 「a to b」は線形に補間し、表示の数は既定で5（究極スキルのページでは3）。末尾の数（「60 to 200 4」）で数を変える。
 * - x を含む式は x＝1…数 で計算する。式の中の複数の範囲（(85 to 225)*(1+(0.3 to 0.5))）は同じ段階で同時に補間する。
 * - | で区切った値は順につなぐ（範囲のある部分は末尾の数が必要。ない場合は解析しない）。
 * - round・key などの名前つきの引数は表示用なので除く。
 * defaultCount：既定の表示の数（Q・W・E は5、R は3）。0 なら補間しない（パッシブなど、段階の意味がスキルのランクと限らない）。
 */
function apValues(content, defaultCount) {
  const parts = content.split("|").map((x) => x.trim()).filter((x) => x && !/^[a-z]+\s*=/.test(x));
  if (!parts.length) return { ok: false, reason: "empty" };
  const values = [];
  let ranged = false;
  for (const p of parts) {
    const hasRange = /\bto\b/.test(p) || /\bx\b/.test(p);
    if (!hasRange) {
      const v = arith(p);
      if (v === null) return { ok: false, reason: "ap_complex" };
      values.push(v);
      continue;
    }
    ranged = true;
    const explicit = /^(.*\S)\s+(\d+)$/.exec(p);
    const body = explicit && !/\bto\s*$/.test(explicit[1]) ? explicit[1] : p;
    const count = explicit && body !== p ? Number(explicit[2]) : parts.length === 1 ? defaultCount : 0;
    if (!count || count < 2) return { ok: false, reason: parts.length === 1 ? "ap_range_without_ranks" : "ap_part_without_count" };
    const vals = expandRange(body, count);
    if (!vals) return { ok: false, reason: "ap_complex" };
    values.push(...vals);
  }
  if (!ranged) return values.length === 1 ? { ok: true, kind: "number", values } : { ok: true, kind: "by_rank", values };
  return { ok: true, kind: "by_rank", values };
}

/** 文字列全体が1つのテンプレートなら、名前と（深さを考えた）引数を返す */
function outerTemplate(v) {
  const s = v.trim();
  if (!s.startsWith("{{") || !s.endsWith("}}")) return null;
  let depth = 0, seg = "";
  const segs = [];
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "{{" || two === "[[") { depth++; if (depth > 1) seg += two; i++; continue; }
    if (two === "}}" || two === "]]") {
      depth--;
      if (depth === 0) { if (i + 2 !== s.length) return null; segs.push(seg); break; }
      seg += two; i++; continue;
    }
    if (s[i] === "|" && depth === 1) { segs.push(seg); seg = ""; continue; }
    seg += s[i];
  }
  if (!segs.length) return null;
  return { name: segs[0].trim(), args: segs.slice(1).map((x) => x.trim()) };
}

/**
 * {{pp|…}}・{{pplevel|…}}（Template:Passive progression、/doc 2026-06-28 版）：
 * 1つ目の引数＝値（; 区切り、または「a to b」「a to b for N」）、2つ目＝基準（; 区切り、「a to b」「a to b by s」、空ならレベル1〜）。
 * type＝基準の名前（既定はレベル）、key・key1＝単位、formula＝式の説明。「then」などの複雑な書き方は解析しない
 */
function parsePp(args, levelDefault) {
  const named = {};
  const pos = [];
  for (const a of args) {
    const m = /^\s*([a-z0-9_]+)\s*=\s*([\s\S]*)$/i.exec(a);
    if (m) named[m[1].toLowerCase()] = m[2].trim();
    else pos.push(a.trim());
  }
  const valuesRaw = pos[0] ?? "";
  const basisRaw = pos[1] ?? "";
  if (!valuesRaw || /then|\{\{/.test(valuesRaw) || /\{\{/.test(basisRaw)) return { ok: false, reason: "pp_complex" };
  // 基準（何に応じて変わるか）
  let basis = null;
  if (basisRaw) {
    const r = /^(-?[\d.]+)\s+to\s+(-?[\d.]+)(?:\s+(for|by)\s+([\d.]+))?$/.exec(basisRaw);
    if (r) {
      const a = Number(r[1]), b = Number(r[2]);
      if (r[3] === "by") { basis = []; for (let x = a; x <= b + 1e-9; x += Number(r[4])) basis.push(round(x)); }
      else basis = { from: a, to: b, count: r[3] === "for" ? Number(r[4]) : null };
    } else basis = basisRaw.split(";").map((x) => x.trim());
  }
  // 値
  let values = null;
  const vr = /^([-\d.*/+() ]+?)\s+to\s+([-\d.*/+() ]+?)(?:\s+for\s+(\d+))?$/.exec(valuesRaw);
  if (vr) {
    const a = arith(vr[1]), b = arith(vr[2]);
    if (a === null || b === null) return { ok: false, reason: "pp_complex" };
    const count = vr[3] ? Number(vr[3]) : Array.isArray(basis) ? basis.length : basis && basis.count ? basis.count : 18;
    values = Array.from({ length: count }, (_, k) => round(a + ((b - a) * k) / Math.max(1, count - 1)));
  } else if (valuesRaw.includes(";")) {
    values = valuesRaw.split(";").map((x) => arith(x));
    if (values.some((x) => x === null)) return { ok: false, reason: "pp_complex" };
  } else {
    const one = arith(valuesRaw);
    if (one === null) return { ok: false, reason: "pp_complex" };
    values = [one];
  }
  if (basis && !Array.isArray(basis)) {
    const n = values.length;
    basis = Array.from({ length: n }, (_, k) => round(basis.from + ((basis.to - basis.from) * k) / Math.max(1, n - 1)));
  }
  if (!basis) basis = values.map((_, k) => k + 1);
  if (basis.length !== values.length) return { ok: false, reason: "pp_basis_mismatch" };
  return {
    ok: true,
    kind: "progression",
    values,
    basis,
    basis_label: named.type ? plainText(named.type) : named.label1 ? plainText(named.label1) : "level",
    ...(named.key ? { unit: named.key } : {}),
    ...(named.key1 ? { basis_unit: named.key1 } : {}),
    ...(named.formula ? { formula: plainText(named.formula) } : {}),
    level_default: levelDefault && !basisRaw ? true : undefined,
  };
}

/**
 * Wiki の記法を読める英語の文にする（取り込み時に保存し、翻訳の原文にする）。
 * 解けない記法が残ったら residual を true にする（その部分は翻訳しない）
 */
// 解けない記法の印：名前だけを残し、| や入れ子の印を含めない（外側のテンプレートが | で区切って印を壊さないように）
const mark = (name) => `⟦${String(name).replace(/[|⟦⟧]/g, "").trim().slice(0, 40)}⟧`;
function plainText(raw) {
  if (!raw) return "";
  // 画像のリンク（[[File:…|20px|link=…]]）は文字ではないので、テンプレートを解く前に取り除く
  let t = String(raw).replace(/<!--[\s\S]*?-->/g, "").replace(/\[\[(File|Image):[^\[\]]*\]\]/gi, "");
  for (let k = 0; k < 40; k++) {
    const before = t;
    t = t.replace(/\{\{([^{}]*)\}\}/g, (all, inner) => {
      const parts = inner.split("|").map((x) => x.trim());
      const name = (parts[0] || "").toLowerCase();
      const pos = parts.slice(1).filter((x) => !/^[a-z0-9_]+\s*=/i.test(x));
      if (name === "pp" || name === "pplevel") {
        const p = parsePp(parts.slice(1), name === "pplevel");
        if (!p.ok) return mark(name);
        const u = p.unit || "";
        const range = p.values.length > 1 ? `${fmtNum(p.values[0])}${u} – ${fmtNum(p.values[p.values.length - 1])}${u}` : `${fmtNum(p.values[0])}${u}`;
        return `${range} (based on ${p.basis_label})`;
      }
      if (name === "ap") {
        const v = apValues(parts.slice(1).join("|"), 5);
        return v.ok ? v.values.map(fmtNum).join(" / ") : pos.join(" / ").replace(/\s+to\s+/g, " – ");
      }
      // 記号のテンプレート
      const SYMBOLS = { times: "×", x: "×", plus: "+", minus: "−", "divided by": "÷", equals: "=", "-": "–" };
      if (name in SYMBOLS && !pos.length) return SYMBOLS[name];
      // sti は {{sti|ステータスの種類|表示する文}}：表示するのは2つ目
      if (name === "sti") return pos[1] ?? pos[0] ?? "";
      // 1つ目の引数を表示するテンプレート（色・書式・名前のリンク・トグルの既定の表示）
      // {{g|N}} はゴールドのアイコンつきの数（例：{{g|1}} は 1 gold）。数だけにすると何の量か分からなくなる
      if (name === "g") return pos[0] ? `${pos[0]} gold` : "gold";
      // 名前のリンクの表示の文：{{ai|スキル|チャンピオン|表示}} は3つ目、{{ii|アイテム|表示}}・{{si}}・{{ri}}・{{ci}} などは2つ目（あれば）を表示する
      if (/^(ai|cai|ais)$/.test(name)) return pos[2] || pos[0] || "";
      if (/^(ii|si|ri|ci|cis|bi|ui|csl|pi|sis|ri2|ci2)$/.test(name)) return pos[1] || pos[0] || "";
      if (/^(sbc|as|ccs|cs|fd|tt|ft|nie|ci|cai|ai|si|sis|ii|ri|bi|ui|csl|cis|pi|tt2|sm2|mi|ci2|rp|ms|hp|mana|ad|ap2|ri2|sbi)$/.test(name)) return pos[0] ?? "";
      // アイコンつきの名前（{{ais|名前|チャンピオン}}・{{uis|名前}}）・小文字のリンク（{{lc|語}}）は名前・語を表示。anchor は表示しない
      if (/^(ais|uis|lc)$/.test(name)) return pos[0] ?? "";
      if (name === "anchor") return "";
      // アイコンだけのツールチップ（{{tip|er|icononly = true}} など）は文字を出さない
      if (name === "tip" && parts.some((x) => /^icononly\s*=\s*true$/i.test(x))) return "";
      if (name === "tip") return pos[pos.length - 1] ?? pos[0] ?? "";
      if (name === "st") return `${pos[0] ?? ""}: ${pos[1] ?? ""}`;
      // 近接・遠隔で違う値（{{rd|近接|遠隔}}）と、2つ以上の値（{{dv}}）は全部を示す
      if (name === "rd") return pos.length >= 2 ? `${pos[0]} (melee) / ${pos[1]} (ranged)` : pos[0] ?? "";
      if (name === "dv") return pos.join(" / ");
      // それ以外（表示の仕方を確かめていないテンプレート・パーサー関数）は推測で読まず、解けない記法として残す
      return mark(name);
    });
    if (t === before) break;
  }
  t = t
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return t;
}
const fmtNum = (x) => String(Number(Number(x).toFixed(4)));
/** 解けない記法が残っているか */
const hasResidual = (s) => /⟦|\{\{|\}\}|\b[a-z_]+\d*\s*=\s*\S/i.test(s);

/** 範囲（a to b、(a to b) の入れ子なし、x）を count 段階に展開する。解析できなければ null */
function expandRange(body, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const t = count === 1 ? 0 : k / (count - 1);
    // 括弧の中の範囲を先に置き換える
    let e = body.replace(/\(\s*([-\d.*/+ ]+?)\s+to\s+([-\d.*/+ ]+?)\s*\)/g, (all, a, b) => {
      const va = arith(a), vb = arith(b);
      return va === null || vb === null ? all : `(${va + (vb - va) * t})`;
    });
    // 外側の「A to B」（A・B は式）
    const top = /^(.+?)\s+to\s+(.+)$/.exec(e);
    if (top) {
      if (/\bto\b/.test(top[2])) return null; // 1 to 10 to 40 のような多段は扱わない
      const va = arith(top[1].replace(/\bx\b/g, String(k + 1))), vb = arith(top[2].replace(/\bx\b/g, String(k + 1)));
      if (va === null || vb === null) return null;
      out.push(round(va + (vb - va) * t));
      continue;
    }
    const v = arith(e.replace(/\bx\b/g, String(k + 1)));
    if (v === null) return null;
    out.push(v);
  }
  return out;
}
const round = (x) => Math.round(x * 1e6) / 1e6;
/** 数・括弧・四則演算だけの式を計算する（それ以外は null）*/
function arith(s) {
  const t = s.trim();
  if (!/^[-\d.*/+() ]+$/.test(t)) return null;
  try {
    const v = Function(`"use strict"; return (${t});`)();
    return Number.isFinite(v) ? round(v) : null;
  } catch {
    return null;
  }
}

/** 係数・割合の対象の文（記法・太字を除く）。例："of target's '''maximum''' health}}" → "of target's maximum health" */
function plainOf(s) {
  return s.replace(/'''?/g, "").replace(/\{\{[^{}|]*\|/g, "").replace(/[{}|]/g, " ").replace(/\s+/g, " ").trim();
}

/** leveling の {{st|ラベル|値}}：ラベル・値（ランク別）・係数（(+ 60% AD) など）を取り出す */
function parseLeveling(raw, ranks) {
  if (!raw) return [];
  const out = [];
  // {{st|ラベル1|値1|ラベル2|値2|…}}：1つの st に複数の組がある。最も外側の | で区切って組にする
  const re = /\{\{st\|/g;
  let m;
  const pairs = [];
  while ((m = re.exec(raw))) {
    let depth = 1, i = re.lastIndex, j = i, seg = "";
    const segs = [];
    for (; j < raw.length; j++) {
      const two = raw.slice(j, j + 2);
      if (two === "{{" || two === "[[") { depth++; seg += two; j++; continue; }
      if (two === "}}" || two === "]]") {
        depth--;
        if (depth === 0) { segs.push(seg); break; }
        seg += two; j++; continue;
      }
      if (raw[j] === "|" && depth === 1) { segs.push(seg); seg = ""; continue; }
      seg += raw[j];
    }
    for (let k = 0; k + 1 < segs.length; k += 2) pairs.push({ label: segs[k].trim(), value: segs[k + 1] });
    if (segs.length % 2 === 1 && segs.length > 1) pairs.push({ label: segs[segs.length - 1].trim(), value: "", odd: true });
    re.lastIndex = j;
  }
  for (const pr of pairs) {
    const value = pr.value;
    const trimmed = value.trim();
    // 基礎値は値の最初の {{ap|…}}（または先頭の数）で、係数「(+」より前にあるものだけ。
    // 最初の {{ap| が入れ子（未解決の {{#var}} など）で読めないときは、後ろの係数の値を基礎値と取り違えないよう未解析にする
    const firstAp = trimmed.indexOf("{{ap|");
    const firstRatio = trimmed.indexOf("(+");
    let base = /^[-\d.\s/]+/.exec(trimmed);
    // チャンピオンのレベル依存の値（{{pp|…}}・{{pplevel|…}}）は、式の意味を確かめていないので未解析（理由を分ける）
    let baseReason = /^(\{\{as\|)?\{\{(pp|pplevel)\|/i.test(trimmed) ? "level_dependent" : "no_base";
    if (!base && firstAp >= 0 && (firstRatio < 0 || firstAp < firstRatio)) {
      const m2 = /\{\{ap\|[^{}]*\}\}/.exec(trimmed.slice(firstAp));
      if (m2 && m2.index === 0) base = { 0: m2[0], index: firstAp };
      else baseReason = "base_nested_template";
    }
    if (base && base[0].trim() === "") base = null;
    // 基礎値がレベル・スタックなどに依存する {{pp|…}}・{{pplevel|…}}（Template:Passive progression の規則で読む）
    if (!base && baseReason === "level_dependent") {
      const start = trimmed.search(/\{\{(pp|pplevel)\|/i);
      let depth = 0, end = start;
      for (let q = start; q < trimmed.length; q++) {
        if (trimmed.startsWith("{{", q)) { depth++; q++; continue; }
        if (trimmed.startsWith("}}", q)) { depth--; q++; if (depth === 0) { end = q + 1; break; } }
      }
      const sub = trimmed.slice(start, end);
      const pp = parseValue(sub, ranks);
      if (pp.ok) base = { 0: sub, index: start };
      else baseReason = pp.reason || "level_dependent";
    }
    const parsed = base ? parseValue(base[0].trim(), ranks) : { ok: false, reason: baseReason };
    // 基礎値が割合（例：{{ap|8 to 10}}% … of target's missing health）なら、単位と対象を残す（数だけを示すと誤解を招くため）
    if (parsed.ok && base) {
      const after = trimmed.slice(base.index + base[0].length);
      if (/^\s*%/.test(after)) {
        parsed.unit = "%";
        const of = plainOf(after.replace(/^\s*%/, "").replace(/\{\{as\|\(\+[^{}]*(\{\{[^{}]*\}\}[^{}]*)*\)\}\}/g, ""));
        if (of) parsed.of = of;
      }
    }
    // 係数：(+ 60% AD)、(+ {{ap|100 to 140}}% bonus AD)、(+ {{fd|1.5}}% per 100 AP) など。ランク別の係数は values で持つ
    const ratios = [...value.matchAll(/\(\+\s*(\{\{ap\|[^{}]*\}\}|\{\{fd\|[\d.]+\}\}|[\d.]+)\s*%\s*([^()]*?)\)/g)].map((r) => {
      const p = parseValue(r[1], ranks);
      return { percent: p.ok ? (p.values.length === 1 ? p.values[0] : p.values) : null, of: plainOf(r[2]), ...(p.ok ? {} : { raw: r[1], reason: p.reason }) };
    });
    out.push({ label: pr.label, raw: value, base: parsed.ok ? parsed : null, ratios, ...(parsed.ok ? {} : { reason: pr.odd ? "st_unpaired" : parsed.reason }) });
  }
  return out;
}

/**
 * ダメージ計算に使えるかの段階（leveling の1行ごと）：
 *   raw_only（原文のみ）→ formula_parsed（基礎値を解析）→ damage_type_known（ダメージの種類が分かる）
 *   → inputs_identified（係数の入力の種類がすべて分かる）→ computable（数値で計算できる）
 * 計算できない理由（条件付きの係数・割合の対象が不明・形態ごとの値など）は reason に残す。
 */
const INPUT_PATTERNS = [
  [/^of (the )?target'?s? max(imum)? health$/, "target_max_hp"],
  [/^of (the )?target'?s? missing health$/, "target_missing_hp"],
  [/^of (the )?target'?s? current health$/, "target_current_hp"],
  [/^bonus AD$/i, "bonus_ad"],
  [/^AD$/i, "total_ad"],
  [/^AP$/i, "ap"],
  [/^bonus health$/i, "bonus_hp"],
  [/^(of (his|her|their|its) )?max(imum)? health$/i, "self_max_hp"],
  [/^bonus armor$/i, "bonus_armor"],
  [/^armor$/i, "armor"],
  [/^bonus magic resistance$/i, "bonus_mr"],
  [/^magic resistance$/i, "mr"],
  [/^bonus mana$/i, "bonus_mana"],
  [/^max(imum)? mana$/i, "max_mana"],
];
function inputOf(of) {
  const s = (of || "").trim();
  for (const [re, k] of INPUT_PATTERNS) if (re.test(s)) return k;
  return null;
}

function calcInfo(l, damageTypeRaw) {
  const label = l.label || "";
  const isDamage = /damage/i.test(label);
  const dt = /physical/i.test(damageTypeRaw || "") ? "physical" : /magic/i.test(damageTypeRaw || "") ? "magic" : /true/i.test(damageTypeRaw || "") ? "true" : null;
  const labelType = /physical/i.test(label) ? "physical" : /magic/i.test(label) ? "magic" : /true/i.test(label) ? "true" : null;
  const damage_type = isDamage ? labelType || dt : null;
  if (!l.base) return { stage: "raw_only", reason: l.reason || "no_base", damage_type };
  const inputs = [];
  const unknown = [];
  if (l.base.unit === "%" && (l.base.of || isDamage)) {
    const k = inputOf(l.base.of);
    if (k) inputs.push({ input: k, from: "base" });
    else unknown.push(l.base.of || "割合の対象が不明");
  }
  for (const r of l.ratios) {
    if (r.percent === null) { unknown.push("係数が未解析"); continue; }
    // 「(+ 1.5% per 100 AP)」は割合の基礎値への加算（8% + 1.5%×AP/100）。割合の基礎値があるときだけ計算できる
    const per = /^per 100 (AP|AD|bonus AD|bonus health)$/i.exec(r.of);
    if (per && l.base.unit === "%") { const k = inputOf(per[1]); if (k) { inputs.push({ input: k, from: "per100" }); continue; } }
    if (/^per\s/i.test(r.of)) { unknown.push(`条件付きの係数（${r.of}）`); continue; }
    const k = inputOf(r.of);
    if (k) inputs.push({ input: k, from: "ratio" });
    else unknown.push(r.of);
  }
  const basis = l.base.kind === "progression" ? (l.base.basis_label === "level" ? "level" : "other") : l.base.kind === "number" ? "fixed" : l.base.kind === "variants" || l.base.kind === "keyword" || l.base.kind === "min_max" ? "special" : "rank";
  if (basis === "other") unknown.push(`基礎値が「${l.base.basis_label}」に応じて変わる`);
  if (basis === "special") unknown.push("基礎値が条件・形態ごとの値");
  const stage = !isDamage && !inputs.length ? "formula_parsed" : !damage_type ? "formula_parsed" : unknown.length ? "inputs_identified_partial" : "computable";
  return {
    stage: stage === "inputs_identified_partial" ? "not_computable" : stage === "formula_parsed" && damage_type ? "damage_type_known" : stage,
    damage_type,
    base_basis: basis,
    inputs: [...new Set(inputs.map((x) => x.input))],
    ...(unknown.length ? { missing: unknown } : {}),
  };
}

// 構造化の対象にする引数（数値になりうるもの）。それ以外（説明文など）は raw のまま残し、解析の対象に数えない
const NUMERIC_FIELDS = new Set(["cooldown", "cost", "range", "target range", "effect radius", "speed", "width", "angle", "cast time", "static", "recharge", "charges", "ammo", "delay", "duration", "custominfo", "collision radius", "tether radius", "attack range", "maxrank"]);

function structureTemplate(params, defaultRanks) {
  const ranks = Number(params.maxrank) || defaultRanks;
  const parsed = {}, unparsed = [];
  for (const [k, v] of Object.entries(params)) {
    if (!NUMERIC_FIELDS.has(k)) continue;
    const p = parseValue(v, ranks);
    if (p.ok) parsed[k] = p; else if (p.reason !== "empty") unparsed.push({ field: k, reason: p.reason });
  }
  const leveling = Object.entries(params).filter(([k]) => /^leveling\d*$/.test(k)).flatMap(([k, v]) => parseLeveling(v, ranks).map((x) => ({ field: k, ...x })));
  for (const l of leveling) if (!l.base) unparsed.push({ field: `${l.field}:${l.label}`, reason: l.reason });
  return { parsed, leveling, unparsed };
}

/** 記事：見出しと、使っているテンプレートの名前だけ（本文は保存しない）*/
function articleMeta(text) {
  const headings = [...text.matchAll(/^(={2,4})\s*(.+?)\s*\1\s*$/gm)].map((m) => ({ level: m[1].length, title: m[2] }));
  const templates = [...new Set([...text.matchAll(/\{\{\s*([^|{}\n#:]+)/g)].map((m) => m[1].trim().toLowerCase()))];
  return { bytes: Buffer.byteLength(text), headings, templates_used: templates.length, links: (text.match(/\[\[/g) || []).length };
}

module.exports = { calcInfo, inputOf, plainText, hasResidual, parsePp, outerTemplate, SITE, UA, LICENSE, pageUrl, fetchRaw, parseLuaChunk, templateParams, dataTemplateParams, parseValue, parseLeveling, structureTemplate, articleMeta, NUMERIC_FIELDS, defaultCache: () => path.join(os.tmpdir(), "rift-compass-wiki-cache") };
