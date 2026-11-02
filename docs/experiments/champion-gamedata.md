# 全チャンピオンの基礎データ（2026-11-02）

長期目標：全チャンピオン・スキル・ステータス・アイテム・ルーン・オブジェクト・相互作用・プロの経験則を、蓄積・比較・探索できる知識基盤にする。今回はその土台として、全チャンピオンの Topic・5ロール・公式データの一括取り込み・成長の計算・パッチ別の管理を作った。

## 1. 構成

| 層 | 置き場所 | 内容 |
|---|---|---|
| 構造化データ（数値） | `public/gamedata/`（静的公開。画面は必要なファイルだけを読む） | Data Dragon（版ごと）・Wiki の Module:ChampionData（revid ごと） |
| 知識（説明・経験則） | `data/sample-resources.json` の KnowledgeNote・Evidence・Relation | 数値そのものはノートにしない。式・理由・影響をノートにする |
| 分類 | Topic | 全チャンピオン（cat-champions の子）・5ロール（大分類） |
| 原典 | Resource | Data Dragon・Wiki（Champion statistic・Module:ChampionData） |

- 新しい DB・グラフエンジンは入れていない。取り込みは `npm run gamedata -- <コマンド>`（`tools/gamedata/ingest.js`、依存パッケージなし）。
- 出典は各ファイルの `source`（名前・版・URL・取得日）に残す。`public/gamedata/manifest.json` が全版の一覧と現行の版を持つ。

```
public/gamedata/
  manifest.json                         取り込んだ版の一覧（ddragon・wiki_championdata）と current
  ddragon/<版>/index.json               全チャンピオンの一覧（ID・キー・日英の名前・クラス・Topic・基本ステータス）
  ddragon/<版>/champions/<ID>.json      1チャンピオン（日英の名前・説明・パッシブ・スキル Q/W/E/R）
  ddragon/<版>/classes.json             チャンピオンクラス（tags）→ チャンピオン、チャンピオン → クラス
  ddragon/<版>/report.json              スキルの取得範囲・Wiki との照合・前の版との違い
  wiki-championdata/<revid>/index.json  Wiki の項目の一覧（形態を含む175項目）
  wiki-championdata/<revid>/by-key/<キー>.json  Data Dragon のキーごとの形態（例：240＝Kled・Kled & Skaarl）
```

容量：Data Dragon 1版あたり約2.3MB（173ファイル＋一覧）、Wiki 約0.8MB、計5.4MB（2版）。画面は1チャンピオンあたり manifest・一覧（約80KB）・個別ファイル・Wiki の1件・前の版の個別ファイルを読む。

## 2. 全チャンピオンと5ロール

- **チャンピオン**：Data Dragon 16.21.1 の173件すべてに Topic がある（網羅率 100%）。新規166件＋既存7件（champ-jax・champ-veigar・champ-twisted-fate・champ-malzahar・champ-mordekaiser・champ-zed・champ-lux、ID は変えていない）。
  - ID は英語名から作る（`champ-kaisa`・`champ-dr-mundo`・`champ-nunu-willump`）。日本語名は Data Dragon の ja_JP（173件すべてにある）。別名は日本語名の中黒・＝なしの形と、Data Dragon の ID が名前と違う場合（MonkeyKing など）だけ。通称（根拠のない略称）は付けていない。
  - 既存の champ-jax（親 aa-negation）・champ-veigar・champ-twisted-fate（親 cat-expert）に cat-champions を親として加えた（既存の親は残す）。散策の距離への影響は §7。
  - Data Dragon の一覧の `topic_id` で、チャンピオンと Topic を結ぶ（Topic の形式は変えていない）。
- **5ロール（ポジション）**：既存の role-mid（大分類）と同じ形で、role-top・role-jungle・role-bot・role-support を大分類として追加。
  - **チャンピオンをロールの子にしていない**。Wiki の client_positions（Riot クライアントの推奨。Wiki の記載）と external_positions（統計サイトでの使用）は、構造化データとしてチャンピオンのページに表示するだけ。
