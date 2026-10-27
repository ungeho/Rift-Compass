# Rift Compass

League of Legends（LoL）の知識を **探し・関連付け・再評価する** ためのWebアプリ（構想段階）です。

日本語・英語の無料公開資料（Wiki、公式資料、YouTube、専門家・高レートプレイヤー・OTPの解説など）にアクセスしやすくすることを目的とします。既存の高品質な教材を活用し、資料全文の転載や独自教材の大量制作は行いません。

## 現在の状態：Phase 0（調査・設計のみ）

Phase 0 では知識モデルの調査・設計・検証だけを行いました。**アプリ本体、依存パッケージ、開発サーバーはまだありません。**

| 成果物 | 内容 |
|---|---|
| [docs/knowledge-model.md](docs/knowledge-model.md) | 軽量スキーマ（Resource / Topic / KnowledgeNote / Evidence / Relation）と拡張方針 |
| [docs/source-research.md](docs/source-research.md) | 実在教材の調査結果と確認状態 |
| [docs/case-studies.md](docs/case-studies.md) | 6ケースの検証 |
| [docs/retrieval-evaluation.md](docs/retrieval-evaluation.md) | 検索方式の比較（机上評価）と評価用質問 |
| [docs/phase0-report.md](docs/phase0-report.md) | 結果、問題点、コスト評価、推奨案 |
| [data/sample-resources.json](data/sample-resources.json) | スキーマ準拠のサンプルデータ（資料38件、うち36件は実在とメタデータを確認済み） |
| [tools/](tools/) | サンプルデータの検査（`node tools/validate-sample-data.js`、不正データの検出テストは `node --test tools/validate-sample-data.test.js`）と机上の検索照合（`node tools/desk-retrieval-check.js`）。Node.js のみで動き、依存パッケージなし |

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

## 今後のローカル開発方針（アプリ実装段階で適用）

- 普段の画面確認は、原則として `npm run dev` だけで起動できるようにする。
- 複数の起動コマンドが必要な場合は、可能な限り `package.json` の scripts にまとめる。
- それでも複雑になる場合は、Windows PowerShell 向けの `startDev.ps1` などを検討する。
- 初回セットアップ手順、必要な環境変数、起動方法、アクセス先をこの README に日本語で記載する。
- 起動のたびに依存関係の再インストールやデータベースの変更などを実行しない。
- 不要な独自起動スクリプトは追加せず、標準的な npm コマンドで済むならそれを優先する。
