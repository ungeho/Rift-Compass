import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { attackSpeedRow, closestForm, placeholders, statChanges, statRows, type DDragonChampion, type KnownIssue, type WikiByKey } from "./champion";
import { ChampionDataBody } from "../components/ChampionData";

const root = join(__dirname, "../..");
const read = <T,>(p: string): T => JSON.parse(readFileSync(join(root, p), "utf8")) as T;
const manifest = read<{ current: { ddragon: string; wiki_championdata: number }; ddragon: { version: string }[] }>("public/gamedata/manifest.json");
const v = manifest.current.ddragon;
const champ = (id: string, version = v) => read<DDragonChampion>(`public/gamedata/ddragon/${version}/champions/${id}.json`);
const knownIssues = read<{ known_issues: KnownIssue[] }>(`public/gamedata/ddragon/${v}/index.json`).known_issues;
const wiki = (key: string) => read<WikiByKey>(`public/gamedata/wiki-championdata/${manifest.current.wiki_championdata}/by-key/${key}.json`);

describe("基本データの表示用の行", () => {
  it("Data Dragon の攻撃力の成長値（既知の不具合で全件0）は採用せず、生の値を残したまま Wiki の値で計算する", () => {
    expect(knownIssues.map((k) => k.field)).toEqual(["attackdamageperlevel"]);
    expect(knownIssues[0].reference).toBe("https://github.com/RiotGames/developer-relations/issues/1144");
    const dd = champ("Aatrox");
    expect(dd.stats.attackdamageperlevel).toBe(0); // 生の値はファイルにそのまま
    const ad = statRows(dd, closestForm(dd, wiki(dd.key).forms, knownIssues), knownIssues).find((r) => r.label === "攻撃力")!;
    expect(ad.excluded?.field).toBe("attackdamageperlevel");
    expect(ad.rawGrowth).toBe(0);
    expect(ad.growthSource).toBe("wiki");
    expect(ad.growth).toBe(5);
    expect(ad.levels[3]).toBeCloseTo(ad.base! + 17 * 5, 6);
    expect(ad.conflict).toBe(false); // 基本値は一致し、除外した成長値は比べない
  });
  it("除外した成長値を補う値がなければ「不明」（Lv1 の基本値だけ示す）", () => {
    const ad = statRows(champ("Aatrox"), null, knownIssues).find((r) => r.label === "攻撃力")!;
    expect(ad.growth).toBeNull();
    expect(ad.growthSource).toBeNull();
    expect(ad.levels).toEqual([ad.base, null, null, null]);
  });
  it("既知の不具合を渡さなければ、2つの出典の違いとして両方の計算を示す（どちらかに決めない）", () => {
    const dd = champ("Aatrox");
    const rows = statRows(dd, closestForm(dd, wiki(dd.key).forms));
    const ad = rows.find((r) => r.label === "攻撃力")!;
    expect(ad.conflict).toBe(true);
    expect(ad.wikiLevels![3]).toBeCloseTo(ad.wikiBase! + 17 * ad.wikiGrowth!, 6);
    const hp = rows.find((r) => r.label === "体力")!;
    expect(hp.conflict).toBe(false);
    expect(hp.wikiLevels).toBeNull();
  });
  it("攻撃速度は Wiki の反映率で計算し、反映率がなければ計算しない", () => {
    const dd = champ("Ahri");
    const w = closestForm(dd, wiki(dd.key).forms)!;
    const as = attackSpeedRow(dd, w);
    expect(as.ratio).toBe(w.stats!.as_ratio);
    expect(as.levels[3]).toBeCloseTo(as.base! + ((as.growthPercent! * 17) / 100) * as.ratio!, 10);
    expect(attackSpeedRow(dd, null).levels.every((x) => x === null)).toBe(true);
  });
  it("形態が複数あるチャンピオン（クレッド）は、違いの最も少ない形態と比べる", () => {
    const dd = champ("Kled");
    const forms = wiki(dd.key).forms;
    expect(forms.map((f) => f.form)).toEqual(expect.arrayContaining(["Kled", "Kled & Skaarl"]));
    expect(closestForm(dd, forms)).not.toBeNull();
  });
  it("説明文の穴埋めを数える（値は推測で埋めない）", () => {
    expect(placeholders("deals {{ qdamage }} and {{ e1 }}")).toEqual(["qdamage", "e1"]);
  });
  it("前の版との違い（Data Dragon 16.20.1 → 16.21.1 のダリウス Q の CD）", () => {
    const old = manifest.ddragon.find((x) => x.version !== v)!.version;
    const changes = statChanges(champ("Darius", old), champ("Darius"));
    expect(changes).toContainEqual({ field: "Q cooldownBurn", from: "9/8/7/6/5", to: "9/7.75/6.5/5.25/4" });
  });
  it("画面：クラスとポジションを分け、出典・版・未検証であることを示す", () => {
    const dd = champ("Ahri");
    const html = renderToStaticMarkup(<ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: { game_patch: "26.21", status: "照合による推定" } }} />);
    expect(html).toContain("チャンピオンクラス");
    expect(html).toContain("メイジ（Mage）");
    expect(html).toContain("担当するポジションとは別です");
    expect(html).toContain("ポジション");
    expect(html).toContain(`Data Dragon ${v}`);
    expect(html).toContain("ゲーム内では検証していません");
    expect(html).toContain("反映率");
    expect(html).toContain("既知の不具合");
    expect(html).toContain("issues/1144");
    expect(html).toContain(`revid ${manifest.current.wiki_championdata}`);
    expect(html).toContain("ゲームのパッチ 26.21 に対応（照合による推定");
    expect(html).toContain("Wiki の revid はページの版で、ゲームのパッチではありません");
    expect(html).toContain("パッシブ：");
    expect(html).toContain(dd.passive.name.ja!);
  });
});