- **チャンピオンクラス**（Riot の分類。ポジションとは別）：Data Dragon の tags をそのまま保存（173件すべてにあり、130件は複数）。Fighter 60・Mage 75・Assassin 46・Marksman 33・Tank 46・Support 43。tags の順は Data Dragon のまま（先頭が主なクラスとは限らない）。
  - Wiki の細分類（role：Juggernaut・Burst など13種）と herotype・alttype も Wiki のデータに残す（Riot の tags とは別の出典として表示）。
  - クラスは知識を整理する観点として今後使う（例：Mage＝マナ効率・スキル CD・射程・ウェーブクリア、Assassin＝バースト・キルライン・接近と離脱、Marksman＝通常攻撃の射程・攻撃速度・DPS・カイト）。**クラスだけから個々のチャンピオンの仕様・最適な戦術を推定しない**。Topic・ノートとしての活用は未着手（§9）。

## 3. 取得できた数値

| 項目 | Data Dragon | Wiki（Module:ChampionData） |
|---|---|---|
| 体力・マナ（リソース）・物理防御・魔法防御・体力回復・リソース回復 | 基本値・成長値 | 基本値・成長値 |
| 攻撃力 | 基本値。**成長値は全173件で0**（既知の不具合。§10.1。生の値は残し、計算に採用しない） | 基本値・成長値 |
| 攻撃速度 | 基本攻撃速度・成長値（％） | 基本攻撃速度・成長値・**反映率（as_ratio）** |
| 射程・移動速度 | あり | あり |
| 攻撃のモーション | なし | attack_cast_time・attack_total_time・attack_delay_offset・missile_speed（チャンピオンによる） |
| 形態 | 1組だけ | 形態ごと（Kled / Kled & Skaarl、Gnar / Mega Gnar） |
| クラス・ポジション | tags | role・herotype・alttype・client_positions・external_positions |

- Data Dragon と Wiki の照合（16.21.1 × revid 4088335）：違い178件。内訳は攻撃力の成長値172件、マナ3件（Bel'Veth 45/0・Mordekaiser 100/0・Viego 10000/0。マナのないチャンピオンに Data Dragon が値を持つ）、Jhin の攻撃速度の成長値（0/3）、Kled の射程・移動速度（Data Dragon は体力が「Kled」、射程・移動速度が「Kled & Skaarl」と、形態の値が混ざっている）。
- 数式で書かれた値（Kled & Skaarl の hp_lvl = 84+1000/17）は計算し、`__expr` に元の式を残した。

## 4. 成長の計算

- 実装：`src/gamedata/growth.ts`。式は Wiki「Champion statistic」revid 4069636。
  - 成長するステータス：基本値＋成長値×(n−1)×(0.7025＋0.0175×(n−1))
  - 攻撃速度：基本攻撃速度＋[増加％＋成長値×(n−1)×(0.7025＋0.0175×(n−1))]×反映率
- **攻撃速度の3つの値を混同しない**：基本攻撃速度（Data Dragon の attackspeed）、反映率（Wiki の as_ratio。Data Dragon にない）、成長値（％）。Wiki の175項目のうち112項目で反映率は基本攻撃速度と違う。反映率がなければ合計は計算しない。
- 検証（テスト `src/gamedata/growth.test.ts`）：係数 Lv1＝0・Lv2＝0.72・Lv18＝17・Lv20＝19.665、1レベルの増分（Lv9→10＝100%・Lv17→18＝128%・Lv19→20＝135%、増分は0.035ずつ増える）は Wiki の記載と一致。全173件で Lv18＝基本値＋17×成長値。手計算の例（体力650・成長114 → Lv2 732.08・Lv18 2588）。反映率と基本攻撃速度が違う例で、基本攻撃速度に成長を掛ける誤りと区別できること。
- 扱わないもの（明示）：攻撃速度の上限（2.5 など）、アイテム・ルーンの増加（関数の引数としては受け取れる）、HUD の切り上げ、形態の切り替え。
- **これは計算の確認で、ゲーム内の検証ではない**。

## 5. スキルのデータ（Data Dragon 16.21.1、692スキル）

