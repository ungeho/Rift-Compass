# 抽出済み知識の正式収録と原典登録（2026-11-01）

基準コミット：`579802a`。既存の KnowledgeNote・Evidence・Relation・Resource・Topic だけを使い、新しいスキーマ・検索エンジンは作っていない。

## 1. 結果の要約

| 項目 | 追加 | 収録後の合計 |
|---|---|---|
| 正式資料（Resource） | 9（公開9） | 85（公開83） |
| 知識ノート | 58（公開58） | 82（公開79） |
| 根拠（Evidence） | 74 | 114 |
| 関係（Relation） | 21 | 34 |
| Topic | 6 | 45 |
| 散策の対象 | 67 | 195（教材83・判断材料33・知識ノート79） |

- 新しいノートの status：source_stated 31（公式・Wiki の仕様）、empirical 21（原典の著者の経験則）、tactical_inference 6（仕様からの推論）。unverified の新しいノートはない。
- すべての根拠の確認レベルは L3（本文を確認）。資料の確認レベルを超えない（既存の検証で確認）。ゲーム内で検証したノートはない（`last_checked_patch` はすべて null）。
- 既存の資料2件は、確認した範囲を検証の注記に追記した（res-riot-patch-26-1-en：第2回で確認した節、res-wiki-cc-types：2026-11-01 に確認した定義）。確認レベルは変えていない。

### 件数の集計単位

新しいノートは58件。原典ごとの「根拠を付けたノート」を足すと69件になるが、これはノートの数ではない。

| 集計 | 件数 | 内容 |
|---|---|---|
| パッチ26.1（N）を主な根拠にする新しいノート | 12 | — |
| mpbhg（R）を主な根拠にする新しいノート | 7 | — |
| タワーダイブの3原典（H・K・U）を主な根拠にする新しいノート | 18 | 仕様4（Wiki Turret）と経験則14 |
| チャンピオン研究からの新しいノート | 21 | — |
| **新しいノートの計** | **58** | |
| 原典ごとの「根拠を付けたノート」の和（H 16＋K 7＋U 6） | 29 | 1つのノートを、根拠の原典ごとに数えた値 |

29 と 18 の差の11件：

- 1件：既存のノート kn-turret-plates-permanent-261 に H17 の根拠を足しただけ（新しいノートではない）
- 3件：パッチ26.1 の新しいノート（N の12件に数えたもの）に、H・U の根拠を足した分（kn-turret-melee-bonus-261 に H と U、kn-first-turret-gold-261 に U）
- 7件：タワーダイブの新しいノートで、複数の原典の根拠を持つものの重複（kn-turret-warming-up は3原典で＋2、kn-turret-reinforced-armor・kn-turret-aggro-switch・kn-dive-from-behind-wave・kn-dive-jungler-position・kn-dive-champions は2原典で各＋1）

複数の原典の根拠を持つ新しいノートは13件。同じ仕様の説明（Wiki と LoL Theory、公式パッチノートと Wiki の履歴）は独立した裏付けではないと、各ノートの補足に書いた。独立した著者の同じ判断として扱うのは、LoL Theory とゆにかの経験則が一致する3件（kn-dive-from-behind-wave・kn-dive-jungler-position・kn-dive-champions。最後の1件は挙げる例が違う）だけ。

### 未登録の原典に依存する行（228 → 193）

| 内訳 | 行 |
|---|---|
| 前回：既存の正式資料に結び付かない行（253 − 25） | 228 |
| H（LoL Theory tower-dive）を登録 | −18 |
| K（lol-guide qwgsg）を登録 | −9 |
| U（Wiki Turret の照合の表）を res-wiki-turret として登録 | −8 |
| **今回：未登録の原典に依存する行**（16原典） | **193** |

- 下書きツールで自動的に資料が付くのは H・K の27行と、以前からの N・R の25行（計52行）。U の8行は記録に URL がないため、ツールでは資料が付かず、手作業で res-wiki-turret に対応させた。
- U と res-wiki-turret の対応：記録（第3回の原典の表）の「League of Legends Wiki『Turret』、revid 4080007」と、資料の URL（en-us/Turret）・表題（Turret）・版（revid 4080007。2026-11-01 に MediaWiki API で現行の版と確認）が一致する。