describe("ステータス表の注記と、英語 Wiki のスキルの表示（2026-11-02）", () => {
  const snapshot = (read<{ current: { wiki_snapshot: string } }>("public/gamedata/manifest.json")).current.wiki_snapshot;
  const abilities = (key: string) => ({ snapshot, file: read<import("./wikiAbility").WikiAbilityFile>(`public/gamedata/wiki/${snapshot}/abilities/${key}.json`) });
  const render = (id: string) => {
    const dd = champ(id);
    return renderToStaticMarkup(<ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: null, abilities: abilities(dd.key) }} />);
  };
  it("表のセルには注記の文を入れず、除外・Wiki の版・形態・未検証の情報は表の下の注記に残す", () => {
    const html = render("Aatrox");
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(table).not.toContain("既知の不具合");
    expect(table).not.toContain("revid");
    expect(table).toContain("※1");
    const notes = html.slice(html.indexOf('class="stat-notes"'));
    expect(notes).toContain("既知の不具合");
    expect(notes).toContain("issues/1144");
    expect(notes).toContain(`revid ${manifest.current.wiki_championdata}`);
    expect(notes).toContain("形態「Aatrox」");
    expect(notes).toContain("ゲーム内では検証していません");
  });
  it("スキル：英語 Wiki の値（ランク別の基礎値・係数・CD）を示し、Data Dragon の穴埋めは表示しない", () => {
    const html = render("Darius");
    expect(html).toContain("Physical Damage (Blade)：50/80/110/140/170");
    expect(html).toContain("(+ 100/110/120/130/140% AD)");
    expect(html).toContain("CD 9/7.75/6.5/5.25/4");
    expect(html).toContain("Template:Data_Darius/Decimate");
    // 説明の文（「穴埋め（{{ }}）は表示しません」）以外に {{ が残らない
    expect(html.replace("（{{ }}）", "")).not.toContain("{{");
    expect(html).not.toContain("abilityresourcename");
  });
  it("Wiki のスキルのデータが未取得なら、値を埋めずに未取得と示す", () => {
    const dd = champ("Darius");
    const html = renderToStaticMarkup(<ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: null, abilities: null }} />);
    expect(html).toContain("英語 Wiki のスキルのデータは未取得です");
    expect(html).not.toContain("Physical Damage (Blade)");
  });
});

