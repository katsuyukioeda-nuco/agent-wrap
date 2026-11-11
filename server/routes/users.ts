import { Hono } from 'hono'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db'

interface UserRow extends RowDataPacket {
  id: string
  name: string
  email: string
  createdAt: Date
}

export const users = new Hono()

users.get('/', async (c) => {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT id, name, email, created_at AS createdAt FROM users ORDER BY created_at ASC',
  )

  return c.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
    })),
  )
})
