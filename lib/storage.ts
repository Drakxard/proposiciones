import { openDB, type DBSchema, type IDBPDatabase } from "idb"

type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"

interface PropositionsDB extends DBSchema {
  subtopics: {
    key: string
    value: {
      id: string
      text: string
      propositions:
        | {
            type: PropositionType
            text: string
            audios: [] // Empty array, actual blobs stored separately
          }[]
        | null
    }
  }
  themes: {
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
              text: string
              audioCount: number
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
}

let dbPromise: Promise<IDBPDatabase<PropositionsDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PropositionsDB>("propositions-app", 2, {
      upgrade(db) {
        // Create subtopics store
        if (!db.objectStoreNames.contains("subtopics")) {
          db.createObjectStore("subtopics", { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains("themes")) {
          db.createObjectStore("themes", { keyPath: "id" })
        }

        // Create audios store with index
        if (!db.objectStoreNames.contains("audios")) {
          const audioStore = db.createObjectStore("audios", { keyPath: "id" })
          audioStore.createIndex("by-subtopic", "subtopicId")
        }

        // Create settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings")
        }
      },
    })
  }
  return dbPromise
}

// Subtopics operations
export async function saveSubtopics(subtopics: any[]) {
  const db = await getDB()
  const tx = db.transaction("subtopics", "readwrite")

  // Clear existing and save new
  await tx.store.clear()
  for (const subtopic of subtopics) {
    await tx.store.put(subtopic)
  }
  await tx.done
}

export async function loadSubtopics() {
  const db = await getDB()
  return await db.getAll("subtopics")
}

// Themes operations
export async function saveThemes(themes: any[]) {
  const db = await getDB()
  if (!db.objectStoreNames.contains("themes")) {
    return
  }

  const tx = db.transaction("themes", "readwrite")
  await tx.store.clear()
  for (const theme of themes) {
    await tx.store.put(theme)
  }
  await tx.done
}

export async function loadThemes() {
  const db = await getDB()
  if (!db.objectStoreNames.contains("themes")) {
    return []
  }
  return await db.getAll("themes")
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

// Clear all data
export async function clearAllData() {
  const db = await getDB()
  const stores = ["subtopics", "audios", "settings"]
  if (db.objectStoreNames.contains("themes")) {
    stores.push("themes")
  }
  const tx = db.transaction(stores, "readwrite")
  await tx.objectStore("subtopics").clear()
  await tx.objectStore("audios").clear()
  await tx.objectStore("settings").clear()
  if (db.objectStoreNames.contains("themes")) {
    await tx.objectStore("themes").clear()
  }
  await tx.done
}
