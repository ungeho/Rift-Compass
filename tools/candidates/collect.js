#!/usr/bin/env node
// Phase 5A：教材候補の収集 CLI（依存パッケージなし。Node 18 以降の fetch を使う）
//
//   node tools/candidates/collect.js collect [情報源ID ...]  一覧を取得して候補に統合する（既知の URL は取り直さない）
//   node tools/candidates/collect.js annotate                取得せずに、分類・重複・振り分けだけを付け直す（reviews.json の反映）
//   node tools/candidates/collect.js report                  内訳と、深い確認の順番待ち・保留からの見直し枠を表示する
//
// 規則による分類・深さの推定・保留は、確認する順番を決めるための暫定情報。深さと採否は、本文を確認して reviews.json に書く。
//
// 情報源は data/candidates/sources.json、候補は data/candidates/candidates.json、
// 個別確認の結果は data/candidates/reviews.json（人・AI が本文を読んで書く）。
// 候補はアプリの検索対象ではない（アプリは data/sample-resources.json だけを読む）。
"use strict";
const fs = require("fs");
const path = require("path");
const { mergeCandidates, annotate, structureOf, splitTitleTags, TIER_ORDER } = require("./lib");

const ROOT = path.join(__dirname, "..", "..");
const DIR = path.join(ROOT, "data", "candidates");
const FILES = {
  sources: path.join(DIR, "sources.json"),
  candidates: path.join(DIR, "candidates.json"),
  reviews: path.join(DIR, "reviews.json"),
  dataset: path.join(ROOT, "data", "sample-resources.json"),
};
const UA = "RiftCompass-candidate-collector/0.1 (+https://github.com/ungeho/Rift-Compass)";
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const decode = (s) =>
  (s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8230;|\[&hellip;\]|&hellip;/g, "…").replace(/&#[0-9]+;/g, "").replace(/\s+/g, " ").trim();
// 抜粋（原典の説明文・書き出し）は分類の手がかりを取るためだけに短く取得する。
// 統合の時点で手がかり（excerpt_features）に変えて捨て、候補データには保存しない（lib.js の annotate）
const clip = (s, n = 160) => (s && s.length > n ? s.slice(0, n) + "…" : s || null);

let requests = 0;
async function get(url, { json = false, delay = 1000 } = {}) {
  await sleep(delay); // 同じサイトへの連続アクセスを避ける
  requests++;
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "ja,en;q=0.8" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return json ? res.json() : res.text();
}

// ---------- 情報源ごとの取得方法（汎用の3種類だけ） ----------

const adapters = {
  /** サイトマップの URL を列挙し、未知の URL だけ記事ページのメタデータと本文の構成（文字数・見出し数）を取る */
  async sitemap(src, known) {
    const xml = await get(src.url, { delay: 0 });
    const include = new RegExp(src.include);
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => include.test(u));
    const items = [];
    for (const url of urls) {
      if (known(url)) continue; // 既知の URL は取り直さない（再実行のコストを抑える）
      if (items.length >= (src.max_new ?? Infinity)) break;
      const html = await get(url, { delay: src.delay_ms ?? 1000 });
      const meta = (re) => decode((re.exec(html) || [])[1]);
      const article = src.article_selector ? sliceArticle(html, src.article_selector) : html;
      const rawTitle = meta(/property="og:title" content="([^"]*)"/) || meta(/<title>([^<]*)<\/title>/);
      const { title, tags } = src.title_tags ? splitTitleTags(rawTitle) : { title: rawTitle, tags: [] };
      items.push({
        url,
        title,
        categories: tags,
        excerpt: clip(meta(/name="description" content="([^"]*)"/)),
        creator: creatorOf(src, meta(/property="article:author" content="([^"]*)"/)),
        published_at: meta(/property="article:published_time" content="([^"]*)"/).slice(0, 10) || null,
        updated_at: meta(/property="article:modified_time" content="([^"]*)"/).slice(0, 10) || null,
        type: src.type || "article",
        language: src.language,
        structure: structureOf(article),
        metadata_from: "article_page",
      });
      process.stdout.write(".");
    }
    return { listed: urls.length, items };
  },

  /** WordPress の公開 REST API で、投稿の一覧（題名・日付・抜粋・カテゴリ・本文の構成）を新しい順に取る */
  async wordpress(src, known) {
    const base = src.base.replace(/\/$/, "");
    const cats = new Map((await get(`${base}/wp-json/wp/v2/categories?per_page=100&_fields=id,name`, { json: true, delay: 0 })).map((c) => [c.id, decode(c.name)]));
    const items = [];
    let listed = 0;
    for (let page = 1; listed < (src.max ?? 100); page++) {
      const per = Math.min(50, (src.max ?? 100) - listed);
      const posts = await get(`${base}/wp-json/wp/v2/posts?per_page=${per}&page=${page}&_fields=link,title,date,modified,excerpt,categories,content`, { json: true, delay: src.delay_ms ?? 1000 });
      if (!posts.length) break;
      listed += posts.length;
      for (const p of posts) {
        if (known(p.link)) continue;
        items.push({
          url: p.link,
          title: decode(p.title.rendered),
          excerpt: clip(decode(p.excerpt.rendered)),
          categories: p.categories.map((id) => cats.get(id)).filter(Boolean),
          creator: src.creator || null,
          published_at: p.date.slice(0, 10),
          updated_at: p.modified.slice(0, 10),
          type: src.type || "article",
          language: src.language,
          structure: structureOf(p.content.rendered), // 本文は保存せず、文字数と見出しの数だけ
          metadata_from: "wordpress_api",
        });
      }
      if (posts.length < per) break;
    }
    return { listed, items };
  },

  /** YouTube のチャンネルの動画一覧ページ（新しい順の約30本）から、動画 ID・題名・長さを取る（動画は取得しない）*/
  async "youtube-channel"(src) {
    const html = await get(`https://www.youtube.com/${src.handle}/videos`, { delay: src.delay_ms ?? 1000 });
    const m = /var ytInitialData = (\{.+?\});<\/script>/s.exec(html);
    if (!m) throw new Error(`ytInitialData not found: ${src.handle}`);
    const items = [];
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      const l = o.lockupViewModel;
      if (l && l.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
        const badge = JSON.stringify(l.contentImage || {}).match(/"text":"(\d{1,2}(?::\d{2}){1,2})"/);
        const rows = JSON.stringify(l.metadata || {}).match(/"content":"([^"]*前|[^"]*ago)"/);
        items.push({
          url: `https://www.youtube.com/watch?v=${l.contentId}`,
          title: l.metadata?.lockupMetadataViewModel?.title?.content || null,
          creator: src.creator || null,
          duration_sec: badge ? badge[1].split(":").reduce((a, x) => a * 60 + Number(x), 0) : null,
          published_hint: rows ? rows[1] : null, // 「6年前」など。正確な日付ではない
          type: "video",
          language: src.language,
          metadata_from: "youtube_channel_page",
        });
        return;
      }
      for (const k in o) walk(o[k]);
    };
    walk(JSON.parse(m[1]));
    return { listed: items.length, items };
  },
};

