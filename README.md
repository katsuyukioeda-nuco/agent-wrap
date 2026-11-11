# agent-wrap

AI エージェントアプリのラッパー。Codex / OpenCode のハーネスに接続し、自分だけの Web UI と MCP ツールを載せるための土台です。

対象は、開発者またはバイブコーディングができる人。**Codex アプリと併用しながら、このリポジトリを clone して自分の画面を作り込む**使い方を想定しています。

## 体験

1. リポジトリを clone して `npm run dev`
2. `http://localhost:3000/` を開く
3. **Codex** または **OpenCode** を選ぶ
4. 認証済みのハーネスに接続され、`/{connectedAppId}/` のトップページが開く
5. あとは `src/screens` や `server/mcp/tools.ts` を直接編集して、自分のアプリに育てる

プロジェクト選択、アプリ名、作業ディレクトリ、モデル、API キー、ポートなどの入力はありません。

- 作業ディレクトリは **clone したリポジトリのルート**
- アプリ名は **ディレクトリ名から自動生成**
- モデルは **ハーネス側のデフォルト**
- OpenCode は **起動中の認証済みサーバーを自動検出**して接続（見つからなければ起動）
- Codex は **既存の `codex` 認証を使って `codex app-server` を起動**

設定 UI はあえてありません。接続方法を変えたい場合はソースを直接編集します。

## 必要なもの

- Node.js 20.19 以上
- Docker / Docker Compose
- Codex CLI（`codex login` 済み）または OpenCode（起動済み / 認証済み）

## クイックスタート

```bash
cp .env.example .env
npm install

npm run db:up        # MySQL を Docker で起動
npm run db:migrate   # DDL マイグレーション
npm run db:seed      # デモユーザー

npm run dev          # http://localhost:3000
```

## URL

| URL | 内容 |
| --- | --- |
| `/` | 接続先の選択 |
| `/{appId}/` | Connected App のトップ（MCP 設定） |
| `/{appId}/mcp` | アプリ専用 MCP エンドポイント |

## 接続の仕組み

### Codex

Connected App ごとに `codex app-server` を JSON-RPC / stdio で起動します。

- `initialize` → `thread/start` → `turn/start`
- ストリーミング通知を SSE に変換して UI に流す
- 既存の `~/.codex` の認証・スレッド履歴を利用
- 会話 ID はブラウザの `localStorage` に保存し、次回 `thread/resume`

### OpenCode

起動中の認証済みサーバーを探して接続します。

1. `$XDG_STATE_HOME/opencode/service.json`（通常 `~/.local/state/opencode/service.json`）を読む
2. `url` と `password` で `/api/info` を確認
3. 見つかればそのサーバーに接続（プロセスは終了させない）
4. 見つからなければ `opencode serve` を空きポートで起動

セッション作成時に `location: { directory: <repo root> }` を渡すため、既存サーバーに相乗りしても作業ディレクトリはこのリポジトリになります。

## 画面を追加する

画面は Connected App 配下の URL に追加します。例: `/{appId}/my-screen`。

1. `src/screens/MyScreen.tsx` を作る
2. `src/App.tsx` の `/:appId` 配下にルートを追加
3. `AppWorkspacePage` や各画面から、そのルートへのリンクを追加

```tsx
import { useApp } from '@/hooks/use-app'

export default function MyScreen() {
  const { detail, refresh } = useApp()
  return <div>{detail.app.name}</div>
}
```

`detail.app` に Connected App、`detail.codex` / `detail.opencode` にプロバイダー設定が入ります。

## MCP

各 Connected App は独立した MCP サーバーを持ちます。

```
http://localhost:3000/{appId}/mcp
```

Connected App のトップページに、この URL と **Codex / OpenCode に貼り付けるだけで設定できるプロンプト** を表示しています。

公開ツールは `server/mcp/tools.ts` で定義します。サンプルとして `get_app_info` と `list_todos` が入っています。

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

Codex から接続:

```bash
codex mcp add agent-wrap --url "http://localhost:3000/{appId}/mcp"
```

OpenCode から接続:

```json
{
  "mcp": {
    "servers": {
      "agent-wrap": {
        "type": "remote",
        "url": "http://localhost:3000/{appId}/mcp"
      }
    }
  }
}
```

## API を追加する

`server/routes/` に Hono ルートを追加し、`server/app.ts` でマウントします。

| Method | Path | 内容 |
| --- | --- | --- |
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/config` | 作業ディレクトリ・MCP origin |
| GET / POST | `/api/apps` | Connected App 一覧 / 追加 |
| GET / PATCH / DELETE | `/api/apps/:id` | 詳細 / プロバイダー設定更新 / 削除 |
| POST | `/api/apps/:id/test` | ハーネス接続テスト |
| GET | `/api/apps/:id/mcp-servers` | プロバイダー側の MCP 状態 |
| POST | `/api/apps/:id/chat` | SSE チャット |
| POST | `/api/apps/:id/chat/interrupt` | 実行中断 |
| GET / POST | `/api/users`, `/api/todos` | デモ CRUD |
| PATCH / DELETE | `/api/todos/:id` | デモ更新 / 削除 |

## データベース

Prisma は使わず、`db/migrations/*.sql` の DDL を順番に適用します。

```bash
npm run db:migrate
npm run db:seed
npm run db:reset     # ボリューム削除 → 再作成 → migrate → seed
```

新しいテーブルを追加するとき:

1. `db/migrations/0004_xxx.sql` を追加
2. `schema.ts` に interface を追加
3. 必要なら `server/repositories/` に読み書きを追加

### schema.ts の規約

- `id` は必須。UUIDv7 の文字列
- リレーションは HasOne などを書かず、外部キーを `xxxId: EntityName['id']` で表現
- `createdAt` は必須。ISO8601 文字列
- `updatedAt` は更新を許可するエンティティのみ持つ。ISO8601 文字列

### テーブル

| テーブル | 役割 |
| --- | --- |
| `connected_apps` | 名前、provider、作業ディレクトリ |
| `codex_connected_apps` | `connectedAppId` で接続。binary / sandbox / approval policy |
| `opencode_connected_apps` | `connectedAppId` で接続。binary / port |

`connected_apps.provider` は `codex` または `opencode` です。プロバイダーは作成後に変更できません。

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
| `MCP_PUBLIC_ORIGIN` | `http://localhost:${PORT}` | UI に表示する MCP origin |
| `MYSQL_*`, `DB_PORT` | `.env.example` 参照 | Docker Compose の MySQL 設定 |

## ディレクトリ

```
src/
  pages/          一覧・ワークスペース
  screens/        Connected App 配下の画面（ここに追加）
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
  seed.sql
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
