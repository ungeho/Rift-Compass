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
  assert.equal(W.parseValue("Varies").keyword, "varies"); // 文の値はキーワードとして持つ（数にしない）
  assert.equal(W.parseValue("some text").reason, "text");
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

test("Passive progression：a to b はレベル1〜18に補間、then を含む式は推測せず pp_complex", () => {
  const v = W.parseValue("{{pp|50 to 80}}", 5);
  assert.equal(v.kind, "progression");
  assert.equal(v.values.length, 18);
  assert.equal(v.values[0], 50);
  assert.equal(v.values[17], 80);
  assert.equal(v.basis_label, "level");
  assert.equal(W.parseValue("{{pp|30 to 70 by 10; 80 for 2}}", 5).reason, "pp_complex");
});

test("dv・tt・キーワード：形態ごとの値、説明つきの値、文の値を分けて持つ", () => {
  const dv = W.parseValue("{{dv|10|20}}", 5);
  assert.equal(dv.kind, "variants");
  assert.deepEqual(dv.variants.map((x) => x.values[0]), [10, 20]);
  const tt = W.parseValue("{{tt|5|Starts post-effect}}", 5);
  assert.deepEqual(tt.values, [5]);
  assert.equal(tt.note, "Starts post-effect");
  assert.equal(W.parseValue("global", 5).keyword, "global");
});

test("説明の文：sti は2つ目の引数、記号は文字に、知らない記法は ⟦⟧ で残して翻訳の対象から外す", () => {
  const p = W.plainText("{{sti|health|below 30% health}} and 625{{times}}180 {{unknownthing|x}}");
  assert.equal(p, "below 30% health and 625×180 ⟦unknownthing⟧");
  // 外側のテンプレートの中にあっても印が壊れない（{{as|{{pp|解けない式}}|physical damage}}）。
  // 「then」「x の式」は Module:Ability progression と同じに解けるようになったので、記号の残る式で確かめる
  const nested = W.plainText("deal {{as|{{pp|foo*bar for 9|formula=x}}|physical damage}} bonus damage");
  assert.equal(nested.replace(/⟦[^⟦⟧]*⟧/g, "X"), "deal X bonus damage");
  assert.equal(W.hasResidual(p), true);
  assert.equal(W.hasResidual("below 30% health"), false);
});

