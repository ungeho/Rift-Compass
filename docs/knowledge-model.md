# 軽量知識モデル（v0.1.1）

> v0.1.1（レビュー反映）：根拠状態を「資料の確認」「仕様の確認」「論理的な導出」「戦術的な推論」に分離。`last_checked_patch` と `historical.valid_from` / `valid_until` の意味を明確化。`falsifiers_ja`（反証条件）を追加。

サンプルデータ：[`data/sample-resources.json`](../data/sample-resources.json)

## 1. 設計の考え方

```
必須層   Resource ──< topic_ids >── Topic           ← 全資料に適用（低コスト）
任意層   KnowledgeNote ──< Evidence >── Resource     ← 必要な資料・質問だけ
         KnowledgeNote ──< Relation >── KnowledgeNote
```

- **必須は Resource と Topic だけ**です。これだけで「資料を登録し、日英の語で検索して見つける」ことができます。
- KnowledgeNote / Evidence / Relation は **後から追加** します。Resource 側には何も追記しなくても、Evidence が Resource を参照する形にしてあります（Resource は Note の存在を知りません）。
- Mechanic → Principle → Decision の因果は、Note の `kind` と Relation（`reason_for` / `prerequisite` / `condition_of`）で表します。全資料に強制はしません。

データ全体はひとつのJSONで、以下の構造です。

```json
{
  "schema_version": "0.1.1",
  "research_context": { "current_patch_at_research": "26.21", ... },
  "topics": [], "resources": [], "knowledge_notes": [], "evidence": [], "relations": []
}
```

## 2. Resource（必須）

外部教材1件を表します。

| フィールド | 必須 | 型・値 | 説明 |
|---|---|---|---|
| `id` | ✔ | `res-<発信元>-<要旨>` | 安定ID。URLが変わっても変えない |
| `url` | ✔ | string | 正規URL。リダイレクトがあれば `verification.notes` に記録 |
| `title` | ✔ | string / null | 原題。未確認なら `null` |
| `type` | ✔ | `wiki` `official` `patch_notes` `patch_notes_archive` `article` `video` | 資料タイプ |
| `language` | ✔ | `ja` `en` `ko` … | 本文（音声）の言語 |
| `creator` | ✔ | `{name, kind, channel_url?}` | `kind`：`official` `community_wiki` `media` `coach` `pro_player` `streamer` `fan_translator` |
| `topic_ids` | ✔ | string[] | 複数所属可 |
| `summary_ja` | ✔ | string | 日本語の短い紹介文（2〜3文）。**本文未確認の場合はそう書く** |
| `published_at` | ✔ | ISO日付 / null | 不明なら `null`。疑義があれば `published_at_note` |
| `patch_context` | ✔ | `{stated_patch, basis, era}` | 下記参照 |
| `access` | ✔ | `{free, login_required, notes?}` | 不明なら `null` |
| `verification` | ✔ | `{level, checked_at, method, notes?}` | 下記参照 |
| `duration_sec` | | number | 動画のみ |
| `segments` | | `[{start_sec, label, source}]` | 動画チャプターや開始時間。`source`：`youtube_chapter` / `manual` |
| `derived_from` | | Resource ID | 翻訳・切り抜き・再掲の原典 |
| `translation` | | `{kind, affiliated_with_original, method_stated}` | 非公式翻訳などの注記 |
| `updated_at` `last_edited_at` | | ISO日付 | 判明する場合のみ |

### patch_context

- `stated_patch`：資料自身が明記しているパッチ・シーズン（例：`"V3.14"`、`"Season 16（タイトル記載）"`）。
- `basis`：`stated`（明記あり）/ `inferred_from_date`（公開日から推定）/ `inferred_from_original_date`（翻訳版で、原典の公開日から推定）/ `unknown`。
- `era`：`season1` … `season16`、`preseason-2014`、`current`、`current_with_history`、`unknown`。

公開日からパッチ番号を推定して書き込むことはしません。推定できるのは era まで（例：2019-11 → `season9`）とします。

