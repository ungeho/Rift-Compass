# Rift Compass

League of Legends（LoL）の知識を **探し・関連付け・再評価する** ためのWebアプリです。

日本語・英語の無料公開資料（Wiki、公式資料、YouTube、専門家・高レートプレイヤー・OTPの解説など）にアクセスしやすくすることを目的とします。既存の高品質な教材を活用し、資料全文の転載や独自教材の大量制作は行いません。

## 現在の状態：Phase 3A・3B 完了（外部探索の導線と、静的サイトとしての公開準備）

- 知りたいことを日本語・英語で入力して、無料公開教材を検索できます（Phase 1）。
- Topic（複数の分類に属せる）から資料をたどれます。
- 資料詳細では、原典へのリンク、動画の区間（開始時間付き）、翻訳元、根拠の状態を確認できます。
- 検索結果は「条件に一致」「認識できた条件に一致」「関連候補」に分けて表示します。新しい18問による評価と、既存資料への到達の改善を行いました（Phase 2A・2B、[docs/phase2-retrieval-audit.md](docs/phase2-retrieval-audit.md)）。
- 収録資料で見つからないときのために、Google・YouTube での検索リンクを表示します（Phase 3A）。
- 本番ビルド（`dist/`）が静的ホスティングでそのまま動くことを確認しました（Phase 3B）。
- バックエンド・データベース・外部APIは使いません。データは `data/sample-resources.json`（正本）を静的に読み込みます。

## セットアップと起動

必要なもの：Node.js 22.12 以上（テストに使う Vitest の要件。動作確認は Node.js 24.19.0 / npm 11.17.0）。環境変数は不要です。

```bash
# 初回だけ
npm install

# 普段の起動（これだけ）
npm run dev
```

ブラウザで **http://localhost:5173/** を開きます。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動（http://localhost:5173/）。依存関係の再インストールなどは行いません |
| `npm run build` | 型チェックのあと、`dist/` に静的ファイルを出力 |
| `npm run preview` | `dist/` を配信して確認（http://localhost:4173/）。先に `npm run build` が必要 |
| `npm run test` | Vitest のテストと、Phase 0 のデータ検査（`npm run validate:data`）を実行 |
| `npm run typecheck` | TypeScript の型チェックのみ |
| `npm run validate:data` | `tools/validate-sample-data.js` とその不正データ検出テスト |
| `npm run eval:desk` | Phase 0 の机上検索照合（参考値）|

`dist/` はハッシュ形式のURL（`#/r/<資料ID>` など）と相対パスを使うため、静的ホスティングのどのパスに置いてもリロードやURL共有で同じ画面を再表示できます。

## 公開（GitHub Pages）

公開先：**https://ungeho.github.io/Rift-Compass/**

- デプロイは手動です。GitHub の Actions 画面で「Deploy to GitHub Pages」（`.github/workflows/deploy-pages.yml`）を選び、「Run workflow」で `main` を指定して実行します。
- ワークフローは `npm ci` → `npm run test` → `npm run build` を行い、`dist/` を GitHub Pages に配置します。テストかビルドが失敗すると公開しません。
- `main` への push だけでは公開内容は更新されません。公開中の内容は、最後にワークフローを実行した時点の `main` です。
- リポジトリの Settings → Pages の Source は「GitHub Actions」にします。生成した `dist/` を Git に commit したり、公開用のブランチを作ったりはしません。

## 画面

| URL | 画面 |
|---|---|
| `#/` | 検索・資料一覧（`?q=検索語&lang=&type=&topic=&creator=&era=&level=` で条件を保持）|
| `#/r/<資料ID>` | 資料詳細 |
| `#/topics` | Topic 一覧 |
| `#/topic/<TopicID>` | Topic 詳細（上位・下位の Topic と資料）|

通常の一覧・検索に出すのは、**無料アクセスを確認した確認レベルL2以上の資料** だけです。L0 などの未確認の候補はデータに残していますが、表示しません。

確認レベル（L2・L3 など）は **資料をどこまで確認したか** を示すもので、ゲーム内での検証を意味しません。Phase 0 時点で、現行パッチのゲーム内で検証した知識ノートはありません。

## 検索の仕組み（概要）

[docs/retrieval-evaluation.md](docs/retrieval-evaluation.md) の方式Bを基本にしています。

