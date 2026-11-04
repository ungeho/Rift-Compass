#!/usr/bin/env node
// 公開用の投影だけを行う。外部取得・再分類・正本や候補の更新はしない。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { candidateKey, youtubeId } = require("../candidates/lib");

function safeUrl(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
const publicResource = (r) => r.access.free === true && ["L2", "L3", "L4"].includes(r.verification.level);
function project({ catalog, collections, candidates, reviews, dataset, manual }) {
  const fail = (message) => { throw new Error(message); };
  const ids = new Set(), collectionIds = new Set(collections.map((c) => c.id));
  const topics = new Set(dataset.topics.map((t) => t.id));
  const resources = new Map(dataset.resources.map((r) => [r.id, r]));
  const byUrl = new Map();
  for (const r of dataset.resources) {
    const key = candidateKey(r.url);
    if (byUrl.has(key)) fail(`Resource URL が重複: ${key}`);
    byUrl.set(key, r);
  }
  for (const s of catalog) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id) || ids.has(s.id)) fail(`Source ID が不正・重複: ${s.id}`);
    ids.add(s.id);
    if (!s.name || !s.description_ja || !s.coverage_ja || !safeUrl(s.url)) fail(`Source の説明・URL が不正: ${s.id}`);
    if (!["website", "youtube"].includes(s.kind) || !s.languages.length || s.languages.some((l) => !["ja", "en", "ko", "unknown"].includes(l))) fail(`Source の分類が不正: ${s.id}`);
    if (s.collection_ids.some((id) => !collectionIds.has(id))) fail(`収集設定の参照先がない: ${s.id}`);
    if (s.topic_ids.some((id) => !topics.has(id))) fail(`Topic の参照先がない: ${s.id}`);
    if (s.related_resource_ids.some((id) => !resources.has(id))) fail(`Resource の参照先がない: ${s.id}`);
    if (!["unconfirmed", "checked"].includes(s.presence.status) || (s.presence.status === "checked" && (!s.presence.checked_at || !s.presence.basis_ja))) fail(`存在確認の記録が不正: ${s.id}`);
  }
  const records = new Map();
  function record(c, sourceIds, extra = {}) {
    if (!safeUrl(c.url)) fail(`候補URLが不正: ${c.url}`);
    const key = candidateKey(c.url);
    if (c.topic_ids?.some((id) => !topics.has(id))) fail(`候補Topic の参照先がない: ${key}`);
    const old = records.get(key);
    if (old) { sourceIds.forEach((id) => old.sourceIds.add(id)); return; }
    const r = byUrl.get(key);
    const review = reviews[key];
    records.set(key, { sourceIds: new Set(sourceIds), candidate: {
      key, url: c.url, title: c.title || null, type: c.type || (youtubeId(c.url) ? "video" : "article"), language: c.language || "unknown",
      published_at: c.published_at || null, discovered_at: c.discovered_at || null,
      metadata_state: c.metadata_from && !["sitemap_only", "user_url"].includes(c.metadata_from) ? "metadata" : "url_only",
      review: review ? { checked_at: review.checked_at || null, checked_by: review.checked_by || null, method: review.method || "確認範囲の記録なし" } : null,
      topic_ids: c.topic_ids || [], roles: c.roles || [],
      triage: { status: r ? "registered" : c.triage?.status === "registered" ? "candidate" : c.triage?.status || "candidate", reason: c.triage?.reason || "個別確認待ち" },
      registered: !!r, resource_id: r && publicResource(r) ? r.id : null, ...extra,
    } });
  }
  const candidateKeys = new Set();
  for (const c of candidates) {
    const key = candidateKey(c.url);
    if (c.key !== key || candidateKeys.has(key)) fail(`候補キーが不正・重複: ${key}`);
    candidateKeys.add(key);
    if (c.sources.some((id) => !collectionIds.has(id))) fail(`候補の収集設定参照が不正: ${key}`);
    const sourceIds = catalog.filter((s) => s.collection_ids.some((id) => c.sources.includes(id))).map((s) => s.id);
    if (!sourceIds.length) fail(`候補に対応する公開情報源がない: ${key}`);
    record(c, sourceIds);
  }
  for (const m of manual) {
    if (m.source_ids.some((id) => !ids.has(id))) fail(`手動候補の情報源参照が不正: ${m.url}`);
    record({ ...m, metadata_from: "user_url" }, m.source_ids, { registered_at: m.registered_at || null, notes_ja: m.notes_ja || null });
  }
  const files = new Map(), entries = [...records.values()];
  const sources = catalog.map((s) => {
    const cs = entries.filter((e) => e.sourceIds.has(s.id)).map((e) => e.candidate);
    const resourceIds = [...new Set([...s.related_resource_ids.filter((id) => publicResource(resources.get(id))), ...cs.flatMap((c) => c.resource_id ? [c.resource_id] : [])])];
    files.set(`${s.id}.json`, { source_id: s.id, candidates: cs });
    return { ...s, candidate_count: cs.length, unregistered_count: cs.filter((c) => !c.registered).length, excluded_count: cs.filter((c) => c.triage.status === "excluded").length,
      inferred_topic_ids: [...new Set(cs.flatMap((c) => c.topic_ids))], resource_ids: resourceIds };
  });
  files.set("index.json", { schema_version: 1, sources, unassigned: entries.filter((e) => !e.sourceIds.size).map((e) => e.candidate) });
  return files;
}
function load(root) {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  return { catalog: read("data/sources/catalog.json"), manual: read("data/sources/manual-candidates.json"), collections: read("data/candidates/sources.json"), candidates: read("data/candidates/candidates.json"), reviews: read("data/candidates/reviews.json"), dataset: read("data/sample-resources.json") };
}
function run(check = false, root = path.resolve(__dirname, "../..")) {
  const dir = path.join(root, "public/sources");
  const files = project(load(root));
  if (!check) fs.mkdirSync(dir, { recursive: true });
  for (const [name, value] of files) {
    const text = JSON.stringify(value) + "\n", file = path.join(dir, name);
    if (check) {
      // Gitの改行変換だけを許容する。JSON内容・順序・その他の空白は厳密に比較する。
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") !== text) throw new Error(`公開データが未生成・古い: ${name}（npm run sources:build）`);
    } else fs.writeFileSync(file, text);
  }
  if (check && fs.readdirSync(dir).some((name) => name.endsWith(".json") && !files.has(name))) throw new Error("公開データに廃止されたSourceのJSONが残っています");
  console.log(`Sources: ${files.size - 1}情報源・公開データ${check ? "整合確認" : "生成"}完了`);
}
module.exports = { project, load, safeUrl, run };
if (require.main === module) run(process.argv.includes("--check"));