### verification.level（確認レベル）

| レベル | 意味 | Phase 0 の件数 |
|---|---|---|
| **L0** | URL候補のみ。取得できない（403など）か未確認 | 2 |
| **L1** | URLの実在のみ確認 | 0 |
| **L2** | タイトル・発信者・公開日などのメタデータを確認（動画はoEmbed＋公開ページ。本編は未視聴） | 13 |
| **L3** | AIが本文を取得し、要約ツール経由で見出し・該当記述を確認 | 23 |
| **L4** | 人間が本文・該当区間を確認 | 0 |

L3 は「AIが読んだ」だけで、人間による確認ではありません。WebFetch は小型モデルによる要約を返すため、引用の細部や数式（例：Haste の式）は L4 で再確認すべきです。

**L0 資料と公開UIでの扱い**：L0 の資料は、調査候補としてデータに保存してかまいません。ただし Phase 1 の公開UIでは、**無料でアクセスできることを確認した資料（`access.free: true`、かつ確認レベルL2以上）だけを通常の推奨対象** にします。L0 の資料や `access.free` が `null` の資料は、検索結果の通常表示や推奨に出しません。出す場合は「未確認の候補」として区別します。

## 3. Topic（必須）

階層カテゴリと検索用の概念を同じ形で管理します。

| フィールド | 説明 |
|---|---|
| `id` | 安定ID（英小文字・ハイフン） |
| `kind` | `category`（大分類）/ `concept`（検索概念）|
| `parent_ids` | 複数の親を許可します（DAG）。例：`minion-aggro` は `wave-management` と `cat-basics` の両方に属する |
| `label_ja` / `label_en` | 表示名 |
| `aliases_ja` / `aliases_en` | 検索用の別名。略語・俗語・表記ゆれ（例：`CD` `クールタイム` `スキルが落ちている`）|

日英の対応は Topic を介して取ります。「Lv2先行」で検索すると `level-2` に当たり、`aliases_en` の `level 2 spike` などを経由して英語資料にも到達できます。

## 4. KnowledgeNote（任意）

必要なときだけ作る知識単位です。

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✔ | `kn-<要旨>` |
| `kind` | ✔ | `mechanic`（仕様）/ `principle`（原理・相互作用）/ `decision`（判断）/ `hypothesis`（仮説） |
| `statement_ja` | ✔ | 1〜2文の主張 |
| `topic_ids` | ✔ | 検索用 |
| `status` | ✔ | 下表。**Evidence から機械的に決める** |
| `patch_dependencies` | ✔ | 依存する仕様のキー（後述）。依存がなければ `[]` |
| `last_checked_patch` | ✔ | **そのパッチの環境で主張が成り立つことを検証したパッチ**。`in_game_test` の Evidence がある場合だけ設定する。調査日の最新パッチや、資料を読んだ日のパッチを入れてはいけない。Phase 0 ではすべて `null` |
| `conditions_ja` / `exceptions_ja` | | 成立条件・例外。必要な場合だけ |
| `falsifiers_ja` | | 反証条件（観察されたら仮説を棄却・修正すべき状況）。主に `hypothesis` で使う |
| `historical` | | `{valid_from, valid_until, current_applicability, applicability_note_ja}` |
| `source_person` / `generalizability` | | 特定人物の判断の場合。`general` / `role_specific` / `champion_specific` / `matchup_specific` |
| `notes_ja` | | 未確認理由など |

### status（根拠状態）

根拠状態は、次の4つの違いを区別するためのものです。

1. **資料の確認**：資料にそう書かれていることを確かめた（`source_stated`）。資料の記述が正しいか、現行のゲームで成り立つかは含まない。
2. **仕様の確認**：現行のゲームで実際に成り立つことを確かめた。`status` ではなく、`in_game_test` の Evidence と `last_checked_patch` で表す（Phase 0 では0件）。
3. **論理的な導出**：確認済みの前提から、数値や事実が必然的に導かれる（`derived`）。
4. **戦術的な推論**：仕様から「どう行動すべきか」を推論した（`tactical_inference`）。導出と違い、試合状況についての暗黙の仮定を含む。

