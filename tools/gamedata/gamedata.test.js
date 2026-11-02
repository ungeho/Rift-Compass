// ゲームデータの取り込みの道具と、取り込んだデータ・Topic の整合（node --test）
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const L = require("./lib");
const { ROLE_TOPICS } = require("./ingest");

const ROOT = path.resolve(__dirname, "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const manifest = read("public/gamedata/manifest.json");
const version = manifest.current.ddragon;
const ddIndex = read(`public/gamedata/ddragon/${version}/index.json`);
const data = read("data/sample-resources.json");

test("Lua のテーブル：文字列・数値・配列・入れ子・コメント・数式", () => {
  const v = L.parseLuaTable(`-- <pre>
return {
  ["A"] = { ["id"] = 1, ["name"] = "a\\"b", ["list"] = {"Top","Jungle"}, ["skills"] = {[1] = "x", [2] = "y"},
    ["stats"] = { ["hp_lvl"] = 84+1000/17, ["neg"] = -0.1, ["flag"] = true }, --[[ block ]] ["n"] = nil },
}
-- </pre>`);
  assert.equal(v.A.name, 'a"b');
  assert.deepEqual(v.A.list, ["Top", "Jungle"]);
  assert.deepEqual(v.A.skills, ["x", "y"]);
  assert.ok(Math.abs(v.A.stats.hp_lvl - (84 + 1000 / 17)) < 1e-12);
  assert.deepEqual(v.A.stats.__expr, { hp_lvl: "84+1000/17" }); // 元の式を残す
  assert.equal(v.A.stats.neg, -0.1);
  assert.equal(v.A.stats.flag, true);
  assert.equal(v.A.n, null);
});

test("Wiki の形態はキーの整数部分でまとめ、Data Dragon と違いの最も少ない形態と比べる", () => {
  const wiki = { Kled: { id: 240, apiname: "Kled", stats: { hp_base: 410, range: 250 } }, "Kled & Skaarl": { id: 240.1, apiname: "Kled", stats: { hp_base: 810, range: 125 } } };
  const r = L.crossCheck([{ id: "Kled", key: "240", stats: { hp: 810, attackrange: 125 } }], wiki);
  assert.deepEqual(r.diffs, []);
  assert.equal(r.multiForm[0].compared_with, "Kled & Skaarl");
});

test("版の違い：基本ステータスとスキルの CD を比べる", () => {
  const a = [{ id: "X", stats: { hp: 600 } }], b = [{ id: "X", stats: { hp: 610 } }, { id: "Y", stats: {} }];
  const sp = (cd) => ({ X: { spells: [{ slot: "Q", maxrank: 5, cooldownBurn: cd, costBurn: "0", rangeBurn: "600", maxammo: "-1", tooltip: { en: "t" } }] } });
  const r = L.diffVersions(a, b, sp("9/8/7/6/5"), sp("9/7.75/6.5/5.25/4"));
  assert.deepEqual(r.added, ["Y"]);
  assert.deepEqual(r.changed[0].stats, [{ stat: "hp", from: 600, to: 610 }]);
  assert.equal(r.changed[0].spells[0].field, "cooldownBurn");
});

test("Topic の ID は英語名から作る（既存の champ-twisted-fate と同じ規則）", () => {
  assert.equal(L.championTopicId("Twisted Fate"), "champ-twisted-fate");
  assert.equal(L.championTopicId("Kai'Sa"), "champ-kaisa");
  assert.equal(L.championTopicId("Dr. Mundo"), "champ-dr-mundo");
  assert.equal(L.championTopicId("Nunu & Willump"), "champ-nunu-willump");
});

test("あいまいな名前：ほかのカタカナ語の一部だけを数え、ロール名などとの連結は数えない", () => {
  assert.deepEqual(L.ambiguousInRuns("ナー", ["ナーフ", "ミッドナー"], ["ミッド"]), ["ナーフ"]);
  assert.deepEqual(L.ambiguousInRuns("ゼド", ["ミッドゼド", "ゼドビルド"], ["ミッド", "ビルド"]), []);
});

test("全チャンピオン：Data Dragon の全件に Topic があり、cat-champions の子になっている", () => {
  const topics = new Map(data.topics.map((t) => [t.id, t]));
  assert.equal(ddIndex.count, ddIndex.champions.length);
  for (const c of ddIndex.champions) {
    const t = topics.get(c.topic_id);
    assert.ok(t, `${c.id} の Topic ${c.topic_id} がない`);
    assert.ok(t.parent_ids.includes("cat-champions"), `${c.topic_id} が cat-champions の子でない`);
    assert.equal(t.label_ja, c.name.ja ?? t.label_ja);
  }
  const champTopics = data.topics.filter((t) => t.parent_ids.includes("cat-champions"));
  assert.equal(champTopics.length, ddIndex.champions.length, "チャンピオンの Topic と Data Dragon の件数が同じ");
  // 既存の ID は変えていない
  for (const id of ["champ-jax", "champ-veigar", "champ-twisted-fate", "champ-malzahar", "champ-mordekaiser", "champ-zed", "champ-lux"]) assert.ok(topics.has(id));
});

test("5ロール（ポジション）は大分類で、チャンピオンをロールの子にしない", () => {
  const roleIds = ["role-top", "role-jungle", "role-mid", "role-bot", "role-support"];
  for (const id of roleIds) assert.equal(data.topics.find((t) => t.id === id)?.kind, "category", id);
  for (const t of data.topics) assert.ok(!t.parent_ids.some((p) => roleIds.includes(p)), `${t.id} がロールの子になっている`);
  assert.equal(ROLE_TOPICS.length, 4); // role-mid は既存
});

test("チャンピオンクラス：全チャンピオンに Data Dragon の tags があり、classes.json と一致する（ポジションとは別）", () => {
  const classes = read(`public/gamedata/ddragon/${version}/classes.json`);
  assert.equal(classes.source.version, version);
  for (const c of ddIndex.champions) {
    assert.ok(c.tags.length >= 1, `${c.id} のクラスがない`);
    assert.deepEqual(classes.by_champion[c.id], c.tags);
    for (const tag of c.tags) assert.ok(classes.classes[tag].includes(c.id));
  }
  assert.deepEqual(Object.keys(classes.classes).sort(), ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"]);
});

test("個別のファイル：出典と版を持ち、スキルは4つ（Q・W・E・R）とパッシブ", () => {
  for (const c of ddIndex.champions) {
    const f = read(`public/gamedata/ddragon/${version}/champions/${c.id}.json`);
    assert.equal(f.source.version, version);
    assert.deepEqual(f.spells.map((s) => s.slot), ["Q", "W", "E", "R"]);
    assert.ok(f.passive.name.en);
    assert.ok(f.name.ja, `${c.id} の日本語名がない`);
  }
});

test("Wiki のデータ：全チャンピオンに対応する項目があり、攻撃速度の反映率がある", () => {
  const revid = manifest.current.wiki_championdata;
  for (const c of ddIndex.champions) {
    const w = read(`public/gamedata/wiki-championdata/${revid}/by-key/${c.key}.json`);
    assert.ok(w.forms.length >= 1);
    for (const f of w.forms) assert.equal(typeof f.stats.as_ratio, "number", `${f.form} の as_ratio`);
  }
});

test("既知の不具合：攻撃力の成長値が全件0の版は一覧に記録し、生の値はファイルにそのまま残す", () => {
  for (const v of manifest.ddragon) {
    const idx = read(`public/gamedata/ddragon/${v.version}/index.json`);
    assert.deepEqual(idx.known_issues.map((k) => k.field), ["attackdamageperlevel"], v.version);
    assert.ok(idx.champions.every((c) => c.stats.attackdamageperlevel === 0));
  }
  // 16.4.1 のように0がセナだけの版では当てはまらない
  const fake = [{ stats: { attackdamageperlevel: 0 } }, { stats: { attackdamageperlevel: 5 } }, { stats: { attackdamageperlevel: 3 } }];
  assert.deepEqual(L.knownIssuesFor(fake), []);
});

test("パッシブ：全チャンピオンに日英の名前・説明がある（Q・W・E・R の692件とは別）", () => {
  let n = 0;
  for (const c of ddIndex.champions) {
    const f = read(`public/gamedata/ddragon/${version}/champions/${c.id}.json`);
    assert.ok(f.passive.name.en && f.passive.name.ja && f.passive.description.en && f.passive.description.ja, c.id);
    n++;
  }
  assert.equal(n, 173);
});

test("版の対応：Data Dragon の全版に、ゲームのパッチ番号を別の項目として根拠つきで記録する", () => {
  const versions = read("public/gamedata/versions.json");
  for (const v of manifest.ddragon) {
    const e = versions.ddragon.find((x) => x.ddragon === v.version);
    assert.ok(e, v.version);
    assert.match(e.game_patch, /^\d+\.\d+$/);
    assert.notEqual(e.game_patch, e.ddragon);
    assert.ok(e.status.includes("推定"), "対応は推定として記録する");
    assert.ok(e.evidence.length >= 1);
  }
  assert.ok(versions.wiki_championdata.every((w) => !("game_patch" in w)), "Wiki の revid をパッチとして扱わない");
});

test("Wiki との照合：違いはすべて状態（既知の不具合・説明できる・未解決）を持ち、未解決は残す", () => {
  const r = read(`public/gamedata/ddragon/${version}/report.json`);
  for (const d of r.cross_check.diffs) assert.ok(["known_issue", "explained", "unresolved"].includes(d.status), `${d.id} ${d.stat}`);
  assert.equal(r.cross_check.diffs.filter((d) => d.status === "known_issue").length, 172);
  assert.ok(r.cross_check.diffs.filter((d) => d.status !== "known_issue").every((d) => d.note || d.status === "unresolved"));
  assert.equal(r.cross_check.unresolved, r.cross_check.diffs.filter((d) => d.status === "unresolved").length);
});

test("古い版も残す（manifest の全版にファイルがある）", () => {
  assert.ok(manifest.ddragon.length >= 2);
  for (const v of manifest.ddragon) assert.ok(fs.existsSync(path.join(ROOT, `public/gamedata/ddragon/${v.version}/index.json`)), v.version);
});

test("英語 Wiki の取り込み：取得日・ライセンス・取得の条件を記録し、全チャンピオンのスキルのファイルがある", () => {
  const snap = manifest.current.wiki_snapshot;
  assert.ok(snap, "manifest.current.wiki_snapshot");
  const cov = read(`public/gamedata/wiki/${snap}/coverage.json`);
  assert.equal(cov.license.name, "CC BY-SA 3.0");
  assert.match(cov.access.robots, /api\.php/);
  for (const d of ["abilities", "items", "runes", "modules", "units", "articles"]) {
    const c = cov.domains[d];
    assert.ok(c, d);
    assert.equal(c.fetched + c.not_found + c.failed + 0, c.discovered, `${d}：発見＝取得＋未発見＋失敗`);
  }
  for (const c of ddIndex.champions) {
    const f = read(`public/gamedata/wiki/${snap}/abilities/${c.key}.json`);
    assert.ok(f.templates.length >= 5, c.id);
    for (const t of f.templates) {
      assert.match(t.source.url, /^https:\/\/wiki\.leagueoflegends\.com\/en-us\//);
      if (t.source.status === 200 && !t.redirect_to) assert.ok(Object.keys(t.params).length > 0, `${t.title} の引数`);
    }
  }
});

test("ポジション → チャンピオンの一覧：出典の revid を持ち、全チャンピオンに届く", () => {
  const p = read(`public/gamedata/wiki-championdata/${manifest.current.wiki_championdata}/positions.json`);
  assert.equal(p.source.revid, manifest.current.wiki_championdata);
  const all = new Set(Object.values(p.roles).flatMap((r) => r.client.map((c) => c.id)));
  assert.equal(all.size, ddIndex.champions.length);
});