test("取り込んだ Ekko R の説明の文に記法（label1= など）が残っていない", () => {
  const f = require("../../public/gamedata/wiki/2026-11-02/abilities/245.json");
  const r = f.templates.find((t) => t.name === "Chronobreak");
  for (const [k, v] of Object.entries(r.text)) {
    assert.doesNotMatch(v.plain, /\{\{|\}\}|label\d*=|\[\[/, k);
    assert.equal(v.residual, false, k);
  }
  assert.match(r.text.description2.plain, /stasis/);
});

test("計算の段階：Darius Q は computable（物理・ランク・合計攻撃力）", () => {
  const f = require("../../public/gamedata/wiki/2026-11-02/abilities/122.json");
  const q = f.templates.find((t) => t.name === "Decimate");
  assert.deepEqual(q.leveling[0].calc, { stage: "computable", damage_type: "physical", base_basis: "rank", inputs: ["total_ad"] });
});

test("変更履歴：版と行数だけ。アイテムの変更の文は保存しない（チャンピオンはスキル名などの項目名だけ）", () => {
  const items = require("../../public/gamedata/wiki/2026-11-02/history/items.json");
  const ie = items.entries["Infinity Edge"];
  assert.ok(ie.versions.length > 0);
  assert.ok(ie.versions.every((v) => v.subjects.length === 0 && v.lines >= 0));
  assert.doesNotMatch(JSON.stringify(items), /increased to \d+ from/);
  const champs = require("../../public/gamedata/wiki/2026-11-02/history/champions.json");
  const subj = Object.values(champs.entries).flatMap((e) => (e.versions || []).flatMap((v) => v.subjects));
  assert.ok(subj.length > 0);
  assert.ok(subj.every((s) => s.length <= 40 && !/\d/.test(s)));
});

test("説明の文：{{g|N}} はゴールドの数として残す（数だけにしない）", () => {
  assert.equal(W.plainText("granting him {{g|1}} and {{as|1 ability power}}"), "granting him 1 gold and 1 ability power");
});

test("説明の文：アイコンだけのツールチップ（icononly）は文字を残さない", () => {
  assert.equal(W.plainText("revealed to enemy champions in a {{tip|er|icononly = true}} 1250 radius"), "revealed to enemy champions in a 1250 radius");
  assert.equal(W.plainText("{{tip|stasis|Stasis}} for 2.5 seconds"), "Stasis for 2.5 seconds");
});

test("pp・pplevel：Module:Ability progression と同じ展開と表示（then・x の式・by・基準の行・レベル 18 まで）", () => {
  const P = require("./pp");
  assert.equal(P.ppText(["27 + 3*x for 3; then +6*x for 3; then +9*x for 4; then +12*x for 5; then +15*x for 5"], {}, false), "30 – 225 (based on level)");
  assert.equal(P.ppText(["0 to 100 by 20", "0 to 5"], { key: "%", type: "stacks" }, false), "0% – 100% (based on stacks)");
  assert.equal(P.ppText(["12 to 24 for 7", "1;3 to 18"], { key: "%" }, false), "12% – 24% (based on level)");
  // 5段階以下は「/」で並べる。changedisplay=true は逆
  assert.equal(P.ppText(["1;2;3"], {}, false), "1 / 2 / 3 (based on level)");
  assert.equal(P.ppText(["25;42;69;96", "0 to 0.75"], { key: "%", type: "seconds elapsed", changedisplay: "true" }, false), "25% – 96% (based on seconds elapsed)");
  // pplevel はレベル 18 までの値を表示する（Jax W：レベル 19 の 14% ではなく 12.5%）
  assert.equal(P.ppText(["5 to 14 for 7", "1 to 19"], { key: "%" }, true), "5% – 12.5% (based on level)");
  assert.equal(P.ppText(["3 to 18", "1;6;11;19;24;30"], { key: "%" }, true), "3% / 6% / 9% (based on level)");
  // 式の記号が残る段階は推測で読まない
  assert.equal(P.ppText(["foo*bar for 3"], {}, false), null);
  assert.equal(P.ppText(["45;90;infinite", "0;40;80"], { type: "stacks" }, false), "45 / 90 / infinite (based on stacks)");
});

test("説明の文：rutngt・critical damage・ccd・#expr・#vardefineecho・adaptive・recurring・rd の pp=true", () => {
  const ctx = {
    vars: { q: "{{pp|0 to 70 for 11|0 to 1.25|key=%|type=charge time}}" },
    ccd: (c, k) => ({ "Master Yi": { crit_base: 200 }, Kled: { ms: 305 }, "Kled & Skaarl": { ms: 345 } }[c] || {})[k],
    cid: (i, k) => (i === "Infinity Edge" && k === "critdamage" ? 40 : undefined),
  };
  assert.equal(W.plainText("after {{rutngt|0.5}}", ctx), "after 0.528 seconds (0.5 seconds rounded up to the next game tick)");
  assert.equal(W.plainText("after {{rutngt|0.33}}", ctx), "after 0.33 seconds");
  assert.equal(W.plainText("for {{critical damage|({{ccd|Master Yi|crit_base}}-100)*1+100|1*100}} damage", ctx), "for (200% + Infinity Edge 40%) damage");
  assert.equal(W.plainText("by {{#expr:{{ccd|Kled & Skaarl|ms}}-{{ccd|Kled|ms}}}}", ctx), "by 40");
  assert.equal(W.plainText("increased by {{#var:q}}", ctx), "increased by 0% – 70% (based on charge time)");
  assert.equal(W.plainText("Gain {{#vardefineecho:b|3}}% up to {{#expr:{{#var:b}}*6}}%", ctx), "Gain 3% up to 18%");
  assert.equal(W.plainText("gain {{adaptive|8}}", ctx), "gain 4.8 bonus Attack Damage or 8 Ability Power (Adaptive)");
  assert.equal(W.plainText("every {{fd|1.3{{recurring|3}}}} seconds", ctx), "every 1.333… seconds");
  assert.equal(W.plainText("heal for {{rd|10 to 20 for 3|5 to 10 for 3|pp=true}}", ctx), "heal for 10 / 15 / 20 (melee) / 5 / 7.5 / 10 (ranged) (based on level)");
  // 決まらない変数・データのない ccd は推測せず解けない記法として残す
  assert.equal(W.hasResidual(W.plainText("{{#var:nothing}}", ctx)), true);
  assert.equal(W.hasResidual(W.plainText("{{ccd|Nobody|ms}}", ctx)), true);
  // 式のまま残った x は解けていない
  assert.equal(W.hasResidual("heals for 15+(145/17)*(x-1) for 20"), true);
});

test("pp の安全：刻み幅0・負・数でない刻み、逆向き・巨大な範囲、巨大な段階の数は展開せず、すぐに失敗を返す", () => {
  const P = require("./pp");
  const W = require("./wiki");
  const t0 = Date.now();
  // pp.js（説明の文）：段階は Module と同じく41まで。超える・数でないときは null（解けない記法として保留）
  for (const args of [["0 to 100 by 0"], ["0 to 100 by -5"], ["0 to 100 by abc"], ["0 to 1e12 by 1"], ["1 to 2 for 1e9"], ["1 to 2 for 0"], ["x*2 for 1e9"], ["x*2 for -1"]]) {
    assert.equal(P.ppText(args, {}, false), null, args[0]);
  }
  // 基準の行の巨大な範囲も同じ
  assert.equal(P.ppText(["1 to 2", "0 to 1e12 by 1"], {}, false), null);
  // wiki.js の parsePp（構造化）：刻み幅0・負・巨大な範囲・巨大な段階の数は pp_complex
  for (const a of [["10 to 20", "1 to 100 by 0"], ["10 to 20", "1 to 1000000000 by 1"], ["10 to 20", "1 to 100 by 0.0000001"], ["10 to 20 for 100000000"], ["10 to 20 for 0"]]) {
    const r = W.parsePp(a, 18);
    assert.equal(r.ok, false, a.join("|"));
  }
  // 負の刻み幅は範囲の書き方に一致しないので、展開せず文字のまま扱う（ループしない）
  const neg = W.parsePp(["10 to 20", "1 to 100 by -1"], 18);
  assert.ok(!neg.ok || !(neg.basis && neg.basis.length > 41));
  assert.ok(Date.now() - t0 < 2000, "すぐに終わる");
  // 通常の指定はこれまでどおり
  assert.equal(P.ppText(["0 to 100 by 20", "0 to 5"], { key: "%", type: "stacks" }, false), "0% – 100% (based on stacks)");
});

test("レベル18を超える値の記録：Electrocute は表示 70 – 260（レベル20まで）、レベル18は 240（Data Dragon の 70-240 と一致）", () => {
  const P = require("./pp");
  assert.deepEqual(P.levelNote(["60 + 10 * x", "1 to 20 by 1"], {}, false), { kind: "shown_beyond_18", first: "70", at_level_18: "240", max_level: 20, at_max_level: "260", shown_last_level: 20 });
  // pplevel は表示がレベル18まで（Jax W：12.5%）。原典にはレベル19の値 14% もある
  assert.deepEqual(P.levelNote(["5 to 14 for 7", "1 to 19"], { key: "%" }, true), { kind: "hidden_beyond_18", first: "5%", at_level_18: "12.5%", max_level: 19, at_max_level: "14%", shown_last_level: 16 });
  // レベル18までの値・基準がレベルでないもの（スタック・時間）は記録しない
  assert.equal(P.levelNote(["15 to 100"], {}, false), null);
  assert.equal(P.levelNote(["0 to 70 for 11", "0 to 1.25"], { key: "%", type: "charge time" }, false), null);
  // 取り込んだルーンの文：表示は変えずに記録が付く
  const fs = require("node:fs"), path = require("node:path");
  const ru = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/gamedata/wiki/2026-11-02/runes.json"), "utf8")).runes.find((r) => r.name === "Electrocute");
  assert.match(ru.text.description.plain, /70 – 260 \(based on level\)/);
  assert.equal(ru.text.description.level_notes[0].at_level_18, "240");
});

test("lcfirst・ucfirst（マジックワード）", () => {
  const W = require("./wiki");
  assert.equal(W.plainText("which {{lcfirst:Grants sight}}."), "which grants sight.");
  assert.equal(W.plainText("{{ucfirst:abc}}"), "Abc");
});

test("Named item effect の表：共有・単独・互いに関係する効果の名前とアイテム（説明の文は持たない）", () => {
  const W = require("./wiki");
  const raw = [
    "== Shared effects ==", "{| class=\"article-table\"", "!Name", "!Effect", "!Items", "|-", "|{{anchor|Annul}}'''Annul'''", "|Grants a spell shield.", "|{{ii|Verdant Barrier}}<br />{{ii|Banshee's Veil}}", "|}",
    "=== Grouped shared effects ===", "{| class=\"article-table\"", "!Group", "!Name", "!Effect", "!Items", "|-",
    "|rowspan=\"2\"|{{anchor|X}}'''Jungle Companions''' / '''Evolution Buff'''", "|'''Jungle Companions'''", "|Summon a pet.", "|rowspan=\"2\"|{{ii|Gustwalker Hatchling}}<br>{{ii|Scorchclaw Pup}}",
    "|-", "|'''Gustwalker's Gait / Scorchclaw's Slash'''", "|Consumes the item.", "|}",
    "== Isolated effects ==", "{| class=\"article-table\"", "!Name", "!Effect", "!Item", "|-", "|{{anchor|Anguish}}'''Anguish'''", "|Deal damage.", "|{{ii|Unending Despair}}", "|}",
    "== Archive ==", "* x",
  ].join("\n");
  const r = W.parseNamedItemEffects(raw);
  assert.deepEqual(r.map((x) => [x.name, x.kind, x.group ?? null, x.items.join(",")]), [
    ["Annul", "shared", null, "Verdant Barrier,Banshee's Veil"],
    ["Jungle Companions", "shared", "Jungle Companions / Evolution Buff", "Gustwalker Hatchling,Scorchclaw Pup"],
    ["Gustwalker's Gait", "shared", "Jungle Companions / Evolution Buff", "Gustwalker Hatchling,Scorchclaw Pup"],
    ["Scorchclaw's Slash", "shared", "Jungle Companions / Evolution Buff", "Gustwalker Hatchling,Scorchclaw Pup"],
    ["Anguish", "isolated", null, "Unending Despair"],
  ]);
  assert.ok(r.every((x) => !("description" in x)));
});

test("同時に持てる数の制限（Module:ItemData/getter の p.itemlimit・p.limit を写したもの）", () => {
  const W = require("./wiki");
  const by = new Map([["Manamune", { itemlimit: "Manaflow" }]]);
  assert.deepEqual(W.itemLimitGroups("Sterak's Gage", { itemlimit: "Lifeline", type: ["Legendary"] }, by), [{ group: "Lifeline", rule: "Limited to 1 Lifeline item." }]);
  // グループがない Legendary は同じアイテム1つまで
  assert.deepEqual(W.itemLimitGroups("Thornmail", { type: ["Legendary"] }, by), [{ group: "legendary", rule: "Limited to 1 Thornmail." }]);
  // "=>アイテム名" は参照先の値（Muramana → Manamune の Manaflow）
  assert.deepEqual(W.itemLimitGroups("Muramana", { itemlimit: "=>Manamune", type: ["Legendary"] }, by).map((x) => x.group), ["Manaflow"]);
  assert.deepEqual(W.itemLimitGroups("Berserker's Greaves", { type: ["Boots"] }, by).map((x) => x.group), ["Boots"]);
  assert.match(W.itemLimitGroups("Elixir of Iron", { itemlimit: "Elixir", type: ["Elixir"] }, by)[0].rule, /replace the existing one's effects/);
  // 制限の文：trinket・warding の語は定型の文に、champion は「Only available to」
  assert.equal(W.itemLimitText({ limit: "trinket,warding" }), "Switching to another trinket keeps the current cooldown, if there is any. A player may only have 3 {{tip|Stealth Ward|Stealth Wards}} or {{tip|Totem Ward|Totem Wards}} on the map at one time.");
  assert.equal(W.itemLimitText({ limit: "Limited to 1 '''Black Spear'''.", champion: ["Kalista", "Sylas"] }), "Limited to 1 '''Black Spear'''. Only available to {{ci|Kalista}} and {{ci|Sylas}}.");
  assert.equal(W.itemLimitText({}), "");
});

test("回帰：Katarina のパッシブ（pplevel）はレベル18の 240 まで表示し、レベル20の 275 は記録だけ", () => {
  const fs = require("node:fs"), path = require("node:path");
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/gamedata/wiki/2026-11-02/abilities/55.json"), "utf8"));
  const t = j.templates.find((x) => x.title === "Template:Data Katarina/Voracity").text.description2;
  assert.match(t.plain, /68 – 240 \(based on level\)/);
  assert.doesNotMatch(t.plain, /275/);
  assert.deepEqual(t.level_notes, [{ kind: "hidden_beyond_18", first: "68", at_level_18: "240", max_level: 20, at_max_level: "275", shown_last_level: 18 }]);
});