| status | 機械的な条件 | 表示文言 |
|---|---|---|
| `source_stated` | L3以上の `source_fact` Evidence が1件以上 | 「資料に記載あり（○○、確認レベルL3）。ゲーム内では未検証」 |
| `derived` | L3以上の `derivation` Evidence があり、前提の Note（`reason_for` / `prerequisite`）がすべて `source_stated` か `derived` | 「資料の値からの計算（前提：○○）。ゲーム内では未検証」 |
| `tactical_inference` | L3以上の `tactical_inference` Evidence がある | 「仕様からの推論（前提にない試合状況では成り立たない場合あり）」 |
| `empirical` | `empirical_claim` Evidence のみ | 「解説者の経験則・主張」 |
| `unverified` | L2以下の根拠のみ、または根拠なし | 「未検証」 |
| `disputed` | `counter` Evidence がある | 「対立する見解あり」 |

- どの status も、それだけでは「現行環境で検証済み」を意味しません。表示では、確認レベル（L0〜L4）と、ゲーム内での検証の有無を、status とは別に示します。
- L3 は「AIが本文を取得し、要約ツール経由で確認した」段階です。`source_stated` の多くは L3 なので、「資料に記載あり」と表示し、「仕様として確認済み」とは表示しません。
- **根拠なしの主張を検証済みと表示しない** ために、status は Evidence 側の条件からしか付けられないようにします。この規則は `tools/validate-sample-data.js` で機械的に検査できます（下記の再現手順を参照）。
- `unverified` 以外の status は、Evidence が1件以上必要です。`empirical` には `empirical_claim` が必要です。
- `derived` は、前提の Note（`reason_for` / `prerequisite`）か、所在（`locator`）付きの L3 以上の `derivation` Evidence の、どちらかで計算根拠を辿れる必要があります。Relation は必須ではありません。
- Evidence の `checked_level` は、参照先 Resource の `verification.level` を超えてはいけません。
- 未定義の status と、Topic の自己参照・循環参照は拒否します。

```
node tools/validate-sample-data.js                   # 実データの検査
node --test tools/validate-sample-data.test.js       # 不正データを与えて検査が失敗することの確認
```

### historical.current_applicability

| 値 | 意味 |
|---|---|
| `applicable` | 現行仕様で同じことを確認済み（`in_game_test`、または現行パッチの公式情報との照合が必要）|
| `likely_applicable` | 複数時期の資料で一致しているが、現行仕様での確認は一部のみ |
| `unknown` | 現行で成り立つか判断する根拠がない（**既定値**）|
| `superseded` | 前提となる仕様が変わり、そのままでは適用できない |

古い資料の主張は、確認できるまで `unknown` のままにします。

### historical.valid_from / valid_until

- **主張が対象とする時期** を表します（資料の公開日ではありません）。値はパッチ番号（`V3.14`）またはシーズン（`season4`）です。
- `valid_until: null` は「終了時期を確認していない」という意味で、「現在も有効」という意味ではありません。現在も有効かどうかは `current_applicability` だけで表します。
- 特定時期の観察に基づく主張（例：2014年1月のコラム）は、`valid_from` と `valid_until` の両方をその時期にします。
- 変更前の仕様と変更後の仕様を1つの Note に混ぜません。変更前の挙動が資料で曖昧な場合は、その部分を Note に含めません。

## 5. Evidence（任意。ただし根拠付きの主張には必須）

