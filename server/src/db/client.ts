import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg

export const pool = new Pool({ connectionString: config.databaseUrl })

export async function initDb() {
  const client = await pool.connect()
  try {
    await client.query('SELECT NOW()')
    console.log('Database connected')
  } finally {
    client.release()
  }
}

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params)
}
