"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"

import { saveAppState, loadAppState, type StoredAppState } from "@/lib/storage"

const REMOTE_THEME_ID = "remote-subtopics"
const REMOTE_THEME_NAME = "Subtemas remotos"

type StoredProposition = {
  id: string
  type: string
  label: string
  text: string
}

type StoredSubtopic = {
  id: string
  text: string
  propositions: StoredProposition[] | null
}

type StoredTheme = {
  id: string
  name: string
  subtopics: StoredSubtopic[]
}

const createDefaultState = (): StoredAppState => {
  const timestamp = Date.now()

  return {
    currentEra: {
      id: `era-${timestamp}`,
      name: "Ciclo generado automáticamente",
      createdAt: timestamp,
      updatedAt: timestamp,
      closedAt: null,
      themes: [],
    },
    eraHistory: [],
  }
}

const ensureRemoteTheme = (state: StoredAppState): StoredTheme => {
  const { currentEra } = state

  if (!currentEra.themes) {
    currentEra.themes = []
  }

  let remoteTheme = currentEra.themes.find((theme) => theme.id === REMOTE_THEME_ID)

  if (!remoteTheme) {
    remoteTheme = {
      id: REMOTE_THEME_ID,
      name: REMOTE_THEME_NAME,
      subtopics: [],
    }
    currentEra.themes.push(remoteTheme)
  }

  return remoteTheme
}

interface CreationResult {
  created: boolean
  updated: boolean
}

const upsertSubtopic = (
  state: StoredAppState,
  subtopicId: string,
  subtopicName: string,
): CreationResult => {
  const theme = ensureRemoteTheme(state)

  const existingSubtopic = theme.subtopics.find((item) => item.id === subtopicId)

  if (existingSubtopic) {
    if (existingSubtopic.text !== subtopicName) {
      existingSubtopic.text = subtopicName
      state.currentEra.updatedAt = Date.now()
      return { created: false, updated: true }
    }

    return { created: false, updated: false }
  }

  theme.subtopics.push({
    id: subtopicId,
    text: subtopicName,
    propositions: null,
  })

  state.currentEra.updatedAt = Date.now()

  return { created: true, updated: false }
}

const decodeSlug = (slugParam: string | string[] | undefined): { id: string; name: string } | null => {
  const slugValue = Array.isArray(slugParam) ? slugParam.join("/") : slugParam

  if (!slugValue) {
    return null
  }

  const normalizedValue = decodeURIComponent(slugValue)
  const separatorIndex = normalizedValue.indexOf("=")

  if (separatorIndex === -1) {
    return null
  }

  const rawId = normalizedValue.slice(0, separatorIndex)
  const rawName = normalizedValue.slice(separatorIndex + 1)

  if (!rawId || !rawName) {
    return null
  }

  return {
    id: rawId,
    name: rawName,
  }
}

interface CreationMessage {
  title: string
  description: string
}

export default function CreateSubtopicPage() {
  const router = useRouter()
  const params = useParams<{ slug: string | string[] }>()
  const slugParam = params?.slug
  const [message, setMessage] = useState<CreationMessage | null>(null)
  const [status, setStatus] = useState<"processing" | "error" | "done">("processing")
  const hasRunRef = useRef(false)

  const decoded = useMemo(() => decodeSlug(slugParam), [slugParam])

  useEffect(() => {
    if (hasRunRef.current) {
      return
    }

    if (!decoded) {
      setMessage({
        title: "URL inválida",
        description:
          "Asegúrate de utilizar el formato /nuevaproposicion/{id}={Nombre%20Subtema}.",
      })
      setStatus("error")
      return
    }

    hasRunRef.current = true

    const run = async () => {
      try {
        const { id, name } = decoded

        if (!id.trim() || !name.trim()) {
          setMessage({
            title: "Datos incompletos",
            description: "El identificador y el nombre del subtema no pueden estar vacíos.",
          })
          setStatus("error")
          return
        }

        const storedState = (await loadAppState()) ?? createDefaultState()
        const result = upsertSubtopic(storedState, id.trim(), name.trim())

        await saveAppState(storedState)

        if (result.created) {
          setMessage({
            title: "Subtema creado",
            description: `Se creó el subtema "${name}" con el identificador ${id}. Redirigiendo...`,
          })
        } else if (result.updated) {
          setMessage({
            title: "Subtema actualizado",
            description: `Se actualizó el subtema ${id} con el nuevo nombre "${name}". Redirigiendo...`,
          })
        } else {
          setMessage({
            title: "Subtema existente",
            description: `El subtema ${id} ya existía. Redirigiendo...`,
          })
        }

        setStatus("done")

        setTimeout(() => {
          router.replace(`/proposicion/${encodeURIComponent(id)}`)
        }, 1500)
      } catch (error) {
        console.error("Error al crear el subtema", error)
        setMessage({
          title: "No se pudo crear el subtema",
          description: "Ocurrió un error inesperado mientras se guardaba el subtema.",
        })
        setStatus("error")
      }
    }

    void run()
  }, [decoded, router])

  const title = message?.title ?? "Creando subtema"
  const description = message?.description ?? "Guardando la información del nuevo subtema..."

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      {status === "processing" ? (
        <span className="text-sm text-muted-foreground">Procesando...</span>
      ) : null}
    </main>
  )
}