| 取れるもの | 件数 |
|---|---|
| クールダウン（0 以外） | 672 |
| コスト（0 以外） | 568（コストの種類の多くは「{{ abilityresourcename }}」の穴埋め：556） |
| 射程 | 692（うち36件は 25000 以上で、全体・自分中心などの印と見られる。解釈しない） |
| 最大ランク | 692（3：168・4：3・5：509・6：11・1：1） |
| 日英の名前・説明・説明文（tooltip） | すべて |

| 取れないもの | 状況 |
|---|---|
| ダメージ・スケーリング・効果量 | 説明文の穴埋め3364件のうち、Data Dragon の中で値が分かるのは41件だけ。datavalues・vars は692件すべて空、effect は460件ですべて0か null |
| 対象・効果の種類（視界・True Sight・命中の確認・ステルスとの相互作用・詠唱キャンセル） | 構造化された項目はない（説明文の文章だけ） |

- 説明文・数値の配列は、空や0でも元のまま保存した（推測で補わない）。画面は CD・コスト・射程・最大ランクと「未解決の穴埋めの数」を示す。
- 視界・True Sight・命中の確認などの細かな知識は、スキルの ID（例：LuxE）と Topic・KnowledgeNote（既存のラックスのノートのように Wiki の Template:Data を根拠にする）で結ぶ。数値の構造に押し込まない。

## 6. パッチ別の管理

- Data Dragon は版ごとのディレクトリに保存し、古い版も消さない（16.20.1・16.21.1）。manifest の current が画面の表示の版。
- 版の違い（`report.json` と画面の「前の版からの変化」）：16.20.1 → 16.21.1 で10件。Azir マナ成長 40→50、Darius Q の CD 9/8/7/6/5→9/7.75/6.5/5.25/4、Jinx 体力 630→610、Lee Sin W の CD 7→8、Locke マナ成長 70→60・W のコスト、Wukong 体力回復 3.5→5.5、Sion 体力成長 87→95、Varus Q の説明文、Viktor 移動速度 335→330、Yuumi E の射程 25000→500。
- Data Dragon の版と現行のゲームを同じとしない：画面と Resource に「未反映・誤りがありうる」と書いた。取得時に realms/na.json の現行版かどうかを記録（16.21.1 は取得時の現行）。Data Dragon の 16.x とパッチの 26.x の対応は §10.3（照合による推定として versions.json に記録）。
- Wiki のデータも revid ごとに保存する（今回は 4088335 の1つ）。

## 7. 既存の機能への影響

### 検索

- **あいまいな名前**：日本語の別名は部分一致なので、短い名前がほかの語の一部に一致する（ナー ⊂ ナーフ・サモナースペル、アーリ ⊂ アーリーゲーム、エコー ⊂ ルーデンエコー、ジン ⊂ ショウジン、ロック ⊂ ブロック、パイク ⊂ パワースパイク など）。
  - `npm run gamedata -- ambiguity <版>` が、コーパス（目録の候補の題名2327件・資料・ノート・Topic の別名・一般の語の補い）のカタカナ語から、ほかの語の一部になる名前（17件）を `src/search/ambiguousNames.json` に書く。より長いチャンピオン名（ジンクス・エイトロックス・ツイステッドフェイト）の中は、長い一致が先なので数えない。
  - 検索は、この17件だけ前後が別のカタカナに続く一致を採らない。ロール名・ビルド・ガイドなどの決まった語、ほかのチャンピオン名との連結（ミッドアーリ・ゼドビルド・ルシアンミリオ）は採る。
  - 補いの語（アーリーゲーム・パーソナル・ダイナミックなど）は手で加えたもので、コーパスの根拠ではない。英語の名前（Twitch＝配信サイト、Karma、Brand など）は単語として一致するので、語の意味のあいまいさは残る（例：「Twitch配信」はチャンピオンの Twitch として認識される）。
