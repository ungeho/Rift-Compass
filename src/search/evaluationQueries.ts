// docs/retrieval-evaluation.md の評価用質問（Q01〜Q24）と期待資料。
// tools/desk-retrieval-check.js の机上照合と同じ質問・期待資料を使う。
export interface EvalQuery {
  id: string;
  query: string;
  expected: string[];
}

export const EVAL_QUERIES: EvalQuery[] = [
  { id: "Q01", query: "敵のスキルを避けた後に仕掛ける理由を知りたい", expected: ["res-metabot-trading-2026", "res-wiki-cooldown"] },
  { id: "Q02", query: "Lv2先行が有利になる条件は？", expected: ["res-wiki-experience", "res-metabot-trading-2026"] },
  { id: "Q03", query: "level 2 how many minions bot lane", expected: ["res-wiki-experience"] },
  { id: "Q04", query: "Dopaの古いウェーブ管理を学びたい", expected: [] },
  { id: "Q05", query: "VeigarV2のリコール解説はどこ？", expected: ["res-yt-veigarv2-recall-timer", "res-yt-veigarv2-coaching-ruu"] },
  { id: "Q06", query: "昔の視界管理の知識は今も利用できる？", expected: ["res-engadget-wards-2014", "res-wiki-v3-14", "res-wiki-sight-ward"] },
  { id: "Q07", query: "特定チャンピオンの対面別ビルドを知りたい（ベイガー）", expected: ["res-yt-veigarv2-veigar-guide-s16"] },
  { id: "Q08", query: "ジャックスのEに通常攻撃が当たらないときどうする？", expected: ["res-wiki-jax"] },
  { id: "Q09", query: "AA無効化されたらスキルで殴るべき？", expected: ["res-wiki-cc-types", "res-wiki-jax"] },
  { id: "Q10", query: "how to freeze a lane", expected: ["res-dignitas-freeze-advanced", "res-dignitas-wave-2019", "res-loltheory-wave-2026", "res-wiki-minion"] },
  { id: "Q11", query: "ミニオンのタゲの仕組み", expected: ["res-wiki-minion", "res-yt-veigarv2-minion-aggro"] },
  { id: "Q12", query: "イグナイトとバリアどっちが生存しやすい？", expected: ["res-wiki-summoner-spell"] },
  { id: "Q13", query: "プロのビルドを真似していい？", expected: ["res-yt-veigarv2-pro-items"] },
  { id: "Q14", query: "フラッシュのCDは昔と同じ？", expected: ["res-wiki-flash", "res-wiki-summoner-spell"] },
  { id: "Q15", query: "トリンケットはいつ導入された？", expected: ["res-wiki-trinket", "res-wiki-v3-14"] },
  { id: "Q16", query: "ミッドレーナーとしてインベードを防ぎたい", expected: ["res-yt-dopaenglish-teacher-2"] },
  { id: "Q17", query: "snowball after winning lane", expected: ["res-yt-dopaenglish-teacher-1"] },
  { id: "Q18", query: "パッチノートの読み方", expected: ["res-yt-veigarv2-patch-notes", "res-riot-patch-notes-ja"] },
  { id: "Q19", query: "ヘイストでCDはどれくらい短くなる？", expected: ["res-wiki-haste"] },
  { id: "Q20", query: "ジャングラーとして敵のサモスペを追跡する方法", expected: ["res-yt-veigarv2-jungle-decisions"] },
  { id: "Q21", query: "Faker wave control", expected: ["res-yt-veigarv2-faker-waves"] },
  { id: "Q22", query: "スロープッシュとファストプッシュの違い", expected: ["res-loltheory-wave-2026", "res-dignitas-wave-2019"] },
  { id: "Q23", query: "日本語でLoLの基本を知りたい", expected: ["res-riot-how-to-play-ja", "res-gamewatch-soraka-2"] },
  { id: "Q24", query: "Dopa TF 解説 日本語", expected: ["res-yt-alliyan-dopa-tf-2019"] },
];
