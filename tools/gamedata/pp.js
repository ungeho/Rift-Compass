/**
 * Wiki の表示用テンプレートを、Wiki と同じ計算で読める文にする（説明の文の取り込み用）。
 *
 * - mwExpr：MediaWiki の {{#expr:}}（ParserFunctions）の四則演算・^・round・mod・ceil など
 * - ppText：{{pp}}・{{pplevel}}（Template:Passive progression → Module:Ability progression の p.pp・p.pplevel）
 *   値の行（1つ目）と基準の行（2つ目）を ; で区切り、「a to b for N」「a to b by s」「x を使う式 for N」「then」を
 *   Module と同じ順で展開し、表示は Module と同じ（6段階以上は「最初 – 最後」、5段階以下は「a / b / c」）。
 * - rutngtText：{{rutngt}}（Template:Rounded up to next game tick、1 tick = 0.033 秒で切り上げ）
 * - criticalDamageText：{{critical damage}}（Template:Critical damage、Infinity Edge の critdamage を使う）
 *
 * 解析できないときは null を返す（呼び出し側で「解けない記法」として残す）。推測で値を補わない。
 */

// ---------------------------------------------------------------------------
// MediaWiki の #expr（必要な部分だけ）。優先順位：単項（- + ceil floor trunc abs）> ^ > * / div mod > + - > round
function mwExpr(src) {
  if (src == null) return null;
  const s = String(src).toLowerCase();
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/.exec(s.slice(i));
    if (num) { toks.push({ t: "n", v: Number(num[0]) }); i += num[0].length; continue; }
    const w = /^(round|mod|div|ceil|floor|trunc|abs|pi)\b/.exec(s.slice(i));
    if (w) { toks.push({ t: "w", v: w[1] }); i += w[0].length; continue; }
    if ("+-*/^()".includes(c)) { toks.push({ t: c }); i++; continue; }
    return null; // ほかの記号・語（比較・関数・未知の変数）は扱わない
  }
  let p = 0;
  const peek = () => toks[p];
  function unary() {
    const k = peek();
    if (!k) throw 0;
    if (k.t === "-") { p++; return -unary(); }
    if (k.t === "+") { p++; return unary(); }
    if (k.t === "w" && ["ceil", "floor", "trunc", "abs"].includes(k.v)) {
      p++;
      const v = unary();
      return k.v === "ceil" ? Math.ceil(v) : k.v === "floor" ? Math.floor(v) : k.v === "trunc" ? Math.trunc(v) : Math.abs(v);
    }
    if (k.t === "w" && k.v === "pi") { p++; return Math.PI; }
    if (k.t === "n") { p++; return k.v; }
    if (k.t === "(") {
      p++;
      const v = roundLevel();
      if (!peek() || peek().t !== ")") throw 0;
      p++;
      return v;
    }
    throw 0;
  }
  function power() {
    let v = unary();
    while (peek() && peek().t === "^") { p++; v = Math.pow(v, unary()); }
    return v;
  }
  function mul() {
    let v = power();
    for (;;) {
      const k = peek();
      if (k && (k.t === "*" || k.t === "/")) { p++; const r = power(); v = k.t === "*" ? v * r : v / r; continue; }
      if (k && k.t === "w" && (k.v === "div" || k.v === "mod")) {
        p++;
        const r = power();
        // MediaWiki の mod は整数の剰余（PHP の %）
        v = k.v === "div" ? v / r : Math.trunc(v) % Math.trunc(r);
        continue;
      }
      return v;
    }
  }
  function add() {
    let v = mul();
    for (;;) {
      const k = peek();
      if (k && (k.t === "+" || k.t === "-")) { p++; const r = mul(); v = k.t === "+" ? v + r : v - r; continue; }
      return v;
    }
  }
  function roundLevel() {
    let v = add();
    while (peek() && peek().t === "w" && peek().v === "round") {
      p++;
      const d = Math.trunc(add());
      const f = Math.pow(10, d);
      // PHP の round（0.5 は 0 から遠い方へ）
      v = (Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9)) / f;
    }
    return v;
  }
  try {
    const v = roundLevel();
    if (p !== toks.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

const ok = (s) => mwExpr(s) !== null;
// Module の rounding：小数点のある数だけ、指定の桁で四捨五入（decimals が null なら丸めない）
function rounding(val, decimals) {
  if (decimals == null || typeof val !== "number" || Number.isInteger(val)) return val;
  if (decimals === "floor") return Math.floor(val);
  if (decimals === "ceil") return Math.ceil(val);
  if (decimals === "abs") return Math.abs(val);
  if (decimals === "trunc") return Math.trunc(val);
  const d = Number(decimals);
  if (!Number.isFinite(d)) return val;
  return Math.floor(val * 10 ** d + 0.5) / 10 ** d;
}
// 表示の数（Module:fd に合わせ、余分な 0 を付けない）
const fmt = (v) => (typeof v === "number" ? String(Number(v.toFixed(6))) : String(v));
const replaceAll = (s, a, b) => s.split(a).join(b);

// Module の string_to_formula：式の中の「a to b」を (a)+((b)-(a))/(times-1)*(x-1) に置き換える
function stringToFormula(args) {
  let val = args.replace(/ /g, "");
  let guard = 0;
  while (val.includes("to")) {
    if (++guard > 20) return args;
    const toPart = val.slice(0, val.indexOf("to"));
    let para = toPart.split("(");
    let j = para.length, total = 0;
    while (j >= 2) {
      total += (para[j - 1].match(/\)/g) || []).length;
      if (para.length - j >= total) break;
      j--;
    }
    const start = para.slice(j - 1).join("(");
    if (!ok(start + "*2")) return args;
    const rest = val.slice(val.indexOf("to") + 2);
    para = rest.split(")");
    j = 1; total = 0;
    while (j < para.length) {
      total += (para[j - 1].match(/\(/g) || []).length;
      if (j > total) break;
      j++;
    }
    const finish = para.slice(0, j).join(")");
    let post = null;
    if (finish.includes("to")) {
      post = stringToFormula(finish);
      if (post === finish) return args;
    } else if (!ok(finish + "*2")) return args;
    val = replaceAll(val, start + "to" + finish, `(${start})+((${post || finish})-(${start}))/(times-1)*(x-1)`);
  }
  return val;
}
const xCheck = (f) => f.replace(/([.\d]?)x([.\d]?)/g, (m, a, b) => (a === "" && b === "" ? "1" : m));

/**
 * {{pp}}・{{pplevel}} の表示の文。positional：[値の行, 基準の行]、named：key・key1・type・label1・round・round1・changedisplay・showtype
 * pplevel のときは level=true（Module の p.pplevel：defaultDisplayMaxLevel・tooltipSize 41）
 */
function ppCompute(positional, named, level) {
  const DEFAULT = 18;
  const tooltipSize = level ? 41 : null;
  const round = [named.round === "false" ? null : named.round || 2, named.round1 === "false" ? null : named.round1 || 2];
  const origtable = [String(positional[0] || "").split(";"), String(positional[1] || "").split(";")];
  const sfv = [{}, {}];
  const res = [[], []];
  for (let oi = 0; oi < 2; oi++) {
    const orig = origtable[oi];
    let last = "", errLast = false, i = 0;
    while (i < orig.length && orig[i] !== "") {
      const s = orig[i];
      const hasTo = s.includes("to"), hasX = s.includes("x");
      if ((hasTo || hasX) && !s.includes("<")) {
        let start = "", finish = "", times = "";
        const hasBy = s.includes("by"), hasFor = s.includes("for");
        if (hasTo) {
          start = s.slice(0, s.indexOf("to"));
          let m;
          if (hasBy) m = /^ *.*? *to *(.*?) *by *(.*?) *$/.exec(s);
          else if (hasFor) m = /^ *.*? *to *(.*?) *for *(.*?) *$/.exec(s);
          else m = /^ *.*? *to *(.*?) *$/.exec(s);
          if (m) { finish = m[1] || ""; times = m[2] || ""; }
        }
        let valid = true;
        if (!hasX && ok(start + "*2") && ok(finish + "*2") && (times === "" || ok(times + "*2"))) {
          start = mwExpr(start); finish = mwExpr(finish);
          if (times === "") {
            if (sfv[oi].linear_filling || sfv[oi].x_filling) valid = false;
            else {
              sfv[oi] = { linear_filling: res[oi].length + 1, start, finish, last_value: last, errLast };
              last = finish; errLast = false;
            }
          } else {
            if (sfv[oi].start == null) sfv[oi] = { start, finish };
            times = mwExpr(times);
            if (hasBy) {
              times = rounding(Math.abs(finish - start) / times + 1, 0);
              if (last === start) times -= 1;
            }
            if (!(times >= 1) || times > 41) return null;
            if (last !== start) { res[oi].push(rounding(start, round[oi])); times -= 1; }
            for (let x = 1; x <= times; x++) res[oi].push(rounding(start + ((finish - start) * x) / times, round[oi]));
            last = finish; errLast = false;
          }
        } else {
          let useformula = s, t = "";
          if (hasFor) {
            const m = /^ *(.*?) *for *(.*?) *$/.exec(s);
            if (m) { useformula = m[1]; t = m[2]; }
          }
          if (ok(t + "*2")) t = mwExpr(t);
          else if (t !== "") valid = false;
          if (valid && last !== "") useformula = useformula.replace("then", String(last));
          if (valid && hasTo) {
            useformula = stringToFormula(useformula);
            if (t !== "") useformula = replaceAll(useformula, "times", String(t));
          }
          if (valid && ok(replaceAll(xCheck(useformula), "times", "2") + "*2")) {
            if (t === "") {
              if (sfv[oi].linear_filling || sfv[oi].x_filling) valid = false;
              else {
                sfv[oi] = { x_filling: res[oi].length + 1, useformula, last_value: last, errLast };
                last = ""; errLast = false;
              }
            } else {
              if (sfv[oi].useformula == null) sfv[oi].useformula = useformula;
              if (!(t >= 1) || t > 41) return null;
              for (let x = 1; x <= t; x++) {
                const v = mwExpr(replaceAll(useformula, "x", String(x)));
                if (v === null) return null;
                last = v;
                res[oi].push(rounding(v, round[oi]));
              }
            }
          } else valid = false;
        }
        if (!valid) { last = ""; errLast = false; res[oi].push(s); }
      } else {
        const value = last === "" ? s : s.replace("then", String(last));
        if (ok(value + "*2")) {
          const v = mwExpr(value);
          if ((orig[i + 1] || "").includes("to")) { last = ""; errLast = v; } else { last = v; errLast = false; }
          res[oi].push(rounding(v, round[oi]));
        } else { errLast = false; last = ""; res[oi].push(s); }
      }
      i++;
    }
  }
  // 段階の数をそろえる（Module の fill）
  const fill = [DEFAULT - res[0].length, DEFAULT - res[1].length];
  let fillingToDefault = false;
  if (res[0].length >= res[1].length) {
    if (!sfv[0].linear_filling && !sfv[0].x_filling) fill[1] = res[0].length - res[1].length;
    else fillingToDefault = true;
  } else if (!sfv[1].linear_filling && !sfv[1].x_filling) fill[0] = res[1].length - res[0].length;
  else fillingToDefault = true;
  if (fill[0] < 0) fill[0] = 0;
  if (fill[1] < 0) fill[1] = 0;
  const extended = tooltipSize && fillingToDefault ? tooltipSize - DEFAULT : 0;
  let originalInputSize = res[0].length;
  for (let oi = 0; oi < 2; oi++) {
    const to = sfv[oi];
    let times = fill[oi];
    if (!(to.linear_filling || to.x_filling)) continue;
    originalInputSize = res[oi].length + times;
    const at = (to.linear_filling || to.x_filling) - 1; // 0 始まりの位置
    const tail = res[oi].splice(at);
    const filled = [];
    if (to.linear_filling) {
      const { start, finish } = to;
      if (to.last_value !== start) { filled.push(rounding(start, round[oi])); times -= 1; }
      if (times <= 0) return null;
      for (let x = 1; x <= times + extended; x++) filled.push(rounding(start + ((finish - start) * x) / times, round[oi]));
    } else {
      const f = replaceAll(to.useformula, "times", String(times));
      for (let x = 1; x <= times + extended; x++) {
        const v = mwExpr(replaceAll(f, "x", String(x)));
        if (v === null) return null;
        filled.push(rounding(v, round[oi]));
      }
    }
    res[oi] = [...res[oi], ...filled, ...tail];
  }
  if (res[1].length !== 0 && res[0].length !== res[1].length) return null; // Module では「Variables are unmatched」の誤り
  if (!res[0].length) return null;
  // 表示する段階の数（pplevel はレベル 18 まで）
  let dmc;
  if (level) {
    if (res[1].length === 0 && res[0].length > DEFAULT) dmc = DEFAULT;
    else {
      for (let k = res[1].length - 1; k >= 0; k--) {
        const v = typeof res[1][k] === "number" ? res[1][k] : Number(res[1][k]);
        if (!Number.isFinite(v)) break;
        if (v <= DEFAULT) { if (k !== res[1].length - 1) dmc = k + 1; break; }
      }
      if (dmc == null) return null; // Module では誤り（レベル 18 を超える段階がない pplevel）
    }
  } else dmc = res[0].length;
  if (dmc > DEFAULT && fillingToDefault) dmc = DEFAULT;
  return { bottom: res[0], top: res[1], dmc, originalInputSize };
}

function ppText(positional, named, level) {
  const r = ppCompute(positional, named, level);
  if (!r) return null;
  // 数にならなかった段階は、Module と同じくそのまま表示する（infinite・8th・10% など）。
  // ただし式の記号・x・to・for が残るもの（解けない式）は推測で読まずに解けないものとする
  if (r.bottom.slice(0, r.dmc).some((v) => typeof v !== "number" && (/[*/+()^]|\bx\b|\bto\b|\bfor\b|\bthen\b/.test(v) || !/^[\w%.\s∞-]+$/.test(v)))) return null; // ∞ は Wiki の表示のまま（Gathering Storm）
  const key = named.key || "";
  const change = named.changedisplay === "true";
  const vals = r.bottom.slice(0, r.dmc);
  let s = (r.dmc > 5 && !change) || (r.dmc <= 5 && change)
    ? `${fmt(vals[0])}${key} – ${fmt(vals[vals.length - 1])}${key}`
    : vals.map(fmt).join(`${key} / `) + key;
  if (named.showtype !== "false") s += ` (based on ${named.type || named.label1 || "level"})`;
  return s;
}

/**
 * チャンピオンのレベルに応じた pp の、レベル18を超える部分の記録（表示の文は変えない）。
 * サモナーズリフトの通常の最大レベルは18で、トップレーンのロールクエストを達成すると20（Experience (champion) の記事）。
 * - shown_beyond_18：表示の範囲（最初 – 最後）がレベル19以上の値で終わる（pp の for 20 など）
 * - hidden_beyond_18：表示はレベル18までだが、原典の値はレベル19以上まである（pplevel）
 * 基準がチャンピオンのレベルでないもの（スキルのランク・スタック・時間など）は対象外。値に数でない段階があるものも対象外
 */
function levelNote(positional, named, level) {
  const label = named.type || named.label1 || "level";
  if (label !== "level") return null;
  const r = ppCompute(positional, named, level);
  if (!r) return null;
  const n = r.bottom.length;
  const levels = r.top.length ? r.top.map(Number) : Array.from({ length: n }, (_, i) => i + 1);
  if (levels.length !== n || levels.some((x) => !Number.isFinite(x)) || r.bottom.some((v) => typeof v !== "number")) return null;
  const maxLevel = Math.max(...levels);
  if (maxLevel <= 18) return null;
  // レベル18の値：段階がレベル18ちょうどになくても、18以下で最も大きいレベルの段階の値が適用される（例：1・4・…・16・19 の 16 の値）
  let i18 = -1;
  levels.forEach((x, i) => { if (x <= 18 && (i18 < 0 || x >= levels[i18])) i18 = i; });
  if (i18 < 0) return null;
  const key = named.key || "";
  const shownLast = levels[r.dmc - 1];
  return {
    kind: shownLast > 18 ? "shown_beyond_18" : "hidden_beyond_18",
    first: `${fmt(r.bottom[0])}${key}`,
    at_level_18: `${fmt(r.bottom[i18])}${key}`,
    max_level: maxLevel,
    at_max_level: `${fmt(r.bottom[levels.indexOf(maxLevel)])}${key}`,
    shown_last_level: shownLast,
  };
}

/** {{rutngt|秒}}：次のゲームの tick（0.033 秒）に切り上げた秒。切り上げで変わるときは元の秒も示す（Wiki ではツールチップ） */
function rutngtText(arg) {
  const v = mwExpr(arg);
  if (v === null) return null;
  const TICK = 0.033;
  // 浮動小数の誤差で1 tick 多く数えないよう、わずかに引いてから切り上げる
  const r = Number((Math.ceil(v / TICK - 1e-9) * TICK).toFixed(3));
  if (Math.abs(r - v) < 1e-9) return `${fmt(v)} seconds`;
  return `${fmt(r)} seconds (${fmt(v)} seconds rounded up to the next game tick)`;
}

/**
 * {{critical damage|値|IE の値|critScaling=true|flat=true|mod=|base=|ie=|wr=}}（Template:Critical damage）
 * ieCritDamage：Infinity Edge の critdamage（Module:ItemData）。wr=… のときは 30（Wild Rift）
 */
function criticalDamageText(positional, named, ieCritDamage) {
  const ieMod = (named.wr ? 30 : ieCritDamage) / 100;
  if (!Number.isFinite(ieMod)) return null;
  const flatKey = named.flat === "true" ? "" : "%";
  if (named.critscaling === "true" || named.critScaling === "true") {
    const vals = positional[1] || positional[0] || "0 to 1";
    const first = vals.split("to")[0], last = vals.split("to")[1];
    const main = ppText([`${positional[0] || "0 to 1"} for 11`, "0 to 100"], { key: flatKey, key1: "%", round: named.round, round1: named.round1, type: "critical strike chance", showtype: "false" }, false);
    const ie = ppText([`(${vals})*${ieMod} for 11`, "0 to 100"], { key: flatKey, key1: "%", round: named.round, round1: named.round1, type: "critical strike chance", showtype: "false" }, false);
    if (main === null || ie === null || last == null || first == null) return null;
    return `${main} (+ Infinity Edge ${ie}) (based on critical strike chance)`;
  }
  const mod = named.mod ? `*(${named.mod})` : "";
  const mainDmg = mwExpr(`(${positional[0] || 0})${mod}-(${named.base || 0})`);
  const ieDmg = mwExpr(`(${positional[1] || positional[0] || 0}) * ${named.ie ? `(${named.ie})/100` : ieMod}${mod}`);
  if (mainDmg === null || ieDmg === null) return null;
  const k = flatKey;
  let s = "";
  if (mainDmg && ieDmg) s += "(";
  if (mainDmg) s += `${fmt(Number(mainDmg.toFixed(6)))}${k}` + (ieDmg ? " + " : "");
  if (ieDmg) s += `Infinity Edge ${fmt(Number(ieDmg.toFixed(6)))}${k}`;
  if (mainDmg && ieDmg) s += ")";
  return s;
}

module.exports = { mwExpr, ppCompute, ppText, levelNote, rutngtText, criticalDamageText, stringToFormula };
