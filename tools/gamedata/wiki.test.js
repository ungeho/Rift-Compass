// 英語 Wiki の取り込みの解析（ネットワークを使わない）
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("./wiki");
const L = require("./lib");

test("ページの URL：空白は _、/ と : はそのまま", () => {
  assert.equal(W.pageUrl("Template:Data Darius/Decimate"), "https://wiki.leagueoflegends.com/en-us/Template:Data_Darius/Decimate");
  assert.equal(W.pageUrl("Module:ItemData/data/Zhonya's Hourglass"), "https://wiki.leagueoflegends.com/en-us/Module:ItemData/data/Zhonya's_Hourglass");
});

test("値：数・ランク別（/・ap の列挙・ap の a to b）・数式。解析できないものは理由を返す", () => {
  assert.deepEqual(W.parseValue("70").values, [70]);
  assert.deepEqual(W.parseValue("{{fd|0.25}}").values, [0.25]);
  assert.deepEqual(W.parseValue("9 / 8 / 7").values, [9, 8, 7]);
  assert.deepEqual(W.parseValue("{{ap|60|90|120}}").values, [60, 90, 120]);
  assert.deepEqual(W.parseValue("{{ap|9 to 4}}", 5).values, [9, 7.75, 6.5, 5.25, 4]);
  assert.deepEqual(W.parseValue("{{ap|100*0.35 to 140*0.35}}", 5).values, [35, 38.5, 42, 45.5, 49]);
  assert.equal(W.parseValue("{{ap|10 to 50}}", 1).reason, "ap_range_without_ranks"); // ランク数が分からなければ補間しない
  // 表示用の記法（tip・tt）だけを除けば数になるものは読む（simplified の印を付ける）。記法だけなら未解析
  assert.deepEqual(W.parseValue("{{tip|melee}} 175").values, [175]);
  assert.equal(W.parseValue("{{tip|melee}} 175").simplified, true);
  assert.equal(W.parseValue("{{tip|global}}").reason, "template:tip");
  // 式の中の複数の範囲は同じ段階で同時に補間する（Template:Ability progression/doc）
  assert.deepEqual(W.parseValue("{{ap|(12 to 22)*(25 to 55)/100}}", 5).values, [3, 4.7125, 6.8, 9.2625, 12.1]);
  assert.deepEqual(W.parseValue("{{ap|75/7|round=2}}").values, [10.714286]);
  assert.equal(W.parseValue("Varies").reason, "text");
});

test("テンプレートの引数：入れ子の {{ }}・[[ ]] の中の | では区切らない", () => {
  const p = W.templateParams("{{Infobox unit\n|name = Gromp\n|hp = {{Jungle monster stat|2050|hp}}\n|link = [[Gold|g]]\n}}\nbody");
  assert.equal(p.name, "Gromp");
  assert.equal(p.hp, "{{Jungle monster stat|2050|hp}}");
  assert.equal(p.link, "[[Gold|g]]");
});

test("leveling：ラベル・ランク別の基本値・係数（ランク別の係数を含む）", () => {
  const l = W.parseLeveling("{{st|Physical Damage|{{ap|50 to 170}} {{as|(+ {{ap|100 to 140}}% AD)}}}} {{st|Magic Damage|300 / 400 / 500 {{as|(+ 120% AP)}}}}", 5);
  assert.equal(l[0].label, "Physical Damage");
  assert.deepEqual(l[0].base.values, [50, 80, 110, 140, 170]);
  assert.deepEqual(l[0].ratios[0], { percent: [100, 110, 120, 130, 140], of: "AD" });
  assert.deepEqual(l[1].base.values, [300, 400, 500]);
  assert.deepEqual(l[1].ratios[0], { percent: 120, of: "AP" });
});

test("Lua：local の参照・長い文字列・長いコメント", () => {
  const r = W.parseLuaChunk(`-- <pre>
local T = { ["A"] = true }
local Physical = "Physical"
return {
  ["x"] = { ["type"] = Physical, ["props"] = T, ["note"] = [=[
  * changed to {{as|65% AP}}
  ]=] },
  --[=[ comment with [[links]] ]=]
}`);
  assert.equal(r.value.x.type, "Physical");
  assert.deepEqual(r.value.x.props, { A: true });
  assert.match(r.value.x.note, /changed to/);
});

