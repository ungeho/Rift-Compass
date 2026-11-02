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
