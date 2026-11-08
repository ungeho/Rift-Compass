# 抽出済み知識を既存の知識モデルへ接続する試験

実施日：2026-11-01。基準コミット：`85e6705`。知識抽出の第1〜3回（`knowledge-extraction-batch1〜3.md`、計253件）を、新しい DB・スキーマを作らずに、既存の `KnowledgeNote`・`Evidence`・`Relation`・`Resource`（`data/sample-resources.json`）で表せるかを、性質の違う11件で試した。**公開データは変更していない**。試験は作業用のコピーに追加し、既存の検証（`tools/validate-sample-data.js` の `validate`）にかけただけ。

## 1. 結果の要約

- 11件のノート・17件の根拠・4件の関係を作り、既存の検証の規則（status と evidence_type の組み合わせ、確認レベルの上限、参照切れ）に**誤りなく通った**（empirical 7、source_stated 3、tactical_inference 1）。
- ただし、そのうち5件は、正式資料になっていない原典（Wiki の Turret、LoL Theory の tower-dive、lol-guide の qwgsg、LoLGaren の garencounter）を、既存の登録形式で**仮登録しないと根拠を付けられなかった**。Evidence は正式資料（Resource）しか参照できないため。
- バッチの1行を1ノートにはしていない。同じ主張は1ノートに複数の根拠をまとめ（例1・例9）、条件・数値・著者が違うものは別ノートにした（例7・8）。

## 2. 試した11件

| # | 試験 ID | 性質 | バッチの元 | 表し方 | 根拠（Resource） |
|---|---|---|---|---|---|
| 1 | kn-trial-diagonal-trade | 著者の経験則、同じ主張を複数の記事が支持 | xcppa（目録の試行）、jdgrp、pdvmw ⑥ | 1ノート＋根拠3件（empirical） | res-lg-xcppa・res-lg-jdgrp・res-lg-pdvmw（登録済み） |
| 2 | kn-trial-diagonal-exceptions | 他の知識の例外 | xcppa「成り立たない場合」 | 別ノート＋関係 `condition_of`（→1） | res-lg-xcppa |
| 3 | kn-trial-plates-permanent-261 | 公式仕様（26.1時点） | 第2回 N3・N4 | source_stated＋`historical`（valid_from 26.1、現在への適用は unknown、26.3の変更を注記） | res-riot-patch-26-1-en（登録済み） |
| 4 | kn-trial-plates-fell-14min | 旧パッチだけの知識 | 第1回 C11（旧仕様） | source_stated＋`historical.current_applicability: superseded`。関係 `context_of`（→3） | res-riot-patch-26-1-en（変更前の値の記載） |
| 5 | kn-trial-turret-warming-up | Wiki で確認したゲーム仕様 | 第3回 U2、第2回 H4・K5 | source_stated。同じ仕様の説明（LoL Theory・ゆにか）は empirical_claim の根拠として併記 | **res-wiki-turret（仮登録）**、res-loltheory-tower-dive（仮）、res-lg-qwgsg（仮） |
| 6 | kn-trial-dive-after-15 | 仕様からの戦術的推論 | 第2回 H17 | tactical_inference。関係 `reason_for`（3→6） | res-riot-patch-26-1-en、res-loltheory-tower-dive（仮） |
| 7 | kn-trial-dive-hp-team | 原典ごとに条件・数値が違う | 第2回 K2（ゆにか、2〜3割） | 別ノート（empirical） | res-lg-qwgsg（仮） |
| 8 | kn-trial-dive-hp-squishy | 同上 | 第2回 H9（LoL Theory、60%/40%） | 別ノート（empirical）。7 と `context_of` | res-loltheory-tower-dive（仮） |
| 9 | kn-trial-objective-prep-1min | 同じ著者の近い目安をまとめる | pdvmw ③「約1分前」、第3回 R7「最低1分前」 | 1ノート＋根拠2件。「約1分半前」（suftp）・「7分ごろ」（nxldr）は目安が違うので統合せず注記 | res-lg-pdvmw・res-lg-mpbhg（登録済み） |
| 10 | kn-trial-immobile-mage-not-alone | 複数の著者が同じ判断 | 第3回 R4（がりある）、P3（LoL Theory） | empirical。根拠は1件だけ（P3 の原典が未登録）。注記で別の著者の同じ判断を示す | res-lg-mpbhg |
| 11 | kn-trial-garen-q-timing | チャンピオン・マッチアップ固有 | 第1回 G7 | empirical、`generalizability: champion_specific` | **res-garen-garencounter（仮登録）** |

