import { NextRequest, NextResponse } from "next/server"

import {
  clearAllStorage,
  getAudioBlobs,
  getStorageItem,
  saveAudioBlob,
  setStorageItem,
} from "@/lib/server/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const JSON_HEADERS = { "Content-Type": "application/json" }

const DEFAULT_AUDIO_MIME_TYPE = "audio/webm"

type AudioPayload = {
  subtopicId: string
  propIndex: number
  audioIndex: number
  blobBase64: string
  mimeType?: string | null
}

const encodeError = (error: unknown) => {
  if (error instanceof Error) {
    return { message: error.message }
  }
  return { message: "Unknown error" }
}

const getSegment = (params: { segments?: string[] }) => {
  const segments = params.segments ?? []
  return segments[0]
}

const ensureDatabaseConfigured = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set")
  }
}

function decodeBase64ToBuffer(base64: string) {
  return Buffer.from(base64, "base64")
}

function encodeBufferToBase64(buffer: Buffer) {
  return buffer.toString("base64")
}

function parseNumber(value: unknown, defaultValue: number) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
  }
  return defaultValue
}

async function handleGet(resource: string, request: NextRequest) {
  ensureDatabaseConfigured()

  switch (resource) {
    case "themes": {
      const data = await getStorageItem<any[]>("themes")
      return NextResponse.json({ data: data ?? [] })
    }
    case "app-state": {
      const data = await getStorageItem<unknown>("appState")
      return NextResponse.json({ data: data ?? null })
    }
    case "settings": {
      const data = await getStorageItem<Record<string, unknown> | null>("settings")
      return NextResponse.json({ data: data ?? null })
    }
    case "audios": {
      const subtopicId = request.nextUrl.searchParams.get("subtopicId") ?? undefined
      const audios = await getAudioBlobs(subtopicId)
      return NextResponse.json({
        audios: audios.map((audio) => ({
          id: audio.id,
          subtopicId: audio.subtopicId,
          propIndex: audio.propIndex,
          audioIndex: audio.audioIndex,
          mimeType: audio.mimeType,
          blobBase64: encodeBufferToBase64(audio.data),
          timestamp: audio.timestamp.getTime(),
        })),
      })
    }
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 404 })
  }
}

async function handlePost(resource: string, request: NextRequest) {
  ensureDatabaseConfigured()

  switch (resource) {
    case "themes": {
      const payload = await request.json()
      await setStorageItem("themes", payload?.data ?? [])
      return new NextResponse(null, { status: 204 })
    }
    case "app-state": {
      const payload = await request.json()
      await setStorageItem("appState", payload?.data ?? null)
      return new NextResponse(null, { status: 204 })
    }
    case "settings": {
      const payload = await request.json()
      await setStorageItem("settings", payload?.data ?? null)
      return new NextResponse(null, { status: 204 })
    }
    case "audios": {
      const payload = (await request.json()) as Partial<AudioPayload>
      if (!payload?.subtopicId) {
        return NextResponse.json(
          { error: "subtopicId is required" },
          { status: 400, headers: JSON_HEADERS },
        )
      }
      if (!payload?.blobBase64) {
        return NextResponse.json(
          { error: "blobBase64 is required" },
          { status: 400, headers: JSON_HEADERS },
        )
      }

      const audioIndex = parseNumber(payload.audioIndex, 0)
      const propIndex = parseNumber(payload.propIndex, 0)
      const id = `${payload.subtopicId}-${propIndex}-${audioIndex}`

      const buffer = decodeBase64ToBuffer(payload.blobBase64)
      await saveAudioBlob(
        id,
        payload.subtopicId,
        propIndex,
        audioIndex,
        payload.mimeType ?? DEFAULT_AUDIO_MIME_TYPE,
        buffer,
      )

      return new NextResponse(null, { status: 204 })
    }
    case "clear": {
      await clearAllStorage()
      return new NextResponse(null, { status: 204 })
    }
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 404 })
  }
}

export async function GET(request: NextRequest, context: { params: { segments?: string[] } }) {
  try {
    const resource = getSegment(context.params)
    if (!resource) {
      return NextResponse.json({ error: "Resource not specified" }, { status: 404 })
    }

    return await handleGet(resource, request)
  } catch (error) {
    console.error("GET /api/storage error", error)
    return NextResponse.json({ error: encodeError(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: { segments?: string[] } }) {
  try {
    const resource = getSegment(context.params)
    if (!resource) {
      return NextResponse.json({ error: "Resource not specified" }, { status: 404 })
    }

    return await handlePost(resource, request)
  } catch (error) {
    console.error("POST /api/storage error", error)
    return NextResponse.json({ error: encodeError(error) }, { status: 500 })
  }
}
