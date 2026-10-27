// Phase 2A：初見の18問による検索の独立評価（docs/phase2-retrieval-audit.md）。
// 現行の search() をそのまま呼び出すだけで、評価用の検索ロジックは持たない。
// 品質の合否は判定しない（判定は文書側で人が行う）。結果の出力：
//   PRINT_AUDIT=1 npx vitest run src/search/phase2Audit.test.ts --silent=false
import { expect, it } from "vitest";
import { search } from "./search";

// 質問文は評価依頼のとおり一字一句固定する
export const PHASE2_QUESTIONS: [string, string][] = [
  ["P01", "ジャックスがEを使っている間、通常攻撃よりスキルで攻撃した方がいい？"],
  ["P02", "ボットレーンで先にレベル2になるには、2ウェーブ目のどこまでミニオンを倒せばいい？"],
  ["P03", "相手チャンピオンを殴るとミニオンに狙われるのはどういう条件？"],
  ["P04", "レーンをフリーズしたいとき、なぜタワーの手前でミニオンを止めるの？"],
  ["P05", "VeigarV2がリコールするタイミングを説明している動画を見たい。"],
  ["P06", "シーズン4にトリンケットが登場したときの仕様を調べたい。"],
  ["P07", "バリアを持つよりイグナイトでキル圧力をかけた方が、安全にレーン戦できることはある？"],
  ["P08", "Dopaが昔、ウェーブを自分のタワー手前に維持する理由を説明した動画を探したい。"],
  ["P09", "昔のワード設置上限は、現在のLoLでも同じなの？"],
  ["P10", "フラッシュのクールダウンは、昔と今でどう変わった？"],
  ["P11", "敵ジャングラーのサモナースペルを追跡するとき、何を記録すればいい？"],
  ["P12", "対面が通常攻撃を無効化するチャンピオンなら、スキルのレベルアップ順序をどう変えるべき？"],
  ["P13", "敵ジャングラーのキャンプ時間から次のガンク位置を予測したい。"],
  ["P14", "ドラゴンソウルの種類ごとの効果を詳しく知りたい。"],
  ["P15", "リフトヘラルドをいつ使うとタワーへのダメージを最大化できる？"],
  ["P16", "最新パッチでテレポートが使用可能になる時間と制限を知りたい。"],
  ["P17", "2026年のアーリ対面で、ベイガーはどのアイテムを積むべき？"],
  ["P18", "バロン周辺の視界がなくても、相手がバロンを始めたか判断する方法はある？"],
];

it("18問を現行の検索で実行する", () => {
  const rows = PHASE2_QUESTIONS.map(([id, q]) => {
    const r = search(q);
    const count = (m: string) => r.hits.filter((h) => h.match === m).length;
    return {
      id,
      units: r.analysis.units.map((u) => `${u.kind}:${u.matched}`),
      ignored: r.analysis.ignored,
      full: count("full"),
      recognized: count("recognized"),
      partial: count("partial"),
      hits: r.hits.map((h, i) => `${i + 1}. [${h.match}] ${h.resource.id} (${h.resource.verification.level}) ${h.resource.title}`),
    };
  });
  if (process.env.PRINT_AUDIT) console.log(JSON.stringify(rows, null, 1));
  expect(rows).toHaveLength(18);
});