| フィールド | 説明 |
|---|---|
| `note_id` / `resource_id` | 結び付け先 |
| `evidence_type` | `source_fact`（資料に記載された仕様・事実）/ `derivation`（数学的・論理的な導出の前提）/ `tactical_inference`（戦術的な推論の前提）/ `empirical_claim`（経験則・観測に基づく主張）/ `hypothesis`（未検証の仮説）/ `counter`（反証・対立する見解）/ `in_game_test`（現行パッチのゲーム内で検証した記録。Phase 0 では0件） |
| `locator` | `{section}` または `{start_sec, label}`。不明なら `null` |
| `summary_ja` | 該当箇所の要約。原文の引用は1文程度まで |
| `checked_level` | その箇所を確認したレベル（L0〜L4）。Resource のレベルとは別に持つ |
| `checked_at` | 日付 |

## 6. Relation（任意）

| type | 意味 |
|---|---|
| `prerequisite` | A を知っていることが B の前提 |
| `reason_for` | A が B の理由（Mechanic → Principle → Decision の鎖）|
| `condition_of` | A が B の成立条件 |
| `applies_to` / `generalizes` / `refines` | 適用・一般化・精緻化 |
| `context_of` | 歴史的な背景 |
| `conflicts_with` | 対立 |
| `supersedes` | 旧知識の置き換え（削除せず関係で残す）|
| `should_derive` | 未完了の導出タスク（Progressive Validation 用。導出が済んだら `reason_for` に変える）|
| `related` | 弱い関連 |

最初からすべての関係を登録する必要はありません。

## 7. パッチ依存の管理

Note ごとに `patch_dependencies` で依存先の仕様キーを持ちます。

```
system:<名前>        例: system:minion-xp, system:ability-haste, system:crowd-control
champion:<名>:<スキル>  例: champion:jax:e
summoner:<名前>      例: summoner:flash
item:<名前>          例: item:wards（* はワイルドカード）
map:<名前>
```

新パッチでは、パッチノートから変更された仕様キーの集合を作り、それと一致する Note だけを再確認候補にします。

- 例：26.21 のパッチノートを見出しとキーワードで確認したところ、本サンプルの依存キーに一致する項目は見当たりませんでした（テレポートの表示バグ修正のみ）。これは「再確認の候補がない」という意味で、各 Note が 26.21 で検証済みになるわけではありません。
- 例：26.1（Wikiの表記では V26.01）のミニオン経験値の変更は `system:minion-xp` に一致し、`kn-level2-xp` と `kn-level2-minion-count` が候補になります。再確認の結果、公式ノートに「序盤のbreakpointsは変わっていない」とあり、計算でも従来の目安（7体／9体）と一致しました。**「計算方法が変わった」という事実だけから、従来の目安が無効だと推測してはいけません。**
- 26.2〜26.21 のように、パッチノートを確認していない期間がある Note は、その旨を `notes_ja` に書きます。
- `item:*` のような広いワイルドカードは候補が増えるため、仮説段階の Note に限って使います。

Resource 自体は再確認しません。対象を Note に限ることで、毎パッチの全件再検証を避けます。

## 8. 古い知識の保存

- 古い資料も削除しません。`patch_context.era` で時期を示します。
- 主張は Note として `historical` を付け、「当時の事実（`status`）」と「現在の適用可能性（`current_applicability`）」を別の軸で持ちます。
- 仕様が変わった場合は、新しい Note を作り `supersedes` で結びます。

## 9. 詳細な因果グラフへの移行経路

1. 現在：Note と Relation は同じJSON内のフラットな配列。
2. Note が増えたら、Relation をそのままグラフDBのエッジ、または RDB の結合テーブルに移せます（ID はすでに安定）。
3. `conditions_ja` / `exceptions_ja` が繰り返し現れる場合は、条件を独立した Node（例：`cond-enemy-jungler-unknown`）に昇格させます。
4. `patch_dependencies` のキーを、パッチノートから自動抽出した変更エンティティと結合できるようにします。

どの段階でも、既存の Resource / Topic を作り直す必要はありません。

## 10. 意図的に入れなかったもの

- 資料全体のチャンピオン・アイテムの網羅的なタグ付け（必要になったら Topic を追加）
- 評価スコア・人気度（実測データがないため）
- 本文・字幕の保存（著作権と更新コストの理由）
