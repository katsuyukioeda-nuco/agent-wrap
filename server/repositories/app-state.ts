import type { RowDataPacket } from 'mysql2'
import type { AppState } from '../../schema'
import { pool } from '../db'

/**
 * シングルトンの AppState 行を識別する固定 ID。
 * schema.ts の規約に合わせて UUIDv7 形式にしている。
 */
const APP_STATE_ID = '0190a000-0000-7000-8000-000000000000'

interface AppStateRow extends RowDataPacket {
  id: string
  lastOpenConnectedAppId: string | null
  createdAt: Date
  updatedAt: Date
}

function toAppState(row: AppStateRow): AppState {
  return {
    id: row.id,
    lastOpenConnectedAppId: row.lastOpenConnectedAppId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getAppState(): Promise<AppState> {
  const [rows] = await pool.query<AppStateRow[]>(
    `SELECT id, last_open_connected_app_id AS lastOpenConnectedAppId,
            created_at AS createdAt, updated_at AS updatedAt
     FROM app_state
     WHERE id = ?`,
    [APP_STATE_ID],
  )

  if (rows[0]) {
    return toAppState(rows[0])
  }

  const now = new Date()
  return {
    id: APP_STATE_ID,
    lastOpenConnectedAppId: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export async function setLastOpenConnectedApp(
  connectedAppId: string,
): Promise<AppState> {
  const now = new Date()

  await pool.execute(
    `INSERT INTO app_state
       (id, last_open_connected_app_id, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_open_connected_app_id = ?, updated_at = ?`,
    [APP_STATE_ID, connectedAppId, now, now, connectedAppId, now],
  )

  return getAppState()
}
