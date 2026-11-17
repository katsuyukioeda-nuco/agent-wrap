# AGENTS.md

このリポジトリは、AI エージェントアプリのラッパーです。Codex / OpenCode / Claude Code のハーネスに接続し、独自の Web UI と MCP ツールを載せるための土台になっています。

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
    AppHomeScreen.tsx       接続済みアプリのトップ画面（プロジェクト→セッションのツリー）
    SessionScreen.tsx       セッション画面（ワークスペースのファイル / Git差分）
  components/ui/            shadcn/ui
  hooks/use-app.ts          useApp()
  lib/                      API / SSE クライアント
server/
  routes/                   Hono API
  agents/                   Codex / OpenCode / Claude Code ランタイム
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
- `/{appId}/` — Connected App のトップ画面（プロジェクト→セッションのツリー）
- `/{appId}/sessions/{sessionId}` — セッション画面
- `/{appId}/?project=<projectId>` — ツリーで開くプロジェクトを指定
- `/{appId}/mcp` — アプリ専用 MCP エンドポイント

## プロジェクトとセッション

トップ画面はプロジェクトを親、セッションを子とするツリーで表示します。
プロジェクトを開いたときに `GET /api/apps/:id/projects/:projectId/sessions` を読み、
一度読み込んだセッションは折りたたんでも保持します。

データの取得元:

- OpenCode: `/api/project` と `/api/session` を使う。セッションは `projectID` で絞り込む
- Codex: AppServer の `thread/list` を使う。`projectId` が無い場合は `cwd` でまとめる
- Claude Code: プロジェクト一覧は `supported: false`

型は `shared/agents.ts` の `ProjectSummary` / `SessionSummary`、
ランタイム実装は `AgentRuntime.projects()` / `sessions(project)` です。
プロジェクトのラベルは `path` / `name` / `vcs` / `lastActiveAt` / `sessionCount` を使います。

### 最近の会話

`GET /api/apps/:id/recent-sessions?limit=5` が全プロジェクト横断の最新セッションを返します。
ランタイムは `AgentRuntime.recentSessions(limit)` です。

- OpenCode: `/api/session` を `updatedAt` 降順に並べる
- Codex: `thread/list` を `updatedAt` 降順に並べる
- Claude Code: `supported: false`

トップ画面では「会話を開く」と Projects の間に表示し、行からセッション画面へ遷移します。

## セッション画面

`/{appId}/sessions/{sessionId}` にセッション画面のルートがあります。
`SessionScreen.tsx` はワークスペースのファイル閲覧と Git 差分を表示します。

- ファイルタブ: ディレクトリを辿り、テキストファイルをプレビューする
- ファイルプレビューは CodeMirror（読み取り専用、行番号・シンタックスハイライト付き）
- Git差分タブ: 変更ファイルを一覧し、ファイルごとの差分を表示する
- 未追跡ファイルは差分の代わりにファイルの内容を表示する
- 変更ファイルはリスト表示とフォルダツリー表示をアイコンで切り替えられる
- 差分ビューアは「分割（split）」と「統合（unified）」をアイコンで切り替えられる
- 行番号・ハンクヘッダー付きで表示し、コンテキスト行は両方に出す
- ファイルの内容または差分を選択すると、選択範囲の近くに「コメント」ポップアップを表示する
- 「コメント」からダイアログを開き、コメントを保存する（会話へは送信しない）
- 右側のアイコンレールからセッションのコメント一覧を開ける
- 左にファイルツリーと Git 差分を縦積み、右にタブ式のビューアを置く
- ファイルの内容と差分は右側のタブで切り替える
- ファイルツリーの項目を右クリックするとコンテキストメニューを表示する
  - Finder（macOS）/ Explorer（Windows）/ ファイルマネージャー（Linux）で表示
  - ワークスペース内の絶対パスをコピー
- 「ファイル」見出しのフォルダアイコンでワークスペースのルートを開ける
- ワークスペースが複数ある場合は上部のボタンで切り替える

### ワークスペース API

- `GET /api/apps/:id/sessions/:sessionId/workspace` — ルート一覧
- `GET /api/apps/:id/sessions/:sessionId/workspace/files?root=0&path=` — ディレクトリ一覧
- `GET /api/apps/:id/sessions/:sessionId/workspace/file?root=0&path=` — ファイル内容
- `GET /api/apps/:id/sessions/:sessionId/workspace/diff?root=0` — Git 差分
- `POST /api/apps/:id/sessions/:sessionId/workspace/reveal` — OS のファイルマネージャーで表示
  - body: `{ "root": 0, "path": "src/App.tsx" }`

`reveal` は macOS なら `open -R`（ディレクトリは `open`）、Windows なら `explorer`
（ファイルは `/select,`）、それ以外は `xdg-open` を使います。
パスは他のワークスペース API と同じくルート外に出られないよう検証します。

