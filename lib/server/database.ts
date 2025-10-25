const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS app_state (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
]

let schemaInitialization: Promise<void> | null = null

const extractRows = (payload: any): any[] => {
  if (!payload) {
    return []
  }

  if (Array.isArray(payload.rows)) {
    return payload.rows
  }

  if (payload.result && Array.isArray(payload.result.rows)) {
    return payload.result.rows
  }

  if (Array.isArray(payload.results)) {
    const aggregated: any[] = []
    for (const result of payload.results) {
      if (result && Array.isArray(result.rows)) {
        aggregated.push(...result.rows)
      }
    }
    return aggregated
  }

  if (Array.isArray(payload.data)) {
    return payload.data
  }

  return []
}

const buildSqlEndpoint = (databaseUrl: URL) => {
  if (databaseUrl.protocol === "https:" || databaseUrl.protocol === "http:") {
    const origin = `${databaseUrl.protocol}//${databaseUrl.host}`
    return `${origin}/sql`
  }

  return `https://${databaseUrl.host}/sql`
}

const buildAuthorizationHeader = (databaseUrl: URL) => {
  const username = decodeURIComponent(databaseUrl.username)
  const password = decodeURIComponent(databaseUrl.password)

  if (!username || !password) {
    throw new Error("DATABASE_URL must include username and password for Basic authentication")
  }

  const credentials = `${username}:${password}`
  const encoded = Buffer.from(credentials).toString("base64")
  return `Basic ${encoded}`
}

const executeSql = async (query: string) => {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.")
  }

  const url = new URL(connectionString)
  const databaseName = url.pathname.replace(/^\//, "")

  if (!databaseName) {
    throw new Error("DATABASE_URL debe incluir el nombre de la base de datos")
  }

  const endpoint = buildSqlEndpoint(url)
  const authorization = buildAuthorizationHeader(url)

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      sql: query,
      params: [],
      parameters: [],
      database: databaseName,
      format: "json",
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Error al ejecutar la consulta SQL (${response.status} ${response.statusText}): ${errorBody}`,
    )
  }

  const payload = await response.json()
  const rows = extractRows(payload)

  return { rows, raw: payload }
}

export const ensureSchema = async () => {
  if (!schemaInitialization) {
    schemaInitialization = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await executeSql(statement)
      }
    })()
  }

  return schemaInitialization
}

const escapeLiteral = (value: string) => {
  return value.replace(/'/g, "''")
}

export const readAppState = async () => {
  await ensureSchema()
  const { rows } = await executeSql("SELECT data FROM app_state WHERE id = 'main' LIMIT 1")

  if (!rows.length) {
    return null
  }

  const raw = rows[0]
  const data = raw?.data ?? raw?.["data"] ?? raw?.[0]

  if (!data) {
    return null
  }

  if (typeof data === "string") {
    return JSON.parse(data)
  }

  return data
}

export const writeAppState = async (state: unknown) => {
  await ensureSchema()
  const serialized = JSON.stringify(state)
  const escaped = escapeLiteral(serialized)

  await executeSql(`
    INSERT INTO app_state (id, data, updated_at)
    VALUES ('main', '${escaped}'::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `)
}

export const clearStorage = async () => {
  await ensureSchema()
  await executeSql("DELETE FROM app_state WHERE id = 'main'")
  await executeSql("DELETE FROM app_settings WHERE id = 'config'")
}

export const readSettings = async () => {
  await ensureSchema()
  const { rows } = await executeSql("SELECT data FROM app_settings WHERE id = 'config' LIMIT 1")

  if (!rows.length) {
    return null
  }

  const raw = rows[0]
  const data = raw?.data ?? raw?.["data"] ?? raw?.[0]

  if (!data) {
    return null
  }

  if (typeof data === "string") {
    return JSON.parse(data)
  }

  return data
}

export const writeSettings = async (settings: unknown) => {
  await ensureSchema()
  const serialized = JSON.stringify(settings)
  const escaped = escapeLiteral(serialized)

  await executeSql(`
    INSERT INTO app_settings (id, data, updated_at)
    VALUES ('config', '${escaped}'::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `)
}
