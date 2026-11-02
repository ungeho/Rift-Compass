#!/usr/bin/env node
// ゲームデータの取り込み CLI（依存パッケージなし。Node 18 以降の fetch を使う）
//
//   node tools/gamedata/ingest.js ddragon <版> [--cache <dir>]  Data Dragon の championFull（en_US・ja_JP）を1チャンピオン1ファイルにする
//   node tools/gamedata/ingest.js wiki [--cache <file>]         LoL Wiki の Module:ChampionData/data（MediaWiki API）を JSON にする
//   node tools/gamedata/ingest.js report <版> [<比べる版>]       スキルの取得範囲・Wiki との照合・版の違いを report.json に書く
//   node tools/gamedata/ingest.js topics <版>                   全チャンピオンと5ロールの Topic を追加する（既存の Topic は変えない）
//   node tools/gamedata/ingest.js ddragon-extra <版>             Data Dragon のアイテム・ルーン・サモナースペル（日英）
//   node tools/gamedata/ingest.js positions                    ポジション → チャンピオンの一覧（Wiki の client_positions・external_positions）
//   node tools/gamedata/ingest.js ambiguity <版>                ほかのカタカナ語の一部になるチャンピオン名を src/search/ambiguousNames.json に書く
//
// 出力：public/gamedata/（静的公開。画面は必要なチャンピオンのファイルだけを読む）。古い版は消さずに残す。
"use strict";
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public/gamedata");
const DATA = path.join(ROOT, "data/sample-resources.json");
const MANIFEST = path.join(OUT, "manifest.json");
const UA = { "User-Agent": "RiftCompass/0.1 (static knowledge browser; https://github.com/ungeho/Rift-Compass)" };
const today = () => new Date().toISOString().slice(0, 10);

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v, pretty = false) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, pretty ? 1 : 0) + "\n");
};
const manifest = () => (fs.existsSync(MANIFEST) ? readJson(MANIFEST) : { note: "", ddragon: [], wiki_championdata: [], current: {} });

