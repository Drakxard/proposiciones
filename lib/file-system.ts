// Lightweight File System Access helpers for browser (Chromium-based)
// Stores a chosen directory handle in IndexedDB and provides JSON read/write utilities

import { openDB, type DBSchema, type IDBPDatabase } from "idb"

interface FileSystemDB extends DBSchema {
  "directory-handle": {
    key: string
    value: FileSystemDirectoryHandle
  }
}

const DB_NAME = "propositions-fs"
const STORE_NAME = "directory-handle"
const HANDLE_KEY = "gestor-system"

let db: IDBPDatabase<FileSystemDB> | null = null

async function getDB() {
  if (!db) {
    db = await openDB<FileSystemDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      },
    })
  }
  return db
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window
}

/**
 * Request directory access and save handle to IndexedDB
 */
export async function requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemSupported()) {
    throw new Error("File System Access API not supported in this browser")
  }

  try {
    const dirHandle = await window.showDirectoryPicker({
      mode: "readwrite",
      startIn: "documents",
    })

    const systemHandle = await dirHandle.getDirectoryHandle("system", { create: true })

    // Save handle to IndexedDB
    const database = await getDB()
    await database.put(STORE_NAME, systemHandle, HANDLE_KEY)

    return systemHandle
  } catch (error: any) {
    if (error.name === "SecurityError" || error.message?.includes("cross-origin")) {
      throw new Error("Cross origin sub frames aren't allowed to show a file picker")
    }
    console.error("[v0] Error requesting directory access:", error)
    throw error
  }
}

/**
 * Get saved directory handle from IndexedDB
 */
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const database = await getDB()
    const handle = await database.get(STORE_NAME, HANDLE_KEY)

    if (!handle) {
      return null
    }

    // Verify we still have permission. Requesting a new permission prompt
    // requires a user activation (e.g. button click). Since this function is
    // called automatically during app boot we simply return null when
    // permission is no longer granted so the UI can prompt the user.
    const permission = await handle.queryPermission({ mode: "readwrite" })
    if (permission === "granted") {
      return handle
    }

    return null
  } catch (error) {
    console.error("[v0] Error getting saved directory handle:", error)
    return null
  }
}

/**
 * Write JSON data to a file
 */
export async function writeJSONFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  data: any,
): Promise<boolean> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(data, null, 2))
    await writable.close()
    return true
  } catch (error) {
    console.error(`[v0] Error writing file ${filename}:`, error)
    return false
  }
}

/**
 * Read JSON data from a file
 */
export async function readJSONFile(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<any | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename)
    const file = await fileHandle.getFile()
    const text = await file.text()
    return JSON.parse(text)
  } catch (error) {
    // File doesn't exist or can't be read
    return null
  }
}

/**
 * Write Blob data to a file
 */
export async function writeBlobFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<boolean> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch (error) {
    console.error(`[v0] Error writing blob file ${filename}:`, error)
    return false
  }
}

/**
 * Read Blob data from a file
 */
export async function readBlobFile(dirHandle: FileSystemDirectoryHandle, filename: string): Promise<Blob | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename)
    const file = await fileHandle.getFile()
    return file
  } catch (error) {
    return null
  }
}

/**
 * List all files in directory
 */
export async function listFiles(dirHandle: FileSystemDirectoryHandle): Promise<string[]> {
  const files: string[] = []
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        files.push(entry.name)
      }
    }
  } catch (error) {
    console.error("[v0] Error listing files:", error)
  }
  return files
}
