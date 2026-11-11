import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createConnection, type RowDataPacket } from 'mysql2/promise'
import { databaseConfig } from '../server/db'

const migrationsDir = join(process.cwd(), 'db', 'migrations')

async function main() {
  const connection = await createConnection({
    ...databaseConfig(),
    multipleStatements: true,
  })

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name VARCHAR(255) NOT NULL,
        applied_at DATETIME(3) NOT NULL,
        PRIMARY KEY (name)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4
    `)

    const [appliedRows] = await connection.query<RowDataPacket[]>(
      'SELECT name FROM _migrations',
    )
    const applied = new Set(appliedRows.map((row) => String(row.name)))

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    let count = 0

    for (const file of files) {
      if (applied.has(file)) {
        continue
      }

      console.log(`Applying ${file}...`)
      const sql = await readFile(join(migrationsDir, file), 'utf8')
      await connection.query(sql)
      await connection.execute(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
        [file, new Date()],
      )
      count += 1
    }

    console.log(count === 0 ? 'No pending migrations.' : `Applied ${count} migration(s).`)
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
