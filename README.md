# agent-wrap

**Build your own Codex / OpenCode / etc. wrapper freely.**

Codex / OpenCode のハーネスへの接続、Web UI、MCP エンドポイント、DB を最初から用意した土台です。clone して選んだら、あとは `src/screens` を好きに書き換えるだけ。設定画面はありません。

## Quick Start

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev
```

http://localhost:3000 を開き、Codex か OpenCode を選びます。未接続なら、画面に出るプロンプトをエージェントに貼り付けてください。

## Architecture

```text
src/                Vite + React + shadcn/ui
  pages/            接続先選択・ワークスペース
  screens/          アプリ本体の画面（ここを作り込む）
  hooks/            useApp
  lib/              API / SSE クライアント
server/             Hono
  routes/           API
  agents/           Codex / OpenCode ランタイム
  repositories/     DB アクセス
  mcp/              MCP サーバーとツール
shared/             サーバー / UI 共通の型
db/migrations/      DDL
schema.ts           アプリケーションスキーマ
```

- 1 プロセス・1 ポート。`npm run dev` で Vite（HMR）、Hono、MySQL がまとめて動きます
- アプリごとに `/{appId}/` の Web UI と `/{appId}/mcp` の MCP エンドポイントができます
- Codex は、ユーザーが起動した AppServer に WebSocket で接続します。MCP ツール `connect_codex_app_server` が URL を登録します
- OpenCode は `~/.local/state/opencode/service.json` から、起動中の認証済みサーバーを検出します
- 画面は `src/screens/`、API は `server/routes/`、MCP ツールは `server/mcp/tools.ts`、テーブルは `schema.ts` と `db/migrations/` に追加します
- ローカル利用前提です。認証はなく、MCP エンドポイントを外部公開しないでください

規約と詳しい仕組みは [AGENTS.md](./AGENTS.md) にあります。