ルートはセッションの作業ディレクトリとプロジェクトの canonical パスから作り、
Git リポジトリなら `git rev-parse --show-toplevel` の結果を使います。
パスはルート外に出られないよう `realpath` で検証します。

Git 差分は `git status --porcelain -z -uall` で変更ファイルを列挙し、
未追跡ディレクトリは中のファイル単位で表示します。
ファイルごとに `git diff HEAD` を取得します。未追跡ファイルはフラグ付きで返します。
`git submodule status --recursive` で見つけたサブモジュールにも同じ処理を行い、
差分タブではファイル単位で表示します。大きいファイルは先頭 512KB、
1ファイルあたりの差分は 200KB までに制限します。

`GET /api/apps/:id/sessions/:sessionId` は `session` / `project` / `embed` を返します。

- OpenCode: `embed.url` に OpenCode Web UI の URL が入る
- Codex: `embed.url` は `null`。AppServer に Web UI が無い
- Claude Code: セッション画面自体が非対応（400）

### 選択範囲へのコメント

ファイル内容または Git 差分で選択した範囲にコメントを付け、
`POST /api/apps/:id/sessions/:sessionId/comments` で `session_comments` に保存します。
コメントは会話へ送信せず、選択範囲をまとめた添付ファイルも作成します。

```json
{
  "kind": "file",
  "path": "src/App.tsx",
  "startLine": 3,
  "endLine": 5,
  "selection": "...",
  "comment": "..."
}
```

- `GET /api/apps/:id/sessions/:sessionId/comments` — セッションのコメント一覧（対応済み含む）
- セッション画面では CodeMirror の選択と差分 DOM の選択を検出し、
  選択範囲の近くに「コメント」ポップアップを表示する
- ポップアップからダイアログを開き、コメントを保存する
- 保存後は右レールの「コメント」から一覧を確認できる
- コメント欄のプロンプトをコピーして会話に貼ると、ツール名を明示して
  未対応コメントの確認を依頼できる
- エージェントは MCP の `list_comments` で未対応コメントを ID 付きで取得し、
  対応後に `done_comment` で個別に完了にする
- Claude Code: コメント保存は非対応（400）

### OpenCode の埋め込み

`OpenCodeRuntime.sessionEmbed()` が `POST /api/pair` でコードを作り、
`GET /auth/connect/:code`（`Accept: application/json`）でセッショントークンに交換します。
iframe には次の形式で渡します。

```
{baseUrl}/server/{base64url(baseUrl)}/session/{sessionId}?auth_token={base64url(`${serverKey}:${token}`)}
```

トークンは `<expiresAt>.<secret>` 形式なので、期限までメモリにキャッシュします。
Cookie は使わないため、クロスオリジンの iframe でも認証できます。

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
- `reflect`（Codex / OpenCode）
- `list_comments`（Codex / OpenCode）
- `done_comment`（Codex / OpenCode）
- `run_process`（Codex / OpenCode）
- `list_processes`（Codex / OpenCode）
- `get_process`（Codex / OpenCode）
- `stop_process`（Codex / OpenCode）

`reflect` は呼び出し元のセッション情報から自分のセッション画面 URL を返します。

- Codex: `_meta["x-codex-turn-metadata"]` の `thread_id` / `turn_id` / `model` / `codex_version`
- OpenCode: `_meta["ai.opencode/sessionID"]`

```
{mcpOrigin()}/{appId}/sessions/{sessionId}
```

`mcpOrigin()` は `MCP_PUBLIC_ORIGIN`、未設定なら `http://localhost:${PORT}` です。
セッション情報が無いクライアントには `supported: false` を返します。

`list_comments` は呼び出し元セッションの未対応コメントを ID 付きで返します。
取得しても完了にはならず、`done_comment` に ID を渡すと `done_at` が設定されます。
ユーザーが「コメントを確認して」と伝えたら、`list_comments` →
必要な対応 → `done_comment` の順で使います。

### プロセス管理

MCP の `run_process` で起動したプロセスは自動的に `process_definitions` に保存され、
セッション画面の「プロセス」パネルに表示されます。

- コマンドはシェル経由で実行する（macOS / Linux は `$SHELL -c`、Windows は `cmd /c`）
- プロセス定義の登録と実行は分けて扱う
  - 登録だけでは実行しない（status は `registered`）
  - 実行すると同じ行の `pid` / `status` / `startedAt` を更新する
- `detached` で起動するため、wrapper を再起動してもプロセスは残る
- stdout と stderr は一時ディレクトリの `output.log` にまとめて書き出す
- 停止はプロセスグループへ SIGTERM を送り、5 秒後に残っていれば SIGKILL
- wrapper の起動時に running の行を PID で照合し、消えていれば exited に更新する
- 一覧はセッション単位。ログは `get_process` または API の `tail` 行数で取得する

