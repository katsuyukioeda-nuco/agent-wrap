/**
 * アプリケーションのスキーマ定義。
 *
 * 規約:
 * - id は必須。UUIDv7 の文字列。
 * - リレーションは HasOne などを書かず、外部キーを `xxxId: EntityName['id']` で表現する。
 * - createdAt は必須。ISO8601 文字列。
 * - updatedAt は更新を許可するエンティティのみ持つ。ISO8601 文字列。
 *
 * DB の DDL は db/migrations/ に置き、このファイルと手動で同期する。
 */
export interface User {
  id: string // UUIDv7
  name: string
  email: string
  createdAt: string // ISO8601
}

export interface Todo {
  id: string // UUIDv7
  title: string
  authorId: User['id']
  createdAt: string // ISO8601
  updatedAt: string // ISO8601
}
