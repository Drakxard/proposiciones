import { ensureDatabaseReady, getPool } from "@/lib/db"

export type AudioRow = {
  id: string
  subtopicId: string
  propIndex: number
  audioIndex: number
  mimeType: string | null
  data: Buffer
  timestamp: Date
}

async function ensureTables() {
  await ensureDatabaseReady()
  const pool = getPool()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS storage_items (
      key TEXT PRIMARY KEY,
      data JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audio_blobs (
      id TEXT PRIMARY KEY,
      subtopic_id TEXT NOT NULL,
      prop_index INTEGER NOT NULL,
      audio_index INTEGER NOT NULL,
      mime_type TEXT,
      data BYTEA NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS audio_blobs_subtopic_idx
      ON audio_blobs (subtopic_id)
  `)
}

export async function getStorageItem<T>(key: string): Promise<T | null> {
  await ensureTables()
  const pool = getPool()
  const result = await pool.query<{ data: T }>(
    "SELECT data FROM storage_items WHERE key = $1",
    [key],
  )

  if (result.rows.length === 0) {
    return null
  }

  return result.rows[0].data
}

export async function setStorageItem(key: string, data: unknown) {
  await ensureTables()
  const pool = getPool()

  await pool.query(
    `
      INSERT INTO storage_items (key, data, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    [key, data],
  )
}

export async function deleteStorageItems(keys: string[]) {
  if (!keys.length) return

  await ensureTables()
  const pool = getPool()
  await pool.query(
    `DELETE FROM storage_items WHERE key = ANY($1::text[])`,
    [keys],
  )
}

export async function clearAudioBlobs() {
  await ensureTables()
  const pool = getPool()
  await pool.query(`DELETE FROM audio_blobs`)
}

export async function saveAudioBlob(
  id: string,
  subtopicId: string,
  propIndex: number,
  audioIndex: number,
  mimeType: string | null,
  buffer: Buffer,
) {
  await ensureTables()
  const pool = getPool()
  await pool.query(
    `
      INSERT INTO audio_blobs (id, subtopic_id, prop_index, audio_index, mime_type, data, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        subtopic_id = EXCLUDED.subtopic_id,
        prop_index = EXCLUDED.prop_index,
        audio_index = EXCLUDED.audio_index,
        mime_type = EXCLUDED.mime_type,
        data = EXCLUDED.data,
        timestamp = NOW()
    `,
    [id, subtopicId, propIndex, audioIndex, mimeType, buffer],
  )
}

export async function getAudioBlobs(subtopicId?: string) {
  await ensureTables()
  const pool = getPool()

  const query = subtopicId
    ? `SELECT id, subtopic_id, prop_index, audio_index, mime_type, data, timestamp FROM audio_blobs WHERE subtopic_id = $1 ORDER BY prop_index, audio_index`
    : `SELECT id, subtopic_id, prop_index, audio_index, mime_type, data, timestamp FROM audio_blobs ORDER BY subtopic_id, prop_index, audio_index`

  const params = subtopicId ? [subtopicId] : []

  const result = await pool.query<{
    id: string
    subtopic_id: string
    prop_index: number
    audio_index: number
    mime_type: string | null
    data: Buffer
    timestamp: string | Date
  }>(query, params)

  return result.rows.map((row) => ({
    id: row.id,
    subtopicId: row.subtopic_id,
    propIndex: row.prop_index,
    audioIndex: row.audio_index,
    mimeType: row.mime_type,
    data: row.data,
    timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
  }))
}

export async function clearAllStorage() {
  await deleteStorageItems(["themes", "appState", "settings"])
  await clearAudioBlobs()
}
