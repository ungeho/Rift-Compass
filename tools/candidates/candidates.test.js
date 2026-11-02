// node --test tools/candidates/candidates.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { youtubeId, normalizeUrl, candidateKey, titleSimilarity, mergeCandidates, classify, topicMatcher, structureOf, splitTitleTags, urlOnlyItems, stageOf, stageCounts, STAGES, reviewQueue } = require("./lib");

const dataset = require("../../data/sample-resources.json");
const ctx = (extra = {}) => ({ now: "2026-10-28", resources: dataset.resources, topics: dataset.topics, reviews: {}, ...extra });
const item = (url, extra = {}) => ({ url, source: "test", title: "ウェーブを押してはいけない理由", type: "article", language: "ja", ...extra });

test("YouTube の動画 ID：URL の形が違っても同じ ID", () => {
  for (const u of [
    "https://www.youtube.com/watch?v=3TN6ptsTVpk",
    "https://youtube.com/watch?v=3TN6ptsTVpk&t=120s&si=abc",
    "https://m.youtube.com/watch?feature=share&v=3TN6ptsTVpk",
    "https://youtu.be/3TN6ptsTVpk?si=xyz",
    "https://www.youtube.com/shorts/3TN6ptsTVpk",
    "https://www.youtube.com/embed/3TN6ptsTVpk",
  ]) assert.equal(youtubeId(u), "3TN6ptsTVpk", u);
  assert.equal(youtubeId("https://www.youtube.com/@goru6666/videos"), null);
  assert.equal(youtubeId("https://lolgaren.com/watch?v=3TN6ptsTVpk"), null);
});

test("URL の正規化：追跡パラメータ・www・末尾の /・# を除き、意味のあるパラメータは残す", () => {
  const a = normalizeUrl("http://WWW.Lol-Guide.com/articles/wftjm/?utm_source=x&utm_medium=y#top");
  assert.equal(a, "https://lol-guide.com/articles/wftjm");
  assert.equal(normalizeUrl("https://lolgaren.com/lane-2/?fbclid=1"), normalizeUrl("https://lolgaren.com/lane-2"));
  assert.notEqual(normalizeUrl("https://example.com/list?page=2"), normalizeUrl("https://example.com/list?page=3"));
  assert.equal(normalizeUrl("https://example.com/a?b=2&a=1"), normalizeUrl("https://example.com/a?a=1&b=2"));
});

test("既存の72件と同じ URL・動画は「登録済み」になり、収録候補に数えない", () => {
  const out = mergeCandidates([], [
    item("https://www.lol-guide.com/articles/wftjm?utm_source=twitter"),
    item("https://youtu.be/3TN6ptsTVpk", { type: "video" }),
    item("https://lolgaren.com/lane-2/"),
  ], ctx());
  assert.deepEqual(out.map((c) => c.existing_resource_id).sort(), ["res-garen-lane-2", "res-lg-wftjm", "res-yt-goru-dopa-lecture-influence"]);
  assert.ok(out.every((c) => c.triage.status === "registered"));
});

test("同じ記事の表記ゆれは1件にまとめ、見つけた URL の違いを残す", () => {
  const out = mergeCandidates([], [
    item("https://example.com/guide/wave?utm_campaign=a"),
    item("https://www.example.com/guide/wave/"),
    item("https://example.com/guide/wave#section-2", { source: "other" }),
  ], ctx());
  assert.equal(out.length, 1);
  assert.equal(out[0].url_variants.length, 2);
  assert.deepEqual(out[0].sources, ["other", "test"]);
});

test("再実行：同じ入力を何度統合しても、候補は増えず内容も変わらない", () => {
  const input = [item("https://example.com/a"), item("https://example.com/b?utm_source=x"), item("https://youtu.be/AAAAAAAAAAA", { type: "video", title: "Dopa wave lecture" })];
  const once = mergeCandidates([], input, ctx());
  const twice = mergeCandidates(once, input, ctx({ now: "2026-11-01" }));
  const thrice = mergeCandidates(twice, input.map((x) => ({ ...x, url: x.url.replace("https://", "http://www.") })), ctx({ now: "2026-11-02" }));
  assert.equal(thrice.length, 3);
  assert.equal(JSON.stringify(twice), JSON.stringify(once));
  assert.ok(thrice.every((c) => c.discovered_at === "2026-10-28")); // 最初に見つけた日は変えない
});