## 2. 既存の正式資料に結び付く25行（N16・R9）

| 行 | 結果 | ノート |
|---|---|---|
| N1 | 新しいノート | kn-role-quests-261 |
| N2・N3・N4 | 既存のノートと同じ主張（登録しない） | kn-turret-plates-permanent-261 |
| N5 | 新しいノート（Wiki の V26.01 の履歴も根拠に追加） | kn-first-turret-gold-261 |
| N6 | 新しいノート | kn-inner-turret-plates-261 |
| N7 | 新しいノート（Wiki の履歴と LoL Theory の H15 も根拠に追加） | kn-turret-melee-bonus-261 |
| N8〜N15 | 新しいノート | kn-herald-261・kn-voidgrubs-261・kn-smite-damage-261・kn-scuttle-spawn-level-261・kn-camp-spawn-times-261・kn-remake-surrender-261・kn-homeguard-261・kn-crystalline-overgrowth-261 |
| N16 | 登録しない（AI の時点の整理。各ノートの historical に反映） | — |
| R1・R2・R3・R5・R6・R8・R9 | 新しいノート | kn-midgame-from-herald-15・kn-midgame-mid-side-1v1・kn-priority-from-scoreboard・kn-mobile-mid-solo-vision・kn-side-or-teamfight-strength・kn-mage-assassin-midgame-positioning・kn-no-priority-wait |
| R4・R7 | 既存のノートと同じ主張（登録しない） | kn-immobile-mage-not-alone・kn-objective-prep-1min |

- パッチ26.1 のノート（N）はすべて `historical`（valid_from 26.1、current_applicability unknown）を付けた。26.2 以降の変更を確認していないため、現行の値とは表示しない。
- R5（機動力のあるミッド）と既存の R4（機動力の低いメイジ）は、チャンピオンの機動力という条件で行動の向きが逆になる。統合せず、関係 `context_of` でつないだ。
- mpbhg の節の名前は、既存の根拠（ev-040・ev-041）にある2つの見出しだけを正確に書き、それ以外は記録の表記（「中盤とは」「1」「まとめ」）のまま書いた。見出しの文言は推測していない。

## 3. 未登録原典の正式資料化（原典単位）

### 登録した原典

| 原典 | 資料 ID | 行 | ノート | 統合・分離の判断 |
|---|---|---|---|---|
| 第2回 H：LoL Theory「Tower Diving in LoL」 | res-loltheory-tower-dive | 18 | 根拠を付けたノート16（新しいノート15、既存の kn-turret-plates-permanent-261 に H17） | H1（要約）・H16（未照合の仕様）は登録しない。H9 と K2 は条件・基準が違うので統合しない |
| 第2回 K：ゆにか「タワーダイブのやり方」 | res-lg-qwgsg | 9 | 根拠を付けたノート7（K だけのノート4、H と同じ主張のノート3） | K3・K5・K6・K4 は H の同じ主張のノートに根拠として追加（著者・言語が違う）。K8・K9 は条件のない一般論で登録しない |
| 第3回 U：Wiki「Turret」 | res-wiki-turret | 8 | 根拠を付けたノート6（仕様のノート4、N5・N7 のノートに V26.01 の履歴） | U8（どのタワーの記述か未整理）は登録しない |
| （チャンピオン研究）Riot Patch 14.8・Wiki の4チャンピオン・Quicksilver Sash | res-riot-patch-14-8-en ほか5件 | 研究の110件のうち46件の ID | 21 | 下の §5 |

- 登録の手順は既存の形を守った。資料を追加し、原典目録の候補（`candidates.json`）に `existing_resource_id` と振り分け「registered」を、レビュー（`reviews.json`）に `registered_as` を記録した。
- 下書きツール：資料を登録した後、`node tools/experiments/knowledge-drafts.js draft 2:H 2:K` で、原典の全行にまとめて資料が付いた（行ごとに登録し直していない）。統合するか・kind・Topic・status は人の判断として決めた（今回は AI が決め、この記録に理由を残した）。
- **ツールの制限**：照合の表（第3回 U）は記録に URL がないので、資料を登録しても下書きツールでは資料が付かない。

### 残っている未登録原典

