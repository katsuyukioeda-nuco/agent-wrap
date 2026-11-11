import { Hono } from 'hono'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import type { Todo } from '../../schema'
import { pool } from '../db'

interface TodoRow extends RowDataPacket {
  id: string
  title: string
  authorId: string
  createdAt: Date
  updatedAt: Date
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  authorId: z.string().uuid(),
})

const updateSchema = z.object({
  title: z.string().trim().min(1).max(255),
})

const selectTodo = `
  SELECT id, title, author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt
  FROM todos
`

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ER_NO_REFERENCED_ROW_2'
  )
}

export const todos = new Hono()

todos.get('/', async (c) => {
  const [rows] = await pool.query<TodoRow[]>(`${selectTodo} ORDER BY created_at DESC`)
  return c.json(rows.map(toTodo))
})

todos.post('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  const now = new Date()
  const todo: Todo = {
    id: uuidv7(),
    title: parsed.data.title,
    authorId: parsed.data.authorId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  try {
    await pool.execute(
      'INSERT INTO todos (id, title, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [todo.id, todo.title, todo.authorId, now, now],
    )
  } catch (error) {
    if (isForeignKeyError(error)) {
      return c.json({ error: 'authorId does not exist' }, 400)
    }
    throw error
  }

  return c.json(todo, 201)
})

todos.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400)
  }

  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE todos SET title = ?, updated_at = ? WHERE id = ?',
    [parsed.data.title, new Date(), id],
  )

  if (result.affectedRows === 0) {
    return c.json({ error: 'Todo not found' }, 404)
  }

  const [rows] = await pool.query<TodoRow[]>(`${selectTodo} WHERE id = ?`, [id])
  return c.json(toTodo(rows[0]))
})

todos.delete('/:id', async (c) => {
  const [result] = await pool.execute<ResultSetHeader>('DELETE FROM todos WHERE id = ?', [
    c.req.param('id'),
  ])

  if (result.affectedRows === 0) {
    return c.json({ error: 'Todo not found' }, 404)
  }

  return c.body(null, 204)
})
