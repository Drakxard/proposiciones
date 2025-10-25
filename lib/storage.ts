const API_HEADERS = { "Content-Type": "application/json" } as const

const hasBtoa = typeof globalThis !== "undefined" && typeof globalThis.btoa === "function"
const hasAtob = typeof globalThis !== "undefined" && typeof globalThis.atob === "function"

const encodeBase64 = (bytes: Uint8Array): string => {
  if (hasBtoa) {
    let binary = ""
    const chunkSize = 0x8000

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...slice)
    }

    return globalThis.btoa(binary)
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64")
  }

  throw new Error("Base64 encoding no disponible en este entorno")
}

const decodeBase64 = (value: string): Uint8Array => {
  if (hasAtob) {
    const binary = globalThis.atob(value)
    const bytes = new Uint8Array(binary.length)

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }

    return bytes
  }

  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"))
  }

  throw new Error("Base64 decoding no disponible en este entorno")
}

type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"
type PropositionKind = PropositionType | "custom"

type SerializedAudio = {
  mimeType: string
  base64: string
}

export type StoredProposition = {
  id: string
  type: PropositionKind
  label: string
  text: string
  audios: Blob[]
}

type SerializedProposition = Omit<StoredProposition, "audios"> & {
  audios: SerializedAudio[]
}

export type StoredSubtopic = {
  id: string
  text: string
  propositions: StoredProposition[] | null
  title?: string
  createdAt?: number
  updatedAt?: number
  tags?: string[]
}

type SerializedSubtopic = Omit<StoredSubtopic, "propositions"> & {
  propositions: SerializedProposition[] | null
}

export type StoredTheme = {
  id: string
  name: string
  subtopics: StoredSubtopic[]
}

type SerializedTheme = Omit<StoredTheme, "subtopics"> & {
  subtopics: SerializedSubtopic[]
}

export type StoredEra = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  closedAt: number | null
  themes: StoredTheme[]
}

type SerializedEra = Omit<StoredEra, "themes"> & {
  themes: SerializedTheme[]
}

export type StoredAppState = {
  currentEra: StoredEra
  eraHistory: StoredEra[]
}

type SerializedAppState = {
  currentEra: SerializedEra
  eraHistory: SerializedEra[]
}

const blobToSerializedAudio = async (blob: Blob): Promise<SerializedAudio> => {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  return {
    mimeType: blob.type || "application/octet-stream",
    base64: encodeBase64(bytes),
  }
}

const serializedAudioToBlob = (audio: SerializedAudio): Blob => {
  const bytes = decodeBase64(audio.base64)
  return new Blob([bytes], { type: audio.mimeType || "application/octet-stream" })
}

const serializeProposition = async (
  proposition: StoredProposition,
): Promise<SerializedProposition> => ({
  id: proposition.id,
  type: proposition.type,
  label: proposition.label,
  text: proposition.text,
  audios: await Promise.all(
    (Array.isArray(proposition.audios) ? proposition.audios : [])
      .filter((audio): audio is Blob => Boolean(audio))
      .map(async (audio) => blobToSerializedAudio(audio)),
  ),
})

const serializeSubtopic = async (
  subtopic: StoredSubtopic,
): Promise<SerializedSubtopic> => ({
  id: subtopic.id,
  text: subtopic.text,
  title: subtopic.title,
  tags: subtopic.tags ? [...subtopic.tags] : undefined,
  createdAt: subtopic.createdAt,
  updatedAt: subtopic.updatedAt,
  propositions: subtopic.propositions
    ? await Promise.all(subtopic.propositions.map((prop) => serializeProposition(prop)))
    : null,
})

const serializeTheme = async (theme: StoredTheme): Promise<SerializedTheme> => ({
  id: theme.id,
  name: theme.name,
  subtopics: await Promise.all(theme.subtopics.map((subtopic) => serializeSubtopic(subtopic))),
})

