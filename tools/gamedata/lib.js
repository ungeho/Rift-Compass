// ゲームデータ（公式 Data Dragon・LoL Wiki の Module:ChampionData）の取り込みと比較の共通処理。
// 依存パッケージなし。取得した値は推測で補わず、解釈できない元データは出典・版とともにそのまま残す。
"use strict";

const SLOTS = ["Q", "W", "E", "R"];

// ---------------------------------------------------------------------------
// Lua のテーブル定数（Module:ChampionData/data の `return { ... }`）を JSON に変える最小のパーサ。
// 対応：文字列（"…" '…'、エスケープ）・数値・true/false/nil・テーブル（[式] = 値、名前 = 値、位置の値）・コメント（-- と --[[ ]]）。
// 位置の値だけ、または 1..n の数値キーだけのテーブルは配列、それ以外はオブジェクトにする。
function parseLuaTable(src) {
  let i = 0;
  const n = src.length;
  let lastExpr = null; // 直前の値が数式（例：84+1000/17）だったとき、その元の文字列
  const fail = (msg) => { throw new Error(`Lua の解析に失敗（${i}文字目）：${msg}：${JSON.stringify(src.slice(i, i + 40))}`); };
  const skip = () => {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      const lc = /^--\[(=*)\[/.exec(src.slice(i, i + 14)); // 長いコメント --[[ ]]・--[=[ ]=]
      if (lc) { const close = "]" + lc[1] + "]"; const e = src.indexOf(close, i + lc[0].length); i = e < 0 ? n : e + close.length; continue; }
      if (src.startsWith("--", i)) { const e = src.indexOf("\n", i); i = e < 0 ? n : e + 1; continue; }
      return;
    }
  };
  const str = () => {
    const q = src[i++];
    let out = "";
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") {
        const c = src[i + 1];
        const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };
        if (c in map) { out += map[c]; i += 2; continue; }
        if (/[0-9]/.test(c)) { const m = /^[0-9]{1,3}/.exec(src.slice(i + 1)); out += String.fromCharCode(Number(m[0])); i += 1 + m[0].length; continue; }
        out += c; i += 2; continue;
      }
      out += src[i++];
    }
    if (src[i] !== q) fail("文字列が閉じていない");
    i++;
    return out;
  };
  const value = () => {
    skip();
    const c = src[i];
    if (c === "{") return table();
    // 長い文字列 [[...]]・[=[...]=]（Wiki のモード別の調整などで使う）
    const ls = /^\[(=*)\[/.exec(src.slice(i, i + 12));
    if (ls) {
      const close = "]" + ls[1] + "]";
      const end = src.indexOf(close, i + ls[0].length);
      if (end < 0) fail("長い文字列が閉じていない");
      let s = src.slice(i + ls[0].length, end);
      if (s.startsWith("\n")) s = s.slice(1);
      i = end + close.length;
      return s;
    }
    if (c === '"' || c === "'") return str();
    const m = /^-?(?:0x[0-9a-fA-F]+|[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/.exec(src.slice(i, i + 40));
    if (m) {
      // 数だけの四則演算（Wiki の特殊な成長の表記。例：クレッドの hp_lvl = 84+1000/17）は計算し、元の式も残す
      const e = /^[-+*/().0-9eE ]+/.exec(src.slice(i, i + 200));
      const expr = e ? e[0].trimEnd() : m[0];
      if (expr !== m[0] && /[-+*/]/.test(expr.slice(m[0].length))) {
        i += expr.length;
        lastExpr = expr;
        return Function(`"use strict"; return (${expr});`)();
      }
      i += m[0].length;
      return Number(m[0]);
    }
    const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 40));
    if (w) {
      i += w[0].length;
      if (w[0] === "true") return true;
      if (w[0] === "false") return false;
      if (w[0] === "nil") return null;
      fail("未対応の識別子 " + w[0]);
    }
    fail("値がない");
  };
  const table = () => {
    i++; // {
    const entries = [];
    let pos = 1;
    for (;;) {
      skip();
      if (src[i] === "}") { i++; break; }
      let key;
      if (src[i] === "[" && !/^\[=*\[/.test(src.slice(i, i + 12))) {
        i++;
        key = value();
        skip();
        if (src[i] !== "]") fail("] がない");
        i++;
        skip();
        if (src[i] !== "=") fail("= がない");
        i++;
      } else {
        const save = i;
        const w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 80));
        if (w) {
          i += w[0].length;
          skip();
          if (src[i] === "=" && src[i + 1] !== "=") { key = w[0]; i++; } else i = save;
        }
      }
      lastExpr = null;
      const v = value();
      const k = key === undefined ? pos++ : key;
      entries.push([k, v]);
      // 数式で書かれた値は、同じテーブルの __expr に元の式を残す（例：{ hp_lvl: "84+1000/17" }）
      if (lastExpr) {
        const prev = entries.find(([x]) => x === "__expr");
        if (prev) prev[1][k] = lastExpr;
        else entries.push(["__expr", { [k]: lastExpr }]);
      }
      lastExpr = null;
      skip();
      if (src[i] === "," || src[i] === ";") i++;
    }
    const isArray = entries.every(([k], idx) => k === idx + 1);
    return isArray ? entries.map(([, v]) => v) : Object.fromEntries(entries);
  };
  skip();
  if (src.startsWith("return", i)) i += 6;
  const out = value();
  return out;
}

// ---------------------------------------------------------------------------
// Data Dragon の championFull（en_US・ja_JP）を、1チャンピオン1ファイルの形にする。
// 物語・スキン・おすすめのアイテム・画像の座標は持たない（チャンピオンの知識に使わないため）。
// スキルの数値の配列（effect・vars・datavalues）は、空や0でも元のまま残す（解釈しない）。
function normalizeDDragonChampion(en, ja, source) {
  const both = (a, b) => ({ en: a ?? null, ja: b ?? null });
  return {
    source,
    id: en.id,
    key: en.key,
    name: both(en.name, ja?.name),
    title: both(en.title, ja?.title),
    tags: en.tags,
    partype: both(en.partype, ja?.partype),
    info: en.info,
    stats: en.stats,
    passive: { name: both(en.passive?.name, ja?.passive?.name), description: both(en.passive?.description, ja?.passive?.description), image: en.passive?.image?.full ?? null },
    spells: en.spells.map((s, k) => {
      const j = ja?.spells?.[k];
      return {
        slot: SLOTS[k] ?? String(k),
        id: s.id,
        name: both(s.name, j?.name),
        description: both(s.description, j?.description),
        tooltip: both(s.tooltip, j?.tooltip),
        leveltip: s.leveltip ?? null,
        maxrank: s.maxrank,
        cooldown: s.cooldown,
        cooldownBurn: s.cooldownBurn,
        cost: s.cost,
        costBurn: s.costBurn,
        costType: both(s.costType, j?.costType),
        resource: both(s.resource, j?.resource),
        range: s.range,
        rangeBurn: s.rangeBurn,
        maxammo: s.maxammo,
        effect: s.effect,
        effectBurn: s.effectBurn,
        vars: s.vars,
        datavalues: s.datavalues,
        image: s.image?.full ?? null,
      };
    }),
  };
}

/** 一覧（index）の1行。全チャンピオンの基本ステータスは、個別のファイルを読まずに比べられるようにここにも持つ */
function indexEntry(c, topicId) {
  return { id: c.id, key: c.key, name: c.name, title: c.title, tags: c.tags, partype: c.partype.en, topic_id: topicId ?? null, stats: c.stats };
}

// ---------------------------------------------------------------------------
// スキルのデータがどこまで取れているか（Data Dragon の現状の把握）
const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

function spellCoverage(champions) {
  const out = { spells: 0, cooldown_nonzero: 0, cost_nonzero: 0, range_global_marker: 0, effect_all_zero_or_null: 0, datavalues_empty: 0, vars_empty: 0, tooltip_placeholders: 0, tooltip_placeholders_resolvable: 0, maxrank: {}, costType: {} };
  for (const c of champions) {
    for (const s of c.spells) {
      out.spells++;
      if ((s.cooldown || []).some((x) => x > 0)) out.cooldown_nonzero++;
      if ((s.cost || []).some((x) => x > 0)) out.cost_nonzero++;
      if ((s.range || []).some((x) => x >= 25000)) out.range_global_marker++;
      if ((s.effect || []).every((e) => e == null || e.every((x) => x === 0))) out.effect_all_zero_or_null++;
      if (!s.datavalues || Object.keys(s.datavalues).length === 0) out.datavalues_empty++;
      if (!s.vars || s.vars.length === 0) out.vars_empty++;
      const names = [...(s.tooltip.en || "").matchAll(PLACEHOLDER)].map((m) => m[1]);
      out.tooltip_placeholders += names.length;
      // Data Dragon の中で値が分かる穴埋め：e1〜e10（effectBurn）・cost/cooldown など、vars・datavalues の名前
      const known = new Set(["cost", "cooldown", "maxammo", "ammorechargetime", ...(s.vars || []).map((v) => v.key), ...Object.keys(s.datavalues || {})]);
      for (const nm of names) {
        const base = nm.split(/[*\s]/)[0].toLowerCase();
        const e = /^e(\d+)$/.exec(base);
        if ((e && s.effectBurn?.[Number(e[1])] && s.effectBurn[Number(e[1])] !== "0") || known.has(base)) out.tooltip_placeholders_resolvable++;
      }
      out.maxrank[s.maxrank] = (out.maxrank[s.maxrank] || 0) + 1;
      out.costType[s.costType.en] = (out.costType[s.costType.en] || 0) + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 版のあいだの違い（基本ステータス・スキルの CD・コスト・射程・最大ランク）
const SPELL_FIELDS = ["maxrank", "cooldownBurn", "costBurn", "rangeBurn", "maxammo"];

function diffVersions(oldIndex, newIndex, oldChamps = {}, newChamps = {}) {
  const byId = (list) => new Map(list.map((c) => [c.id, c]));
  const a = byId(oldIndex), b = byId(newIndex);
  const added = [...b.keys()].filter((k) => !a.has(k));
  const removed = [...a.keys()].filter((k) => !b.has(k));
  const changed = [];
  for (const [id, nc] of b) {
    const oc = a.get(id);
    if (!oc) continue;
    const stats = [];
    for (const k of new Set([...Object.keys(oc.stats), ...Object.keys(nc.stats)])) {
      if (oc.stats[k] !== nc.stats[k]) stats.push({ stat: k, from: oc.stats[k] ?? null, to: nc.stats[k] ?? null });
    }
    const spells = [];
    const os = oldChamps[id], ns = newChamps[id];
    if (os && ns) {
      ns.spells.forEach((s, k) => {
        const o = os.spells[k];
        if (!o) return;
        for (const f of SPELL_FIELDS) if (JSON.stringify(o[f]) !== JSON.stringify(s[f])) spells.push({ slot: s.slot, field: f, from: o[f], to: s[f] });
        if (o.tooltip.en !== s.tooltip.en) spells.push({ slot: s.slot, field: "tooltip.en", from: null, to: null, note: "説明文が変わった（本文は各版のファイルにある）" });
      });
    }
    if (stats.length || spells.length) changed.push({ id, stats, spells });
  }
  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Data Dragon と Wiki（Module:ChampionData）の基本ステータスの照合。どちらが正しいかは決めない
const STAT_MAP = [
  ["hp", "hp_base"], ["hpperlevel", "hp_lvl"], ["mp", "mp_base"], ["mpperlevel", "mp_lvl"],
  ["armor", "arm_base"], ["armorperlevel", "arm_lvl"], ["spellblock", "mr_base"], ["spellblockperlevel", "mr_lvl"],
  ["hpregen", "hp5_base"], ["hpregenperlevel", "hp5_lvl"], ["mpregen", "mp5_base"], ["mpregenperlevel", "mp5_lvl"],
  ["attackdamage", "dam_base"], ["attackdamageperlevel", "dam_lvl"], ["attackspeed", "as_base"], ["attackspeedperlevel", "as_lvl"],
  ["attackrange", "range"], ["movespeed", "ms"],
];

/** Wiki の項目を、Data Dragon のキー（数値の整数部分）ごとの形態の一覧にする（例：240＝クレッド、240.1＝クレッド＆スカール）*/
function wikiFormsByKey(wikiChampions) {
  const out = new Map();
  for (const [name, w] of Object.entries(wikiChampions)) {
    const key = String(Math.trunc(Number(w.id)));
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ form: name, ...w });
  }
  return out;
}

function statDiffs(ddStats, wikiStats) {
  const diffs = [];
  for (const [dk, wk] of STAT_MAP) {
    const dv = ddStats[dk], wv = wikiStats?.[wk];
    if (wv === undefined) continue;
    if (typeof dv === "number" && typeof wv === "number" && Math.abs(dv - wv) < 1e-9) continue;
    diffs.push({ stat: dk, ddragon: dv ?? null, wiki: wv ?? null });
  }
  return diffs;
}

/** 形態が複数あるときは、Data Dragon と違いの最も少ない形態と比べる（どの形態と比べたかを残す）*/
function crossCheck(ddIndex, wikiChampions) {
  const forms = wikiFormsByKey(wikiChampions);
  const missing = [];
  const diffs = [];
  const multiForm = [];
  for (const c of ddIndex) {
    const list = forms.get(String(c.key));
    if (!list) { missing.push(c.id); continue; }
    const ranked = list.map((w) => ({ w, d: statDiffs(c.stats, w.stats) })).sort((a, b) => a.d.length - b.d.length);
    if (list.length > 1) multiForm.push({ id: c.id, forms: list.map((w) => w.form), compared_with: ranked[0].w.form });
    for (const d of ranked[0].d) diffs.push({ id: c.id, form: ranked[0].w.form, ...d });
  }
  return { missing, diffs, multiForm };
}

// ---------------------------------------------------------------------------
// チャンピオンの Topic
/** Topic の ID は英語名から作る（既存の champ-twisted-fate と同じ規則）。記号は除き、空白・＆は - にする */
function championTopicId(nameEn) {
  return "champ-" + nameEn.toLowerCase().replace(/[’'.]/g, "").replace(/\s*&\s*/g, " ").trim().replace(/\s+/g, "-");
}

/** 日本語名の表記ゆれ（中黒・＝・空白を除いた形）。元の名前と同じなら加えない */
function jaVariants(nameJa) {
  const v = nameJa.replace(/[・＝=\s]/g, "");
  return [...new Set([nameJa, v])];
}

/**
 * 日本語名が、ほかのカタカナ語の一部として現れるか（例：「ナー」は「ナーフ」の一部）。
 * corpusRuns：コーパスから取り出したカタカナの連なり。ロール名などの決まった前後の語との複合は除く。
 */
function ambiguousInRuns(name, runs, allowedAffixes) {
  const examples = [];
  for (const run of runs) {
    let from = 0;
    for (;;) {
      const at = run.indexOf(name, from);
      if (at < 0) break;
      from = at + 1;
      const before = run.slice(0, at), after = run.slice(at + name.length);
      const ok = (s, atEnd) => s === "" || allowedAffixes.some((a) => (atEnd ? s.startsWith(a) : s.endsWith(a)));
      if (!ok(before, false) || !ok(after, true)) { examples.push(run); break; }
    }
    if (examples.length >= 3) break;
  }
  return examples;
}

// 中黒（・）は列挙の区切りにも使われる（例：サイラス・アカリ）ので、連なりを区切る。＝はチャンピオン名の一部（カ＝ジックス）
const KATAKANA_RUN = /[ァ-ヺー＝]+/g;
function katakanaRuns(text) {
  return (text.match(KATAKANA_RUN) || []).filter((r) => r.length >= 2);
}

// ---------------------------------------------------------------------------
// Data Dragon の既知の不具合。生の値はファイルにそのまま残し、計算・表示に採用しない項目として一覧に記録する
const KNOWN_ISSUES = [
  {
    field: "attackdamageperlevel",
    since: "16.5.1",
    reference: "https://github.com/RiotGames/developer-relations/issues/1144",
    note: "Data Dragon 16.5.1 以降、全チャンピオンの攻撃力の成長値が0になる不具合の報告（RiotGames/developer-relations #1144、2026-11-02 の確認で open）。16.4.1 では0はセナだけ（Wiki もセナは0）。",
    // 不具合が出ている版の判定：全チャンピオン（成長値が本来0のセナを除く）で0
    detect: (index) => index.filter((c) => c.stats.attackdamageperlevel === 0).length >= index.length - 1,
  },
];

/** その版で当てはまる既知の不具合（判定の結果と出典） */
function knownIssuesFor(index) {
  return KNOWN_ISSUES.filter((k) => k.detect(index)).map(({ detect, ...k }) => ({ ...k, status: "excluded", detected: `${index.filter((c) => c.stats[k.field] === 0).length}/${index.length}件が0` }));
}

module.exports = { KNOWN_ISSUES, knownIssuesFor, wikiFormsByKey, statDiffs, parseLuaTable, normalizeDDragonChampion, indexEntry, spellCoverage, diffVersions, crossCheck, STAT_MAP, championTopicId, jaVariants, ambiguousInRuns, katakanaRuns, SLOTS };
