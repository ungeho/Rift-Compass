"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { project, load, safeUrl, run } = require("./build");
const os = require("node:os");
const root = path.resolve(__dirname, "../..");
const input = () => structuredClone(load(root));

test("整合検査はLFとCRLFだけを同一視し、内容・順序・空白・欠損・追加を検出する", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "rift-sources-check-"));
  const data = input();
  const inputs = {
    "data/sources/catalog.json": data.catalog, "data/sources/manual-candidates.json": data.manual,
    "data/candidates/sources.json": data.collections, "data/candidates/candidates.json": data.candidates,
    "data/candidates/reviews.json": data.reviews, "data/sample-resources.json": data.dataset,
  };
  for (const [name, value] of Object.entries(inputs)) {
    const file = path.join(fixture, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }
  run(false, fixture);
  const dir = path.join(fixture, "public/sources"), file = path.join(dir, "lolgaren.json");
  const original = fs.readFileSync(file, "utf8");
  assert.doesNotThrow(() => run(true, fixture));
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\n/g, "\r\n"));
  }
  assert.doesNotThrow(() => run(true, fixture));
  const object = JSON.parse(original);
  for (const change of [
    (o) => { o.candidates[0].title = "changed"; },
    (o) => { o.candidates.reverse(); },
    (o) => { o.candidates.pop(); },
    (o) => { o.candidates.push(o.candidates[0]); },
    (o) => { o.extra = true; },
  ]) {
    const changed = structuredClone(object); change(changed);
    fs.writeFileSync(file, JSON.stringify(changed) + "\r\n");
    assert.throws(() => run(true, fixture), /未生成・古い/);
  }
  for (const changed of [" " + original, original.replace(/\n$/, "\r"), original.replace(/\n$/, ""), original + "\n"]) {
    fs.writeFileSync(file, changed);
    assert.throws(() => run(true, fixture), /未生成・古い/);
  }
  fs.writeFileSync(file, original);
  fs.renameSync(file, file + ".bak");
  assert.throws(() => run(true, fixture), /未生成・古い/);
  fs.renameSync(file + ".bak", file);
  run(false, fixture);
  assert.equal(fs.readFileSync(file, "utf8"), original);
  run(false, fixture);
  assert.equal(fs.readFileSync(file, "utf8"), original);
  fs.writeFileSync(path.join(dir, "unexpected.json"), "{}\n");
  assert.throws(() => run(true, fixture), /廃止されたSource/);
});

test("全候補を保持し、26情報源と未特定の個別動画を分離する。生成は決定的で正本を変更しない", () => {
  const data = input(), before = JSON.stringify(data);
  const files = project(data), index = files.get("index.json");
  assert.equal(index.sources.length, 26);
  assert.equal(index.unassigned.length, 1);
  assert.equal(index.unassigned[0].url, "https://youtu.be/T4d90Hjag5Y");
  assert.equal(index.unassigned[0].registered, false);
  const all = [...files].filter(([name]) => name !== "index.json").flatMap(([, value]) => value.candidates);
  assert.equal(all.length, 2579);
  assert.equal(new Set(all.map((c) => c.key)).size, 2579);
  assert.equal(all.filter((c) => c.triage.status === "excluded").length, 45);
  assert.equal(all.filter((c) => c.title === null).length, 167);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(project(data), files);
  for (const [name, value] of files) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "public/sources", name), "utf8")), value);
});
test("1情報源に複数の収集設定を結べる。情報源・コレクションの件数は混同しない", () => {
  const data = input();
  data.catalog.find((s) => s.id === "lol-guide").collection_ids.push("lol-guide-glossary");
  const file = project(data).get("lol-guide.json");
  assert.equal(file.candidates.length, 184 + 65);
  assert.equal(new Set(file.candidates.map((c) => c.key)).size, file.candidates.length);
});
test("正式資料は現行URL・動画IDの一致で対応。保存済みIDや著者名だけで確定しない", () => {
  const data = input();
  const c = data.candidates.find((c) => c.existing_resource_id);
  const expected = c.existing_resource_id;
  c.existing_resource_id = "res-invalid";
  const files = project(data);
  assert.equal(files.get(`${c.sources[0]}.json`).candidates.find((x) => x.key === c.key).resource_id, expected);
  assert.equal(files.get("index.json").sources.reduce((n, s) => n + s.resource_ids.length, 0), 57); // 候補経由55（2026-11-08 のローム収録のパイロットで res-loltheory-roaming、同日のスプリットプッシュの収録で res-loltheory-split-push が加わった）＋明示的なDopagodの2資料
  const unregistered = data.candidates.find((c) => !c.existing_resource_id && c.creator);
  unregistered.creator = data.dataset.resources[0].creator;
  const projected = project(data).get(`${unregistered.sources[0]}.json`).candidates.find((c) => c.key === unregistered.key);
  assert.equal(projected.registered, false);
});
test("正式登録は本文確認を意味しない。L2資料も確認記録を勝手に補わない", () => {
  const data = input();
  const c = data.candidates.find((c) => data.dataset.resources.some((r) => r.id === c.existing_resource_id && r.verification.level === "L2"));
  delete data.reviews[c.key];
  const projected = project(data).get(`${c.sources[0]}.json`).candidates.find((x) => x.key === c.key);
  assert.equal(projected.registered, true);
  assert.equal(projected.review, null);
});
test("収集機能なしでも登録でき、手動候補も情報源へ明示的に結べる", () => {
  const data = input();
  assert.equal(project(data).get("wardex.json").candidates.length, 0);
  data.manual[0].source_ids = ["wardex"];
  const files = project(data);
  assert.equal(files.get("wardex.json").candidates.length, 1);
  assert.equal(files.get("index.json").unassigned.length, 0);
});
test("危険なURL・参照切れ・重複Source ID・根拠のない接続確認を拒否する", () => {
  for (const mutate of [
    (d) => { d.catalog[0].url = "javascript:alert(1)"; },
    (d) => { d.candidates[0].url = "data:text/html,test"; },
    (d) => { d.catalog[0].collection_ids = ["missing"]; },
    (d) => { d.catalog[0].topic_ids = ["missing"]; },
    (d) => { d.catalog[0].related_resource_ids = ["missing"]; },
    (d) => { d.catalog[1].id = d.catalog[0].id; },
    (d) => { d.manual[0].source_ids = ["missing"]; },
    (d) => { d.catalog[0].presence = { status: "checked", checked_at: null }; },
  ]) { const data = input(); mutate(data); assert.throws(() => project(data)); }
  for (const url of ["javascript:alert(1)", "/relative", "https://user:pass@example.com", "file:///tmp/test"]) assert.equal(safeUrl(url), null);
});
