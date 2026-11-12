import type { RowDataPacket } from 'mysql2'
import { v7 as uuidv7 } from 'uuid'
import type {
  AppType,
  ClaudeConnectedApp,
  CodexConnectedApp,
  ConnectedApp,
  OpencodeConnectedApp,
} from '../../schema'
import type { ConnectedAppDetail } from '../../shared/agents'
import { pool } from '../db'

interface AppRow extends RowDataPacket {
  id: string
  appType: AppType
  createdAt: Date
  updatedAt: Date
}

interface CodexRow extends RowDataPacket {
  id: string
  connectedAppId: string
  binaryPath: string
  sandbox: CodexConnectedApp['sandbox']
  approvalPolicy: CodexConnectedApp['approvalPolicy']
  appServerUrl: string | null
  createdAt: Date
  updatedAt: Date
}

interface OpencodeRow extends RowDataPacket {
  id: string
  connectedAppId: string
  binaryPath: string
  port: number
  createdAt: Date
  updatedAt: Date
}

interface ClaudeRow extends RowDataPacket {
  id: string
  connectedAppId: string
  binaryPath: string | null
  permissionMode: ClaudeConnectedApp['permissionMode']
  model: string | null
  createdAt: Date
  updatedAt: Date
}

const selectApp = `
  SELECT id, app_type AS appType, created_at AS createdAt, updated_at AS updatedAt
  FROM connected_apps
`

const selectCodex = `
  SELECT id, connected_app_id AS connectedAppId, binary_path AS binaryPath, sandbox,
         approval_policy AS approvalPolicy, app_server_url AS appServerUrl,
         created_at AS createdAt, updated_at AS updatedAt
  FROM codex_connected_apps
`

const selectOpencode = `
  SELECT id, connected_app_id AS connectedAppId, binary_path AS binaryPath, port,
         created_at AS createdAt, updated_at AS updatedAt
  FROM opencode_connected_apps
`

const selectClaude = `
  SELECT id, connected_app_id AS connectedAppId, binary_path AS binaryPath, permission_mode AS permissionMode,
         model, created_at AS createdAt, updated_at AS updatedAt
  FROM claude_connected_apps
`

