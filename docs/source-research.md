# 資料調査と確認状態

- 調査日：2026-10-27（調査時点の最新パッチ：26.21）
- 調査者：AI（Claude）。人間による確認（L4）は未実施
- 確認方法：
  - Web記事・Wiki：WebFetch（ページを取得し、小型モデルが要約）
  - YouTube：oEmbed API（タイトル・投稿者）と動画公開ページのメタデータ（投稿日・長さ・説明欄・チャプター）。**動画本編の視聴や字幕の取得はしていません**
  - 取得を拒否されたサイト（HTTP 403 / 451）では、User-Agent の偽装などの回避はしていません
- 確認レベル（L0〜L4）の定義は [knowledge-model.md](knowledge-model.md#verificationlevel確認レベル) を参照

## 1. 集計

| 項目 | 件数 |
|---|---|
| サンプルデータに登録した資料 | **38**（レビュー反映で Patch 26.1 Notes を追加）|
| うち実在とメタデータを確認（L2以上） | **36** |
| うち本文を取得して確認（L3） | 23 |
| うち動画のメタデータ・チャプターのみ確認（L2） | 13 |
| 取得できず未確認（L0） | 2 |
| 言語：英語 / 日本語 / 韓国語 | 31 / 5 / 2 |

ここでの「確認」は **資料の確認**（実在・メタデータ・記述内容）を指します。資料に書かれた仕様が現行のゲームで成り立つかは検証していません。

韓国語の2件は、英語版（非公式ファン翻訳）の **原典を追跡するため** に登録しました。日英の資料には数えていません。

## 2. 領域別の一覧

### 2.1 ゲームの基本仕様（Wiki・公式）

| ID | 資料 | 言語 | 確認 | 確認できた内容・注意 |
|---|---|---|---|---|
| res-wiki-experience | LoL Wiki: Experience (champion) | en | L3 | Lv2=280XP、ソロ100%/共有65%（V26.01）。ミニオン種別XPは取得範囲に記載なし |
| res-wiki-cc-types | LoL Wiki: Types of Crowd Control（/Blind からリダイレクト）| en | L3 | Blind中はAAがミスし、オンヒットが発生しない。ページの約45%のみ取得 |
| res-wiki-cooldown | LoL Wiki: Cooldown | en | L3 | 定義のみ |
| res-wiki-haste | LoL Wiki: Haste（/Ability_haste からリダイレクト） | en | L3 | 式はマークアップ崩れのため、ツールが再構成したもの。L4で要確認 |
| res-wiki-minion | LoL Wiki: Minion | en | L3 | フリーズの定義、Call for Help、ターゲット優先順位 |
| res-wiki-jax | LoL Wiki: Jax | en | L3 | Eは2秒AA回避、範囲スキル25%軽減、CD17秒（Rank1）。最終変更はV26.12 |
| res-wiki-summoner-spell | LoL Wiki: Summoner spell | en | L3 | 各スペルの基本CD。取得結果の「ClarityがSRで使用可」は誤読の疑いがあるため不採用 |
| res-wiki-flash | LoL Wiki: Flash | en | L3 | 現行CD300秒、V1.0.0.152で300秒に |
| res-riot-how-to-play-ja | Riot公式：遊び方（ja-jp） | ja | L3 | 基本の流れ |
| res-riot-patch-notes-ja | Riot公式：パッチノート一覧（ja-jp） | ja | L3 | 最新は26.21（2026-10-20） |
| res-riot-patch-26-21-en | Riot公式：Patch 26.21 Notes | en | L3 | 見出しと対象キーワードの有無のみ確認 |
| res-riot-patch-26-1-en | Riot公式：Patch 26.1 Notes（2026-01-07） | en | L3 | Minions 節のみ。種別ごとの経験値と共有比率の変更、「Early game breakpoints haven't changed here」|
| res-automaton-skills-2015 | AUTOMATON「Super LoL Rocket!!」スキル編 | ja | L3 | 2015年（S5）。CDの説明は普遍的だが、具体例は古い |
| res-gamewatch-soraka-2 | GAME Watch ソラカ先生 初心者ガイド第2回 | ja | L3 | 2018年。チュートリアルの内容 |

### 2.2 レーニング・ウェーブ管理

| ID | 資料 | 言語 | 確認 | 注意 |
|---|---|---|---|---|
| res-dignitas-wave-2019 | Dignitas: A Guide to Improving Your Wave Management | en | L3 | 2019-07-14 |
| res-dignitas-freeze-advanced | Dignitas: Advanced guide: Freezing your lane | en | L3 | 表示日付は2018-01-13だが、旧記事の移行日の可能性あり。**公開日は未確定** |
| res-loltheory-wave-2026 | LoL Theory: Wave Management…When to Freeze, Slow Push, and Fast Push | en | L3 | 2026-04-03、2026-08-25更新 |
| res-metabot-trading-2026 | MetaBot.GG: Laning Phase Fundamentals | en | L3 | 著者名の記載なし。経験則として扱う |
| res-mobalytics-wave | Mobalytics: wave management | en | **L0** | HTTP 403。タイトルも未確認 |
| res-sheep-level2-2026 | Sheep Esports: 1ウェーブ目Lv2の新手法 | en | **L0** | HTTP 403。検索結果の要約のみ |

### 2.3 ジャングル・視界・マクロ

| ID | 資料 | 言語 | 確認 | 注意 |
|---|---|---|---|---|
| res-wiki-trinket | LoL Wiki: Trinket item | en | L3 | Preseason 2014で導入 |
| res-yt-veigarv2-jungle-decisions | VeigarV2: Stop Throwing as a Jungler | en | L2 | チャプター「Tracking enemy summoners」など |
| res-yt-dopaenglish-teacher-2 | Dopa English: Dopa Teacher #2（インベード） | en | L2 | 非公式ファン翻訳（Whisper AI）。原典は下記 |
| res-yt-dopa-official-invade | Official dopa: 인베이드 강의 | ko | L2 | 原典（2023-04-22） |

### 2.4 ビルド・ルーン・サモスペ

| ID | 資料 | 言語 | 確認 | 注意 |
|---|---|---|---|---|
| res-yt-veigarv2-pro-items | VeigarV2: Why you SHOULDNT Copy Pro Players Items! | en | L2 | 本編未視聴 |
| res-yt-veigarv2-veigar-guide-s16 | VeigarV2: How to ACTUALLY Play Veigar in Season 16 | en | L2 | ルーン・ビルド・マッチアップのチャプターあり |
| res-wiki-summoner-spell / res-wiki-flash | （2.1と同じ）| | | |

### 2.5 専門家・高レート・OTPの解説

| ID | 資料 | 言語 | 確認 | 注意 |
|---|---|---|---|---|
| res-yt-veigarv2-recall-timer | VeigarV2: This is the PERFECT Recall Timer | en | L2 | チャプター「The 7-minute recall meta」 |
| res-yt-veigarv2-minion-aggro | VeigarV2: You Don't Understand Minion Aggro | en | L2 | Wikiのミニオン仕様と対応づけられる |
| res-yt-veigarv2-faker-waves | VeigarV2: How Faker Controls Waves | en | L2 | |
| res-yt-veigarv2-patch-notes | VeigarV2: How To Read Patch Notes | en | L2 | Patch-aware の教材として |
| res-yt-veigarv2-coaching-ruu | VeigarV2: Coaching Japanese V-Tuber R_U_U | en | L2 | 日本人プレイヤーへのコーチング。会話言語は未確認 |
| res-yt-dopaenglish-teacher-1 | Dopa English: Dopa Teacher #1 Snowball | en | L2 | 翻訳版は2023年公開、**原典は2019年** |
| res-yt-dopa-official-teacher-snowball | Official dopa: 도선생님모드…스노우볼 | ko | L2 | 原典（2019-11-06） |
| res-yt-alliyan-dopa-tf-2019 | Alliyan: Dopa様のTF 徹底解説 | ja | L2 | 日本語の第三者による解説（2019） |

VeigarV2 のチャンネルについては、検索結果に「元Fnatic戦略コーチ」「C9コーチ」などの記載がありました。ただし、いずれも動画タイトルや説明欄に由来し、現在の経歴は確認していません。

### 2.6 Season 1〜4 を含む歴史的資料

| ID | 資料 | 時期 | 確認 | 注意 |
|---|---|---|---|---|
| res-wiki-season-one | LoL Wiki: Season One (2010-2011) | S1 | L3 | V1.0.0.96 で開始 |
| res-wiki-sight-ward | LoL Wiki: Sight Ward | S1〜S5 | L3 | V3.14で名称変更と上限導入、V5.22で削除（Wikiの記述。当時の公式ノートとは未照合）|
| res-wiki-v3-14 | LoL Wiki: V3.14 | Preseason 2014 | L3 | ワード上限、トリンケット、モンスターのレベル制 |
| res-wiki-flash | LoL Wiki: Flash（履歴） | 2009〜S1 | L3 | |
| res-engadget-wards-2014 | Engadget（Massively再掲）: Wards win League of Legends | S4 | L3 | 当時の主張。現行への適用は未検証 |

## 3. 調査で分かったこと・問題点

1. **Season 1〜3 の当時の「教材」はほとんど見つからなかった**。Wikiの履歴ページは当時の仕様の確認には強いものの、当時の戦術解説（ガイド・動画）は、リンク切れや検索で上位に出ないことから到達が難しい状況でした。Mobafire の Season 3 ガイドは HTTP 403 で取得できず、登録していません。2013年の reddit スレッドも検索では見つかりませんでした。
2. **日本語資料が少ない**（5件）。日本語のウェーブ管理やトレード解説の記事は、検索では英語の結果に埋もれました。esports.net の日本語用語集は HTTP 451 で取得できませんでした。
3. **専用のOTPチャンネルは確保できなかった**。VeigarV2 のベイガーガイド、Dopa（TF・ミッド）の資料で代用しましたが、「OTPである」ことは確認していません。
4. **動画は本編を確認していない**。チャプター名から内容を推測できますが、推測は `summary_ja` に「〜とみられる（本編は未視聴）」と書き、検証済みにはしていません。YouTubeのチャプターが投稿者によるものか自動生成かも判別できません。
5. **翻訳の連鎖**：Dopa English は非公式で、AI（Whisper）による翻訳だと明記しています。`derived_from` で原典を辿れるようにし、翻訳版の公開日（2023年）と原典の時期（2019年）を区別しました。
6. **Wikiのリダイレクト**（Blind → Types of Crowd Control、Ability_haste → Haste）が2件ありました。URLは登録したまま、タイトルは遷移先のものにしました。
7. 検索結果に、内容の薄い集約サイトや、正体の不明なドメイン（例：`gametutorials.duckdns.org`）が混ざっていました。これらは登録していません。

8. **レビュー反映時の追加調査（2026-10-27）**：
   - Patch 26.1 Notes で、ミニオン経験値の変更と「序盤のbreakpointsは変わっていない」という記述を確認しました（L3）。最初の調査では公式ノートを見ずに Wiki の変更履歴だけを根拠にしていたため、「旧パッチの目安は無効かもしれない」という推測を書いてしまいました。この推測は撤回しました。
   - Wiki の Minion ページで、通常ウェーブの構成（近接3・キャスター3、砲台は3ウェーブ目から）を確認しました。
   - Wiki の Sight Ward ページを再確認しました。V3.14 で「1人3個まで」が追加されています。一方、「Ward before V3.12」という注記には「3個設置済みで4個目を置くと最初のものが消える」とあります。V3.14 より前に上限がなかったとは言えないため、Note を修正しました。
   - ケース4の本来の仮説（攻撃的な選択が防御として機能する場合がある）について、1回検索しました。直接の根拠になる実在資料は確認できませんでした（候補のフォーラムは Mobafire で、HTTP 403）。

## 4. 除外した候補

| 候補 | 理由 |
|---|---|
| Udemy のウェーブ管理講座 | 有料 |
| mobafire.com の S3 Ryze ガイド | HTTP 403（L0。ケースで使わないため未登録）|
| esports.net/jp 用語集 | HTTP 451 |
| gametutorials.duckdns.org、nerfplz 等 | 信頼性・内容の確認ができない |
| u.gg / op.gg のビルド統計ページ | 統計は毎パッチ変わるため、教材ではなく外部リンクとして扱うのが妥当（Phase 1 以降で検討）|