describe("公開前の最終確認（2026-11-02）：数値の正確性・ライセンスの表示", () => {
  const snapshot = (read<{ current: { wiki_snapshot: string } }>("public/gamedata/manifest.json")).current.wiki_snapshot;
  const render = (id: string) => {
    const dd = champ(id);
    return renderToStaticMarkup(<ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: null, abilities: { snapshot, file: read(`public/gamedata/wiki/${snapshot}/abilities/${dd.key}.json`) } }} />);
  };
  it("1つの {{st}} の複数の組を別の行にする（ダリウス Q の Blade と Handle の係数を混ぜない）", () => {
    const html = render("Darius");
    expect(html).toContain("Physical Damage (Blade)：50/80/110/140/170 (+ 100/110/120/130/140% AD)<span class=\"calc-stage");
    expect(html).toContain("Reduced Damage (Handle)：17.5/28/38.5/49/59.5 (+ 35/38.5/42/45.5/49% AD)");
  });
  it("Wiki の英語の説明文には、出典・寄稿者・ライセンス・改変の内容・継承の条件を表示する", () => {
    const html = render("Lux");
    expect(html).toContain("League of Legends Wiki の寄稿者");
    expect(html).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
    expect(html).toContain("改変：Wiki の記法を簡略化");
    expect(html).toContain("この改変した文章も CC BY-SA 3.0 で提供します");
    expect(html).toContain("日本語の見出し・注記は Rift Compass が書いたもの");
  });
  it("値の数が Data Dragon の最大ランクと違う技は印を付ける。未解析の理由は日本語で示す", () => {
    const html = render("Nidalee");
    expect(html).toContain("値の数（4）が Data Dragon の最大ランク（5）と違います");
    // レベル依存の式（Passive progression）は解析して範囲で示し、then を含む式は理由つきで未解析に残す
    expect(render("Aatrox")).toContain("（レベルに応じて）");
    expect(render("Hecarim")).toContain("段階ごとに増え方が変わる式");
    // アイコンだけの記法は文字を出さない（ダリウス E の角度：{{tip|er|icononly = true}} 50{{degree}}）
    expect(render("Darius")).toContain("50°");
    expect(render("Darius")).not.toContain("er 50");
  });
  it("メル W の CD は Wiki と Data Dragon の両方を示す", () => {
    const html = render("Mel");
    expect(html).toContain("CD 38/35/32/29/26");
    expect(html).toContain("CD 38/35/33/29/26秒");
    expect(html).toContain("CD が Data Dragon と違う（どちらが現行かは未確認）");
  });
});