MCP ツール:

- `run_process` — コマンド・cwd（省略時はワークスペースのルート）・名前で定義を登録し、そのまま実行する
- `list_processes` — このセッションのプロセス一覧
- `get_process` — 状態とログの末尾
- `stop_process` — SIGTERM（または SIGKILL）で停止

API:

- `GET /api/apps/:id/sessions/:sessionId/processes`
- `POST /api/apps/:id/sessions/:sessionId/processes` — プロセス定義を登録する（実行はしない）
  - body: `{ "command": "npm run build", "cwd": "...", "name": "..." }`
- `POST /api/apps/:id/processes/:processId/run` — 登録済み定義を実行する
- `GET /api/apps/:id/processes/:processId/logs?tail=200`
- `POST /api/apps/:id/processes/:processId/stop`

UI は右レールの「プロセス」。実行中 → 停止中の順で表示します。
実行中は起動日時の昇順、停止中は起動日時の降順です。
行にはコマンドを出し、実行中は赤い停止ボタン、未実行・終了済みは実行ボタンを表示します。
実行は行を増やさず、その行の PID と状態を更新します。
5 秒ごとに更新し、行ごとにログの表示と停止・実行ができます。

### コメント確認プロンプト

コメント欄には、MCP のツール名を明示したプロンプトを表示し、
「プロンプトをコピー」でクリップボードに入れます。
会話に貼ると `reflect` → `list_comments` → 対応 → `done_comment` の順で動きます。

MCP の Prompt（`registerPrompt`）は使いません。Codex が MCP プロンプトに
対応していないため、ハーネスによらずツール名を直接書いたプロンプトを配ります。

トップ画面は上から順に、次の3つで構成します。

1. 「会話を開く」領域（主体験）。プロンプトをコピーして会話に貼る
2. 「最近の会話」領域。全プロジェクト横断の最新セッション
3. 「プロジェクトごとの会話」ツリー（サブ）。プロンプトで開けない場合の選択UI

「プロンプトをコピー」は、その Connected App の MCP URL と `reflect` の呼び出しを
案内するプロンプトをクリップボードに入れます。会話に貼り付けると、エージェントが
`reflect` を呼び、自分の `session.url` を表示します。コピーされるプロンプトは
常に表示します。UI ではセッションを「会話」と表示し、API や内部名は session のままにします。

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
- `claude_connected_apps` — `connectedAppId`、binary / permission mode / model
- `app_state` — シングルトン。`lastOpenConnectedAppId`
- `session_comments` — `connectedAppId`, `sessionId`, path / selection / comment / attachmentPath / `doneAt`
- `process_definitions` — `connectedAppId`, `sessionId`, name / cwd / command / pid / status / exitCode / signal / logPath

`app_state.lastOpenConnectedAppId` は最後に開いた Connected App を保持し、`/` のリダイレクトに使います。アプリ削除時は `ON DELETE SET NULL` でクリアされます。

## 接続の仕組み

### Codex

- Codex AppServer の起動はユーザー（エージェント）側の責務
- wrapper は MCP ツール `connect_codex_app_server` で WebSocket URL を受け取り、接続する
- 接続に成功すると `codex_connected_apps.app_server_url` に保存される
- `GET /api/apps/:id/connection` は URL の有無だけでなく、TCP で到達できるかも確認する
- AppServer に到達できない場合は、トップ画面・セッション画面とも
  「読み込めませんでした」ではなく接続手順（`ConnectScreen`）を表示する

### OpenCode

- `~/.local/state/opencode/service.json`（`$XDG_STATE_HOME` 配下）を読み、起動中の認証済みサーバーへ接続する
- サーバーの自動起動はしない
- セッション作成時に `location: { directory: process.cwd() }` を渡す

### Claude Code

- Codex AppServer / OpenCode Server に相当する待ち受けサーバーは無い
- `@anthropic-ai/claude-agent-sdk` 経由で `claude` CLI を起動し、streaming input で会話する
- ログイン状態は `claude auth status --json` で確認する（未ログインなら接続画面に `claude auth login` を出す）
- 使用する実行ファイルは `claude` の PATH、または `~/.local/bin/claude` などの一般的な場所から解決する
- アプリ専用 MCP エンドポイントは SDK の `mcpServers` に自動で渡す
- 権限モードのデフォルトは `bypassPermissions`（ローカル専用前提）。`claude_connected_apps.permission_mode` で変えられる

## 注意

- ユーザーの設定画面を増やさない。接続方法や構成の変更はソースで行う
- `User` / `Todo` などのデモ用ドメインは削除済み。再追加しない
- ローカル利用前提。認証・認可はない
- MCP エンドポイントを外部公開しない
- Codex の approval 要求は現状 `decline`。スムーズに動かすには `approvalPolicy: "never"` を使う