## 3. 既存モデルでそのまま表せること

| バッチの記録 | 既存の項目 | 例 |
|---|---|---|
| 知識の内容 | `statement_ja` | 全件 |
| 著者の経験則・公式仕様・推論の区別 | `status`（empirical・source_stated・tactical_inference・derived）と、根拠ごとの `evidence_type`（empirical_claim・source_fact・tactical_inference・derivation） | 3・5・6 |
| 原典の節・動画の時間 | `evidence.locator`（section・start_sec・label） | 全件 |
| 確認の範囲 | `evidence.checked_level`（資料の確認レベルを超えられない）と `summary_ja` | 5（Wiki の revid を summary に） |
| 同じ主張の複数の原典 | 1ノートに複数の根拠 | 1・5・9 |
| 成立条件・例外 | `conditions_ja`・`exceptions_ja`、または別ノート＋関係 `condition_of` | 2・6・7・8 |
| パッチ・時期 | `patch_dependencies`、`historical`（valid_from・valid_until・current_applicability・注記） | 3・4 |
| 旧仕様 | `historical.current_applicability: superseded` | 4 |
| ゲーム内での検証 | `last_checked_patch` は `in_game_test` の根拠がない限り設定できない（検証で禁止） | 全件で未設定 |
| 著者 | `source_person` | 1・6・7・8 |
| ノート同士の関係 | `relations`（reason_for・condition_of・refines・prerequisite・applies_to・generalizes・context_of） | 2・4・6・8 |

## 4. 意味や条件が失われる・表しにくい情報

1. **根拠は正式資料しか指せない**：目録の候補（2049件のうち正式資料は46件）を根拠にするには、正式資料への登録が要る。登録すると公開資料の一覧・通常の検索の対象になる（`isPublic` の条件を満たす場合）。11件中5件が仮登録を必要とした。
2. **「同じ著者」「独立した著者」「条件の違う別見解」を表す関係の型がない**：`context_of` などで代用すると、バッチで区別した「独立した裏付けかどうか」「矛盾ではなく条件の違い」が型から読めず、`notes_ja` の文章に頼る（例1・7・8・10）。
3. **判断材料（DU）との関係を持てない**：`relations` はノート同士だけ。DU 側の `related_note`（具体例）は1対1で、ノートから DU への逆向きの関係はない。
4. **旧仕様の期間**：`valid_until` には `valid_from` が要るため、導入時期を調べていない旧仕様は終了パッチを書けない（例4。「superseded」と注記で示した）。
5. **「原典の仕様説明」**（非公式の原典が仕様として説明していること）を表す evidence_type がない。empirical_claim で代用し、summary に「原典の仕様説明」と書いた（例5）。
6. **チャンピオン・ロールの Topic が少ない**：Topic にあるチャンピオンはベイガー・ツイステッド・フェイト・ジャックスの3体、ロールはミッドだけ。ガレン・シンドラなどは `topic_ids` で表せず、`generalizability`（自由記述）と本文に頼る（例11）。追加するのは Topic のデータで、データ形式（スキーマ）の変更は要らない。
7. **図・映像を確認していないこと**：決まった項目がなく、`notes_ja` か evidence の summary に書く。

## 5. 正式資料への登録が必要になる場合