describe("説明の日本語訳と計算の段階（2026-11-02 の拡張）", () => {
  const snapshot = (read<{ current: { wiki_snapshot: string } }>("public/gamedata/manifest.json")).current.wiki_snapshot;
  const render = (id: string, withTr = true) => {
    const dd = champ(id);
    const tr = (() => {
      try {
        return read<import("../components/ChampionData").TranslationFile>(`public/gamedata/wiki/${snapshot}/translations/ja/abilities/${dd.key}.json`);
      } catch {
        return null;
      }
    })();
    return renderToStaticMarkup(
      <ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: null, abilities: { snapshot, file: read(`public/gamedata/wiki/${snapshot}/abilities/${dd.key}.json`) }, translations: withTr ? tr : null }} />,
    );
  };
  it("Ekko R：記法（label1= など）を残さず、日本語訳（固有時停止）と英語の原文（stasis）を分けて示す", () => {
    const html = render("Ekko");
    expect(html).not.toMatch(/label\d*=/);
    expect(html.replace("（{{ }}）", "")).not.toContain("{{");
    expect(html).toContain("固有時停止状態になり");
    expect(html).toContain("Ekko enters stasis at the start of the cast time");
    expect(html).toContain("Wiki の説明（日本語訳）");
    expect(html).toContain("Wiki の説明（英語の原文・記法を簡略化して表示）");
    expect(html).toContain("AI（Claude Opus 5.5） による翻訳（未レビュー");
  });
  it("Ekko パッシブ：以前は解けない記法（pp の式）で保留だった段落が、Module:Ability progression と同じ計算で解けて訳される（2026-11-03）", () => {
    const html = render("Ekko");
    expect(html).not.toContain("この段落は翻訳を保留しています");
    expect(html).not.toContain("［解析できない記法］");
    expect(html).not.toContain("⟦");
  });
  it("解けない記法が残る段落は訳さず、保留と示す。英語は［解析できない記法］で示す（解析の仕組みの確認：段落を解けない状態にして描画）", () => {
    const dd = champ("Ekko");
    const tr = read<import("../components/ChampionData").TranslationFile>(`public/gamedata/wiki/${snapshot}/translations/ja/abilities/${dd.key}.json`);
    const file = read<{ templates: { title: string; text?: Record<string, { plain: string; residual: boolean }> }[] }>(`public/gamedata/wiki/${snapshot}/abilities/${dd.key}.json`);
    const broken = { ...file, templates: file.templates.map((t) => (t.title === "Template:Data Ekko/Z-Drive Resonance" && t.text?.description ? { ...t, text: { ...t.text, description: { ...t.text.description, plain: `${t.text.description.plain} ⟦pp⟧`, residual: true } } } : t)) };
    const html = renderToStaticMarkup(
      <ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: null, abilities: { snapshot, file: broken as never }, translations: tr }} />,
    );
    expect(html).toContain("この段落は翻訳を保留しています");
    expect(html).toContain("［解析できない記法］");
    expect(html).not.toContain("⟦");
  });
  it("訳のファイルがなければ「まだありません」と示し、訳を作らない", () => {
    const html = render("Ekko", false);
    expect(html).toContain("このスキルの説明の日本語訳はまだありません");
    expect(html).not.toContain("固有時停止状態になり");
  });
  it("計算の段階：Darius Q の行は「数値で計算できる（入力：攻撃力（合計））」", () => {
    expect(render("Darius")).toContain("数値で計算できる（入力：攻撃力（合計））");
    // 行の式が計算できることと、コンボ・キルラインの予測を区別する
    expect(render("Darius")).toContain("スキル全体のダメージ・コンボ・キルラインの予測ではありません");
  });
});

describe("訳の更新の検知（2026-11-02）", () => {
  it("Wiki の原文が同じでも、訳の対象の英文（plain_sha1）が変わった訳は表示しない", () => {
    const snapshot = read<{ current: { wiki_snapshot: string } }>("public/gamedata/manifest.json").current.wiki_snapshot;
    const dd = champ("Ekko");
    const tr = read<import("../components/ChampionData").TranslationFile>(`public/gamedata/wiki/${snapshot}/translations/ja/abilities/${dd.key}.json`);
    const id = "Template:Data Ekko/Chronobreak#description2";
    const stale = { ...tr, entries: { ...tr.entries, [id]: { ...tr.entries[id], plain_sha1: "0".repeat(40) } } };
    const html = renderToStaticMarkup(
      <ChampionDataBody data={{ version: v, dd, wiki: wiki(dd.key), prev: null, knownIssues, patch: null, abilities: { snapshot, file: read(`public/gamedata/wiki/${snapshot}/abilities/${dd.key}.json`) }, translations: stale }} />,
    );
    expect(html).not.toContain("固有時停止状態になり");
    expect(html).toContain("原文が更新されたため、古い訳は表示しません");
  });
});
