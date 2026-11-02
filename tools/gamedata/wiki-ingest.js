#!/usr/bin/env node
// 英語 LoL Wiki の網羅的な取り込み CLI（取得の条件は wiki.js の冒頭を参照）
//
//   node tools/gamedata/wiki-ingest.js harvest [--cache <dir>] [--only <分野,...>]
//
// 出力：public/gamedata/wiki/<取得日>/（分野ごとのファイルと coverage.json）。古い取得日のものは消さない。
// 対象のページは Wiki 自身のデータ（Module:ChampionData の技名、Module:ItemData/data/index など）と、
// 公式 Data Dragon（ルーンの名前）から見つける。api.php の検索・一覧は使わない。
"use strict";
const fs = require("fs");
const path = require("path");
const L = require("./lib");
const W = require("./wiki");

const ROOT = path.resolve(__dirname, "../..");
const OUT_BASE = path.join(ROOT, "public/gamedata/wiki");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v) + "\n"); };
const today = () => new Date().toISOString().slice(0, 10);
const SLOT_KEYS = [["skill_i", "I"], ["skill_q", "Q"], ["skill_w", "W"], ["skill_e", "E"], ["skill_r", "R"]];
const MODE_FILES = ["ar", "aram", "nb", "ofa", "swift", "urf", "usb"];

// 記事・ユニットの種（総数の基準ではない。Wiki の全記事数は siteinfo で 16,918）
const UNIT_SEEDS = ["Gromp", "Murk Wolf", "Greater Murk Wolf", "Crimson Raptor", "Raptor", "Ancient Krug", "Krug", "Blue Sentinel", "Red Brambleback", "Rift Scuttler", "Voidgrub", "Rift Herald", "Baron Nashor", "Elder Dragon", "Infernal Drake", "Ocean Drake", "Mountain Drake", "Cloud Drake", "Hextech Drake", "Chemtech Drake", "Atakhan", "Minion (League of Legends)", "Turret", "Inhibitor", "Nexus"];
const ARTICLE_SEEDS = ["Champion statistic", "Attack speed", "Basic attack", "Basic attack reset", "Damage", "Armor", "Magic resistance", "Armor penetration", "Magic penetration", "Lethality", "Health", "Health regeneration", "Mana", "Movement speed", "Ability haste", "Cooldown", "Critical strike", "Life steal", "Omnivamp", "Tenacity", "Crowd control", "Shield", "Spell shield", "Heal and shield power", "Sight", "Stealth", "True sight", "Brush", "Fog of war", "Ward", "Trinket", "Experience (champion)", "Gold", "Monster", "Summoner's Rift", "Projectile", "Unit collision", "Unit size", "Targeting", "Untargetable", "Invulnerability", "Grievous Wounds", "On-hit effect", "Channel", "Dash", "Blink", "Airborne", "Stun", "Root", "Silence", "Slow", "Death", "Respawn", "Champion", "Summoner spell", "Rune", "Item",
  // 2026-11-02 追加：CC・視界・ダメージ・システム
  "Blind", "Nearsight", "Ground", "Fear", "Charm", "Taunt", "Suppression", "Sleep", "Polymorph", "Disarm", "Stasis", "Cripple", "Drowsy", "Kinematics", "Knockback", "Knockup", "Pull",
  "Camouflage", "Invisibility", "Reveal", "Vision", "Fog of war", "Control Ward", "Stealth Ward", "Farsight Alteration", "Oracle Lens",
  "True damage", "Physical damage", "Magic damage", "Damage over time", "Proc damage", "Spell effects", "Area of effect", "Damage reduction", "Heal", "Shield", "Healing reduction",
  "Bounty", "Experience", "Death timer", "Respawn timer", "Minion aggro", "Turret aggro", "Jungle", "Epic monster", "Elemental Drake", "Smite", "Ward", "Recall", "Teleport", "Base"];

/** 説明の項目（description・description2…・blurb）を読める英語にし、解けない記法が残ったかを記録する（翻訳の原文になる）*/
function describeFields(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (!/^(description\d*|blurb\d*)$/.test(k) || !v) continue;
    const plain = W.plainText(v);
    // source_sha1：Wiki の原文（記法つき）、plain_sha1：訳の対象にした英文（記法を簡略化したもの）。
    // 解析の修正で英文だけが変わることがあるので、訳は両方が一致するときだけ有効にする（tools/gamedata/translate.js）
    const sha1 = (x) => require("crypto").createHash("sha1").update(x).digest("hex");
    out[k] = { plain, residual: W.hasResidual(plain), source_sha1: sha1(v), plain_sha1: sha1(plain) };
  }
  return out;
}

