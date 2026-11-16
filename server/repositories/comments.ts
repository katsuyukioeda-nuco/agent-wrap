import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { v7 as uuidv7 } from 'uuid'
import type { ConnectedApp, SessionComment } from '../../schema'
import { pool } from '../db'

interface SessionCommentRow extends RowDataPacket {
  id: string
  connectedAppId: string
  sessionId: string
  kind: SessionComment['kind']
  path: string
  repoPath: string
  startLine: number | null
  endLine: number | null
  side: SessionComment['side']
  selection: string
  comment: string
  attachmentPath: string | null
  createdAt: Date
  doneAt: Date | null
}

const selectComment = `
  SELECT id, connected_app_id AS connectedAppId, session_id AS sessionId, kind,
         path, repo_path AS repoPath, start_line AS startLine, end_line AS endLine,
         side, selection, comment, attachment_path AS attachmentPath,
         created_at AS createdAt, done_at AS doneAt
  FROM session_comments
`

function toComment(row: SessionCommentRow): SessionComment {
  return {
    id: row.id,
    connectedAppId: row.connectedAppId,
    sessionId: row.sessionId,
    kind: row.kind,
    path: row.path,
    repoPath: row.repoPath,
    startLine: row.startLine,
    endLine: row.endLine,
    side: row.side,
    selection: row.selection,
    comment: row.comment,
    attachmentPath: row.attachmentPath,
    createdAt: row.createdAt.toISOString(),
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
  }
}

export interface CreateSessionCommentInput {
  connectedAppId: ConnectedApp['id']
  sessionId: string
  kind: SessionComment['kind']
  path: string
  repoPath: string
  startLine?: number | null
  endLine?: number | null
  side?: SessionComment['side']
  selection: string
  comment: string
  attachmentPath?: string | null
}

export async function createSessionComment(
  input: CreateSessionCommentInput,
): Promise<SessionComment> {
  const id = uuidv7()
  const now = new Date()

  await pool.execute(
    `INSERT INTO session_comments (
       id, connected_app_id, session_id, kind, path, repo_path,
       start_line, end_line, side, selection, comment, attachment_path,
       created_at, done_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      input.connectedAppId,
      input.sessionId,
      input.kind,
      input.path,
      input.repoPath,
      input.startLine ?? null,
      input.endLine ?? null,
      input.side ?? null,
      input.selection,
      input.comment,
      input.attachmentPath ?? null,
      now,
    ],
  )

  return {
    id,
    connectedAppId: input.connectedAppId,
    sessionId: input.sessionId,
    kind: input.kind,
    path: input.path,
    repoPath: input.repoPath,
    startLine: input.startLine ?? null,
    endLine: input.endLine ?? null,
    side: input.side ?? null,
    selection: input.selection,
    comment: input.comment,
    attachmentPath: input.attachmentPath ?? null,
    createdAt: now.toISOString(),
    doneAt: null,
  }
}

export async function listPendingComments(
  connectedAppId: ConnectedApp['id'],
  sessionId: string,
  limit = 50,
): Promise<SessionComment[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const [rows] = await pool.query<SessionCommentRow[]>(
    `${selectComment}
     WHERE connected_app_id = ? AND session_id = ? AND done_at IS NULL
     ORDER BY created_at ASC, id ASC
     LIMIT ${safeLimit}`,
    [connectedAppId, sessionId],
  )

  return rows.map(toComment)
}

export async function listSessionComments(
  connectedAppId: ConnectedApp['id'],
  sessionId: string,
  limit = 100,
): Promise<SessionComment[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
  const [rows] = await pool.query<SessionCommentRow[]>(
    `${selectComment}
     WHERE connected_app_id = ? AND session_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [connectedAppId, sessionId],
  )

  return rows.map(toComment)
}

export async function markCommentDone(
  connectedAppId: ConnectedApp['id'],
  sessionId: string,
  id: string,
): Promise<SessionComment | null> {
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE session_comments
     SET done_at = NOW(3)
     WHERE id = ? AND connected_app_id = ? AND session_id = ? AND done_at IS NULL`,
    [id, connectedAppId, sessionId],
  )

  if (result.affectedRows === 0) {
    return null
  }

  const [rows] = await pool.query<SessionCommentRow[]>(
    `${selectComment} WHERE id = ? AND connected_app_id = ? AND session_id = ?`,
    [id, connectedAppId, sessionId],
  )

  return rows[0] ? toComment(rows[0]) : null
}
