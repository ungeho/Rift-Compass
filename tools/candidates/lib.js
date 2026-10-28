// Phase 5A：教材候補の正規化・重複検出・暫定分類（依存パッケージなし。ネットワークに触れない純粋関数だけを置く）
// 候補は data/candidates/ に置き、アプリ（data/sample-resources.json）とは分ける。
"use strict";

// ---------- URL の正規化と重複キー ----------

// 追跡・共有用のパラメータ。内容を変えないので、重複判定では取り除く
const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|yclid|mc_cid|mc_eid|ref|ref_src|si|feature|pp|ab_channel|_hsenc|_hsmi|igshid)$/i;

/** YouTube の動画 ID（watch / youtu.be / shorts / embed / live）。動画でなければ null */
function youtubeId(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") return validId(u.pathname.slice(1).split("/")[0]);
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (u.pathname === "/watch") return validId(u.searchParams.get("v"));
  const m = /^\/(shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname);
  return m ? validId(m[2]) : null;
}
const validId = (id) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);

/** 比較用に正規化した URL：https・小文字のホスト・www なし・末尾の / なし・追跡パラメータなし・# なし・パラメータは並べ替え */
function normalizeUrl(raw) {
  const yt = youtubeId(raw);
  if (yt) return `https://www.youtube.com/watch?v=${yt}`;
  const u = new URL(raw.trim());
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  const kept = [...u.searchParams].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = kept.length ? "?" + new URLSearchParams(kept).toString() : "";
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u.toString();
}

/** 重複判定のキー。YouTube は動画 ID、それ以外は正規化 URL */
function candidateKey(raw) {
  const yt = youtubeId(raw);
  return yt ? `youtube:${yt}` : normalizeUrl(raw);
}

// ---------- 題名の類似（翻訳・転載・切り抜きの「確認が必要な候補」を出すだけ。削除はしない） ----------

