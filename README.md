# agent-wrap

AI エージェントアプリのラッパー。Codex / OpenCode のハーネスに接続し、独自の Web UI と MCP ツールを載せるための土台です。

このリポジトリを clone してローカルで起動すると、次のことができます。

- Codex または OpenCode を選んで **Connected App** を複数作成する
- 各アプリ専用の URL（`/{connected-app-id}/`）で Web UI を開く
- 各アプリ専用の MCP エンドポイント（`/{connected-app-id}/mcp`）をエージェントに接続する
- `src/screens` に画面を追加し、`server/mcp/tools.ts` にツールを追加して自分用のアプリに育てる

デモとして Chat / Todo CRUD / MCP 状態表示 / 接続設定画面が入っています。

## 構成

```
Browser
  │
  ├─ /                      Connected App 一覧・作成
  ├─ /{appId}/              Connected App のトップ（概要）
  ├─ /{appId}/chat          Chat デモ
  ├─ /{appId}/todos         DB CRUD デモ
  ├─ /{appId}/mcp-servers   MCP 状態
  ├─ /{appId}/settings      接続設定
  └─ /{appId}/mcp           MCP Streamable HTTP エンドポイント
        │
        ▼
Hono server (port 3000)
  ├─ /api/*                 REST API（Hono + mysql2）
  ├─ MCP handler            アプリごとの MCP サーバー
  ├─ Vite middleware (dev)  HMR / React
  └─ static (prod)          dist/client
        │
        ├─ MySQL (Docker Compose)
        ├─ codex app-server (JSON-RPC / stdio)
        └─ opencode serve (HTTP API + SSE)
```

開発時もサーバーは 1 プロセス・1 ポートです。Hono が `/api` と MCP を処理し、それ以外を Vite middleware が HMR 付きで配信します。

## 必要要件

- Node.js 20.19 以上
- Docker / Docker Compose
- 使用するハーネス
  - Codex: `codex` CLI（`codex login` 済みであること）
  - OpenCode: `opencode` CLI

## クイックスタート

```bash
cp .env.example .env
npm install

npm run db:up        # MySQL を Docker で起動
npm run db:migrate   # DDL マイグレーション
npm run db:seed      # デモユーザー投入

npm run dev          # http://localhost:3000
```

`http://localhost:3000/` を開き、Codex / OpenCode を選んで Connected App を作成してください。

### 開発時の挙動

- フロントエンドの変更は Vite の HMR で即時反映
- サーバー側（`server/`）の変更は `tsx watch` で自動再起動
- DB は Docker の MySQL（ホスト側ポートは `.env` の `DB_PORT`、デフォルト 3307）
- ポート 3307 にしているのは、ローカルの別 MySQL と衝突しにくくするためです。変更する場合は `.env` の `DATABASE_URL` と `DB_PORT` を揃えてください。

### 本番ビルド

```bash
npm run build
npm run start        # NODE_ENV=production
```

`dist/client` を Hono が配信します。SPA のルーティングはサーバー側で `index.html` にフォールバックします。

## Connected App

`connected_apps` に共通情報を保存し、プロバイダー固有の設定を外部結合用の別テーブルに保存します。

| テーブル | 役割 |
| --- | --- |
| `connected_apps` | 名前、provider、作業ディレクトリ、モデル |
| `codex_connected_apps` | `connectedAppId` で接続。binary / sandbox / approval policy |
| `opencode_connected_apps` | `connectedAppId` で接続。binary / port |

`connected_apps.provider` は `codex` または `opencode` です。プロバイダーは作成後に変更できません。

### 接続の仕組み

**Codex**

- Connected App ごとに `codex app-server` を stdio で起動します
- `initialize` → `thread/start` → `turn/start` を JSON-RPC で実行
- ストリーミング通知（`item/agentMessage/delta`、`turn/completed` など）を SSE に変換して UI に流します
- スレッド ID はブラウザの `localStorage` に保存し、次回は `thread/resume` で継続します

**OpenCode**

- Connected App ごとに `opencode serve` を `127.0.0.1` の空きポートで自動起動します
- 起動時にランダムな `OPENCODE_SERVER_PASSWORD` を設定し、Basic 認証で接続します
- セッション作成は `POST /api/session`、プロンプトは `POST /api/session/:id/prompt`
- `/api/event` の SSE を購読し、`session.text.delta` などを UI に流します

どちらもサーバー再起動時にプロセスが再生成されます。Chat の会話 ID はブラウザに残るため、可能な限り継続されます。

## MCP

各 Connected App は独立した MCP サーバーを持ちます。

```
http://localhost:3000/{connected-app-id}/mcp
```

Streamable HTTP の MCP サーバーです。アプリごとにセッションを分けて保持します。

### 公開ツール

- `get_app_info` — アプリ名・provider・作業ディレクトリ
- `list_todos` — デモ用 Todo 一覧

追加は `server/mcp/tools.ts` で行います。`detail.app.id` を使えばアプリ単位にデータをスコープできます。

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

