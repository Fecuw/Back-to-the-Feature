import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export async function initializeDatabase() {
  const migrationPath = fileURLToPath(new URL('../migrations/001_init.sql', import.meta.url))
  const migration = await readFile(migrationPath, 'utf8')
  await pool.query(migration)
}

export interface UserRow {
  id: string
  google_sub: string
  email: string | null
  display_name: string
}