test("記事：見出しと数だけを返し、本文は返さない", () => {
  const m = W.articleMeta("Intro text.\n== Notes ==\n* a {{tip|x}}\n=== Sub ===\n[[Link]]");
  assert.deepEqual(m.headings, [{ level: 2, title: "Notes" }, { level: 3, title: "Sub" }]);
  assert.equal(m.templates_used, 1);
  assert.equal(m.links, 1);
  assert.equal(Object.keys(m).includes("text"), false);
});

test("取得の条件：api.php を使わず raw、ライセンスを記録", () => {
  assert.equal(W.LICENSE.name, "CC BY-SA 3.0");
  assert.match(W.UA, /RiftCompass/);
  assert.equal(typeof L.parseLuaTable, "function");
});

test("データのテンプレート：#vardefine・#var・#expr を置き換え、呼び出しの本体から引数を読む", () => {
  const text = "<!-- c -->{{#vardefine:b1|10}}{{#vardefine:b2|70}}{{{{{1<noinclude>|Ability data</noinclude>}}}|The Darkin Blade|{{{2|}}}\n|champion = Aatrox\n|skill = Q\n|leveling = {{st|Damage|{{ap|{{#var:b1}} to {{#var:b2}}}}}}\n|cooldown = {{#expr:{{#var:b2}}/10}}\n}}";
  const { params, vars } = W.dataTemplateParams(text);
  assert.deepEqual(vars, { b1: "10", b2: "70" });
  assert.equal(params.champion, "Aatrox");
  assert.equal(params.cooldown, "7");
  assert.deepEqual(W.structureTemplate(params, 5).leveling[0].base.values, [10, 25, 40, 55, 70]);
});

test("{{ap}}：Wiki の説明（Template:Ability progression/doc）の例どおりに展開する", () => {
  assert.deepEqual(W.parseValue("{{ap|60 to 200}}", 5).values, [60, 95, 130, 165, 200]);
  assert.deepEqual(W.parseValue("{{ap|60 to 200}}", 3).values, [60, 130, 200]); // 究極スキルの既定は3
  assert.deepEqual(W.parseValue("{{ap|60 to 200 4}}", 5).values.length, 4); // 末尾の数が優先
  assert.deepEqual(W.parseValue("{{ap|2*x}}", 5).values, [2, 4, 6, 8, 10]);
  assert.deepEqual(W.parseValue("{{ap|(85 to 225)*(1+(0.3 to 0.5))}}", 5).values, [110.5, 162, 217, 275.5, 337.5]);
  assert.deepEqual(W.parseValue("{{ap|1|3 to 9 4|10}}", 5).values, [1, 3, 5, 7, 9, 10]);
  assert.equal(W.parseValue("{{ap|1 to 10 to 40}}", 5).ok, false); // 多段は扱わない
  assert.equal(W.parseValue("{{ap|1|3 to 9|10}}", 5).reason, "ap_part_without_count");
  assert.equal(W.parseValue("{{ap|10 to 50}}", 0).reason, "ap_range_without_ranks"); // パッシブは補間しない
});

test("leveling：1つの {{st}} の複数の組を分け、係数の値を基礎値と取り違えない", () => {
  const l = W.parseLeveling("{{st|Blade|{{ap|50 to 170}} {{as|(+ {{ap|100 to 140}}% AD)}}|Handle|{{ap|50*0.35 to 170*0.35}} {{as|(+ {{ap|100*0.35 to 140*0.35}}% AD)}}}}", 5);
  assert.deepEqual(l.map((x) => x.label), ["Blade", "Handle"]);
  assert.equal(l[0].ratios.length, 1);
  assert.deepEqual(l[1].base.values, [17.5, 28, 38.5, 49, 59.5]);
  // 基礎値が未解決の変数を含むときは、後ろの係数の {{ap}} を基礎値にしない
  const n = W.parseLeveling("{{st|Last Tick|{{ap|120/{{#var:t}} to 360/{{#var:t}}}} {{as|(+ {{ap|12 to 22}}% of target's missing health)}}}}", 5);
  assert.equal(n[0].base, null);
  assert.equal(n[0].reason, "base_nested_template");
  assert.deepEqual(n[0].ratios[0].percent, [12, 14.5, 17, 19.5, 22]);
});
