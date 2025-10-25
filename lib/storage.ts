import { openDB, type DBSchema, type IDBPDatabase } from "idb"

type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"
type PropositionKind = PropositionType | "custom"

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

interface PropositionsDB extends DBSchema {
  subtopics: {
    key: string
    value: {
      id: string
      name: string
      subtopics: {
        id: string
        text: string
        propositions:
          | {
              id: string
              type: PropositionKind
              label: string
              text: string
            }[]
          | null
      }[]
    }
  }
  audios: {
    key: string // Format: subtopicId-propIndex-audioIndex
    value: {
      id: string
      subtopicId: string
      propIndex: number
      audioIndex: number
      blob: Blob
      timestamp: number
    }
    indexes: { "by-subtopic": string }
  }
  settings: {
    key: string
    value: {
      groqModel: string
      groqPrompt: string
    }
  }
  appState: {
    key: string
    value: StoredAppState
  }
}

let dbPromise: Promise<IDBPDatabase<PropositionsDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PropositionsDB>("propositions-app", 2, {
      upgrade(db, oldVersion) {
        // Create subtopics store
        if (oldVersion < 1 && !db.objectStoreNames.contains("subtopics")) {
          db.createObjectStore("subtopics", { keyPath: "id" })
        }

        // Create audios store with index
        if (oldVersion < 1 && !db.objectStoreNames.contains("audios")) {
          const audioStore = db.createObjectStore("audios", { keyPath: "id" })
          audioStore.createIndex("by-subtopic", "subtopicId")
        }

        // Create settings store
        if (oldVersion < 1 && !db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings")
        }

        if (oldVersion < 2 && !db.objectStoreNames.contains("appState")) {
          db.createObjectStore("appState")
        }
      },
    })
  }
  return dbPromise
}

// Themes operations (stored in the historical "subtopics" store for backwards compatibility)
export async function saveThemes(themes: any[]) {
  const db = await getDB()
  const tx = db.transaction("subtopics", "readwrite")

  // Clear existing and save new
  await tx.store.clear()
  for (const theme of themes) {
    await tx.store.put(theme)
  }
  await tx.done
}

export async function loadThemes() {
  const db = await getDB()
  return await db.getAll("subtopics")
}

// Audio operations
export async function saveAudio(subtopicId: string, propIndex: number, audioIndex: number, blob: Blob) {
  const db = await getDB()
  const id = `${subtopicId}-${propIndex}-${audioIndex}`

  await db.put("audios", {
    id,
    subtopicId,
    propIndex,
    audioIndex,
    blob,
    timestamp: Date.now(),
  })
}

export async function loadAudios(subtopicId: string) {
  const db = await getDB()
  const tx = db.transaction("audios", "readonly")
  const index = tx.store.index("by-subtopic")
  const audios = await index.getAll(subtopicId)

  // Group by propIndex and audioIndex
  const grouped: Record<number, Blob[]> = {}

  for (const audio of audios) {
    if (!grouped[audio.propIndex]) {
      grouped[audio.propIndex] = []
    }
    grouped[audio.propIndex][audio.audioIndex] = audio.blob
  }

  return grouped
}

export async function loadAllAudios() {
  const db = await getDB()
  return await db.getAll("audios")
}

// Settings operations
export async function saveSettings(settings: { groqModel: string; groqPrompt: string }) {
  const db = await getDB()
  await db.put("settings", settings, "config")
}

export async function loadSettings() {
  const db = await getDB()
  return await db.get("settings", "config")
}

// App state operations
export async function saveAppState(state: StoredAppState) {
  const db = await getDB()
  await db.put("appState", state, "main")
}

export async function loadAppState() {
  const db = await getDB()
  return await db.get("appState", "main")
}

// Clear all data
export async function clearAllData() {
  const db = await getDB()
  const tx = db.transaction(["subtopics", "audios", "settings", "appState"], "readwrite")
  await tx.objectStore("subtopics").clear()
  await tx.objectStore("audios").clear()
  await tx.objectStore("settings").clear()
  await tx.objectStore("appState").clear()
  await tx.done
}
