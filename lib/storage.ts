export type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"
export type PropositionKind = PropositionType | "custom"

export type StoredProposition = {
  id: string
  type: PropositionKind
  label: string
  text: string
  audios: Blob[]
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

export type StoredTheme = {
  id: string
  name: string
  subtopics: StoredSubtopic[]
}

export type StoredEra = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  closedAt: number | null
  themes: StoredTheme[]
}

export type StoredAppState = {
  currentEra: StoredEra
  eraHistory: StoredEra[]
}

type StorageResponse<T> = {
  data: T
}

type AudioResponse = {
  id: string
  subtopicId: string
  propIndex: number
  audioIndex: number
  mimeType: string | null
  blobBase64: string
  timestamp: number
}

type AudioFetchResponse = {
  audios: AudioResponse[]
}

const JSON_HEADERS = { "Content-Type": "application/json" }

const AUDIO_ENDPOINT = "/api/storage/audios"
const THEMES_ENDPOINT = "/api/storage/themes"
const SETTINGS_ENDPOINT = "/api/storage/settings"
const APP_STATE_ENDPOINT = "/api/storage/app-state"
const CLEAR_ENDPOINT = "/api/storage/clear"

const DEFAULT_AUDIO_MIME_TYPE = "audio/webm"

const encodeBase64 = (data: Uint8Array) => {
  const globalObject: any = typeof globalThis !== "undefined" ? globalThis : {}

  if (globalObject.Buffer) {
    return globalObject.Buffer.from(data).toString("base64")
  }

  if (typeof globalObject.btoa === "function") {
    let binary = ""
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    return globalObject.btoa(binary)
  }

  throw new Error("Base64 encoding is not supported in this environment")
}

const decodeBase64 = (base64: string): Uint8Array => {
  const globalObject: any = typeof globalThis !== "undefined" ? globalThis : {}

  if (globalObject.Buffer) {
    return new Uint8Array(globalObject.Buffer.from(base64, "base64"))
  }

  if (typeof globalObject.atob === "function") {
    const binary = globalObject.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  throw new Error("Base64 decoding is not supported in this environment")
}

const toBlob = (data: Uint8Array, mimeType?: string | null) => {
  return new Blob([data], { type: mimeType ?? DEFAULT_AUDIO_MIME_TYPE })
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request to ${url} failed with status ${response.status}: ${text}`)
  }
  if (response.status === 204) {
    return undefined as unknown as T
  }
  return (await response.json()) as T
}

export async function saveThemes(themes: any[]) {
  await requestJson<void>(THEMES_ENDPOINT, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ data: themes }),
  })
}

export async function loadThemes() {
  const response = await requestJson<StorageResponse<any[]>>(THEMES_ENDPOINT)
  return response.data ?? []
}

export async function saveAudio(
  subtopicId: string,
  propIndex: number,
  audioIndex: number,
  blob: Blob,
) {
  const arrayBuffer = await blob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  const blobBase64 = encodeBase64(uint8Array)

  await requestJson<void>(AUDIO_ENDPOINT, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      subtopicId,
      propIndex,
      audioIndex,
      blobBase64,
      mimeType: blob.type || DEFAULT_AUDIO_MIME_TYPE,
    }),
  })
}

const mapAudioResponseToBlob = (audio: AudioResponse) => {
  const data = decodeBase64(audio.blobBase64)
  return {
    id: audio.id,
    subtopicId: audio.subtopicId,
    propIndex: audio.propIndex,
    audioIndex: audio.audioIndex,
    blob: toBlob(data, audio.mimeType),
    timestamp: audio.timestamp,
  }
}

export async function loadAudios(subtopicId: string) {
  const url = `${AUDIO_ENDPOINT}?subtopicId=${encodeURIComponent(subtopicId)}`
  const response = await requestJson<AudioFetchResponse>(url)
  const grouped: Record<number, Blob[]> = {}

  for (const audio of response.audios ?? []) {
    const mapped = mapAudioResponseToBlob(audio)
    if (!grouped[mapped.propIndex]) {
      grouped[mapped.propIndex] = []
    }
    grouped[mapped.propIndex][mapped.audioIndex] = mapped.blob
  }

  return grouped
}

export async function loadAllAudios() {
  const response = await requestJson<AudioFetchResponse>(AUDIO_ENDPOINT)
  return (response.audios ?? []).map(mapAudioResponseToBlob)
}

export async function saveSettings(settings: { groqModel: string; groqPrompt: string }) {
  await requestJson<void>(SETTINGS_ENDPOINT, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ data: settings }),
  })
}

export async function loadSettings() {
  const response = await requestJson<StorageResponse<{ groqModel: string; groqPrompt: string } | null>>(SETTINGS_ENDPOINT)
  return response.data ?? null
}

export async function saveAppState(state: StoredAppState) {
  await requestJson<void>(APP_STATE_ENDPOINT, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ data: state }),
  })
}

export async function loadAppState() {
  const response = await requestJson<StorageResponse<StoredAppState | null>>(APP_STATE_ENDPOINT)
  return response.data ?? null
}

export async function clearAllData() {
  await requestJson<void>(CLEAR_ENDPOINT, {
    method: "POST",
  })
}
