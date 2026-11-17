import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import type { ConnectedApp, ProcessDefinition, ProcessStatus } from '../../schema'
import { pool } from '../db'

interface ProcessDefinitionRow extends RowDataPacket {
  id: string
  connectedAppId: string
  sessionId: string
  name: string
  cwd: string
  command: string
  pid: number | null
  status: ProcessStatus
  exitCode: number | null
  exitSignal: string | null
  logPath: string
  createdAt: Date
  startedAt: Date | null
  endedAt: Date | null
  updatedAt: Date
}

const selectProcess = `
  SELECT id, connected_app_id AS connectedAppId, session_id AS sessionId,
         name, cwd, command, pid, status, exit_code AS exitCode,
         exit_signal AS exitSignal,
         log_path AS logPath, created_at AS createdAt,
         started_at AS startedAt, ended_at AS endedAt, updated_at AS updatedAt
  FROM process_definitions
`

function toProcess(row: ProcessDefinitionRow): ProcessDefinition {
  return {
    id: row.id,
    connectedAppId: row.connectedAppId,
    sessionId: row.sessionId,
    name: row.name,
    cwd: row.cwd,
    command: row.command,
    pid: row.pid,
    status: row.status,
    exitCode: row.exitCode,
    signal: row.exitSignal,
    logPath: row.logPath,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface CreateProcessInput {
  id: string
  connectedAppId: ConnectedApp['id']
  sessionId: string
  name: string
  cwd: string
  command: string
  logPath: string
}

export async function createProcess(
  input: CreateProcessInput,
): Promise<ProcessDefinition> {
  const now = new Date()

  await pool.execute(
    `INSERT INTO process_definitions (
       id, connected_app_id, session_id, name, cwd, command, pid, status,
       exit_code, exit_signal, log_path, created_at, started_at, ended_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'starting', NULL, NULL, ?, ?, NULL, NULL, ?)`,
    [
      input.id,
      input.connectedAppId,
      input.sessionId,
      input.name,
      input.cwd,
      input.command,
      input.logPath,
      now,
      now,
    ],
  )

  const process = await getProcess(input.id)
  if (!process) {
    throw new Error('Failed to create process')
  }

  return process
}

export async function getProcess(
  id: string,
): Promise<ProcessDefinition | null> {
  const [rows] = await pool.query<ProcessDefinitionRow[]>(
    `${selectProcess} WHERE id = ?`,
    [id],
  )

  return rows[0] ? toProcess(rows[0]) : null
}

export async function listProcesses(
  connectedAppId: ConnectedApp['id'],
  sessionId: string,
  limit = 30,
): Promise<ProcessDefinition[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
  const [rows] = await pool.query<ProcessDefinitionRow[]>(
    `${selectProcess}
     WHERE connected_app_id = ? AND session_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [connectedAppId, sessionId],
  )

  return rows.map(toProcess)
}

export async function listProcessesForApp(
  connectedAppId: ConnectedApp['id'],
  limit = 50,
): Promise<ProcessDefinition[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
  const [rows] = await pool.query<ProcessDefinitionRow[]>(
    `${selectProcess}
     WHERE connected_app_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [connectedAppId],
  )

  return rows.map(toProcess)
}

export async function listActiveProcesses(): Promise<ProcessDefinition[]> {
  const [rows] = await pool.query<ProcessDefinitionRow[]>(
    `${selectProcess} WHERE status IN ('starting', 'running')`,
  )

  return rows.map(toProcess)
}

export interface UpdateProcessInput {
  pid?: number | null
  status?: ProcessStatus
  exitCode?: number | null
  signal?: string | null
  startedAt?: Date | null
  endedAt?: Date | null
}

const updateColumns: Record<keyof UpdateProcessInput, string> = {
  pid: 'pid',
  status: 'status',
  exitCode: 'exit_code',
  signal: 'exit_signal',
  startedAt: 'started_at',
  endedAt: 'ended_at',
}

export async function updateProcess(
  id: string,
  input: UpdateProcessInput,
): Promise<void> {
  const entries = Object.entries(input).filter(
    ([, value]) => value !== undefined,
  ) as Array<[keyof UpdateProcessInput, unknown]>

  if (entries.length === 0) {
    return
  }

  const assignments = entries
    .map(([key]) => `${updateColumns[key]} = ?`)
    .join(', ')
  const values = entries.map(
    ([, value]) => value as string | number | Date | null,
  )

  await pool.execute<ResultSetHeader>(
    `UPDATE process_definitions SET ${assignments}, updated_at = NOW(3) WHERE id = ?`,
    [...values, id],
  )
}