- 根拠にしたい原典が目録の候補のままのとき（今回の5件、バッチの大半）。既存の登録手順（`sample-resources.json` の資料に、確認レベル L3 と確認の記録を付ける）で登録する。
- 仕様の照合に使った Wiki のページ（Turret など）が未登録のとき。既存の Wiki の資料（`res-wiki-*`、12件）と同じ形で登録できる。
- 登録は公開の一覧・検索の結果を変えるので、件数の変化と検索の回帰の確認（84件の質問）が要る。

## 6. 散策プールにノートを加える最小限の方法

1. `ExploreItem.kind` に `"note"` を加え、`data/explorePool.ts` で `index.data.knowledge_notes` を `{ kind: "note", id, topicIds: note.topic_ids, relatedIds: 関係のあるノートの id }` として追加する。距離の分類（`classify`）と抽選（`pickNext`・`pickMany`）は種類によらないので変更不要。
2. 表示は既存の `NoteCard`（状態・成立条件・時期・根拠と資料へのリンク・「ゲーム内での検証：未実施」を表示済み）を `ExploreCard` から呼ぶ。
3. 散策の対象にするノートは、根拠が1件以上あり、根拠の資料が公開対象のものに限る（公開されない資料へ導かない）。
   - 2026-11-08 更新（P1）：公開対象の資料の根拠だけで既存の根拠状態の規則（`tools/validate-sample-data.js` のノートごとの規則）を満たし、公開対象の資料の根拠が1件以上あるノートを公開する（`src/data/notePublicity.ts`）。規則は緩めず、公開対象でない資料の根拠は保存したまま判定・検索の索引・根拠の件数に使わない。画面では資料の名前・発信者・リンクを出さず「未確認の参考情報あり」とだけ示す（警告つきの資料の直接アクセスは従来どおり）。散策・ノートの詳細・ノート検索・Topic・資料の詳細の逆引きは同じ判定を使う。
4. 件数の注意：現状の公開ノートは18件。バッチから登録すると増え、散策の割合・件数の表示が変わる（テストは件数に依存しない形にしてある）。

## 7. 通常の検索へつなぐ場合の課題

- 検索（`src/search/search.ts`）は資料だけを対象にし、判断材料は `decisionsForQuery` で別に照合している。ノートを結果に混ぜるには、照合の対象（statement・条件・Topic）と、資料との並び順の決め方が新たに要る。
- 現状でも、ノートは根拠の資料の詳細画面に表示されるので、**資料を正式登録すれば、その資料の検索から間接的にノートへ届く**。最小限の接続はこの経路。
- ノートを直接検索するなら、判断材料と同じ「別枠の一致」として、`decisionsForQuery` と同じ型の照合を作るのが既存の形に近い（今回は作らない）。

## 8. 「知りたいことから探す」（質問の例）への追加

- 質問の例は `src/components/SearchPage.tsx` の `EXAMPLES`（固定の配列）。質問の文を追加するだけで、検索語として資料・判断材料に照合される。
- ノートや Input Buffering の調査の質問を足すには、先にその答えになる資料（またはノート・判断材料）が検索で届く必要がある。届かない質問を例に出すと「該当なし」になる。
- 質問と根拠の知識の対応は、`data/experiments/decision-questions.json`（期待値つきの質問セット）の形で記録できる（今回は `input-buffering-research.md` の §D に文書で記録）。

## 9. 今後の公開に必要な作業（提案）

1. 登録済みの資料だけで作れるノート（今回の 1・2・3・4・9・10 の6件）を、既存の形式で `sample-resources.json` に追加し、資料の詳細画面での表示と検証を確かめる。
2. 根拠にしたい原典を、件数を決めて正式資料に登録する（検索の回帰の確認を含む）。
3. 散策の対象に「ノート」を加える（§6）。
4. 必要なら、関係の型（同じ著者・独立した著者・条件の違い）と、旧仕様の終了だけを書ける形を検討する（データ形式の変更になるので別の判断）。

試験に使ったノートの定義は作業用のスクリプトにあり、公開データには入れていない。