function toApp(row: AppRow): ConnectedApp {
  return {
    id: row.id,
    appType: row.appType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toCodex(row: CodexRow): CodexConnectedApp {
  return {
    id: row.id,
    connectedAppId: row.connectedAppId,
    binary: row.binaryPath,
    sandbox: row.sandbox,
    approvalPolicy: row.approvalPolicy,
    appServerUrl: row.appServerUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toOpencode(row: OpencodeRow): OpencodeConnectedApp {
  return {
    id: row.id,
    connectedAppId: row.connectedAppId,
    binary: row.binaryPath,
    port: row.port,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toClaude(row: ClaudeRow): ClaudeConnectedApp {
  return {
    id: row.id,
    connectedAppId: row.connectedAppId,
    binary: row.binaryPath,
    permissionMode: row.permissionMode,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface CreateAppInput {
  appType: AppType
  codex?: {
    binary: string
    sandbox: CodexConnectedApp['sandbox']
    approvalPolicy: CodexConnectedApp['approvalPolicy']
  }
  opencode?: {
    binary: string
    port: number
  }
  claude?: {
    binary: string | null
    permissionMode: ClaudeConnectedApp['permissionMode']
    model: string | null
  }
}

export interface UpdateAppInput {
  codex?: Partial<
    Pick<CodexConnectedApp, 'binary' | 'sandbox' | 'approvalPolicy'>
  >
  opencode?: Partial<Pick<OpencodeConnectedApp, 'binary' | 'port'>>
  claude?: Partial<Pick<ClaudeConnectedApp, 'binary' | 'permissionMode' | 'model'>>
}

export async function listApps(): Promise<ConnectedApp[]> {
  const [rows] = await pool.query<AppRow[]>(`${selectApp} ORDER BY created_at ASC`)
  return rows.map(toApp)
}

export async function getAppDetail(id: string): Promise<ConnectedAppDetail | null> {
  const [rows] = await pool.query<AppRow[]>(`${selectApp} WHERE id = ?`, [id])
  const row = rows[0]

  if (!row) {
    return null
  }

  const app = toApp(row)

  if (app.appType === 'codex') {
    const [codexRows] = await pool.query<CodexRow[]>(
      `${selectCodex} WHERE connected_app_id = ?`,
      [id],
    )
    return {
      app,
      codex: codexRows[0] ? toCodex(codexRows[0]) : null,
      opencode: null,
      claude: null,
    }
  }

  if (app.appType === 'opencode') {
    const [opencodeRows] = await pool.query<OpencodeRow[]>(
      `${selectOpencode} WHERE connected_app_id = ?`,
      [id],
    )
    return {
      app,
      codex: null,
      opencode: opencodeRows[0] ? toOpencode(opencodeRows[0]) : null,
      claude: null,
    }
  }

  const [claudeRows] = await pool.query<ClaudeRow[]>(
    `${selectClaude} WHERE connected_app_id = ?`,
    [id],
  )
  return {
    app,
    codex: null,
    opencode: null,
    claude: claudeRows[0] ? toClaude(claudeRows[0]) : null,
  }
}

export async function createApp(input: CreateAppInput): Promise<ConnectedAppDetail> {
  const id = uuidv7()
  const now = new Date()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    await connection.execute(
      `INSERT INTO connected_apps (id, app_type, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [id, input.appType, now, now],
    )

    if (input.appType === 'codex') {
      await connection.execute(
        `INSERT INTO codex_connected_apps
           (id, connected_app_id, binary_path, sandbox, approval_policy, app_server_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv7(),
          id,
          input.codex?.binary ?? 'codex',
          input.codex?.sandbox ?? 'workspace-write',
          input.codex?.approvalPolicy ?? 'never',
          null,
          now,
          now,
        ],
      )
    } else if (input.appType === 'opencode') {
      await connection.execute(
        `INSERT INTO opencode_connected_apps
           (id, connected_app_id, binary_path, port, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv7(), id, input.opencode?.binary ?? 'opencode', input.opencode?.port ?? 0, now, now],
      )
    } else {
      await connection.execute(
        `INSERT INTO claude_connected_apps
           (id, connected_app_id, binary_path, permission_mode, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv7(),
          id,
          input.claude?.binary ?? null,
          input.claude?.permissionMode ?? 'bypassPermissions',
          input.claude?.model ?? null,
          now,
          now,
        ],
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  const detail = await getAppDetail(id)
  if (!detail) {
    throw new Error('Failed to load the created connected app')
  }
  return detail
}

export async function updateApp(
  id: string,
  input: UpdateAppInput,
): Promise<ConnectedAppDetail | null> {
  const current = await getAppDetail(id)
  if (!current) {
    return null
  }

  const now = new Date()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    await connection.execute(
      'UPDATE connected_apps SET updated_at = ? WHERE id = ?',
      [now, id],
    )

    if (current.app.appType === 'codex') {
      const settings = current.codex
      const patch = input.codex ?? {}
      await connection.execute(
        `UPDATE codex_connected_apps
         SET binary_path = ?, sandbox = ?, approval_policy = ?, updated_at = ?
         WHERE connected_app_id = ?`,
        [
          patch.binary ?? settings?.binary ?? 'codex',
          patch.sandbox ?? settings?.sandbox ?? 'workspace-write',
          patch.approvalPolicy ?? settings?.approvalPolicy ?? 'never',
          now,
          id,
        ],
      )
    } else if (current.app.appType === 'opencode') {
      const settings = current.opencode
      const patch = input.opencode ?? {}
      await connection.execute(
        `UPDATE opencode_connected_apps
         SET binary_path = ?, port = ?, updated_at = ?
         WHERE connected_app_id = ?`,
        [patch.binary ?? settings?.binary ?? 'opencode', patch.port ?? settings?.port ?? 0, now, id],
      )
    } else {
      const settings = current.claude
      const patch = input.claude ?? {}
      await connection.execute(
        `UPDATE claude_connected_apps
         SET binary_path = ?, permission_mode = ?, model = ?, updated_at = ?
         WHERE connected_app_id = ?`,
        [
          patch.binary ?? settings?.binary ?? null,
          patch.permissionMode ?? settings?.permissionMode ?? 'bypassPermissions',
          patch.model ?? settings?.model ?? null,
          now,
          id,
        ],
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }

  return getAppDetail(id)
}

export async function setCodexAppServerUrl(
  connectedAppId: string,
  url: string | null,
): Promise<void> {
  await pool.execute(
    `UPDATE codex_connected_apps
     SET app_server_url = ?, updated_at = ?
     WHERE connected_app_id = ?`,
    [url, new Date(), connectedAppId],
  )
}

export async function deleteApp(id: string): Promise<boolean> {
  const [result] = await pool.execute<import('mysql2').ResultSetHeader>(
    'DELETE FROM connected_apps WHERE id = ?',
    [id],
  )
  return result.affectedRows > 0
}
