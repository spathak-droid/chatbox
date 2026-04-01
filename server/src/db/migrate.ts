import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pool } from './client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        ran_at TIMESTAMP DEFAULT NOW()
      )
    `)

    const ran = await client.query('SELECT name FROM migrations ORDER BY id')
    const ranNames = new Set(ran.rows.map((r: { name: string }) => r.name))

    const migrationDir = join(__dirname, 'migrations')
    const files = readdirSync(migrationDir).filter(f => f.endsWith('.sql')).sort()

    for (const file of files) {
      if (ranNames.has(file)) continue
      console.log(`Running migration: ${file}`)
      const sql = readFileSync(join(migrationDir, file), 'utf-8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Migration ${file} complete`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      }
    }

    console.log('All migrations complete')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
