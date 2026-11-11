# agent-wrap

**Build your own Codex / OpenCode / etc. wrapper freely.**

Codex / OpenCode のハーネスへの接続、Web UI、MCP エンドポイント、DB を最初から用意した土台です。clone して選んだら、あとは `src/screens` を好きに書き換えるだけ。設定画面はありません。

## Start

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev
```

http://localhost:3000 を開き、Codex か OpenCode を選びます。未接続なら、画面に出るプロンプトをエージェントに貼り付けてください。

## URLs

- `/{appId}/` — アプリの Web UI
- `/{appId}/mcp` — アプリ専用 MCP エンドポイント

## Edit

- 画面 — `src/screens/`
- API — `server/routes/`
- MCP ツール — `server/mcp/tools.ts`
- テーブル — `schema.ts` / `db/migrations/`

規約と接続の仕組みは [AGENTS.md](./AGENTS.md) にあります。

## Notes

- Codex AppServer の起動はユーザー（エージェント）側
- OpenCode は起動中の認証済みサーバーを自動検出
- ローカル利用前提。MCP エンドポイントを外部公開しないでください
