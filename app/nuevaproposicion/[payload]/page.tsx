"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadAppState, saveAppState } from "@/lib/storage"
import {
  parseExternalSubtopicPayload,
  prepareStateForExternalSubtopic,
  upsertExternalSubtopic,
} from "@/lib/external-subtopics"

type Status = "initializing" | "redirecting" | "error"

const CreateSubtopicPage = () => {
  const [status, setStatus] = useState<Status>("initializing")
  const [error, setError] = useState<string | null>(null)
  const [subtopicId, setSubtopicId] = useState<string | null>(null)

  const params = useParams<{ payload: string }>()
  const payload = params?.payload ?? ""
  const searchParams = useSearchParams()
  const tagParams = useMemo(
    () => (searchParams ? searchParams.getAll("tag") : []),
    [searchParams],
  )
  const router = useRouter()

  const propositionUrl = useMemo(() => {
    if (!subtopicId) return "#"
    return `/proposicion/${encodeURIComponent(subtopicId)}`
  }, [subtopicId])

  useEffect(() => {
    console.log("[nuevaproposicion] Received payload", payload)

    const parsed = parseExternalSubtopicPayload(payload, tagParams)

    if (!parsed) {
      console.error("[nuevaproposicion] Could not parse external payload")
      setError(
        'No se pudo leer el identificador y el nombre del subtema. Asegúrate de usar el formato /nuevaproposicion/{id}="Nombre".'
      )
      setStatus("error")
      return
    }

    console.log("[nuevaproposicion] Parsed payload", parsed)
    setSubtopicId(parsed.id)

    let cancelled = false

    const persistSubtopic = async () => {
      try {
        const stored = await loadAppState()
        console.log("[nuevaproposicion] Loaded stored app state", {
          hasStoredState: Boolean(stored),
          currentEraId: stored?.currentEra?.id,
          themeCount: stored?.currentEra?.themes?.length,
        })
        const prepared = prepareStateForExternalSubtopic(stored)
        console.log("[nuevaproposicion] Prepared state for insertion", {
          currentEraId: prepared.currentEra.id,
          themeCount: prepared.currentEra.themes.length,
        })
        const updated = upsertExternalSubtopic(prepared, parsed)
        console.log("[nuevaproposicion] Upserted external subtopic", {
          themeCount: updated.currentEra.themes.length,
          subtopicId: parsed.id,
          themeIds: updated.currentEra.themes.map((theme) => theme.id),
        })

        await saveAppState(updated)
        console.log("[nuevaproposicion] Persisted updated state")

        if (!cancelled) {
          setStatus("redirecting")
          router.replace(`/proposicion/${encodeURIComponent(parsed.id)}`)
        }
      } catch (persistError) {
        console.error("[nuevaproposicion] Error creating subtopic", persistError)
        if (!cancelled) {
          setError("Ocurrió un error al guardar el nuevo subtema en el navegador.")
          setStatus("error")
        }
      }
    }

    void persistSubtopic()

    return () => {
      cancelled = true
    }
  }, [payload, router, tagParams])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {status === "initializing" ? (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Guardando nuevo subtema…</h1>
            <p className="max-w-lg text-balance text-muted-foreground">
              Estamos preparando el espacio para la proposición y guardando la información en tu
              navegador.
            </p>
          </div>
        </div>
      ) : null}

      {status === "redirecting" ? (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Abriendo la proposición…</h1>
            <p className="max-w-lg text-balance text-muted-foreground">
              Estamos redirigiéndote a la nueva proposición. Si no ocurre automáticamente, puedes
              abrirla manualmente a continuación.
            </p>
          </div>
          {subtopicId ? (
            <Button asChild>
              <Link href={propositionUrl}>Abrir manualmente</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-col items-center gap-4">
          <XCircle className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">No se pudo crear el subtema</h1>
            <p className="max-w-lg text-balance text-muted-foreground">
              {error ?? "Revisa la URL utilizada e inténtalo de nuevo."}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      ) : null}
    </main>
  )
}

export default CreateSubtopicPage