async function harvest({ cache, only }) {
  const want = (d) => !only || only.includes(d);
  const snap = today();
  const out = path.join(OUT_BASE, snap);
  const coverage = {};
  const src = (r) => ({ title: r.title, url: r.url, status: r.status, last_modified: r.last_modified, fetched_at: r.fetched_at });
  const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

  // --- 全チャンピオンのスキル（Template:Data <チャンピオン>/<技>）---
  const champMod = await W.fetchRaw("Module:ChampionData/data", cache);
  const champions = L.parseLuaTable(champMod.text);
  const manifest = readJson(path.join(ROOT, "public/gamedata/manifest.json"));
  const ddv = manifest.current.ddragon;
  const ddIndex = readJson(path.join(ROOT, `public/gamedata/ddragon/${ddv}/index.json`)).champions;
  if (want("abilities")) {
    const byKey = new Map();
    for (const [form, c] of Object.entries(champions)) {
      const key = String(Math.trunc(Number(c.id)));
      if (!byKey.has(key)) byKey.set(key, { base: null, forms: [] });
      const g = byKey.get(key);
      g.forms.push(form);
      if (Number(c.id) === Math.trunc(Number(c.id))) g.base = form;
    }
    const cov = { label_ja: "チャンピオンのスキル（パッシブ・Q・W・E・R）", target_total: 0, target_basis: "Module:ChampionData の skill_i〜skill_r の技名（形態の技を含む、重複を除く）", discovered: 0, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {}, leveling_entries: 0, leveling_with_base: 0, ratios: 0, ratios_unparsed: 0, conflicts: { compared: 0, cooldown_mismatch: [] } };
    let n = 0;
    for (const [key, g] of byKey) {
      const dd = ddIndex.find((c) => String(c.key) === key);
      const ddChamp = dd ? readJson(path.join(ROOT, `public/gamedata/ddragon/${ddv}/champions/${dd.id}.json`)) : null;
      const base = g.base || g.forms[0];
      const titles = [];
      for (const form of g.forms) for (const [k, slot] of SLOT_KEYS) {
        const v = champions[form][k];
        for (const name of Array.isArray(v) ? v : Object.values(v || {})) {
          const t = `Template:Data ${base}/${name}`;
          if (!titles.some((x) => x.title === t)) titles.push({ title: t, slot, name, form });
        }
      }
      cov.target_total += titles.length;
      cov.discovered += titles.length;
      const templates = [];
      for (const t of titles) {
        const r = await W.fetchRaw(t.title, cache);
        if (++n % 50 === 0) log(`abilities ${n}/${cov.discovered}`);
        if (r.status === 404) { cov.not_found++; templates.push({ ...t, source: src(r) }); continue; }
        if (r.status !== 200) { cov.failed++; templates.push({ ...t, source: src(r) }); continue; }
        cov.fetched++;
        // 転送（#REDIRECT）は別のテンプレートと同じ内容。転送先を記録し、未解析には数えない
        const redirect = /^\s*#REDIRECT\s*\[\[([^\]]+)\]\]/i.exec(r.text);
        if (redirect) {
          cov.redirects = (cov.redirects || 0) + 1;
          const target = redirect[1].replace(/_/g, " ");
          templates.push({ ...t, source: src(r), redirect_to: target });
          // 転送先がまだ一覧にないとき（例：Nunu & Willump → Template:Data Nunu/…）は、転送先も取得する
          if (/^Template:Data /.test(target) && !titles.some((x) => x.title === target)) {
            titles.push({ title: target, slot: t.slot, name: t.name, form: t.form, via_redirect: t.title });
            cov.discovered++;
            cov.redirect_targets_added = (cov.redirect_targets_added || 0) + 1;
          }
          continue;
        }
        const { params, vars } = W.dataTemplateParams(r.text);
        const slotIdx = { Q: 0, W: 1, E: 2, R: 3 }[t.slot];
        // {{ap|a to b}} の既定の段階の数は Wiki の規則（Template:Ability progression/doc）：究極スキル（R）は3、ほかは5。
        // パッシブ（I）は段階がスキルのランクとは限らないので補間しない（0）。テンプレートに maxrank があればそれを使う
        const ranks = t.slot === "I" ? 0 : t.slot === "R" ? 3 : 5;
        const ddMax = slotIdx === undefined ? null : ddChamp?.spells?.[slotIdx]?.maxrank ?? null;
        const s = W.structureTemplate(params, ranks);
        cov.structured_fields += Object.keys(s.parsed).length;
        cov.unparsed_fields += s.unparsed.length;
        for (const u of s.unparsed) cov.unparsed_reasons[u.reason] = (cov.unparsed_reasons[u.reason] || 0) + 1;
        cov.leveling_entries += s.leveling.length;
        cov.leveling_with_base += s.leveling.filter((l) => l.base).length;
        for (const l of s.leveling) { cov.ratios += l.ratios.length; cov.ratios_unparsed += l.ratios.filter((x) => x.percent === null).length; }
        // Data Dragon との照合：同じスロットの最初の技名（主の形態）の CD
        let compare = null;
        if (ddChamp && slotIdx !== undefined && t.form === base && s.parsed.cooldown) {
          const ddSpell = ddChamp.spells[slotIdx];
          const firstName = (champions[base][SLOT_KEYS.find((x) => x[1] === t.slot)[0]] || [])[0];
          if (t.name === firstName && ddSpell) {
            const wv = s.parsed.cooldown.values, dv = ddSpell.cooldown;
            const same = wv.length === 1 ? dv.every((x) => Math.abs(x - wv[0]) < 1e-6) : wv.length === dv.length && wv.every((x, i) => Math.abs(x - dv[i]) < 1e-6);
            compare = { ddragon_version: ddv, ddragon_cooldown: dv, wiki_cooldown: wv, same };
            cov.conflicts.compared++;
            // Data Dragon の値が全ランクで同じ0・0.25 など（特殊な CD の技で Data Dragon が実際の値を持たない形）は placeholder_like として分ける
            const kind = new Set(dv).size === 1 && dv[0] <= 0.25 ? "ddragon_placeholder_like" : "value_difference";
            if (!same) cov.conflicts.cooldown_mismatch.push({ champion: base, slot: t.slot, skill: t.name, ddragon: dv.join("/"), wiki: wv.join("/"), kind });
          }
        }
        if (!Object.keys(params).length) { cov.unparsed_fields++; cov.unparsed_reasons.no_template_call = (cov.unparsed_reasons.no_template_call || 0) + 1; }
        // ランク別の値の数が Data Dragon の最大ランクと違うもの（Wiki の既定の数で補間した可能性）は印を付ける
        const lens = [...Object.values(s.parsed), ...s.leveling.map((l) => l.base).filter(Boolean)].filter((x) => x.kind === "by_rank" || x.kind === "by_rank_linear").map((x) => x.values.length);
        const rankNote = ddMax && lens.some((n) => n !== ddMax) ? { ddragon_maxrank: ddMax, value_counts: [...new Set(lens)] } : null;
        if (rankNote) cov.rank_count_differs = (cov.rank_count_differs || 0) + 1;
        // ダメージ計算に使えるかの段階を、leveling の行ごとに付ける
        for (const l of s.leveling) { l.calc = W.calcInfo(l, params.damagetype); cov.calc = cov.calc || {}; cov.calc[l.calc.stage] = (cov.calc[l.calc.stage] || 0) + 1; }
        const text = describeFields(params);
        for (const v of Object.values(text)) { cov.text_fields = (cov.text_fields || 0) + 1; if (v.residual) cov.text_residual = (cov.text_residual || 0) + 1; }
        templates.push({ ...t, source: src(r), params, ...(Object.keys(vars).length ? { vars } : {}), text, parsed: s.parsed, leveling: s.leveling, unparsed: s.unparsed, ...(compare ? { compare } : {}), ...(rankNote ? { rank_note: rankNote } : {}) });
      }
      writeJson(path.join(out, "abilities", `${key}.json`), { license: W.LICENSE, champion: base, forms: g.forms, ddragon_key: key, templates });
    }
    coverage.abilities = cov;
    log("abilities done", JSON.stringify({ fetched: cov.fetched, not_found: cov.not_found }));
  }

  // --- アイテム（Module:ItemData/data/<アイテム>）---
  if (want("items")) {
    const idx = await W.fetchRaw("Module:ItemData/data/index", cache);
    const names = [...idx.text.matchAll(/^\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)].map((m) => m[1].replace(/\\(.)/g, "$1"));
    const cov = { label_ja: "アイテム", target_total: names.length, target_basis: "Module:ItemData/data/index（削除済みのアイテムは Module:ItemData/data/removed にあり、今回は対象外）", discovered: names.length, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {}, sr_items: 0, mode_only_items: 0 };
    const items = [];
    for (const name of names) {
      const r = await W.fetchRaw(`Module:ItemData/data/${name}`, cache);
      if (r.status !== 200) { r.status === 404 ? cov.not_found++ : cov.failed++; items.push({ name, source: src(r) }); continue; }
      cov.fetched++;
      try {
        const data = W.parseLuaChunk(r.text).value;
        const stats = data.stats || {};
        cov.structured_fields += Object.values(stats).filter((x) => typeof x === "number").length + ["id", "tier", "buy", "sell"].filter((k) => typeof data[k] === "number").length;
        const effects = Object.keys(data.effects || {}).length;
        cov.unparsed_fields += effects;
        if (effects) cov.unparsed_reasons.effect_text = (cov.unparsed_reasons.effect_text || 0) + effects;
        if (data.modes && data.modes["classic sr 5v5"]) cov.sr_items++; else cov.mode_only_items++;
        // 効果の文は、読める英語にしたものも保存する（原文は data.effects に残る）
        const effectText = Object.fromEntries(Object.entries(data.effects || {}).map(([k, e]) => { const plain = W.plainText(e && e.description ? e.description : ""); return [k, { name: e && e.name ? W.plainText(e.name) : null, plain, residual: W.hasResidual(plain) }]; }));
        items.push({ name, source: src(r), data, effect_text: effectText });
      } catch (e) {
        cov.unparsed_fields++;
        cov.unparsed_reasons.lua_parse_error = (cov.unparsed_reasons.lua_parse_error || 0) + 1;
        items.push({ name, source: src(r), unparsed: [{ field: "*", reason: "lua_parse_error", message: e.message.slice(0, 160) }] });
      }
    }
    log("items done", cov.fetched);
    writeJson(path.join(out, "items.json"), { license: W.LICENSE, index: src(idx), items });
    coverage.items = cov;
  }

  // --- ルーン（Template:Rune data <ルーン>、名前は Data Dragon の runesReforged）---
  if (want("runes")) {
    const rr = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddv}/data/en_US/runesReforged.json`)).json();
    const names = rr.flatMap((p) => p.slots.flatMap((s) => s.runes.map((x) => ({ name: x.name, path: p.name, ddragon_id: x.id }))));
    const cov = { label_ja: "ルーン", target_total: names.length, target_basis: `Data Dragon ${ddv} runesReforged.json（現行のルーン。ステータスの欠片・削除済みは対象外）`, discovered: names.length, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {} };
    const runes = [];
    for (const x of names) {
      let r = await W.fetchRaw(`Template:Rune data ${x.name}`, cache);
      // Data Dragon と Wiki で前置詞の大文字・小文字が違う名前がある（Jack Of All Trades → Jack of All Trades）
      const alt = x.name.replace(/ (Of|The|And|In|To) /g, (m) => m.toLowerCase());
      if (r.status === 404 && alt !== x.name) r = await W.fetchRaw(`Template:Rune data ${alt}`, cache);
      if (r.status !== 200) { r.status === 404 ? cov.not_found++ : cov.failed++; runes.push({ ...x, source: src(r) }); continue; }
      cov.fetched++;
      const { params } = W.dataTemplateParams(r.text);
      const s = W.structureTemplate(params, 1);
      cov.structured_fields += Object.keys(s.parsed).length + ["path", "slot"].filter((k) => params[k]).length;
      cov.unparsed_fields += s.unparsed.length;
      for (const u of s.unparsed) cov.unparsed_reasons[u.reason] = (cov.unparsed_reasons[u.reason] || 0) + 1;
      runes.push({ ...x, source: src(r), params, text: describeFields(params), parsed: s.parsed, unparsed: s.unparsed });
    }
    log("runes done", cov.fetched);
    writeJson(path.join(out, "runes.json"), { license: W.LICENSE, runes });
    coverage.runes = cov;
  }

  // --- Lua のデータモジュール（サモナースペル・モード・用語・飛翔体・ダメージ）---
  if (want("modules")) {
    const mods = [
      ["summoner_spells", "Module:SpellData/data", "サモナースペル（モード専用を含む。maps.sr でサモナーズリフトを区別）"],
      ["gamemodes", "Module:GamemodeData/data", "ゲームモードの一覧"],
      ...MODE_FILES.map((m) => [`mode_${m}`, `Module:MapChanges/data/${m}`, `モード別の調整（${m}）。サモナーズリフトの値と混同しない`]),
      ["glossary", "Module:GlossaryData/data", "用語集"],
      ["missiles", "Module:MissileData/data", "飛翔体のデータ（Wiki 上で作成途中）"],
      ["damage", "Module:DamageData/data", "ダメージの種類・性質（ライフスティールの適用、Call for Help など）"],
    ];
    const cov = { label_ja: "Lua のデータモジュール", target_total: mods.length, target_basis: "確認できたデータモジュール（api.php を使わずに名前で確かめたもの）", discovered: mods.length, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {}, modules: {} };
    for (const [id, title, label] of mods) {
      const r = await W.fetchRaw(title, cache);
      if (r.status !== 200) { r.status === 404 ? cov.not_found++ : cov.failed++; cov.modules[id] = { title, status: r.status }; continue; }
      cov.fetched++;
      try {
        const data = W.parseLuaChunk(r.text).value;
        const entries = Object.keys(data).length;
        let extra = {};
        if (id === "summoner_spells") {
          const vals = Object.values(data);
          extra = { sr: vals.filter((x) => x.maps && x.maps.sr).length, other_modes: vals.filter((x) => !(x.maps && x.maps.sr)).length };
        }
        // 飛翔体：技の入れ物だけで値のないチャンピオンが多い（数値を1つ以上持つものだけ数える）
        if (id === "missiles") extra = { with_values: Object.values(data).filter((c) => /:\s*-?\d/.test(JSON.stringify(c))).length };
        cov.structured_fields += entries;
        cov.modules[id] = { title, label_ja: label, entries, ...extra };
        writeJson(path.join(out, "modules", `${id}.json`), { license: W.LICENSE, label_ja: label, source: src(r), data });
      } catch (e) {
        cov.unparsed_fields++;
        cov.unparsed_reasons.lua_parse_error = (cov.unparsed_reasons.lua_parse_error || 0) + 1;
        cov.modules[id] = { title, error: e.message.slice(0, 160) };
      }
    }
    log("modules done", cov.fetched);
    coverage.modules = cov;
  }

  // --- モンスター・オブジェクト・建物（記事の Infobox unit の引数）---
  if (want("units")) {
    const cov = { label_ja: "モンスター・オブジェクト・建物", target_total: null, target_basis: `種の一覧（${UNIT_SEEDS.length}件）。Wiki の全体数は未確定`, discovered: UNIT_SEEDS.length, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {}, without_infobox: [] };
    const units = [];
    for (const name of UNIT_SEEDS) {
      const r = await W.fetchRaw(name, cache);
      if (r.status !== 200) { r.status === 404 ? cov.not_found++ : cov.failed++; units.push({ name, source: src(r) }); continue; }
      cov.fetched++;
      const params = W.templateParams(r.text, /\{\{\s*Infobox (unit|structure)/i);
      if (!params) { cov.without_infobox.push(name); units.push({ name, source: src(r), ...W.articleMeta(r.text) }); continue; }
      const parsed = {}, unparsed = [];
      for (const [k, v] of Object.entries(params)) {
        if (/image|gallery|attributes|name|caption/i.test(k)) continue;
        const p = W.parseValue(v);
        if (p.ok) parsed[k] = p; else if (p.reason !== "empty") unparsed.push({ field: k, reason: p.reason });
      }
      cov.structured_fields += Object.keys(parsed).length;
      cov.unparsed_fields += unparsed.length;
      for (const u of unparsed) cov.unparsed_reasons[u.reason] = (cov.unparsed_reasons[u.reason] || 0) + 1;
      units.push({ name, source: src(r), infobox: params, parsed, unparsed });
    }
    log("units done", cov.fetched);
    writeJson(path.join(out, "units.json"), { license: W.LICENSE, units });
    coverage.units = cov;
  }

  // --- 基本的なゲームシステムの記事（メタデータと見出しだけ。本文は保存しない）---
  if (want("articles")) {
    const cov = { label_ja: "ゲームシステムの記事", target_total: null, target_basis: `種の一覧（${ARTICLE_SEEDS.length}件）。本文は保存せず、見出し・テンプレートの数・リンクの数だけ`, discovered: ARTICLE_SEEDS.length, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {} };
    const articles = [];
    for (const name of ARTICLE_SEEDS) {
      const r = await W.fetchRaw(name, cache);
      if (r.status !== 200) { r.status === 404 ? cov.not_found++ : cov.failed++; articles.push({ name, source: src(r) }); continue; }
      cov.fetched++;
      const redirect = /^#REDIRECT\s*\[\[([^\]]+)\]\]/i.exec(r.text);
      const meta = W.articleMeta(r.text);
      cov.unparsed_fields++; // 本文の知識は構造化していない（記事1件を1件の未解析として数える）
      cov.unparsed_reasons.article_body_not_structured = (cov.unparsed_reasons.article_body_not_structured || 0) + 1;
      articles.push({ name, source: src(r), ...(redirect ? { redirect_to: redirect[1] } : {}), ...meta });
    }
    log("articles done", cov.fetched);
    writeJson(path.join(out, "articles.json"), { license: W.LICENSE, note: "本文は保存していない。原典は url を参照", articles });
    coverage.articles = cov;
  }

  // --- 変更履歴（チャンピオン：<名前>/Patch history、アイテム・ルーン・サモナースペル：ページの Patch History の節）---
  // 版ごとに「変わった項目（スキル・ステータスなど）」と行数だけを保存し、本文の行は保存しない（原典へのリンクで読む）
  if (want("history")) {
    const cov = { label_ja: "変更履歴（版ごとの変更された項目）", target_total: 0, target_basis: "全チャンピオン（Module:ChampionData の基本形態）＋サモナーズリフトのアイテム（modes の classic sr 5v5）＋ルーン（Data Dragon）＋サモナーズリフトのサモナースペル（SpellData maps.sr）", discovered: 0, fetched: 0, not_found: 0, failed: 0, structured_fields: 0, unparsed_fields: 0, unparsed_reasons: {}, without_history: [] };
    // labels=false（アイテム・ルーン・サモナースペル）：最上位の行が変更の文なので、項目名も保存せず版と行数だけ
    const parseHistory = (text, labels = true) => {
      const start = text.search(/^==\s*(Patch [Hh]istory|Release version)\s*==|^;\s*\[\[V\d/m);
      if (start < 0) return null;
      const body = text.slice(start);
      const versions = [];
      let cur = null;
      for (const line of body.split("\n")) {
        const v = /^;\s*\[\[(V[\d.]+)\]\](.*)$/.exec(line.trim());
        if (v) { cur = { version: v[1], note: W.plainText(v[2]).replace(/^[-–\s]+/, "") || undefined, subjects: [], lines: 0 }; versions.push(cur); continue; }
        if (!cur) continue;
        if (/^\*[^*]/.test(line)) {
          // 項目名（スキル名・「General」など短い見出し）だけを残す。変更の文（「… increased to 3500 from 3450.」）は本文なので保存せず、行数だけ数える
          const subj = W.plainText(line.replace(/^\*\s*/, "")).trim();
          const isLabel = subj && subj.length <= 40 && !/[.。:;⟦]$/.test(subj) && !/\b(increased|reduced|decreased|changed|removed|added|now|no longer|from|to)\b/i.test(subj) && !/\d/.test(subj);
          if (labels && isLabel) cur.subjects.push(subj);
          cur.lines++;
        }
        else if (/^\*\*/.test(line)) cur.lines++;
      }
      return versions;
    };
    const targets = [];
    for (const [form, c] of Object.entries(champions)) if (Number(c.id) === Math.trunc(Number(c.id))) targets.push({ kind: "champion", key: String(c.id), name: form, title: `${form}/Patch history` });
    const itemsFile = path.join(out, "items.json");
    if (fs.existsSync(itemsFile)) for (const it of readJson(itemsFile).items) if (it.data && it.data.modes && it.data.modes["classic sr 5v5"]) targets.push({ kind: "item", name: it.name, title: it.name });
    const runesFile = path.join(out, "runes.json");
    if (fs.existsSync(runesFile)) for (const ru of readJson(runesFile).runes) targets.push({ kind: "rune", name: ru.name, title: ru.source && ru.source.title ? ru.source.title.replace(/^Template:Rune data /, "") : ru.name });
    const spellFile = path.join(out, "modules", "summoner_spells.json");
    if (fs.existsSync(spellFile)) for (const [name, sp] of Object.entries(readJson(spellFile).data)) if (sp.maps && sp.maps.sr) targets.push({ kind: "summoner", name, title: sp.link || name });
    cov.target_total = cov.discovered = targets.length;
    const result = { champion: {}, item: {}, rune: {}, summoner: {} };
    let n = 0;
    for (const tg of targets) {
      let r = await W.fetchRaw(tg.title, cache);
      const red = r.status === 200 && /^\s*#REDIRECT\s*\[\[([^\]#]+)/i.exec(r.text);
      if (red) r = await W.fetchRaw(red[1].replace(/_/g, " "), cache);
      if (++n % 50 === 0) log(`history ${n}/${targets.length}`);
      if (r.status !== 200) { r.status === 404 ? cov.not_found++ : cov.failed++; result[tg.kind][tg.key || tg.name] = { name: tg.name, source: src(r) }; continue; }
      cov.fetched++;
      const versions = parseHistory(r.text, tg.kind === "champion");
      if (!versions || !versions.length) { cov.without_history.push(`${tg.kind}:${tg.name}`); cov.unparsed_fields++; cov.unparsed_reasons.no_history_section = (cov.unparsed_reasons.no_history_section || 0) + 1; result[tg.kind][tg.key || tg.name] = { name: tg.name, source: src(r), versions: [] }; continue; }
      cov.structured_fields += versions.length;
      result[tg.kind][tg.key || tg.name] = { name: tg.name, source: src(r), latest: versions[0].version, versions };
    }
    for (const kind of Object.keys(result)) writeJson(path.join(out, "history", `${kind}s.json`), { license: W.LICENSE, note: kind === "champion" ? "版ごとに変更された項目（スキル名・Stats など）と行数だけ。変更の本文は原典（source.url）で読む" : "版と行数だけ（変更の文は保存しない）。変更の本文は原典（source.url）で読む", entries: result[kind] });
    log("history done", cov.fetched);
    coverage.history = cov;
  }

  const prevFile = path.join(out, "coverage.json");
  const prev = fs.existsSync(prevFile) ? readJson(prevFile).domains : {};
  writeJson(prevFile, {
    snapshot: snap,
    site: W.SITE,
    license: W.LICENSE,
    access: { method: "ページの raw（?action=raw）", user_agent: W.UA, interval_ms: 1100, robots: "robots.txt は /*api.php を不許可。api.php は使わない", revision: "raw は revid を返さないので、Last-Modified（版の時刻）を記録する", images: "取得しない（ライセンスが本文と違いうる）", article_body: "記事の本文は保存しない" },
    champion_module: { title: "Module:ChampionData/data", last_modified: champMod.last_modified },
    note: "収録率（fetched / discovered）と解析率（structured_fields / (structured_fields + unparsed_fields)）は別。取得できても、内容を理解・検証したことにはならない。Wiki の値はゲーム内で確かめていない",
    domains: { ...prev, ...coverage },
  });
  // 画面が読む取得日（manifest.current.wiki_snapshot）。古い取得日のファイルは消さない
  const mf = path.join(ROOT, "public/gamedata/manifest.json");
  const m = readJson(mf);
  m.wiki = [...new Set([...(m.wiki || []), snap])].sort().reverse();
  m.current.wiki_snapshot = m.wiki[0];
  fs.writeFileSync(mf, JSON.stringify(m, null, 1) + "\n");
  console.log(JSON.stringify(Object.fromEntries(Object.entries({ ...prev, ...coverage }).map(([k, v]) => [k, { discovered: v.discovered, fetched: v.fetched, not_found: v.not_found, failed: v.failed, structured: v.structured_fields, unparsed: v.unparsed_fields }])), null, 1));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (cmd === "harvest") return harvest({ cache: opt("--cache") || W.defaultCache(), only: opt("--only") ? opt("--only").split(",") : null });
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 8).join("\n"));
  process.exitCode = 1;
}
if (require.main === module) main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