function normalizeTitle(t) {
  return (t || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, " ") // 【パッチ26.8】[日本語字幕] などの付記
    .replace(/日本語字幕|eng\s*sub|english\s*sub|translated|翻訳|切り抜き/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 正規化した題名の文字 bigram の Jaccard 係数（0〜1）*/
function titleSimilarity(a, b) {
  return jaccard(bigrams(normalizeTitle(a)), bigrams(normalizeTitle(b)));
}

function jaccard(x, y) {
  if (x.size === 0 || y.size === 0) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return inter / (x.size + y.size - inter);
}

const TRANSLATION_MARK = /日本語字幕|翻訳|eng\s*sub|english\s*sub|translated|字幕/i;

// ---------- 暫定分類（題名・抜粋・カテゴリなど、一覧で取れる情報だけを使う） ----------

const ROLE_PATTERNS = {
  mid: /ミッド|ミドル|\bmid(?:\s?lane(?:r)?)?\b|(?:^|[/_-])mid(?:[/_-]|$)/i,
  jungle: /ジャングル|ジャングラー|\bjg\b|\bjungle(?:r)?\b|(?:^|[/_-])jungle(?:[/_-]|$)/i,
  top: /トップ|\btop\s?lane(?:r)?\b|(?:^|[/_-])top(?:[/_-]|$)/i,
  bot: /ボット|\badc\b|マークスマン|\bbot\s?lane\b|(?:^|[/_-])(?:bot|adc)(?:[/_-]|$)/i,
  support: /サポート|\bsupport\b|(?:^|[/_-])(?:sup|support)(?:[/_-]|$)/i,
};

// MID の判定に使う、主にミッドで使われるメイジ・アサシン（題名にロール名がない記事のため。推定であり確定ではない）
const MID_CHAMPIONS =
  /アーリ|アニー|アニビア|アジール|オレリオン|カサディン|カシオペア|ガリオ|キヤナ|コーキ|ゼド|シンドラ|ゾーイ|タロン|タリヤ|ツイステッド|ヴェックス|ベイガー|ヴィクター|フィズ|ハイマーディンガー|ブラッド|マルザハール|ラックス|ルブラン|ライズ|リサンドラ|オリアナ|ヤスオ|ヨネ|アカリ|カタリナ|ダイアナ|ナフィーリ|オーロラ|ハイマー|\b(?:ahri|annie|anivia|azir|aurelion|kassadin|cassiopeia|galio|qiyana|syndra|zoe|talon|taliyah|twisted\s?fate|vex|veigar|viktor|fizz|malzahar|lux|leblanc|ryze|lissandra|orianna|yasuo|yone|akali|katarina|zed|aurora|hwei|mel)\b/i;

// ロールを問わない知識であることを示すカテゴリ・タグ（情報源が付けたもの）
const COMMON_MARKERS = /全ロール共通|ロール共通|マクロ|ミクロ|知識を深めよう|ゲーム外での発展|チームゲーム|lolの基礎知識|ウェーブコントロール/i;

// サイト運営の記事（教材ではない）
const SITE_META = /リダイレクト|\bseo\b|記事統合|ブログ運営|サイト運営|アフィリエイト/i;

// 対象外のモード・ゲーム
const OTHER_MODE = /\baram\b|アリーナ|\barena\b|メイヘム|mayhem|\btft\b|チームファイト・?タクティクス|ワイルドリフト|wild\s?rift|ネクサスブリッツ|\burf\b|ワンフォーオール/i;
// 別モードの名前があっても、ランク戦と比べている題名は除外しない
const RANKED_CONTEXT = /ランク|ソロキュー|ソロq|\branked\b/i;

// 解説を伴わないとみられる動画・記事（題名からの推定。保留にとどめ、除外はしない）
const LIKELY_NO_COMMENTARY = /game\s?play|classic\s?game|full\s?game|vod\b|ハイライト|highlights?|配信|stream\b|プレイ動画|本人視点|duo with|\b(challenger|grandmaster)\b|\d{3,4}\s?lp\b|^\[\d{4}\/\d{1,2}\/\d{1,2}\]|\bvs\b.*\b(iron|bronze|silver|gold)\b/i;
// 解説・講義であることを題名で示している動画は、上の語があってもプレイ動画とみなさない
// （例：「Gameplay & Commentary Translated」「Improve your League Gameplay - The Timeline Practice Concept」）
const HAS_COMMENTARY = /commentary|解説|講義|概論|lecture|concept|breakdown|explained|analysis|coaching|コーチング/i;

// 理由・判断・条件を扱っていることを示す語（深さの暫定推定に使う）
const REASON_WORDS = /なぜ|理由|判断|考え方|使い分け|条件|とは[？?]?|方法|コツ|仕組み|タイミング|違い|べき|基準|意識|原則|振り返り|上達|why|how\s?to|when\s?to|explained|principles?|mistakes?|decision|guide\s?to|fundamentals?|concepts?/i;
// 一覧・速報・テンプレートとみられる語（理由の説明が少ない傾向）
const SHALLOW_WORDS = /ティア(リスト)?|tier\s?list|ランキング|速報|最強チャンピオン|おすすめチャンピオン|パッチノート要約|skin|スキン|q&a|discord|完全ガイド|完全攻略|ビルドガイド|ビルド解説|ビルド・ルーン|ルーン・サモナー|build\s?guide|\bbuild\b(?!\s?path)|コンボ/i;
// 書評・メンタル・自己啓発（ジャンルだけで除外しない。判断・振り返り・学習の語があれば評価する）
const MENTAL_WORDS = /メンタル|書評|本を読|読書|習慣|モチベーション|ティルト|tilt|mindset|自己啓発/i;
const LEARNING_WORDS = /振り返り|リプレイ|言語化|上達|学習|練習|意思決定|判断|考え方|review|replay|learn|improve/i;

// ロール共通の判断原則・マクロ・ウェーブ・視界・リソース管理・学習方法（Topic ID）
const COMMON_TOPICS = new Set([
  "wave-management", "freeze", "slow-push", "fast-push", "minion-aggro", "recall", "vision", "jungle-tracking",
  "lane-priority", "roaming", "playing-from-behind", "decision-making", "review-learning", "snowball", "trading",
  "cooldown", "experience", "level-2", "summoner-spells", "runes", "itemization", "matchup", "jungle-invade",
]);

/** sample-resources の Topic 別名で、題名などに現れる Topic を拾う（大分類とチャンピオンの Topic は除く）*/
function topicMatcher(topics) {
  const entries = [];
  for (const t of topics) {
    if (t.kind === "category") continue;
    for (const raw of [t.label_ja, t.label_en, ...t.aliases_ja, ...t.aliases_en]) {
      const term = raw.normalize("NFKC").toLowerCase();
      if ([...term].length < 2) continue;
      const ascii = /^[\x20-\x7e]+$/.test(term);
      const body = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
      entries.push({ id: t.id, re: new RegExp(ascii ? `(?<![a-z0-9])${body}s?(?![a-z0-9])` : body, "i") });
    }
  }
  const match = (text) => {
    const s = (text || "").normalize("NFKC").toLowerCase();
    return [...new Set(entries.filter((e) => e.re.test(s)).map((e) => e.id))];
  };
  // 複数の文から取った Topic を、Topic の定義順に並べ直すための順番
  match.order = new Map(topics.map((t, i) => [t.id, i]));
  return match;
}

/**
 * 抜粋（サイトの説明文や記事の書き出し。原典の文そのもの）から、分類に使う手がかりだけを取り出す。
 * 抜粋の文章は保存せず、この手がかりだけを候補データに残す（第三者の文を公開リポジトリに置かないため）。
 * 規則を変えても、保存済みの手がかりは取得し直さない限り古い規則のまま。
 */
function excerptFeatures(excerpt, matchTopics) {
  const s = excerpt || "";
  return {
    roles: Object.entries(ROLE_PATTERNS).filter(([, re]) => re.test(s)).map(([r]) => r),
    topic_ids: matchTopics(s).sort(),
    mage: /メイジ|\bmage\b/i.test(s),
    reason: REASON_WORDS.test(s),
    mental: MENTAL_WORDS.test(s),
    learning: LEARNING_WORDS.test(s),
  };
}
const NO_FEATURES = { roles: [], topic_ids: [], mage: false, reason: false, mental: false, learning: false };

/**
 * 一覧で取れる情報だけから、対象ロール・Topic 候補・優先区分・深さの推定を出す。
 * 深さはあくまで推定（estimate）であり、本文を確認した結果（reviews.json の depth_confirmed）とは別に扱う。
 * 抜粋は文章ではなく、excerpt_features（excerptFeatures の結果）として使う。
 */
function classify(c, matchTopics) {
  const ex = c.excerpt_features || NO_FEATURES;
  const text = [c.title, ...(c.categories || []), ...(c.tags || []), c.url].filter(Boolean).join(" \n ");
  // ロールは題名・カテゴリ・URL から判定し、そこにないときだけ抜粋を見る（抜粋は他ロールへの言及を含みやすい）
  let roles = Object.entries(ROLE_PATTERNS).filter(([, re]) => re.test(text)).map(([r]) => r);
  if (roles.length === 0) roles = [...ex.roles];
  if (MID_CHAMPIONS.test(c.title || "") && !roles.includes("mid") && roles.length === 0) roles.push("mid");
  const order = matchTopics.order || new Map();
  const topic_ids = [...new Set([...matchTopics(text), ...ex.topic_ids])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  if ((/メイジ|\bmage\b/i.test(text) || ex.mage) && !topic_ids.includes("mage")) topic_ids.push("mage");

  const signals = [];
  let score = 0;
  const add = (cond, name, pts) => {
    if (cond) {
      signals.push(name);
      score += pts;
    }
  };
  add(REASON_WORDS.test(c.title || ""), "題名に理由・判断の語", 2);
  add(ex.reason, "抜粋に理由・判断の語", 1);
  add(SHALLOW_WORDS.test(c.title || ""), "題名が一覧・テンプレート型", -2);
  add(topic_ids.some((t) => COMMON_TOPICS.has(t)), "判断に関わる Topic に一致", 1);
  const st = c.structure;
  if (st) {
    add(st.chars >= 4000, `本文が長い（${st.chars}字）`, 1);
    add(st.chars > 0 && st.chars < 1500, `本文が短い（${st.chars}字）`, -1);
    add(st.reason_headings >= 2, `理由・条件の見出し ${st.reason_headings}個`, 1);
  }
  if (c.duration_sec != null) {
    add(c.duration_sec >= 600, "動画が10分以上", 1);
    add(c.duration_sec > 0 && c.duration_sec < 180, "動画が3分未満", -1);
  }
  const depth_estimate = score >= 3 ? "high" : score >= 1 ? "medium" : "low";

  let tier;
  if (roles.includes("mid") || topic_ids.includes("mage")) tier = "P1-mid";
  else if (roles.length === 0 && (topic_ids.some((t) => COMMON_TOPICS.has(t)) || LEARNING_WORDS.test(text) || ex.learning || (c.categories || []).some((x) => COMMON_MARKERS.test(x)))) tier = "P1-common";
  else if (roles.length > 0 && roles.every((r) => r === "jungle")) tier = "P2";
  else if (roles.length > 0) tier = "P3";
  else tier = "unclassified";

  return { roles, topic_ids, tier, depth_estimate, depth_signals: signals };
}

/** 規則による仮の振り分け。reviews.json に判断があれば、そちらを優先する */
function ruleTriage(c) {
  const ex = c.excerpt_features || NO_FEATURES;
  const mental = MENTAL_WORDS.test(c.title || "") || ex.mental;
  const learning = LEARNING_WORDS.test(c.title || "") || ex.learning;
  if (c.existing_resource_id) return { status: "registered", reason: `既存資料 ${c.existing_resource_id} と同じ URL・動画` };
  // 抜粋は他モードに触れるだけのことが多いので、題名・カテゴリ・URL だけで判定する
  const otherMode = OTHER_MODE.test(c.title || "") || OTHER_MODE.test(c.url) || (c.categories || []).some((x) => OTHER_MODE.test(x));
  if (otherMode && !RANKED_CONTEXT.test(c.title || "")) return { status: "excluded", reason: "別モード・別ゲーム" };
  if (SITE_META.test(c.title || "")) return { status: "excluded", reason: "サイト運営の記事（教材ではない）" };
  // 以下の「保留」は、確認の順番を後にするだけの暫定の振り分け（除外ではない。report の見直し枠で抜き取り確認する）
  if (c.type === "video" && LIKELY_NO_COMMENTARY.test(c.title || "") && !HAS_COMMENTARY.test(c.title || "")) return { status: "hold", reason: "解説のないプレイ動画の可能性（題名から推定）" };
  if (c.tier === "P3") return { status: "hold", reason: "他ロール固有（P3）" };
  if (c.tier === "unclassified") return { status: "hold", reason: "対象ロール・主題を題名から判定できない" };
  if (mental && !learning) return { status: "hold", reason: "メンタル・自己啓発系で、判断・学習の語がない（ジャンルだけでは除外しない）" };
  if (c.depth_estimate === "low") return { status: "hold", reason: "深さの推定が低い（題名・構成から）" };
  return { status: "candidate", reason: "深い確認の対象（推定。内容は未確認）" };
}

// ---------- 候補の統合（再実行しても候補が増殖しない） ----------

const TIER_ORDER = ["P1-common", "P1-mid", "P2", "P3", "unclassified"];

/**
 * 既存の候補一覧に、新しく取得した項目を統合する。
 * - 同じキー（正規化 URL・動画 ID）は1件にまとめ、見つけた URL の違い（追跡パラメータなど）は url_variants に残す
 * - 最初に見つけた日時（discovered_at）は変えない。同じ入力での再実行は、ファイルの内容を変えない
 * @param {object[]} existing  これまでの候補
 * @param {object[]} incoming  取得した項目（url と source は必須）
 * @param {{ now: string, resources: object[], topics: object[], reviews?: Record<string, object> }} ctx
 */
function mergeCandidates(existing, incoming, ctx) {
  const byKey = new Map(existing.map((c) => [c.key, { ...c }]));
  for (const item of incoming) {
    const key = candidateKey(item.url);
    const prev = byKey.get(key);
    if (prev) {
      for (const [k, v] of Object.entries(item)) {
        if (k === "url" || k === "source" || v == null || v === "") continue;
        prev[k] = v; // 一覧で取れる情報は新しい値で更新する
      }
      if (!prev.sources.includes(item.source)) prev.sources = [...prev.sources, item.source].sort();
      const variant = item.url.trim();
      if (variant !== prev.url && !prev.url_variants.includes(variant)) prev.url_variants = [...prev.url_variants, variant].sort();
    } else {
      const { source, ...rest } = item;
      byKey.set(key, { key, ...rest, url: item.url.trim(), normalized_url: normalizeUrl(item.url), url_variants: [], sources: [source], discovered_at: ctx.now });
    }
  }
  return annotate([...byKey.values()], ctx);
}

/** 既存資料との重複・題名の類似・分類・振り分けを付け直す（取得した情報だけから毎回計算する）*/
function annotate(list, { resources, topics, reviews = {} }) {
  const matchTopics = topicMatcher(topics);
  const existingByKey = new Map();
  for (const r of resources) existingByKey.set(candidateKey(r.url), r.id);
  const out = list.map((c) => {
    const base = { ...c, existing_resource_id: existingByKey.get(c.key) || null };
    // 取得した抜粋は、手がかりに変えてから捨てる（抜粋の文章は保存しない）
    if (base.excerpt != null) {
      base.excerpt_features = excerptFeatures(base.excerpt, matchTopics);
      delete base.excerpt;
    }
    Object.assign(base, classify(base, matchTopics));
    return base;
  });
  // 題名の bigram は1件につき1回だけ作る（候補が数千件でも、組ごとに作り直さない）
  const gramsOf = new Map();
  const grams = (t) => {
    if (!gramsOf.has(t)) gramsOf.set(t, bigrams(normalizeTitle(t)));
    return gramsOf.get(t);
  };
  for (const c of out) {
    const similar = [];
    if (!c.existing_resource_id) {
      for (const r of resources) {
        const s = jaccard(grams(c.title), grams(r.title));
        if (s >= 0.6) similar.push({ resource_id: r.id, similarity: round(s), relation: "similar_title" });
      }
      for (const o of out) {
        if (o.key === c.key) continue;
        const s = jaccard(grams(c.title), grams(o.title));
        if (s >= 0.6) similar.push({ candidate_key: o.key, similarity: round(s), relation: "similar_title" });
      }
    }
    // 翻訳版は題名が別言語になるので類似では拾えない。翻訳の印がある動画は、原典の確認が要る候補として示す
    c.needs_review = [
      ...similar.map((x) => ({ ...x, note: "題名が類似。翻訳・転載・切り抜き・続編のいずれかを確認" })),
      ...(c.type === "video" && TRANSLATION_MARK.test(c.title || "") && !c.existing_resource_id
        ? [{ relation: "possible_translation", note: "翻訳・字幕版の印あり。原典の特定が要る" }]
        : []),
    ];
    const rule = ruleTriage(c);
    const review = reviews[c.key];
    c.triage = review?.decision
      ? { status: review.decision, reason: review.reason || "個別確認の結果", by: "review" }
      : { ...rule, by: "rule" };
    c.depth_confirmed = review?.depth_confirmed ?? null; // 本文・字幕を確認した結果。推定（depth_estimate）とは別
  }
  return out.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.key.localeCompare(b.key));
}

const round = (x) => Math.round(x * 100) / 100;

/** 「題名 - タグ1, タグ2」形式の題名（lol-guide.com など）を、題名とタグに分ける */
function splitTitleTags(title) {
  const m = /^(.+?) - ([^-]+)$/.exec(title || "");
  if (!m || (!m[2].includes(",") && m[2].length > 20)) return { title, tags: [] };
  return { title: m[1].trim(), tags: m[2].split(/\s*,\s*/).filter(Boolean) };
}

// ---------- 本文の構成（深さの推定用。本文そのものは保存しない） ----------

const REASON_HEADING = /なぜ|理由|場合|条件|注意|例外|判断|基準|メリット|デメリット|リスク|代わり|ポイント|why|when|if\b|exception|mistake/i;

/** HTML から本文の文字数と見出しの数だけを数える（本文・見出しの文字列は返さない）*/
function structureOf(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, "");
  const headings = [...body.matchAll(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  const text = body.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, "");
  return { chars: text.length, headings: headings.length, reason_headings: headings.filter((h) => REASON_HEADING.test(h)).length };
}

module.exports = {
  youtubeId, normalizeUrl, candidateKey, normalizeTitle, titleSimilarity, topicMatcher, classify, ruleTriage,
  mergeCandidates, annotate, structureOf, splitTitleTags, excerptFeatures, TIER_ORDER,
};