- **資料のない Topic**：チャンピオンの Topic の多くは資料がまだない。これを必須の条件にすると、ほかの条件に合う資料が「関連候補」に落ちる（例：「アーリ対面でベイガーは…」）。資料のない具体的な Topic は必須にせず、語彙にない語と同じく「認識できた条件に一致」にとどめる。資料のない Topic と一般語だけの検索は、一般語だけの一致で資料を出さない（以前の「アーリ」が語彙になかったときと同じ）。大分類（ロール）は対象外（もともと必須にしない）。
- **資料検索84件**（プロ解説の収録後 → 今回）：同じ69件、新しい資料（Data Dragon・Wiki 2件）が加わっただけ10件、ほかの違い5件。評価の質問の期待する資料はすべて到達する。
  - Q03「level 2 how many minions bot lane」：bot lane がロールとして認識され、条件に一致が0→1件。
  - P13「敵ジャングラーのキャンプ時間から…」：0件→2件（「ジャングラー」がロールとして認識され、語の照合が変わった）。
  - Q20・P11・「ジャングラーがガンクしてきたら…」：「ジャングラー」が必須の語からロール（大分類、必須にしない）に変わり、「ジャングラー」だけで一致していた関連候補が減った（16→6、9→6、14→6）。条件に一致の資料は同じ（P11 は上位が「認識できた条件に一致」に上がった）。既存の role-mid（「ミッド」）と同じ扱い。
  - Data Dragon の資料に patch-reading を付けると「パッチノートの読み方」に一致し、紹介文の「日本語版」が「日本語で LoL の基本」に一致したので、Topic と紹介文を直した。
- **判断材料の検索**：「ボットレーンで先にレベル2になるには…」の判断材料が3件→1件になっていたのは回帰で、§10.4 で直した（現在は変更前と同じ）。
- **知識ノートの検索**：評価29問はすべて期待どおり。「エズリアル」がチャンピオンの Topic になったので、Topic の名前が例外の記述にだけあるノートにも「逆向きの可能性」の印を付けるようにした（語の一致と同じ扱い）。

### 散策

- 新しい Topic（チャンピオン166・ロール4）には教材がないので、既存の教材の分類は変えない。
- 既存の champ-jax・champ-veigar・champ-twisted-fate に cat-champions を親として加えたことで、14の Topic で373件が「遠い」から「中間」（363件）・「近い」（10件、cat-champions）に移った。cat-champions は、配下の Topic の上位（cat-expert・aa-negation から cat-basics・cat-laning まで）の配下がすべて「中間」になるため、ほとんどが中間になる。以前の多重親の試験と同じ型の変化で、Topic の網羅を優先して採った（距離と分類の切り分けは今後の課題）。
- 対象は 238→243件（新しい資料3件・ノート2件）。

### Topic ページ・表示

- チャンピオンの Topic ページに「基本データ」を表示（`src/components/ChampionData.tsx`、ページを開いたときに読む）。クラスとポジションを分け、ステータスの表（Lv1・6・11・18）、Wiki と違う値はどちらかに決めずに両方の計算、攻撃速度の反映率、スキル、前の版からの変化を示す。
- PC・390px で確認（ページの横スクロールなし。表だけが枠の中で横にスクロールする）。
- 公開の JS は 771KB → 819KB（Topic 170件の分）。ゲームデータは JS に含めない。

## 8. 正式データへの追加

- Resource 3件：res-riot-data-dragon（公式）・res-wiki-champion-statistic・res-wiki-championdata-module。
- KnowledgeNote 2件：kn-stat-growth-formula（成長の式）・kn-as-growth-via-ratio（攻撃速度の成長は反映率を掛ける）。Evidence 4件、Relation 2件（成長の式→攻撃速度の成長→通常攻撃の間隔 kn-aa-interval-from-attack-speed）。
- 数値そのものはノートにしていない。

## 9. 次の拡張の候補