- 16件・193行：第1回 A〜G（83行）、第2回 I・J・L・M（53行）、第3回 O・P・Q・S・T（57行）。
- 次に登録しやすい順（本文の確認が済み、著者・公開日が分かり、正式資料にある原典と同じサイト）：
  1. lol-guide の記事（A〜E・L・Q。がりある・ゆにか）
  2. LoL Theory（I・J・O・P。英語、同じ著者の記事で、既存の res-loltheory-wave-2026 と同じサイト）
  3. LoLGaren（F・G・M・S・T。パッチの時点が記事ごとに違う）

## 4. チャンピオン Topic の規則

- **新しい規則（今回の4件に適用）**：チャンピオンの Topic は、大分類 `cat-champions`（チャンピオン別）を親に持つ。追加：champ-malzahar・champ-mordekaiser・champ-zed・champ-lux（別名：マルザ・モルデなど）。トップ画面の「Topic から探す」に「チャンピオン別」の入口が出る。
- **既存の3件は動かしていない**（最終照合で、いったん足した cat-champions の親を元に戻した）。そのため、今は親の構造が2通りある。

| Topic | 親 |
|---|---|
| champ-malzahar・champ-mordekaiser・champ-zed・champ-lux（新規） | cat-champions |
| champ-jax（既存） | aa-negation |
| champ-veigar・champ-twisted-fate（既存） | cat-expert |

- 既存の3件を「チャンピオン別」に含めるか（親を足すか、移すか）は、散策の距離・Topic の一覧への影響を確かめてから、別の作業で決める。
- **ロールの Topic は追加していない。** role-mid は判断材料の照合（ROLE_TOPICS）にも使われ、「サポート」「トップ」などの語を Topic にすると、資料の検索と判断材料の照合の結果が変わる。追加するなら別の作業として影響を確認する。
- タワーダイブの Topic（tower-dive、別名：ダイブ・タワー下）も追加した。前回の検索の限界「タワー下での戦い方」（語彙不足）に届くようになった。

## 5. チャンピオン知識の発見しやすさ（4チャンピオン）

- **将来の改善候補**：Topic のページ（例：#/topic/champ-zed）は資料だけを表示し、その Topic の知識ノートを表示しない。ノートには、検索・散策・資料の詳細から届く。今回は実装しない。

研究記録（`champion-knowledge-research.md`）の110件のうち46件の ID を、21件のノートとして正式に収録した（仕様と、仕様からの明らかな推論。仮説は注記）。残りの64件は研究記録に残す（今後の収録の対象）。

| チャンピオン | 収録したノート | 使う側 | 対策側 | マッチアップ | 旧仕様 |
|---|---|---|---|---|---|
| 行動妨害の定義 | kn-cc-root・kn-cc-suppression | 両方から参照 | 両方から参照 | — | — |
| マルザハール | e-spread・e-spread-any-killer・voidlings・r-qss・r-leave-tether・void-shift | e-spread・voidlings・r-qss | e-spread-any-killer・r-leave-tether | matchup の Topic | — |
| モルデカイザー | r-realm・r-resist-timing・r-cleanse-pre-148・r-no-cleanse-148・r-counter-before | r-realm | r-counter-before | matchup の Topic | r-cleanse-pre-148（superseded） |
| ゼド | r-mark・r-stored-damage・r-mark-blockers・r-zhonya-timing | r-mark・r-stored-damage | r-mark-blockers・r-zhonya-timing | matchup の Topic | — |
| ラックス | q-root・q-zhonya・illumination-r・combo-kill | illumination-r・combo-kill | q-zhonya | matchup の Topic | — |

- **発見の経路**：検索（「ゼド」「モルデ」「サッシュ」などの語でノートの欄に出る）、散策（チャンピオンの Topic を選ぶ）、資料の詳細（例：res-wiki-zed の「この資料を根拠にした知識ノート」）。Topic のページと Topic での絞り込みは資料だけが対象。
- **使う側・対策側**：対策側のノートは本文を「対策側：」で始め、仕様のノートから `reason_for` でつないだ。検索で「対策」と書くと、視点の注意（side）が出る。「対策」は照合の条件には使わない（「対策側：」と書いたノートだけが残り、仕様のノートが落ちるのを防ぐ）。
- **できないこと**：
  - 「誰に対する対策か」（例：ゼド対ラックス）は、2体のチャンピオン Topic を両方付けるしか表せない。今回の4体のノートは1体の Topic だけ。
  - 「対策 → 再対応 → 追加対策」の順番は、関係の種類（reason_for・context_of）では向きの意味が足りない（`counters`・`responds_to` は提案のまま）。