/** 記事ページの著者名を、既存資料と同じ発信者名にそろえる（sources.json の creator_aliases）*/
function creatorOf(src, author) {
  if (author && src.creator_aliases?.[author]) return src.creator_aliases[author];
  return { name: author || src.creator?.name || null, kind: src.creator?.kind || null };
}

function sliceArticle(html, selector) {
  const i = html.indexOf(selector);
  if (i < 0) return html;
  const end = html.indexOf("</article>", i);
  return html.slice(i, end > i ? end : undefined);
}

// ---------- コマンド ----------

function context() {
  const d = readJson(FILES.dataset);
  return { now: today(), resources: d.resources, topics: d.topics, reviews: readJson(FILES.reviews, {}) };
}

function save(list) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILES.candidates, JSON.stringify(list, null, 1) + "\n");
}

async function collect(ids) {
  const sources = readJson(FILES.sources).filter((s) => !ids.length || ids.includes(s.id));
  let list = readJson(FILES.candidates, []);
  const { candidateKey } = require("./lib");
  const t0 = Date.now();
  for (const src of sources) {
    const knownKeys = new Set(list.map((c) => c.key));
    const known = (u) => knownKeys.has(candidateKey(u));
    try {
      const { listed, items } = await adapters[src.kind](src, known);
      const before = list.length;
      list = mergeCandidates(list, items.map((x) => ({ ...x, source: src.id })), context());
      console.log(`\n${src.id}: 一覧 ${listed}件、取得 ${items.length}件、新規 ${list.length - before}件`);
    } catch (e) {
      console.error(`\n${src.id}: 失敗 ${e.message}`);
    }
  }
  save(list);
  console.log(`候補 ${list.length}件（HTTP リクエスト ${requests}回、${Math.round((Date.now() - t0) / 1000)}秒）`);
}

