"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { loadAppState, saveAppState } from "@/lib/storage"
import {
  parseExternalSubtopicPayload,
  prepareStateForExternalSubtopic,
  upsertExternalSubtopic,
} from "@/lib/external-subtopics"

type Status = "initializing" | "success" | "error"

const CreateSubtopicPage = () => {
  const [status, setStatus] = useState<Status>("initializing")
  const [error, setError] = useState<string | null>(null)
  const [subtopicId, setSubtopicId] = useState<string | null>(null)
  const [subtopicName, setSubtopicName] = useState<string | null>(null)

  const params = useParams<{ payload: string }>()
  const payload = params?.payload ?? ""

  const propositionUrl = useMemo(() => {
    if (!subtopicId) return "#"
    return `/proposicion/${encodeURIComponent(subtopicId)}`
  }, [subtopicId])

  useEffect(() => {
    const parsed = parseExternalSubtopicPayload(payload)

    if (!parsed) {
      setError(
        'No se pudo leer el identificador y el nombre del subtema. Asegúrate de usar el formato /nuevaproposicion/{id}="Nombre".'
      )
      setStatus("error")
      return
    }

    setSubtopicId(parsed.id)
    setSubtopicName(parsed.name)

    let cancelled = false

    const persistSubtopic = async () => {
      try {
        const stored = await loadAppState()
        const prepared = prepareStateForExternalSubtopic(stored)
        const updated = upsertExternalSubtopic(prepared, parsed)

        await saveAppState(updated)

        if (!cancelled) {
          setStatus("success")
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
  }, [payload])

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

      {status === "success" ? (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">¡Subtema listo!</h1>
            <div className="space-y-1 text-muted-foreground">
              <p>
                Se creó el subtema <span className="font-medium text-foreground">{subtopicName}</span>
                {" "}
                con el identificador <span className="font-mono text-foreground">{subtopicId}</span>.
              </p>
              <p>
                Puedes abrirlo ahora mismo o regresar a la aplicación principal para completarlo con
                más detalles.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href={propositionUrl}>Ir a la proposición</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Abrir la aplicación</Link>
            </Button>
          </div>
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