### チャンピオンの検索の確認（テストには加えていない）

| 検索語 | 結果 | 評価 |
|---|---|---|
| マルザハールの使い方／マルザハールの対策 | どちらもマルザハールの6件（同じ結果）。視点の注意が出る | 「使い方」「対策」は照合に使わないので、視点では絞られない。どちらのノートが答えかは判定せず、注意で示す |
| マルザのEでウェーブを押す | E の伝播・対策側の注意・ヴォイドリングの3件が完全一致 | 使う側・対策側の両方が出る |
| マルザハールのRはサッシュで解除できる？ | r-qss・r-leave-tether が完全一致 | 仕様と対策側の推論が出る |
| ゼドのRはゾーニャで防げる？ | r-zhonya-timing が完全一致 | 期待どおり |
| ゼドのRはバリアで軽減できる？ | r-stored-damage が関連候補だけ | バリアの効果は断定していない（ノートの補足に記載）ので、完全一致にならないのは妥当 |
| モルデカイザーのRはサッシュで抜けられる？ | no-cleanse-148・counter-before が先、旧仕様の cleanse-pre-148 が最後 | 旧仕様を現行の攻略法として先に出さない |
| ラックスのQ中にフラッシュできる？ | q-zhonya が完全一致、関連候補が10件 | 「Q中」は1語として捨てられ、サモナースペルの Topic だけの関連候補が多い（雑音） |
| ラックスの使い方 コンボ | ラックスの4件 | 「コンボ」はノートの語彙にない（ノートは「Q→E→R」と書く） |

## 6. 検証

- validate：誤りなし。全テスト：vitest 565・node 11/24/24。
- **資料検索84件**：49件は同じ、24件は新しい資料が加わっただけ。11件はほかの違いがある。
  - 7件は件数の数え方（complete）だけ。新しい資料がすべての条件に一致した分。
  - 4件は、関連候補の数・並び順が変わった。語の重み（資料の中での語の出現数）が資料の追加で変わったため。評価の質問の期待する資料は、すべて引き続き到達する。
    - 「ボットレーンで先にレベル2になるには…」：関連候補19件が3件に減り、trading の記事が関連候補から「認識できた条件に一致」に上がった。
    - 「レーンをフリーズしたいとき…」：一部の関連候補の順序が入れ替わった。
    - 「Dopaが昔、ウェーブを…」：関連候補が増えた。
    - 「最新パッチでテレポートが…」：上位2件の順序が入れ替わった。
- **判断材料の検索**：変化なし。
- **知識ノートの検索の評価29問**：すべて期待どおり。
  - N11 に、新しい関連ノート kn-dive-wave-state を「関連」として追加した。
  - N14「バロンの出現時間」は、新しいノートの根拠の要約にある「出現時間」だけで kn-camp-spawn-times-261 が一致するようになった。語彙にない語（バロン）を捨てると、残りの語の一致が広がる型の限界として記録した（lexical_only）。
- 件数のテスト（正式資料76件→85件、公開74件→83件）は、収録の経緯をテストの名前に書いて更新した。
- 最終照合（同日）：既存のチャンピオン Topic 3件の親を元に戻した後も、資料検索の84件の内訳（49・24・7・4）と、評価の質問の期待する資料への到達は変わらない。件数の数え方だけが変わった7件は「パッチノートの読み方」「なぜこのウェーブを押してはいけないのか」「アイテム選択」「ビルド」「itemization」「build」「アイテム」で、新しい資料がすべての条件に一致した分。
- L3 の表示は「AIが本文を確認」で、説明に「資料の確認であり、ゲーム内での検証ではありません」とある。ノートの要約は「ゲーム内での検証：未実施」と表示する。
- 下書きツールのテスト：実証のデータ（pilot）の N10 は、今回同じ主張で正式に収録したため、`check` が二重の登録として止めるようになった（意図した動き）。資料が付く原典の期待値は、データから求める形に変えた。