function reannotate() {
  const list = annotate(readJson(FILES.candidates, []), context());
  save(list);
  console.log(`候補 ${list.length}件を付け直した`);
}

function report() {
  const list = readJson(FILES.candidates, []);
  const count = (f) => list.reduce((m, c) => m.set(f(c), (m.get(f(c)) || 0) + 1), new Map());
  const show = (title, m) => console.log(`${title}：` + [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("、"));
  console.log(`候補 ${list.length}件`);
  show("情報源", count((c) => c.sources.join("+")));
  show("振り分け", count((c) => `${c.triage.status}(${c.triage.by})`));
  show("優先区分", count((c) => c.tier));
  show("深さの推定", count((c) => c.depth_estimate));
  show("深さの確認", count((c) => c.depth_confirmed ?? "未確認"));
  show("発信者", count((c) => c.creator?.name ?? "不明"));
  console.log(`URL の表記ゆれをまとめた候補：${list.filter((c) => c.url_variants.length).length}件`);
  console.log(`既存資料と同じ：${list.filter((c) => c.existing_resource_id).length}件`);
  console.log(`確認が必要な類似・翻訳の候補：${list.filter((c) => c.needs_review.length).length}件`);
  show("保留・除外の理由", count((c) => (c.triage.status === "candidate" ? null : c.existing_resource_id ? "既存資料と同じ URL・動画" : c.triage.reason)));
  const queue = list
    .filter((c) => c.triage.status === "candidate" && c.depth_confirmed == null)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || ["high", "medium", "low"].indexOf(a.depth_estimate) - ["high", "medium", "low"].indexOf(b.depth_estimate));
  console.log(`\n深い確認の順番待ち（未確認の収録候補 ${queue.length}件。先頭20件）`);
  for (const c of queue.slice(0, 20)) console.log(`  [${c.tier} ${c.depth_estimate}] ${c.title} — ${c.url}`);
  // 規則による保留は確認の順番を後にするだけなので、理由ごとに未確認のものを少しずつ抜き取って確認する
  // （確認して reviews.json に書くと、次の回は別の資料が出る）
  const held = list.filter((c) => c.triage.status === "hold" && c.triage.by === "rule" && c.depth_confirmed == null);
  console.log(`\n保留からの見直し枠（規則による保留 ${held.length}件から、理由ごとに2件）`);
  for (const reason of [...new Set(held.map((c) => c.triage.reason))].sort()) {
    for (const c of held.filter((x) => x.triage.reason === reason).slice(0, 2)) console.log(`  [${reason}] ${c.title} — ${c.url}`);
  }
}

const [cmd = "report", ...args] = process.argv.slice(2);
if (cmd === "collect") collect(args);
else if (cmd === "annotate") reannotate();
else if (cmd === "report") report();
else {
  console.error("usage: node tools/candidates/collect.js collect [source...] | annotate | report");
  process.exit(1);
}
