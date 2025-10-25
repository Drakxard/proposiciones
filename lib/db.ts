import { Pool } from "pg"

let pool: Pool | null = null
let initPromise: Promise<void> | null = null

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not defined")
  }
  return url
}

function createPool() {
  if (!pool) {
    const connectionString = getDatabaseUrl()
    const sslRequired = !/localhost|127\.0\.0\.1/.test(new URL(connectionString).hostname)

    pool = new Pool({
      connectionString,
      ssl: sslRequired
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    })
  }
  return pool
}

async function ensureExtensions(pool: Pool) {
  await pool.query("SELECT 1")
}

export function getPool() {
  return createPool()
}

export async function ensureDatabaseReady() {
  if (!initPromise) {
    initPromise = (async () => {
      const poolInstance = createPool()
      await ensureExtensions(poolInstance)
    })()
  }

  return initPromise
}
