import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createConnection } from 'mysql2/promise'
import { databaseConfig } from '../server/db'

async function main() {
  const connection = await createConnection({
    ...databaseConfig(),
    multipleStatements: true,
  })

  try {
    const sql = await readFile(join(process.cwd(), 'db', 'seed.sql'), 'utf8')
    await connection.query(sql)
    console.log('Seed data applied.')
  } finally {
    await connection.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