### Codex から接続する

```bash
codex mcp add agent-wrap --url "http://localhost:3000/{connected-app-id}/mcp"
```

### OpenCode から接続する

`opencode.json` の `mcp.servers` に追加します。

```json
{
  "mcp": {
    "servers": {
      "agent-wrap": {
        "type": "remote",
        "url": "http://localhost:3000/{connected-app-id}/mcp"
      }
    }
  }
}
```

MCP エンドポイントはローカル利用前提で認証を付けていません。外部公開しないでください。

## 画面の追加

画面は Connected App の配下にルーティングされます。例: `/{appId}/my-screen`。

1. `src/screens/MyScreen.tsx` を作る
2. `src/App.tsx` の `/:appId` 配下に `<Route path="my-screen" element={<MyScreen />} />` を追加
3. `src/pages/AppWorkspacePage.tsx` の `navItems` にリンクを追加

画面内では `useApp()` で Connected App の情報を取得できます。

```tsx
import { useApp } from '@/hooks/use-app'

export default function MyScreen() {
  const { detail, refresh } = useApp()
  return <div>{detail.app.name}</div>
}
```

`detail.codex` / `detail.opencode` にプロバイダー固有の設定が入ります。

## API

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/config` | 既定の作業ディレクトリ、MCP origin |
| GET / POST | `/api/apps` | Connected App 一覧 / 作成 |
| GET / PATCH / DELETE | `/api/apps/:id` | 詳細 / 更新 / 削除 |
| POST | `/api/apps/:id/test` | ハーネス接続テスト |
| GET | `/api/apps/:id/mcp-servers` | プロバイダー側の MCP 状態 |
| POST | `/api/apps/:id/chat` | SSE でチャット |
| POST | `/api/apps/:id/chat/interrupt` | 実行中断 |
| GET / POST | `/api/users`, `/api/todos` | デモ CRUD |
| PATCH / DELETE | `/api/todos/:id` | デモ更新 / 削除 |

## データベース

Prisma などは使わず、`db/migrations/*.sql` の DDL を順番に適用します。適用済みファイルは `_migrations` テーブルで管理します。

```bash
npm run db:migrate
npm run db:seed
npm run db:reset     # ボリューム削除 → 再作成 → migrate → seed
```

新しいテーブルを追加するときは:

1. `db/migrations/0003_xxx.sql` を追加
2. `schema.ts` に interface を追加
3. 必要なら `server/repositories/` に読み書きを追加

### schema.ts の規約

- `id` は必須。UUIDv7 の文字列
- リレーションは HasOne などを書かず、外部キーを `xxxId: EntityName['id']` で表現
- `createdAt` は必須。ISO8601 文字列
- `updatedAt` は更新を許可するエンティティのみ持つ。ISO8601 文字列

```ts
export interface CodexConnectedApp {
  id: string // UUIDv7
  connectedAppId: ConnectedApp['id']
  binary: string
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approvalPolicy: 'never' | 'on-request' | 'untrusted'
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}
```

MySQL の `BINARY` は予約語のため、DB カラムは `binary_path` にしています。API / schema 上は `binary` です。

## ディレクトリ

```
src/
  pages/          一覧・作成・ワークスペース
  screens/        Connected App 配下の画面（ここに追加していく）
  components/ui/  shadcn/ui
  hooks/          useApp など
  lib/            API / SSE クライアント
server/
  routes/         Hono API
  agents/         Codex / OpenCode ランタイム
  repositories/   DB アクセス
  mcp/            MCP サーバーとツール
  app.ts          Hono アプリ
  index.ts        HTTP サーバー起動
db/
  migrations/     DDL
  seed.sql
shared/
  agents.ts       サーバー / UI 共通の API 型
schema.ts         アプリケーションスキーマ
```

## 環境変数

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | アプリサーバーのバインド先。LAN 公開する場合のみ変更 |
| `PORT` | `3000` | アプリサーバーのポート。MCP URL の port にも使う |
| `DATABASE_URL` | `mysql://app:app@127.0.0.1:3307/app` | MySQL 接続先 |
| `MCP_PUBLIC_ORIGIN` | `http://localhost:${PORT}` | UI に表示する MCP の origin を上書き |
| `MYSQL_*`, `DB_PORT` | `.env.example` 参照 | Docker Compose の MySQL 設定 |

## 制限・注意

- ローカル利用前提です。認証・認可はありません
- MCP エンドポイントは `127.0.0.1` で待ち受けるアプリサーバー上で公開されます
- Codex の approval 要求は現状 `decline` で返します。スムーズに動かすには `approvalPolicy: "never"` を使ってください
- Chat の履歴表示はデモです。会話の永続化や承認 UI は `src/screens/ChatScreen.tsx` を拡張して実装してください
- Codex / OpenCode の API はバージョンで変わる可能性があります。現在の実装は Codex CLI 0.165 / OpenCode 2.2 系で確認しています