- 検索対象は、資料のタイトル・発信者名・日本語の紹介文、Topic の日英の表示名と別名です。
- 入力から、Topic の別名（例：「Lv2」「レベル2」「level 2 spike」）と発信者名（例：「VeigarV2」「Dopa」）を見つけ、日英の対応をとります。
- 残った語は、資料中に実在する語だけを使います。使わなかった語は画面に表示します。
- 結果は「条件に一致」「認識できた条件に一致（資料中にない語は条件に含めていない）」「一部の条件に関連する候補」に分けて表示します。関連候補は別の欄に、一致した条件ごとにまとめます。大分類（例：lane）や多くの資料に現れる語は、具体的な主題より軽く扱います。
- 主題が資料中にない検索は0件として案内します。
- 知識ノート本文や動画区間は検索に混ぜず、詳細画面での案内に使います。

## 外部での探索

検索語があるときは、検索結果の下に「Rift Compass の外で探す」として、Google 検索と YouTube 検索へのリンクを表示します。0件のとき、関連候補だけのとき、一致する資料があるときのいずれでも表示します。

- 検索語に「League of Legends」を添えたURLを作るだけです（検索語に LoL を示す語があれば添えません）。Rift Compass から外部の検索 API を呼んだり、結果を取得したりはしません。
- **リンクを開いたときに、入力した検索語が Google または YouTube に送られます**。開かなければ送られません。Rift Compass は検索語を記録しません。
- 外部で見つかる情報は、Rift Compass では確認していません。答えが見つかるとは限らず、内容の正しさや現在のパッチで有効かは、各資料で確かめる必要があります。

## ディレクトリ

| パス | 内容 |
|---|---|
| `src/` | Webアプリ（React + TypeScript + Vite）|
| `src/data/` | 正本 JSON の読み込み、索引の派生生成、表示ラベル |
| `src/search/` | 検索・絞り込みと、評価用質問 |
| `src/components/` | 画面 |
| `data/sample-resources.json` | データの正本（資料38件、うち公開対象36件）|
| `docs/` | Phase 0 の調査・設計文書 |
| `tools/` | Phase 0 のデータ検査と机上照合（Node.js のみ、CommonJS）|

## Phase 0 の成果物

| 成果物 | 内容 |
|---|---|
| [docs/knowledge-model.md](docs/knowledge-model.md) | 軽量スキーマ（Resource / Topic / KnowledgeNote / Evidence / Relation）と拡張方針 |
| [docs/source-research.md](docs/source-research.md) | 実在教材の調査結果と確認状態 |
| [docs/case-studies.md](docs/case-studies.md) | 6ケースの検証 |
| [docs/retrieval-evaluation.md](docs/retrieval-evaluation.md) | 検索方式の比較と評価用質問（Phase 1 の実測を含む）|
| [docs/phase0-report.md](docs/phase0-report.md) | 結果、問題点、コスト評価、推奨案 |

## 基本方針

- **Retrieval-first**：質問や問題から既存教材に到達できることを優先する。
- **Structure-on-demand**：全資料を事前に知識グラフ化しない。必要になった資料だけ構造化する。
- **Evidence-first**：根拠と推論を区別し、確認できる資料に結び付ける。
- **Progressive Validation**：未確認事項や矛盾を記録し、必要な追加検証を提案する。
- **Patch-aware**：パッチへの依存を管理するが、毎パッチすべてを再検証しない。
- **Historical Knowledge Preservation**：古い知識を削除せず、当時の仕様と現在の適用可能性を区別する。

「Mechanic（仕様）→ Principle（原理・相互作用）→ Decision（判断）」という因果モデルは保持します。ただし、全資料の必須構造にはしません。

## 資料の扱い

- 登録するのは **メタデータ・日本語の短い紹介文・該当箇所（見出し・動画時間）** に限ります。
- 有料コンテンツの本文、動画のダウンロード、無許可の大量文字起こし、全文転載は行いません。
- 本文を確認していない資料は、タイトルから内容を推測して「検証済み」にしません（確認レベル L0〜L4 で区別します）。

## ローカル開発の方針

- 普段の画面確認は `npm run dev` だけで起動する。
- 複数の起動コマンドが必要になった場合は、`package.json` の scripts にまとめる。
- 起動のたびに依存関係の再インストールやデータの変更を行わない。
- 標準的な npm コマンドで済む限り、独自の起動スクリプトは追加しない。
