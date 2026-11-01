// 「知りたいことから探す」のウェーブ操作以外の入口。質問の文をそのまま検索語にして、検索結果（資料・判断材料・知識ノート）へ移動する。
// 採用するのは、実際の検索で期待する到達先に届くことをテスト（questionEntrances.test.ts）で確かめた質問だけ。
// 期待する到達先（expect）と、到達先より前に出てはいけない知識（must_not_precede）を質問ごとに記録する。
// 到達できることは、その資料・ノートが質問に正しく答えていることの保証ではない（ゲーム内では検証していない）。

export interface KnowledgeEntrance {
  question_ja: string;
  /** 分野（偏りの確認用。画面には出さない）*/
  area_ja: string;
  expect: {
    /** すべての条件に一致した知識ノートの先頭に来るべきノート */
    first_note?: string;
    /** すべての条件に一致した知識ノートに含まれるべきノート */
    notes?: string[];
    /** 資料の検索結果の先頭に来るべき資料（条件に一致した資料）*/
    first_resource?: string;
    /** 資料の検索結果の上位5件に含まれるべき資料 */
    resources_top5?: string[];
  };
  /** 期待するノートより前に出てはいけないノート（旧仕様・仮説・別の状況の知識）*/
  must_not_precede?: string[];
  /** 「すべての条件に一致」に出てはいけないノート（関連候補なら可）*/
  must_not_full?: string[];
  rationale_ja: string;
}

export const KNOWLEDGE_ENTRANCES: KnowledgeEntrance[] = [
  {
    question_ja: "スキルのクールダウンは、ヘイストでどれだけ短くなる？",
    area_ja: "クールダウン",
    expect: { first_note: "kn-cooldown-window", first_resource: "res-wiki-haste" },
    must_not_precede: ["kn-trade-window-6-8s"],
    rationale_ja: "計算式（基本CD × 100 / (100 + ヘイスト)）は kn-cooldown-window と Wiki の Haste。6〜8秒の踏み込みは未確認の仮説なので、先に出たら取り違え",
  },
  {
    question_ja: "通常攻撃を無効化されたら、どう戦う？",
    area_ja: "AA無効化",
    expect: { notes: ["kn-vs-aa-negation-decision", "kn-blind-mechanic", "kn-jax-e-mechanic"], resources_top5: ["res-wiki-jax", "res-wiki-cc-types"] },
    rationale_ja: "対処は kn-vs-aa-negation-decision（AI の整理を含む判断）。仕様の根拠は暗闇とジャックスのE（Wiki）",
  },
  {
    question_ja: "視界がないとき、機動力の低いメイジはどう動く？",
    area_ja: "視界管理",
    expect: { first_note: "kn-immobile-mage-not-alone" },
    must_not_full: ["kn-hist-ward-limit-v3-14", "kn-hist-ward-full-duration-2014"],
    rationale_ja: "がりあるの記事の判断（単独で動かない）。2013〜2014年のワードの仕様・主張は別の話題なので、すべての条件に一致として出たら取り違え",
  },
  {
    question_ja: "タワーのプレートは、今も14分で落ちる？",
    area_ja: "タワーの仕様",
    expect: { first_note: "kn-turret-plates-permanent-261" },
    must_not_precede: ["kn-turret-plates-fell-14min-pre-261"],
    rationale_ja: "現行（パッチ26.1以降）はプレートが恒久。26.1より前の「14分で落ちる」は旧仕様なので、現行のノートより前に出たら取り違え",
  },
  {
    question_ja: "マナアイテムはどれを買う？",
    area_ja: "アイテムの判断",
    expect: { first_resource: "res-lg-ndzdy" },
    rationale_ja: "メイジのマナアイテムの選び方を扱う記事。知識ノートはまだない",
  },
  {
    question_ja: "プロのビルドは真似していい？",
    area_ja: "アイテムの判断",
    expect: { first_resource: "res-yt-veigarv2-pro-items" },
    rationale_ja: "プロのアイテム選択をそのまま真似しない理由を扱う動画。知識ノートはまだない",
  },
  {
    question_ja: "試合の振り返りでは何を見る？",
    area_ja: "試合の振り返り",
    expect: { first_resource: "res-lg-lpvdr", resources_top5: ["res-lg-pdvmw"] },
    rationale_ja: "振り返りの観点を扱う記事。知識ノート・判断材料はまだない",
  },
  {
    question_ja: "相手のフラッシュが落ちていたら仕掛けどき？",
    area_ja: "サモナースペル",
    expect: { first_note: "kn-engage-when-flash-down", first_resource: "res-lg-qyxqb" },
    rationale_ja: "フラッシュのCD中は仕掛けやすいという判断（成立条件：使用時刻の把握・ヘイスト）。資料はサモナースペルの差を扱う記事",
  },
  {
    question_ja: "相手がドラゴンに集まったら、反対側で何をする？",
    area_ja: "オブジェクト・マクロ",
    expect: { first_note: "kn-diagonal-objective-trade" },
    rationale_ja: "対角線の交換（がりある）。例外のノート（kn-diagonal-trade-exceptions）は関連候補として出てよい",
  },
  {
    question_ja: "ドラゴンの前は、いつまでにリコールする？",
    area_ja: "オブジェクト・マクロ",
    expect: { first_note: "kn-objective-prep-1min" },
    must_not_full: ["kn-recall-7min"],
    rationale_ja: "オブジェクトの約1分前までに準備する（がりある）。7分前後のリコールはレーンの目安の仮説で別の話題",
  },
  {
    question_ja: "敵チャンピオンを殴ると、ミニオンに狙われるのはなぜ？",
    area_ja: "ミニオンの仕様",
    expect: { first_note: "kn-minion-aggro-call-for-help", first_resource: "res-wiki-minion" },
    rationale_ja: "Call for Help の仕様（Wiki）",
  },
];