test("個別確認の結果（reviews.json）は、再実行しても規則による振り分けで上書きされない", () => {
  const key = candidateKey("https://example.com/a");
  const reviews = { [key]: { decision: "excluded", reason: "本文が一般論だけ", depth_confirmed: "shallow" } };
  const out = mergeCandidates(mergeCandidates([], [item("https://example.com/a")], ctx({ reviews })), [item("https://example.com/a")], ctx({ reviews }));
  assert.equal(out[0].triage.status, "excluded");
  assert.equal(out[0].triage.by, "review");
  assert.equal(out[0].depth_confirmed, "shallow");
});

test("正式資料になった候補は、登録前のレビューの判断（candidate など）より registered を優先する。レビューの記録は消さない", () => {
  const r = dataset.resources[0];
  const reviews = { [candidateKey(r.url)]: { decision: "candidate", reason: "登録前の確認", depth_confirmed: "deep" } };
  const out = mergeCandidates([], [item(r.url)], ctx({ reviews }));
  assert.equal(out[0].existing_resource_id, r.id);
  assert.equal(out[0].triage.status, "registered");
  assert.equal(out[0].triage.by, "rule");
  assert.equal(out[0].depth_confirmed, "deep");
  // 実データ：既存資料に対応する候補は、すべて registered
  const list = require("../../data/candidates/candidates.json");
  for (const c of list.filter((x) => x.existing_resource_id)) assert.equal(c.triage.status, "registered", c.key);
});

test("深さは推定（depth_estimate）だけを付け、確認済み（depth_confirmed）にはしない", () => {
  const out = mergeCandidates([], [item("https://example.com/deep", { title: "なぜフリーズするのか：判断の基準", structure: { chars: 6000, headings: 8, reason_headings: 3 } })], ctx());
  assert.equal(out[0].depth_estimate, "high");
  assert.equal(out[0].depth_confirmed, null);
  assert.equal(out[0].triage.status, "candidate");
});

test("翻訳の印がある動画と、題名が似た資料は「確認が必要」として残し、削除しない", () => {
  const out = mergeCandidates([], [
    item("https://youtu.be/BBBBBBBBBBB", { type: "video", title: "[日本語字幕] Dopa教授のLOL講義 ウェーブについて" }),
    item("https://example.com/x", { title: "対面がロームに行った時に行うべきこと" }),
  ], ctx());
  assert.equal(out.length, 2);
  const yt = out.find((c) => c.type === "video");
  assert.ok(yt.needs_review.some((r) => r.relation === "possible_translation"));
  const art = out.find((c) => c.type === "article");
  assert.ok(art.needs_review.some((r) => r.resource_id === "res-lg-wftjm"));
  assert.ok(titleSimilarity("【パッチ26.8】サポートはいつロームするべきか？", "サポートはいつロームするべきか") > 0.9);
});

test("分類：ロール・優先区分・別モードの除外・メンタル系の扱い", () => {
  const m = topicMatcher(dataset.topics);
  const t = (title, extra = {}) => classify({ title, url: "https://example.com/x", ...extra }, m);
  assert.equal(t("ミッドレーナーのロームのタイミング").tier, "P1-mid");
  assert.equal(t("シンドラの対面ごとのトレード").tier, "P1-mid");
  assert.equal(t("ウェーブ管理の基本：フリーズの条件").tier, "P1-common");
  assert.equal(t("ジャングラーの初手ルート").tier, "P2");
  assert.equal(t("トップ ダリウスのビルド").tier, "P3");
  const merged = (title) => mergeCandidates([], [item("https://example.com/" + encodeURIComponent(title), { title })], ctx())[0].triage;
  assert.equal(merged("ARAMで勝つためのビルド").status, "excluded");
  assert.notEqual(merged("Dopa Stream Smurfing in KR server").status, "excluded"); // 「urf」を単語の途中で拾わない
  assert.notEqual(merged("メイヘムは押せるのにランクは押せない理由").status, "excluded"); // ランク戦と比べている
  const viaExcerpt = mergeCandidates([], [item("https://example.com/habit", { title: "上達する試合前の習慣と判断", excerpt: "以前はメイヘムの統計がなかった" })], ctx())[0];
  assert.notEqual(viaExcerpt.triage.status, "excluded"); // 抜粋で触れているだけでは除外しない
  assert.equal(merged("メンタルを保つ習慣").status, "hold");
  assert.equal(merged("メンタルが崩れたときの振り返りと判断の立て直し方").status, "candidate");
});