async function getJson(url, cacheFile) {
  if (cacheFile && fs.existsSync(cacheFile)) return readJson(cacheFile);
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

function topicIdFor(nameEn, topics) {
  const t = topics.find((x) => x.id.startsWith("champ-") && x.label_en.toLowerCase() === nameEn.toLowerCase());
  return t ? t.id : L.championTopicId(nameEn);
}

async function ddragon(version, cache) {
  const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data`;
  const en = await getJson(`${base}/en_US/championFull.json`, cache && path.join(cache, `full-${version}-en_US.json`));
  const ja = await getJson(`${base}/ja_JP/championFull.json`, cache && path.join(cache, `full-${version}-ja_JP.json`));
  if (en.version !== version) throw new Error(`版が違う：${en.version}`);
  const realm = await getJson("https://ddragon.leagueoflegends.com/realms/na.json").catch(() => null);
  const source = { name: "Riot Data Dragon", version, files: [`${base}/en_US/championFull.json`, `${base}/ja_JP/championFull.json`], fetched_at: today() };
  const topics = readJson(DATA).topics;
  const dir = path.join(OUT, "ddragon", version);
  const index = [];
  for (const id of Object.keys(en.data).sort()) {
    const c = L.normalizeDDragonChampion(en.data[id], ja.data[id], source);
    writeJson(path.join(dir, "champions", `${id}.json`), c);
    index.push(L.indexEntry(c, topicIdFor(c.name.en, topics)));
  }
  // 既知の不具合：生の値は champions/<ID>.json と一覧の stats にそのまま残し、ここに「採用しない項目」として記録する
  const known_issues = L.knownIssuesFor(index);
  writeJson(path.join(dir, "index.json"), { source, count: index.length, known_issues, champions: index });
  // Riot のチャンピオンクラス（Data Dragon の tags）。複数のクラスを持つチャンピオンはすべてのクラスに入れる。
  // ポジション（担当レーン）とは別の分類で、クラスから個々のチャンピオンの仕様・戦術は推定しない
  const classes = {};
  for (const c of index) for (const tag of c.tags) (classes[tag] = classes[tag] || []).push(c.id);
  writeJson(path.join(dir, "classes.json"), { source, field: "tags", note: "Riot のチャンピオンクラス（Data Dragon の tags の順のまま。先頭が主なクラスとは限らない）。ポジションとは別", classes, by_champion: Object.fromEntries(index.map((c) => [c.id, c.tags])) }, true);
  const m = manifest();
  m.ddragon = m.ddragon.filter((x) => x.version !== version);
  m.ddragon.push({ version, fetched_at: today(), champions: index.length, realm_na_current_at_fetch: realm ? realm.n?.champion === version : null });
  m.ddragon.sort((a, b) => cmpVersion(b.version, a.version));
  m.current.ddragon = m.ddragon[0].version;
  writeJson(MANIFEST, m, true);
  console.log(`Data Dragon ${version}：${index.length}件 → ${path.relative(ROOT, dir)}`);
}

function cmpVersion(a, b) {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let k = 0; k < Math.max(pa.length, pb.length); k++) if ((pa[k] || 0) !== (pb[k] || 0)) return (pa[k] || 0) - (pb[k] || 0);
  return 0;
}

async function wiki(cacheFile) {
  const url = "https://wiki.leagueoflegends.com/en-us/api.php?action=query&prop=revisions&titles=Module:ChampionData/data&rvprop=content|ids|timestamp&rvslots=main&format=json";
  const j = await getJson(url, cacheFile);
  const page = Object.values(j.query.pages)[0];
  const rev = page.revisions[0];
  const data = L.parseLuaTable(rev.slots.main["*"]);
  const source = { name: "League of Legends Wiki — Module:ChampionData/data", url: "https://wiki.leagueoflegends.com/en-us/Module:ChampionData/data", revid: rev.revid, timestamp: rev.timestamp, fetched_at: today(), license: "CC BY-SA 3.0（Wiki の記載）" };
  // チャンピオンごと（Data Dragon のキーごと、形態をまとめて）に分ける。画面は必要な1件だけを読む
  const dir = path.join(OUT, "wiki-championdata", String(rev.revid));
  const forms = L.wikiFormsByKey(data);
  for (const [key, list] of forms) writeJson(path.join(dir, "by-key", `${key}.json`), { source, key, forms: list });
  writeJson(path.join(dir, "index.json"), { source, count: Object.keys(data).length, entries: Object.entries(data).map(([form, w]) => ({ form, id: w.id, apiname: w.apiname })) });
  const file = dir;
  const m = manifest();
  m.wiki_championdata = m.wiki_championdata.filter((x) => x.revid !== rev.revid);
  m.wiki_championdata.push({ revid: rev.revid, timestamp: rev.timestamp, fetched_at: today(), champions: Object.keys(data).length });
  m.wiki_championdata.sort((a, b) => b.revid - a.revid);
  m.current.wiki_championdata = m.wiki_championdata[0].revid;
  writeJson(MANIFEST, m, true);
  console.log(`Wiki ChampionData revid ${rev.revid}：${Object.keys(data).length}件 → ${path.relative(ROOT, file)}`);
}

function loadVersion(version) {
  const dir = path.join(OUT, "ddragon", version);
  const index = readJson(path.join(dir, "index.json")).champions;
  const champs = Object.fromEntries(index.map((c) => [c.id, readJson(path.join(dir, "champions", `${c.id}.json`))]));
  return { index, champs };
}

function report(version, prev) {
  const cur = loadVersion(version);
  const m = manifest();
  const out = { version, generated_at: today(), coverage: L.spellCoverage(Object.values(cur.champs)) };
  if (m.current.wiki_championdata) {
    const wdir = path.join(OUT, "wiki-championdata", String(m.current.wiki_championdata));
    const widx = readJson(path.join(wdir, "index.json"));
    const champions = {};
    for (const f of fs.readdirSync(path.join(wdir, "by-key"))) for (const x of readJson(path.join(wdir, "by-key", f)).forms) { const { form, ...rest } = x; champions[form] = rest; }
    const w = { source: widx.source, champions };
    out.wiki_revid = w.source.revid;
    out.cross_check = L.crossCheck(cur.index, w.champions);
    // 既知の不具合による違いは印を付けて分ける（生の値の違いとしては残す）
    const issueFields = new Set(L.knownIssuesFor(cur.index).map((k) => k.field));
    for (const d of out.cross_check.diffs) if (issueFields.has(d.stat)) d.known_issue = true;
    // 比較の条件の違い（特殊な仕様）を調べた結果を、違いごとに残す。解決できないものは unresolved のまま
    const multi = new Map(out.cross_check.multiForm.map((m) => [m.id, m]));
    for (const d of out.cross_check.diffs) {
      const c = cur.index.find((x) => x.id === d.id);
      const wf = w.champions[d.form];
      if (d.known_issue) d.status = "known_issue";
      else if ((d.stat === "mp" || d.stat === "mpperlevel") && c.partype !== "Mana" && wf?.stats?.mp_base === 0) {
        d.status = "unresolved";
        d.note = `マナを持たないチャンピオン（Data Dragon の partype「${c.partype || "（空）"}」、Wiki の resource「${wf.resource}」）。Wiki は0、Data Dragon は別の値で、項目の意味（リソースの上限か、なしか）の違いの可能性。どちらの意味かは確かめていない`;
      } else if (d.stat === "attackspeedperlevel" && wf?.stats?.as_ratio === 0) {
        d.status = "explained";
        d.note = "Wiki の攻撃速度の反映率が0（成長・増加攻撃速度が攻撃速度に反映されない）。どちらの成長値でも合計の攻撃速度は同じ。Wiki の成長値が別の効果（パッシブ）に使われるかは扱わない";
      } else if (multi.has(d.id)) {
        d.status = "unresolved";
        d.note = `形態が複数（${multi.get(d.id).forms.join("・")}）。Data Dragon の値は形態が混ざって見える（どの形態とも全項目は一致しない）。どの形態の値かは確かめていない`;
      } else d.status = "unresolved";
    }
    out.cross_check.unexplained = out.cross_check.diffs.filter((d) => !d.known_issue).length;
    out.cross_check.unresolved = out.cross_check.diffs.filter((d) => d.status === "unresolved").length;
    out.known_issues = L.knownIssuesFor(cur.index);
    const wikiKeys = new Set(Object.values(w.champions).map((x) => String(x.id)));
    out.wiki_only = Object.values(w.champions).filter((x) => !cur.index.some((c) => String(c.key) === String(x.id))).map((x) => x.apiname);
    out.as_ratio_differs_from_base = Object.values(w.champions).filter((x) => x.stats && x.stats.as_ratio != null && x.stats.as_ratio !== x.stats.as_base).length;
    out.as_ratio_missing = Object.values(w.champions).filter((x) => wikiKeys.has(String(x.id)) && (!x.stats || x.stats.as_ratio == null)).map((x) => x.apiname);
  }
  if (prev) {
    const old = loadVersion(prev);
    out.diff_from = prev;
    out.diff = L.diffVersions(old.index, cur.index, old.champs, cur.champs);
  }
  writeJson(path.join(OUT, "ddragon", version, "report.json"), out, true);
  console.log(JSON.stringify({ coverage: out.coverage, cross_check: out.cross_check && { missing: out.cross_check.missing, diffs: out.cross_check.diffs.length }, diff: out.diff && { added: out.diff.added, removed: out.diff.removed, changed: out.diff.changed.length } }, null, 1));
}

// ---------------------------------------------------------------------------
// Topic：全チャンピオン（cat-champions の子）と5ロール（大分類）。既存の Topic・ID は変えない
const ROLE_TOPICS = [
  { id: "role-top", label_ja: "トップレーン", label_en: "Top lane", aliases_ja: ["トップ", "トップレーナー", "TOP"], aliases_en: ["top", "top lane", "top laner", "toplaner"] },
  { id: "role-jungle", label_ja: "ジャングル", label_en: "Jungle", aliases_ja: ["ジャングラー", "JG"], aliases_en: ["jungle", "jungler", "jg"] },
  { id: "role-bot", label_ja: "ボットレーン", label_en: "Bot lane", aliases_ja: ["ボット", "ボトム", "ADC", "ボットレーナー"], aliases_en: ["bot", "bot lane", "bottom", "adc", "ad carry"] },
  { id: "role-support", label_ja: "サポート", label_en: "Support", aliases_ja: ["サポ", "SUP"], aliases_en: ["support", "sup", "supp"] },
];

function topics(version) {
  const { index } = loadVersion(version);
  let s = fs.readFileSync(DATA, "utf8");
  const data = JSON.parse(s);
  const have = new Set(data.topics.map((t) => t.id));
  const inline = (t) => "    " + JSON.stringify(t).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/","/g, '", "');
  const add = [];
  for (const r of ROLE_TOPICS) if (!have.has(r.id)) add.push({ id: r.id, kind: "category", parent_ids: [], label_ja: r.label_ja, label_en: r.label_en, aliases_ja: r.aliases_ja, aliases_en: r.aliases_en });
  for (const c of [...index].sort((a, b) => a.name.en.localeCompare(b.name.en))) {
    if (have.has(c.topic_id)) continue;
    const aliasesEn = [...new Set([c.name.en, c.id !== c.name.en.replace(/[^A-Za-z]/g, "") ? c.id : null].filter(Boolean))];
    add.push({ id: c.topic_id, kind: "concept", parent_ids: ["cat-champions"], label_ja: c.name.ja, label_en: c.name.en, aliases_ja: L.jaVariants(c.name.ja), aliases_en: aliasesEn });
  }
  if (add.length === 0) return console.log("追加する Topic はない");
  const anchor = "\n  ],\n  \"resources\": [";
  if (s.split(anchor).length !== 2) throw new Error("topics の終わりが見つからない");
  s = s.replace(anchor, ",\n" + add.map(inline).join(",\n") + anchor);
  JSON.parse(s);
  fs.writeFileSync(DATA, s);
  console.log(`Topic を ${add.length}件追加（ロール ${add.filter((t) => t.kind === "category").length}・チャンピオン ${add.filter((t) => t.kind === "concept").length}）`);
}

// ---------------------------------------------------------------------------
// あいまいなチャンピオン名：日本語名が、ほかのカタカナ語の一部としてコーパスに現れるもの（例：ナー ⊂ ナーフ）。
// 検索では、これらの名前だけ前後が別のカタカナに続く一致を採らない（ロール名などの決まった語・ほかのチャンピオン名との連結は除く）
const COMMON_AFFIXES = ["トップ", "ミッド", "ミドル", "ジャングル", "サポート", "ボット", "ボトム", "ビルド", "ガイド", "アイテム", "ルーン", "コンボ", "カウンター", "プレイヤー", "キャリー", "キャラ", "チャレ", "スキン"];

const SUPPLEMENTARY_WORDS = ["アーリーゲーム", "アーリー", "レイトゲーム", "ミッドゲーム", "パーソナル", "ダイナミック", "サプライズ", "マージン", "エンジン", "ナーフ", "バフ", "ダメージ", "シールド", "ガンク", "キル", "アシスト", "シャットダウン", "ローテーション", "ポジション", "スプリットプッシュ", "テレポート", "オブジェクト", "スノーボール", "ゴールド", "チャンピオン", "スキルショット", "クールダウン", "ヘイスト", "ブッシュ", "サイドレーン", "ラストヒット", "ハラス", "エンゲージ", "ピール", "バースト", "カウンター", "マッチアップ", "トレード", "リコール", "ワード", "コントロール", "ドラゴン", "バロン", "ヘラルド", "グラブ", "インヒビター", "ネクサス", "タワー", "プレート", "ジャングラー", "サポーター", "キャリー", "ダイブ", "ロール", "ピック", "バン", "ドラフト", "ランク", "ノーマル", "ソロキュー", "プレイスタイル", "メカニクス", "フィジカル", "マクロ", "ミクロ"];

function ambiguity(version) {
  const { index } = loadVersion(version);
  const d = readJson(DATA);
  const texts = [];
  const candFile = path.join(ROOT, "data/candidates/candidates.json");
  if (fs.existsSync(candFile)) for (const c of readJson(candFile)) texts.push(c.title || "");
  for (const r of d.resources) texts.push(r.title || "", r.summary_ja || "");
  for (const n of d.knowledge_notes) texts.push(n.statement_ja, n.notes_ja || "", ...(n.conditions_ja || []), ...(n.exceptions_ja || []));
  for (const t of d.topics) texts.push(t.label_ja, ...t.aliases_ja);
  // コーパスにはまだないが、検索で使われやすい一般のカタカナ語（手で加えた補い。根拠はコーパスではない）
  texts.push(...SUPPLEMENTARY_WORDS);
  const runs = new Set(texts.flatMap((t) => L.katakanaRuns(t)));
  const champNames = new Map();
  for (const t of d.topics.filter((x) => x.parent_ids.includes("cat-champions") || x.id.startsWith("champ-"))) for (const a of [t.label_ja, ...t.aliases_ja]) if (/^[ァ-ヺー・＝]+$/.test(a)) champNames.set(a, t.id);
  const affixes = [...COMMON_AFFIXES, ...[...champNames.keys()].filter((n) => n.length >= 3)];
  const terms = {};
  for (const [name, topic] of champNames) {
    // 検索は長い一致を先に採るので、この名前を含むより長いチャンピオン名（例：ジン ⊂ ジンクス、フェイト ⊂ ツイステッドフェイト）の部分は除いてから調べる
    const longer = [...champNames.keys()].filter((n) => n.length > name.length && n.includes(name));
    const masked = [...runs].flatMap((r) => longer.reduce((acc, n) => acc.split(n).join(" "), r).split(" ")).filter((r) => r.length >= name.length);
    const examples = L.ambiguousInRuns(name, masked, affixes.filter((a) => a !== name));
    if (examples.length) terms[name] = { topic, examples };
  }
  const out = { generated_at: today(), ddragon: version, corpus: { texts: texts.length, katakana_runs: runs.size }, rule: "日本語名の前後が別のカタカナに続く一致は採らない（affixes の語との連結は採る）", affixes: COMMON_AFFIXES, terms };
  writeJson(path.join(ROOT, "src/search/ambiguousNames.json"), out, true);
  console.log(`あいまいな名前 ${Object.keys(terms).length}件：${Object.keys(terms).join("、")}`);
}

// ---------------------------------------------------------------------------
// Data Dragon のアイテム・ルーン・サモナースペル（en_US・ja_JP）。公式の日本語の名前と説明を、画面の日本語の表示に使う
async function ddragonExtra(version) {
  const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data`;
  const get = async (lang, file) => getJson(`${base}/${lang}/${file}`);
  const source = { name: "Riot Data Dragon", version, fetched_at: today() };
  const dir = path.join(OUT, "ddragon", version);
  const strip = (h) => (h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
  // アイテム
  const [ien, ija] = [await get("en_US", "item.json"), await get("ja_JP", "item.json")];
  const items = Object.entries(ien.data).map(([id, e]) => {
    const j = ija.data[id] || {};
    return { id: Number(id), name: { en: e.name, ja: j.name ?? null }, plaintext: { en: e.plaintext || null, ja: j.plaintext || null }, description: { en: strip(e.description), ja: strip(j.description) }, gold: e.gold, tags: e.tags, maps: e.maps, from: e.from || [], into: e.into || [] };
  });
  writeJson(path.join(dir, "items.json"), { source: { ...source, files: [`${base}/en_US/item.json`, `${base}/ja_JP/item.json`] }, count: items.length, items }, true);
  // ルーン
  const [ren, rja] = [await get("en_US", "runesReforged.json"), await get("ja_JP", "runesReforged.json")];
  const runes = [];
  ren.forEach((p, pi) => p.slots.forEach((sl, si) => sl.runes.forEach((r, ri) => {
    const j = rja[pi]?.slots[si]?.runes[ri] || {};
    runes.push({ id: r.id, key: r.key, path: { en: p.name, ja: rja[pi]?.name ?? null }, slot: si, name: { en: r.name, ja: j.name ?? null }, short: { en: strip(r.shortDesc), ja: strip(j.shortDesc) }, long: { en: strip(r.longDesc), ja: strip(j.longDesc) } });
  })));
  writeJson(path.join(dir, "runes.json"), { source: { ...source, files: [`${base}/en_US/runesReforged.json`, `${base}/ja_JP/runesReforged.json`] }, count: runes.length, runes }, true);
  // サモナースペル
  const [sen, sja] = [await get("en_US", "summoner.json"), await get("ja_JP", "summoner.json")];
  const spells = Object.entries(sen.data).map(([id, s]) => {
    const j = sja.data[id] || {};
    return { id, key: s.key, name: { en: s.name, ja: j.name ?? null }, description: { en: strip(s.description), ja: strip(j.description) }, cooldown: s.cooldown, range: s.range, summonerLevel: s.summonerLevel, modes: s.modes };
  });
  writeJson(path.join(dir, "summoners.json"), { source: { ...source, files: [`${base}/en_US/summoner.json`, `${base}/ja_JP/summoner.json`] }, count: spells.length, spells }, true);
  console.log(`Data Dragon ${version}：アイテム ${items.length}、ルーン ${runes.length}、サモナースペル ${spells.length}`);
}

// ---------------------------------------------------------------------------
// ポジション（担当レーン）→ チャンピオンの一覧。Topic の親子は変えず、ロールのページが読む。
// 出典は Wiki の Module:ChampionData の client_positions（Riot クライアントの推奨）と external_positions（統計サイトでの使用）。
// 同じチャンピオンは複数のポジションに入る（フレックス）。根拠のない所属は加えない
const POSITION_ROLE = { Top: "role-top", Jungle: "role-jungle", Middle: "role-mid", Bottom: "role-bot", Support: "role-support" };

function positions() {
  const m = manifest();
  const revid = m.current.wiki_championdata;
  const ddv = m.current.ddragon;
  const dir = path.join(OUT, "wiki-championdata", String(revid));
  const source = readJson(path.join(dir, "index.json")).source;
  const dd = readJson(path.join(OUT, "ddragon", ddv, "index.json")).champions;
  const roles = Object.fromEntries(Object.values(POSITION_ROLE).map((r) => [r, { client: [], external: [] }]));
  const unknown = new Set();
  for (const c of dd) {
    const f = path.join(dir, "by-key", `${c.key}.json`);
    if (!fs.existsSync(f)) continue;
    const forms = readJson(f).forms;
    const base = forms.find((x) => Number(x.id) === Math.trunc(Number(x.id))) || forms[0];
    const entry = { topic_id: c.topic_id, id: c.id, key: c.key, name: c.name };
    for (const [field, list] of [["client_positions", "client"], ["external_positions", "external"]]) {
      for (const p of base[field] || []) {
        const role = POSITION_ROLE[p];
        if (!role) { unknown.add(p); continue; }
        roles[role][list].push(entry);
      }
    }
  }
  for (const r of Object.values(roles)) for (const l of ["client", "external"]) r[l].sort((a, b) => (a.name.ja || "").localeCompare(b.name.ja || "", "ja"));
  writeJson(path.join(dir, "positions.json"), {
    source,
    ddragon: ddv,
    note: "client＝Riot クライアントの推奨ポジション（Wiki の記載）、external＝統計サイトなどでの使用（Wiki の記載）。どちらも Wiki の版の時点の記載で、ゲーム内・統計で確かめていない。形態が複数のチャンピオンは基本の形態の記載を使う",
    unknown_positions: [...unknown],
    roles,
  }, true);
  console.log(Object.entries(roles).map(([r, v]) => `${r}: client ${v.client.length} / external ${v.external.length}`).join("、"));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (cmd === "ddragon") return ddragon(args[0], opt("--cache"));
  if (cmd === "wiki") return wiki(opt("--cache"));
  if (cmd === "report") return report(args[0], args[1] && !args[1].startsWith("--") ? args[1] : null);
  if (cmd === "topics") return topics(args[0]);
  if (cmd === "ambiguity") return ambiguity(args[0]);
  if (cmd === "positions") return positions();
  if (cmd === "ddragon-extra") return ddragonExtra(args[0]);
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 9).join("\n"));
  process.exitCode = 1;
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });

module.exports = { ROLE_TOPICS, cmpVersion };