const serializeEra = async (era: StoredEra): Promise<SerializedEra> => ({
  id: era.id,
  name: era.name,
  createdAt: era.createdAt,
  updatedAt: era.updatedAt,
  closedAt: era.closedAt,
  themes: await Promise.all(era.themes.map((theme) => serializeTheme(theme))),
})

const serializeAppState = async (state: StoredAppState): Promise<SerializedAppState> => ({
  currentEra: await serializeEra(state.currentEra),
  eraHistory: await Promise.all(state.eraHistory.map((era) => serializeEra(era))),
})

const deserializeProposition = (proposition: SerializedProposition): StoredProposition => ({
  id: proposition.id,
  type: proposition.type,
  label: proposition.label,
  text: proposition.text,
  audios: (Array.isArray(proposition.audios) ? proposition.audios : [])
    .filter((audio): audio is SerializedAudio => Boolean(audio))
    .map((audio) => serializedAudioToBlob(audio)),
})

const deserializeSubtopic = (subtopic: SerializedSubtopic): StoredSubtopic => ({
  id: subtopic.id,
  text: subtopic.text,
  title: subtopic.title,
  tags: subtopic.tags ? [...subtopic.tags] : undefined,
  createdAt: subtopic.createdAt,
  updatedAt: subtopic.updatedAt,
  propositions: subtopic.propositions
    ? subtopic.propositions.map((prop) => deserializeProposition(prop))
    : null,
})

const deserializeTheme = (theme: SerializedTheme): StoredTheme => ({
  id: theme.id,
  name: theme.name,
  subtopics: theme.subtopics.map((subtopic) => deserializeSubtopic(subtopic)),
})

const deserializeEra = (era: SerializedEra): StoredEra => ({
  id: era.id,
  name: era.name,
  createdAt: era.createdAt,
  updatedAt: era.updatedAt,
  closedAt: era.closedAt,
  themes: era.themes.map((theme) => deserializeTheme(theme)),
})

const deserializeAppState = (state: SerializedAppState): StoredAppState => ({
  currentEra: deserializeEra(state.currentEra),
  eraHistory: state.eraHistory.map((era) => deserializeEra(era)),
})

const fetchJson = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, init)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Error en la solicitud (${response.status}): ${text}`)
  }

  return response.json()
}

// Legacy operations preserved as no-ops for compatibilidad con versiones anteriores
export async function saveThemes(_: any[]) {
  console.warn("[storage] saveThemes ya no está soportado en la capa de base de datos remota")
}

export async function loadThemes() {
  return []
}

export async function saveAudio(
  _subtopicId: string,
  _propIndex: number,
  _audioIndex: number,
  _blob: Blob,
) {
  console.warn("[storage] saveAudio ya no está soportado en la capa de base de datos remota")
}

export async function loadAudios(_subtopicId: string) {
  return {}
}

export async function loadAllAudios() {
  return []
}

export async function saveSettings(settings: { groqModel: string; groqPrompt: string }) {
  await fetchJson<{ ok: boolean }>("/api/storage/settings", {
    method: "PUT",
    headers: API_HEADERS,
    body: JSON.stringify({ settings }),
  })
}

export async function loadSettings() {
  const data = await fetchJson<{ settings: { groqModel: string; groqPrompt: string } | null }>(
    "/api/storage/settings",
    { method: "GET", cache: "no-store" },
  )
  return data.settings ?? null
}

export async function saveAppState(state: StoredAppState) {
  const serialized = await serializeAppState(state)

  await fetchJson<{ ok: boolean }>("/api/storage/app-state", {
    method: "PUT",
    headers: API_HEADERS,
    body: JSON.stringify({ state: serialized }),
  })
}

export async function loadAppState() {
  const data = await fetchJson<{ state: SerializedAppState | null }>(
    "/api/storage/app-state",
    { method: "GET", cache: "no-store" },
  )

  if (!data.state) {
    return null
  }

  return deserializeAppState(data.state)
}

export async function clearAllData() {
  await fetchJson<{ ok: boolean }>("/api/storage", { method: "DELETE" })
}
