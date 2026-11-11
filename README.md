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

agent-wrap は、Codex からは MCP サーバーとして見え、Codex AppServer には WebSocket クライアントとして接続します。

```text
  ┌─────────┐            MCP             ┌──────────────────┐
  │  Codex  │◄──────────────────────────►│    agent-wrap    │
  │         │        /{appId}/mcp        │      (Hono)      │
  └─────────┘                              └────┬────────┬────┘
                                                │        │
                                WebSocket       │        │  HTTP / SSE
                                                │        │
                                       ┌────────▼──┐  ┌──▼─────────┐
                                       │   Codex   │  │  Browser   │
                                       │ AppServer │  │ /{appId}/  │
                                       │  (user)   │  └────────────┘
                                       └───────────┘
```

- Browser は `/{appId}/` の Web UI を開き、agent-wrap の API / SSE で会話を受け取る
- Codex は `/{appId}/mcp` の MCP ツールを呼ぶ
- Codex AppServer の起動はユーザー（エージェント）側。`connect_codex_app_server` が受け取った URL に、agent-wrap が WebSocket で接続する
- OpenCode は `~/.local/state/opencode/service.json` から、起動中の認証済みサーバーを検出して接続する
- 1 プロセス・1 ポート。`npm run dev` で Vite（HMR）、Hono、MySQL がまとめて動く
- 画面は `src/screens/`、API は `server/routes/`、MCP ツールは `server/mcp/tools.ts`、テーブルは `schema.ts` と `db/migrations/` に追加する
- ローカル利用前提。認証はなく、MCP エンドポイントを外部公開しない

規約と詳しい仕組みは [AGENTS.md](./AGENTS.md) にあります。
