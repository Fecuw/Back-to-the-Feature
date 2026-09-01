# Back to the Feature

A browser-based puzzle and simulation game where players act as security engineers. Observe and analyze cyberattacks as they unfold, then modify past configurations through settings and shell commands to deploy defenses. Adapt your strategy, prevent future attacks, and aim to stop every threat completely.

## 起動

```bash
npm install
npm run dev
```

開発サーバーは通常 `http://127.0.0.1:5173/` で起動します。

### Docker・PostgreSQL・Redisを含む構成

```bash
cp .env.example .env
npm run infra:build
npm run infra:up
VITE_API_URL=http://127.0.0.1:18080 npm run dev
```

Googleログインを使う場合は `.env` の `GOOGLE_CLIENT_ID` と、フロント起動時の `VITE_GOOGLE_CLIENT_ID` に同じWebクライアントIDを設定します。本番環境では `ALLOW_DEMO_AUTH=false` とし、全シークレットをランダム値へ変更してください。

構成と信頼境界は [docs/architecture.md](docs/architecture.md) に記載しています。

開発環境の設定は次のファイルに分かれています。

| ファイル | 格納する設定 |
| --- | --- |
| `.env`（`.env.example`をコピー） | DB／Redisの資格情報、JWT・orchestrator秘密値、GoogleクライアントID、公開ポート |
| `docker-compose.yml` | サービス構成、ネットワーク、ボリューム、環境変数の開発用既定値 |
| `apps/api/src/config.ts` | API環境変数の型、検証条件、API側既定値 |
| `apps/orchestrator/src/index.ts` 冒頭の `config` | セッションイメージ、TTL、orchestrator側環境変数の検証条件 |
| `vite.config.ts` | フロントエンドのVite／Reactビルド設定 |

`.env.example` は、各設定行の直前に用途と本番運用上の注意をコメントで記載しています。

## ターミナルと設定ファイル

画面下部のターミナル／イベントログは、上端のハンドルを上下にドラッグして高さを変更できます。ハンドルへキーボードフォーカスを移した場合は、`↑` / `↓`（20px）、`PageUp` / `PageDown`（80px）、`Home` / `End`（最小／最大）でも変更できます。ダブルクリックすると初期サイズへ戻ります。

各ノードのターミナルは `/workspace` から開始します。次のコマンドで、ノードに対応する設定と説明を確認できます。

```bash
ls
cat README.md
cat rate_limit.conf
config get rate_limit.conf
config set rate_limit.conf rate_limit on
```

`README.md` は「どのファイルがどの設定を格納するか」を表で示します。`session.conf` はステージ／ノード／モードを、`<setting-id>.conf` はそのノードの防御設定を格納します。すべての設定行の直前に、その役割、元のゲーム内パス、on/off の意味をコメントで記載しています。

防御状態の変更は対策フェーズでターミナルから行います。`config set <path> <setting-name> <on|off>` のように、設定ファイル、設定名、値をそれぞれ指定するとゲームへ即時反映されます。たとえば `ssh_keys_only.conf` の設定を有効にする場合は `config set ssh_keys_only.conf ssh_keys_only on` です。不正な設定名や `on` / `off` 以外の値は拒否されます。

## 検証

```bash
npm run validate
npm run build
npm run test:smoke
```

`test:smoke` は開発サーバーが `http://127.0.0.1:4173/` で起動している状態で実行します。

## ステージ追加

`src/stages/<stage-id>/` に `stage.json` と `scenario.json` を追加すると自動で一覧へ登録されます。`availability_checks` は必須で、すべての攻撃対象に同じサービスを通る正常系チェックが必要です。`npm run validate` が参照整合性を検査します。

## MVP の境界

API未設定時はシナリオエンジン、ログ、ターミナルがブラウザ内のローカルシミュレーションへ自動フォールバックします。`VITE_API_URL` を設定すると、所有権検証済みWebSocket PTYとセッション専用Dockerコンテナを利用します。プラットフォームのPostgreSQL/Redisへプレイヤーシェルを接続することはありません。
