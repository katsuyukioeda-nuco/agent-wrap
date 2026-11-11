import 'dotenv/config'
import { createPool } from 'mysql2/promise'

const DEFAULT_DATABASE_URL = 'mysql://app:app@127.0.0.1:3307/app'

/**
 * DATABASE_URL を mysql2 の接続設定に変換する。
 * DATETIME は UTC として読み書きする。
 */
export function databaseConfig() {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL)

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    timezone: 'Z',
  }
}

export const pool = createPool({
  ...databaseConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})
