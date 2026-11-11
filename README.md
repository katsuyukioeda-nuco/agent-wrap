# agent-wrap

AI エージェントアプリのラッパー。Codex / OpenCode のハーネスに接続し、自分だけの Web UI と MCP ツールを載せるための土台です。

対象は、開発者またはバイブコーディングができる人。**Codex アプリと併用しながら、このリポジトリを clone して自分の画面を作り込む**使い方を想定しています。

## 体験

1. リポジトリを clone して `npm run dev`
2. `http://localhost:3000/` を開く（初回は接続先の選択画面）
3. **Codex** または **OpenCode** を選ぶ
4. 未接続なら、画面に表示されるプロンプトをエージェントに貼り付ける
5. 接続されるとプロンプトが消え、`src/screens/AppHomeScreen.tsx` のアプリ画面に切り替わる
6. 次回以降は `/` を開くと、最後に開いた Connected App へ自動でリダイレクトされる
7. 追加でアプリを作る場合は、左のアイコンレールの `+` から追加モーダルを開く（同じ Codex / OpenCode も複数追加可能）
8. あとは `src/screens` や `server/mcp/tools.ts` を直接編集して育てる

アプリ名、作業ディレクトリ、モデル、API キー、ポートなどの入力はありません。

- 作業ディレクトリは **clone したリポジトリのルート**（`process.cwd()`）
- モデルは **ハーネス側のデフォルト**
- Codex AppServer は **ユーザー（エージェント）側で起動**
- OpenCode は **起動中の認証済みサーバーを自動検出**
- 設定 UI はありません。接続方法を変えたい場合はソースを直接編集します

## 必要なもの

- Node.js 20.19 以上
- Docker / Docker Compose
- Codex CLI または OpenCode（認証済み）

## クイックスタート

```bash
cp .env.example .env
npm install

npm run db:up        # MySQL を Docker で起動
npm run db:migrate   # DDL マイグレーション

npm run dev          # http://localhost:3000
```

## 接続

### Codex

Codex AppServer の起動はユーザー（エージェント）側の責務です。未接続時の画面に、次のようなプロンプトが表示されます。

```text
agent-wrap に接続してください。

Codex AppServer の URL: ws://127.0.0.1:4500
agent-wrap の MCP サーバー: http://localhost:3000/{appId}/mcp

- Codex AppServer が起動していない場合は起動してください。
- agent-wrap の MCP サーバーをまだ追加していない場合だけ追加してください。追加済みならスキップしてください。
- MCP ツール connect_codex_app_server に次の引数を渡してください。
  { "url": "ws://127.0.0.1:4500" }
```

MCP ツール `connect_codex_app_server` が URL を登録し、wrapper が WebSocket で接続します。接続に成功すると URL が DB に保存され、画面がアプリ部分に切り替わります。

### OpenCode

`~/.local/state/opencode/service.json`（`$XDG_STATE_HOME` 配下）を読み、起動中の認証済みサーバーへ接続します。見つからない場合は画面にサーバー起動用のプロンプトが表示されます。

```bash
opencode serve --service
```

## URL

| URL | 内容 |
| --- | --- |
| `/` | 最後に開いた Connected App へリダイレクト（初回のみ接続先選択） |
| `/{appId}/` | アプリ本体（未接続なら接続プロンプト） |
| `/{appId}/mcp` | アプリ専用 MCP エンドポイント |

## MCP

各 Connected App は独立した MCP サーバーを持ちます。

```
http://localhost:3000/{appId}/mcp
```

デフォルトのツール:

- `get_app_info` — アプリ ID・種別・Codex AppServer URL
- `connect_codex_app_server` — Codex AppServer の WebSocket URL を登録して接続（Codex アプリのみ）

追加は `server/mcp/tools.ts` で行います。

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

## 画面を追加する

画面は Connected App 配下の URL に追加します。例: `/{appId}/my-screen`。

1. `src/screens/MyScreen.tsx` を作る
2. `src/App.tsx` の `/:appId` 配下にルートを追加
3. `AppWorkspacePage` や各画面から、そのルートへのリンクを追加

```tsx
import { useApp } from '@/hooks/use-app'

export default function MyScreen() {
  const { detail, refresh } = useApp()
  return <div>{detail.app.appType}</div>
}
```