1. **スキルの数値**：Wiki の Template:Data <チャンピオン>/<スキル>（ダメージ・スケーリング・効果。既存のラックス・ゼドなどで使った）を、Data Dragon のスキル ID と結んで一括で取り込む。CommunityDragon（ゲームのファイルから抽出した非公式のデータ）は出典の性質を分けて検討。
2. **アイテム・ルーン・サモナースペル**：Data Dragon の item.json・runesReforged.json・summoner.json を同じ形（版ごと・一覧＋個別）で取り込む。
3. **クラスの観点**：クラスごとの観点（Mage＝マナ効率など）を、Topic か観点の一覧として整える。クラスから個々のチャンピオンの仕様は推定しない。
4. **目録の分類**：収集の道具（`tools/candidates`）の Topic の照合はあいまいな名前の規則を使っていないので、付け直す前に同じ規則を入れる（いま付け直すと「ナーフ」の候補にナーが付く）。
5. **散策の距離**：多重親の Topic で距離が広がる問題（cat-champions が配下の上位をすべて中間にする）を、分類と距離を分けて扱う。
6. **パッチの対応**：Data Dragon の版と公式パッチノート（26.x）の対応を、パッチノートの原典で確かめて記録する。
7. Data Dragon と Wiki の不一致（攻撃力の成長値・マナ・Kled の形態）を、公式のパッチノート・ゲーム内で確かめる。

## 10. 公開前の確認（2026-11-02）

### 10.1 Data Dragon の攻撃力の成長値

- 既知の不具合：RiotGames/developer-relations #1144「Attackdamage per level is 0 since the last patch (16.5.1)」（2026-03-13 起票、2026-11-02 の確認で open）。コメント（2026-09-30）によれば 16.19.1 でも続き、ほかの17のステータスはクライアントと一致し、攻撃力の成長値だけがクライアントの項目の形式の変更（ModifiableFloat）で取りこぼされた、との説明（報告者の説明で Riot の回答ではない）。
- 確認：Data Dragon 16.4.1 では0はセナだけ（172件中1件。Wiki もセナは0）、16.5.1 では172件すべてが0。今回の 16.20.1・16.21.1 も173件すべて0。
- 対応（最小限）：
  - 生の値は champions/<ID>.json と一覧の stats にそのまま残す。
  - 版の一覧（ddragon/<版>/index.json）の known_issues に「attackdamageperlevel を採用しない」を、出典の URL・判定（173/173件が0）とともに記録（tools/gamedata/lib.js の KNOWN_ISSUES。全件0（セナを除く）の版だけに当てはめる）。
  - 計算・表示に採用する成長値は Wiki の値（revid・形態・「ゲーム内で未確認」を表示）、Wiki にもなければ「不明」（Lv1 の基本値だけ示す）。
  - report.json の照合では、この178件中172件に known_issue の印を付け、説明のない違いは6件（マナ3件・ジンの攻撃速度の成長値・クレッドの形態の2件）。
- Wiki の値も現行の正解とはしない。項目ごとの changes（Wiki が最後に変更を記録したパッチ）を表示する（例：ジンクスは V26.21 で、パッチノート 26.21 の 3.25→3/Level と一致する値 3）。

### 10.2 パッシブ

- スキル692件は 173×4（Q・W・E・R）。パッシブは別に保存している：173件すべてに日英の名前・説明と画像のファイル名（Data Dragon の passive は name・description・image だけ。画像の座標は持たない）。
- 画面にはパッシブの名前に加えて説明（タグを除いた日本語）を表示するようにした。数値・複雑な効果は解析していない。

### 10.3 版の対応

- public/gamedata/versions.json に、Data Dragon の版・ゲームのパッチ・状態・根拠・注意を別の項目として記録（手で管理する対応表）。
  - 16.21.1 ↔ 26.21：照合による推定。根拠は日付（Data Dragon の Last-Modified 2026-10-20 22:38 GMT、Wiki V26.21（revid 4091663）のリリース 2026-10-21）と内容（16.20.1→16.21.1 の違いのうち、ジンクス 体力 630→610・ヴィクター 移動速度 335→330・リー・シン W の CD 7→8・ウーコン 体力回復 3.5→5.5・アジール マナ成長 40→50 が、公式のパッチノート 26.21 の記載と一致）。
  - 16.20.1 ↔ 26.20：日付による推定（Last-Modified 2026-10-06、Wiki V26.20（revid 4089736）のリリース 2026-10-07）。内容は照合していない。
  - Riot の公式の対応表は見つからなかった（Wiki の検索で「16.21.1」は0件）。