test("「題名 - タグ」形式の題名をタグに分け、タグでロール共通を判定する", () => {
  assert.deepEqual(splitTitleTags("ローテーションとは？ - 全ロール共通, 初心者向け, マクロ"), { title: "ローテーションとは？", tags: ["全ロール共通", "初心者向け", "マクロ"] });
  assert.deepEqual(splitTitleTags("A - B 対 C の比較をくわしく説明する長い副題です"), { title: "A - B 対 C の比較をくわしく説明する長い副題です", tags: [] });
  const out = mergeCandidates([], [item("https://example.com/rot", { title: "ローテーションとは？", categories: ["全ロール共通", "マクロ"] })], ctx());
  assert.equal(out[0].tier, "P1-common");
  const meta = mergeCandidates([], [item("https://example.com/seo", { title: "ビルドガイドの記事統合と301リダイレクト" })], ctx());
  assert.equal(meta[0].triage.status, "excluded");
});

test("解説・講義と題名にある動画は、「Gameplay」などの語があってもプレイ動画として保留にしない", () => {
  const v = (title) => mergeCandidates([], [item("https://youtu.be/CCCCCCCCCCC", { type: "video", title, duration_sec: 1200 })], ctx())[0].triage.reason;
  assert.doesNotMatch(v("【ENG SUB】 Dopa TF vs Ryze  Gameplay & Commentary Translated"), /プレイ動画/);
  assert.doesNotMatch(v("Improve your League Gameplay - The Timeline Practice Concept"), /プレイ動画/);
  assert.doesNotMatch(v("SoloQ Drafting Format is OUTDATED"), /プレイ動画/);
  assert.match(v("[2025/4/11] Dopa Orianna vs Xerath Challenger 900LP+"), /プレイ動画/);
});

test("reviews.json：参照先の候補・資料が存在し、registered_as は同じ URL の資料を指す", () => {
  const reviews = require("../../data/candidates/reviews.json");
  const list = require("../../data/candidates/candidates.json");
  const keys = new Set(list.map((c) => c.key));
  for (const [key, r] of Object.entries(reviews)) {
    assert.ok(keys.has(key), `候補にない: ${key}`);
    assert.ok([undefined, "candidate", "hold", "excluded"].includes(r.decision), `${key}: decision ${r.decision}`);
    assert.ok([undefined, null, "deep", "medium", "shallow"].includes(r.depth_confirmed), `${key}: depth_confirmed ${r.depth_confirmed}`);
    assert.ok(r.checked_at && r.method, `${key}: 確認日と確認の範囲が要る`);
    if (r.registered_as) {
      const res = dataset.resources.find((x) => x.id === r.registered_as);
      assert.ok(res, `${key}: 資料 ${r.registered_as} がない`);
      assert.equal(candidateKey(res.url), key, `${key}: ${r.registered_as} の URL が一致しない`);
    }
  }
});

test("本文の構成は数だけを返し、本文の文字列を保存しない", () => {
  const s = structureOf("<article><h2>なぜ押さないのか</h2><p>本文</p><h3>例外の場合</h3><h2>まとめ</h2></article>");
  assert.deepEqual(Object.keys(s).sort(), ["chars", "headings", "reason_headings"]);
  assert.equal(s.headings, 3);
  assert.equal(s.reason_headings, 2);
});

test("候補データの整合：キーの重複がなく、アプリは候補を読み込まない", () => {
  const f = path.join(__dirname, "..", "..", "data", "candidates", "candidates.json");
  if (fs.existsSync(f)) {
    const list = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.equal(new Set(list.map((c) => c.key)).size, list.length);
    for (const c of list) assert.equal(c.key, candidateKey(c.url));
    // 原典の抜粋（説明文・書き出し）の文章は保存しない。分類の手がかりだけを持つ
    assert.equal(list.filter((c) => "excerpt" in c).length, 0);
  }
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "src", "data", "dataset.ts"), "utf8");
  assert.ok(!src.includes("candidates"));
});

test("抜粋は手がかりに変えて捨てる：保存されず、再収集でも戻らず、分類は抜粋があるときと同じ", () => {
  const withExcerpt = item("https://example.com/ex", { title: "序盤の考え方", excerpt: "ミッドでロームする理由と判断の基準を解説します" });
  const once = mergeCandidates([], [withExcerpt], ctx());
  assert.ok(!("excerpt" in once[0]));
  assert.deepEqual(once[0].excerpt_features.roles, ["mid"]);
  assert.ok(once[0].excerpt_features.topic_ids.includes("roaming"));
  // 同じ抜粋をもう一度取得しても、文章は保存されない
  const again = mergeCandidates(once, [withExcerpt], ctx({ now: "2026-11-01" }));
  assert.ok(!("excerpt" in again[0]));
  assert.equal(JSON.stringify(again), JSON.stringify(once));
  // 手がかりだけでも、抜粋がある場合と同じ分類になる（ロール・Topic・深さの根拠・優先区分）
  const pick = (c) => [c.roles, c.topic_ids, c.tier, c.depth_estimate, c.depth_signals, c.triage];
  assert.deepEqual(pick(once[0]), pick(mergeCandidates([], [{ ...withExcerpt }], ctx())[0]));
  assert.ok(once[0].depth_signals.includes("抜粋に理由・判断の語"));
  assert.equal(once[0].tier, "P1-mid");
});