`detail.app` に Connected App、`detail.codex` / `detail.opencode` にアプリ種別ごとの設定が入ります。

## API

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/api/health` | ヘルスチェック |
| GET / POST | `/api/apps` | Connected App 一覧 / 作成 |
| GET / PATCH / DELETE | `/api/apps/:id` | 詳細 / 設定更新 / 削除 |
| GET / PUT | `/api/app-state` | 最後に開いた Connected App の取得 / 保存 |
| GET | `/api/apps/:id/connection` | 接続状態 |
| POST | `/api/apps/:id/connect` | Codex AppServer URL の登録（HTTP フォールバック） |
| POST | `/api/apps/:id/test` | 接続テスト |
| GET | `/api/apps/:id/mcp-servers` | ハーネス側の MCP 状態 |
| POST | `/api/apps/:id/chat` | SSE チャット |
| POST | `/api/apps/:id/chat/interrupt` | 実行中断 |

## データベース

Prisma は使わず、`db/migrations/*.sql` の DDL を順番に適用します。

```bash
npm run db:migrate
npm run db:reset     # ボリューム削除 → 再作成 → migrate
```

### テーブル

| テーブル | 役割 |
| --- | --- |
| `connected_apps` | `id`, `appType`, `createdAt`, `updatedAt` |
| `codex_connected_apps` | `connectedAppId` で接続。binary / sandbox / approval policy / appServerUrl |
| `opencode_connected_apps` | `connectedAppId` で接続。binary / port |
| `app_state` | シングルトン。`lastOpenConnectedAppId` を保持 |

`connected_apps.app_type` は `codex` または `opencode` です。

`app_state.last_open_connected_app_id` は最後に開いた Connected App を指します。アプリを開くと `PUT /api/app-state` で更新され、`/` はこの ID の画面へリダイレクトします。アプリが削除されると `ON DELETE SET NULL` でクリアされます。

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
  appServerUrl: string | null
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}
```

MySQL の `BINARY` は予約語のため、DB カラムは `binary_path` にしています。API / schema 上は `binary` です。

## 開発時の挙動

- フロントエンドは Vite の HMR
- サーバーは `tsx watch` で自動再起動
- DB は Docker の MySQL（ホスト側ポートは `.env` の `DB_PORT`、デフォルト 3307）
- サーバーは `127.0.0.1` にバインド
- 開発時も本番時も 1 プロセス・1 ポート

## 本番ビルド

```bash
npm run build
npm run start
```

`dist/client` を Hono が配信し、SPA ルーティングは `index.html` にフォールバックします。

## 環境変数

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | バインド先 |
| `PORT` | `3000` | アプリサーバーのポート。MCP URL の port |
| `DATABASE_URL` | `mysql://app:app@127.0.0.1:3307/app` | MySQL 接続先 |
| `MCP_PUBLIC_ORIGIN` | `http://localhost:${PORT}` | `/mcp-servers` API が返す origin |
| `MYSQL_*`, `DB_PORT` | `.env.example` 参照 | Docker Compose の MySQL 設定 |

## ディレクトリ

```
src/
  pages/          接続先選択・ワークスペース
  screens/        アプリ本体の画面（ここに追加）
  components/ui/  shadcn/ui
  hooks/          useApp
  lib/            API / SSE クライアント
server/
  routes/         Hono API
  agents/         Codex / OpenCode ランタイム
  repositories/   DB アクセス
  mcp/            MCP サーバーとツール
  app.ts          Hono アプリ
  index.ts        HTTP サーバー
db/
  migrations/     DDL
shared/
  agents.ts       サーバー / UI 共通の API 型
schema.ts         アプリケーションスキーマ
```

## 制限・注意

- ローカル利用前提です。認証・認可はありません
- MCP エンドポイントはアプリサーバー上で公開されます。外部公開しないでください
- Codex の approval 要求は現状 `decline` で返します。スムーズに動かすには `approvalPolicy: "never"` を使ってください
- 画面は最小構成です。Chat や承認 UI などは `src/screens` に自分で追加してください
- Codex / OpenCode の API はバージョンで変わる可能性があります。現在は Codex CLI 0.165 / OpenCode 2.2 系で確認しています
