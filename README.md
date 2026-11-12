# agent-wrap

agent-wrap は、Codex や OpenCode、Claude Code などのエージェントアプリと連動し、それらを自由に拡張したい人のための Web アプリテンプレートで、各アプリとの連携部など、最低限の機能が最初から入っています。

クローンし、好きに拡張することができます。

## Quick Start

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev
```

http://localhost:3000 を開き、Codex / OpenCode / Claude Code を選びます。未接続なら、画面の手順に従ってください。

- Codex — 表示されるプロンプトをエージェントに貼り付ける
- OpenCode — 起動中のサーバーを自動検出
- Claude Code — ログインしていなければ `claude auth login` を実行

## Architecture

以下は Codex との連携例です。agent-wrap は、Codex からは MCP サーバーとして見え、Codex AppServer には WebSocket クライアントとして接続します。

```text
                    MCP
  ┌──────────┐                ┌───────────────────────────────────────┐
  │  Codex   │◄──────────────►│              agent-wrap               │
  └──────────┘  /{appId}/mcp  │                (Hono)                 │
                              └─────────┬───────────────────┬─────────┘
                       WebSocket        │                   │  HTTP / SSE
                                        │                   │
                                ┌───────▼────────┐  ┌───────▼────────┐
                                │     Codex      │  │    Browser     │
                                │   AppServer    │  │     Web UI     │
                                │ (user starts)  │  │   /{appId}/    │
                                └────────────────┘  └────────────────┘
```

- Browser は `/{appId}/` の Web UI を開き、agent-wrap の API / SSE で会話を受け取る
- Codex は `/{appId}/mcp` の MCP ツールを呼ぶ
- Codex AppServer の起動はユーザー（エージェント）側。`connect_codex_app_server` が受け取った URL に、agent-wrap が WebSocket で接続する
- OpenCode は `~/.local/state/opencode/service.json` から、起動中の認証済みサーバーを検出して接続する
- Claude Code は待ち受けサーバーを持たないため、agent-wrap が Claude Agent SDK 経由で CLI を起動し、MCP エンドポイントを自動で渡す
- 1 プロセス・1 ポート。`npm run dev` で Vite（HMR）、Hono、MySQL がまとめて動く
- 画面は `src/screens/`、API は `server/routes/`、MCP ツールは `server/mcp/tools.ts`、テーブルは `schema.ts` と `db/migrations/` に追加する
- ローカル利用前提。認証はなく、MCP エンドポイントを外部公開しない

規約と詳しい仕組みは [AGENTS.md](./AGENTS.md) にあります。
