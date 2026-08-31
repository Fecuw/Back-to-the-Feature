# Back to the Feature

A browser-based puzzle and simulation game where players act as security engineers. Observe and analyze cyberattacks as they unfold, then modify past configurations through settings and shell commands to deploy defenses. Adapt your strategy, prevent future attacks, and aim to stop every threat completely.


## 起動

```bash
npm install
npm run dev
```

開発サーバーは通常 `http://127.0.0.1:5173/` で起動します。

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

現時点ではシナリオエンジン、ログ、ターミナルをブラウザ内の隔離シミュレーションとして実装しています。実Dockerコンテナ、WebSocket PTY、Google OIDC、PostgreSQL/Redisを接続する場合は、要件定義書のセキュリティ境界に従う専用バックエンドが必要です。
