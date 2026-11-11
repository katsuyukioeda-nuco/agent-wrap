# AGENTS.md

このリポジトリは、AI エージェントアプリのラッパーです。Codex / OpenCode のハーネスに接続し、独自の Web UI と MCP ツールを載せるための土台になっています。

## 作業前提

- 作業ディレクトリは、clone したこのリポジトリのルート
- ファイルを直接編集できること
- `npm` コマンドを実行できること
- 実装後は `npm run typecheck` と `npm run build` を通すこと
- 既存のディレクトリ構成・命名・shadcn/ui のパターンに合わせること

## 技術スタック

- フロントエンド: Vite + React + TypeScript
- UI: shadcn/ui + Tailwind CSS
- サーバー: Hono（`@hono/node-server`）
- DB: MySQL（Docker Compose）+ mysql2
- マイグレーション: DDL ベース。Prisma は使わない
- 開発時: 1 プロセス・1 ポート。Vite middleware で HMR、`tsx watch` で API 再起動

## コマンド

```bash
npm run dev          # 開発サーバー（http://localhost:3000）
npm run typecheck    # 型チェック
npm run build        # フロントエンドビルド
npm run start        # 本番起動（NODE_ENV=production）

npm run db:up        # MySQL 起動
npm run db:migrate   # マイグレーション適用
npm run db:reset     # DB ボリューム削除 → 再作成 → migrate
```

## 主要な構成

```
src/
  pages/
    AppsPage.tsx            接続先の初回選択
    AppWorkspacePage.tsx    アプリ共通レイアウト・アイコンレール・追加モーダル
  screens/
    AppHomeScreen.tsx       接続済みアプリのトップ画面（ここを作り込む）
  components/ui/            shadcn/ui
  hooks/use-app.ts          useApp()
  lib/                      API / SSE クライアント
server/
  routes/                   Hono API
  agents/                   Codex / OpenCode ランタイム
  repositories/             DB アクセス
  mcp/                      MCP サーバーとツール
  app.ts                    Hono アプリ
  index.ts                  HTTP サーバー
db/migrations/              DDL
shared/agents.ts            サーバー / UI 共通の API 型
schema.ts                   アプリケーションスキーマ
```

## URL

- `/` — 最後に開いた Connected App へリダイレクト（アプリが 0 件なら接続先選択）
- `/{appId}/` — Connected App のトップ画面
- `/{appId}/mcp` — アプリ専用 MCP エンドポイント

## 画面を追加する

1. `src/screens/MyScreen.tsx` を作る
2. `src/App.tsx` の `/:appId` 配下にルートを追加
3. 必要なら `AppWorkspacePage` や各画面にリンクを追加

```tsx
import { useApp } from '@/hooks/use-app'

export default function MyScreen() {
  const { detail, refresh } = useApp()
  return <div>{detail.app.appType}</div>
}
```

`detail.app` は Connected App、`detail.codex` / `detail.opencode` はアプリ種別ごとの設定です。

## API を追加する

1. `server/routes/` に Hono ルートを追加
2. `server/app.ts` の `api` にマウント
3. 必要なら `shared/agents.ts` に型を追加

DB アクセスは `server/repositories/` に寄せます。

## MCP ツールを追加する

`server/mcp/tools.ts` の `registerAppTools` に `registerTool` で追加します。

```ts
server.registerTool(
  'my_tool',
  {
    title: 'My tool',
    description: '説明',
    inputSchema: { value: z.string() },
  },
  async ({ value }) => ({
    content: [{ type: 'text', text: value }],
  }),
)
```

アプリごとの MCP エンドポイントは `http://localhost:3000/{appId}/mcp` です。デフォルトでは次のツールを公開しています。

- `get_app_info`
- `connect_codex_app_server`（Codex アプリのみ）

## DB / スキーマ

- `schema.ts` に interface を定義する
- DDL は `db/migrations/*.sql` に追加する
- `id` は必須。UUIDv7 の文字列
- リレーションは外部キーを `xxxId: EntityName['id']` で表現する
- `createdAt` は必須。ISO8601 文字列
- `updatedAt` は更新を許可するエンティティのみ持つ

現在のテーブル:

- `connected_apps` — `id`, `appType`, `createdAt`, `updatedAt`
- `codex_connected_apps` — `connectedAppId`、binary / sandbox / approval policy / appServerUrl
- `opencode_connected_apps` — `connectedAppId`、binary / port
- `app_state` — シングルトン。`lastOpenConnectedAppId`

`app_state.lastOpenConnectedAppId` は最後に開いた Connected App を保持し、`/` のリダイレクトに使います。アプリ削除時は `ON DELETE SET NULL` でクリアされます。

## 接続の仕組み

### Codex

- Codex AppServer の起動はユーザー（エージェント）側の責務
- wrapper は MCP ツール `connect_codex_app_server` で WebSocket URL を受け取り、接続する
- 接続に成功すると `codex_connected_apps.app_server_url` に保存される

### OpenCode

- `~/.local/state/opencode/service.json`（`$XDG_STATE_HOME` 配下）を読み、起動中の認証済みサーバーへ接続する
- サーバーの自動起動はしない
- セッション作成時に `location: { directory: process.cwd() }` を渡す

## 注意

- ユーザーの設定画面を増やさない。接続方法や構成の変更はソースで行う
- `User` / `Todo` などのデモ用ドメインは削除済み。再追加しない
- ローカル利用前提。認証・認可はない
- MCP エンドポイントを外部公開しない
- Codex の approval 要求は現状 `decline`。スムーズに動かすには `approvalPolicy: "never"` を使う