- 食い違い：ダリウス Q の CD は、パッチノート 26.21 が「9/8/7/6/5 ⇒ 9/8/7/6/4」、Data Dragon 16.21.1 が「9/7.75/6.5/5.25/4」。どちらがゲーム内の値かは確かめていない（versions.json の cautions に記録）。
- Wiki の revid はページの版で、ゲームのパッチではない（versions.json に game_patch を持たせない。画面にも明記）。
- パッチノートの本文は照合のために取得し、該当の数値だけを確認して一時コピーは削除した。

### 10.4 判断材料の Lv2 の質問の回帰

- 原因：判断材料の照合は、検索の条件（単位）がすべて一致した判断材料だけを出す。今回「ボットレーン」が role-bot（ロールの大分類）として認識されるようになったが、ロールの Topic と判断材料の対象ロール（scope.roles）の対応（src/data/decisions.ts の ROLE_TOPICS）が role-mid だけだった。そのため、対象ロールが「ロール共通」の判断材料は role-bot の条件を満たせず外れ、本文に「ボット」の語がある du-lv2-duo-minion-count（対象 bot・support）だけが残った。
- 外れた2件：du-trade-checklist（ロール共通、Topic に level-2）と du-lvl1-contest-or-concede（ロール共通、Topic に level-2）。どちらも Lv2 先行の Topic を持つロール共通の判断材料で、変更前は到達していた。**本来到達できるべき判断材料**で、無関係な候補ではない。
- 修正：ROLE_TOPICS に4ロール（top・jungle・bot・support）を加えた。判断材料の検索の一覧は変更前と完全に同じに戻った。テスト（src/data/decisionRoles.test.ts）を追加。

### 10.5 回帰の確認

- 資料検索84件：前回（§7）と同じ（84件とも差なし）。チャンピオンの追加前との違いは §7 の内容のまま。評価の質問の期待する資料はすべて到達。
- 知識ノートの検索29問：すべて期待どおり。
- 散策：既存の教材の分類はチャンピオンの追加前と比べて §7 の373件だけ（多重親による）。前回の測定との違いは、Data Dragon の資料から patch-reading を外した分の10件（その資料自身の分類）だけ。
- 全173チャンピオンの Topic と、既存の多重親（champ-jax・champ-veigar・champ-twisted-fate）は維持。


## 11. 公開前の最終確認（2026-11-02）

- **攻撃力の成長値**：src の中で attackdamageperlevel を使うのは表示用の行の定義（src/gamedata/champion.ts）だけで、既知の不具合の一覧（index.json の known_issues）があれば必ず除外する。画面は一覧を読んで渡す。テストで、除外・Wiki の値での計算・Wiki がないときの「不明」を確かめた。
- **ダリウス Q の CD**：Wiki（Template:Data Darius/Decimate revid 4088338）は「9 to 4」＝9/7.75/6.5/5.25/4 で、Data Dragon 16.21.1 と同じ。公式のパッチノート 26.21 は 9/8/7/6/4。出典のあいだの不一致として versions.json に記録し、どの値でも上書きしていない。
- **Wiki との照合の残り6件**（report.json の各違いに status と note）：
  - Jhin の攻撃速度の成長値（Data Dragon 0、Wiki 3）：**説明できる**。Wiki の反映率が0で、成長・増加攻撃速度が攻撃速度に反映されないため、合計の攻撃速度はどちらでも同じ。
  - Bel'Veth（partype 空・Wiki resource None）・Viego（None）・Mordekaiser（Shield）のマナ：**未解決**。マナを持たないチャンピオンで、Wiki は0、Data Dragon は 45・10000・100。項目の意味（リソースの上限か、なしか）の違いの可能性があるが確かめていない。エネルギーなどマナ以外のリソースでも Wiki と一致するチャンピオンが多いので、一律の規則にはしない。
  - Kled の射程・移動速度：**未解決**。Data Dragon の値は、体力が Kled、射程・移動速度が Kled & Skaarl と、形態が混ざって見える。
- **16.20.1 ↔ 26.20**：日付による推定のまま（内容は照合していない）。versions.json と画面の表示に「推定」と書く。