// ---------- 原典目録：URL だけの収集と収録の段階 ----------

const SRC = { id: "sitemap-test", creator: { name: "Riot Games", kind: "official" }, language: "ja" };
const URLS = ["https://www.example.com/ja-jp/news/patch-26-1-notes/", "https://www.example.com/ja-jp/news/patch-26-2-notes/"];

test("URL だけの候補：題名・公開日・更新日を推測せず null のまま、既知の URL と上限を守る", () => {
  const items = urlOnlyItems(URLS, SRC);
  assert.equal(items.length, 2);
  for (const x of items) {
    assert.equal(x.title, null);
    assert.equal(x.published_at, null);
    assert.equal(x.updated_at, null);
    assert.equal(x.metadata_from, "sitemap_only");
  }
  assert.deepEqual(urlOnlyItems(URLS, SRC, (u) => u === URLS[0]).map((x) => x.url), [URLS[1]]);
  assert.equal(urlOnlyItems(URLS, { ...SRC, max_new: 1 }).length, 1);
  // 統合しても題名・日付は空のまま（URL の語から作らない）
  const merged = mergeCandidates([], items.map((x) => ({ ...x, source: SRC.id })), ctx());
  for (const c of merged) {
    assert.equal(c.title, null);
    assert.equal(c.published_at, null);
  }
});

test("再収集で候補が増えない：同じ URL を URL だけで取り直しても、後で取得した題名が消えない", () => {
  const once = mergeCandidates([], urlOnlyItems(URLS, SRC).map((x) => ({ ...x, source: SRC.id })), ctx());
  const again = mergeCandidates(once, urlOnlyItems(URLS, SRC).map((x) => ({ ...x, source: SRC.id })), ctx({ now: "2026-11-02" }));
  assert.equal(again.length, 2);
  assert.equal(JSON.stringify(again), JSON.stringify(once));
  // あとで記事ページから題名を取得した場合、URL だけの再収集で null に戻らない
  const withTitle = mergeCandidates(again, [item(URLS[0], { source: SRC.id, title: "パッチ26.1ノート", metadata_from: "article_page" })], ctx());
  const reCollected = mergeCandidates(withTitle, urlOnlyItems(URLS, SRC).map((x) => ({ ...x, source: SRC.id })), ctx());
  assert.equal(reCollected.length, 2);
  assert.equal(reCollected.find((c) => c.url === URLS[0]).title, "パッチ26.1ノート");
});

test("収録の段階：排他的な集計（各候補は1回）と累積（その段階以上）が一致する", () => {
  const sctx = { reviews: { k3: {} }, extracted: new Set(["res-used"]) };
  const list = [
    { key: "k1", metadata_from: "sitemap_only", existing_resource_id: null },
    { key: "k2", metadata_from: "article_page", existing_resource_id: null },
    { key: "k3", metadata_from: "wordpress_api", existing_resource_id: null },
    { key: "k4", metadata_from: "article_page", existing_resource_id: "res-unused" },
    { key: "k5", metadata_from: "sitemap_only", existing_resource_id: "res-used" },
  ];
  assert.deepEqual(list.map((c) => stageOf(c, sctx)), STAGES);
  // 本文確認の記録があっても、正式資料になっていれば上の段階に数える
  assert.equal(stageOf({ key: "k3", metadata_from: "article_page", existing_resource_id: "res-unused" }, sctx), STAGES[3]);
  const { exclusive, cumulative } = stageCounts(list, sctx);
  assert.deepEqual(Object.values(exclusive), [1, 1, 1, 1, 1]);
  assert.deepEqual(STAGES.map((s) => cumulative[s]), [5, 4, 3, 2, 1]);
  assert.equal(Object.values(exclusive).reduce((a, b) => a + b, 0), list.length);
});

// ---------- 全ロール・全チャンピオンを対等に扱う（2026-11-01 の方針） ----------

test("ロール・チャンピオンは保留の理由にしない：他ロール・ロール不明でも、深さの推定で振り分ける", () => {
  const merged = (title, extra = {}) => mergeCandidates([], [item("https://example.com/" + encodeURIComponent(title), { title, ...extra })], ctx())[0];
  const top = merged("トップのダリウスで対面ごとにトレードする理由と条件");
  assert.equal(top.tier, "P3"); // 分類情報としては残す
  assert.deepEqual(top.roles, ["top"]);
  assert.equal(top.triage.status, "candidate");
  const support = merged("サポートのワードを置く判断の基準とタイミング");
  assert.equal(support.triage.status, "candidate");
  const unknown = merged("この状況で何を優先するべきか、その理由");
  assert.equal(unknown.tier, "unclassified");
  assert.equal(unknown.triage.status, "candidate");
  for (const c of [top, support, unknown]) assert.doesNotMatch(c.triage.reason, /他ロール|判定できない/);
});

test("チャンピオン別のガイドの語は減点しない。一覧・速報の語は減点する", () => {
  const m = topicMatcher(dataset.topics);
  const t = (title) => classify({ title, url: "https://example.com/x" }, m);
  for (const title of ["ジャングルダイアナのビルドガイド【レベル3でリコールしても間に合う】", "ヤスオ完全攻略", "リヴェンのコンボ"]) {
    assert.ok(!t(title).depth_signals.includes("題名が一覧・速報型"), title);
  }
  assert.ok(t("最新ティアリスト").depth_signals.includes("題名が一覧・速報型"));
});

test("確認の順番：深さの推定が高い順で、同じ深さではロールごとに交互に並べる（ロールで優劣をつけない）", () => {
  const c = (key, depth, roles) => ({ key, depth_estimate: depth, roles });
  const list = [c("a1", "high", ["mid"]), c("a2", "high", ["mid"]), c("a3", "high", ["mid"]), c("b1", "high", ["top"]), c("s1", "high", ["support"]), c("z1", "medium", ["mid"]), c("n1", "high", [])];
  const order = reviewQueue(list).map((x) => x.key);
  assert.deepEqual(order.slice(0, 4).sort(), ["a1", "b1", "n1", "s1"]); // 最初の一巡で、各ロールから1件ずつ
  assert.equal(order[order.length - 1], "z1"); // 深さの推定が低い方は後
  assert.equal(order.length, list.length);
});

test("確認の順番：同じ深さでは情報源ごとに交互に並べ、各情報源の中ではロールごとに交互に並べる（件数の上限なし）", () => {
  const c = (key, src, roles, depth = "high") => ({ key, sources: [src], roles, depth_estimate: depth });
  const list = [c("g1", "lolgaren", ["top"]), c("g2", "lolgaren", ["top"]), c("g3", "lolgaren", ["mid"]), c("l1", "lol-guide", ["mid"]), c("l2", "lol-guide", ["mid"]), c("y1", "yt-el", ["jungle"]), c("m1", "lolgaren", [], "medium")];
  const order = reviewQueue(list);
  assert.deepEqual(order.slice(0, 3).map((x) => x.sources[0]).sort(), ["lol-guide", "lolgaren", "yt-el"]); // 最初の一巡で各情報源から1件
  const gs = order.filter((x) => x.sources[0] === "lolgaren" && x.depth_estimate === "high").map((x) => x.roles[0]);
  assert.deepEqual(gs.slice(0, 2).sort(), ["mid", "top"]); // 情報源の中ではロールが交互
  assert.equal(order.length, list.length); // 上限で落とさない
  assert.equal(order[order.length - 1].key, "m1"); // 深さの推定が高い方が先
  assert.deepEqual(reviewQueue(list).map((x) => x.key), order.map((x) => x.key)); // 決定的
});

test("URL だけの候補は「浅い」とせず、別の理由で保留する", () => {
  const [u] = mergeCandidates([], urlOnlyItems(["https://www.example.com/ja-jp/news/patch-26-3-notes/"], { language: "ja" }).map((x) => ({ ...x, source: "s" })), ctx());
  assert.equal(u.triage.status, "hold");
  assert.match(u.triage.reason, /URL のみ/);
  assert.doesNotMatch(u.triage.reason, /深さの推定が低い/);
});

test("付け直しは候補の並びを変えない（既存の候補の順を保つ）", () => {
  const items = ["https://example.com/z", "https://example.com/a", "https://example.com/m"].map((u) => item(u));
  const out = mergeCandidates([], items, ctx());
  assert.deepEqual(out.map((c) => c.url), items.map((x) => x.url));
});
