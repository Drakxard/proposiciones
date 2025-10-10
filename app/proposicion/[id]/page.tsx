"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { FileQuestion, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { findSubtopicInAppState, PENDING_SUBTOPIC_STORAGE_KEY } from "@/lib/external-subtopics"
import { loadAppState } from "@/lib/storage"

type Status = "checking" | "redirecting" | "not-found" | "error"

const PropositionRedirectPage = () => {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<Status>("checking")
  const [error, setError] = useState<string | null>(null)

  const rawId = params?.id ?? ""
  const decodedId = useMemo(() => {
    try {
      return decodeURIComponent(rawId)
    } catch (decodeError) {
      console.error("[proposicion] Error decoding id", decodeError)
      return ""
    }
  }, [rawId])

  useEffect(() => {
    if (!decodedId) {
      setStatus("error")
      setError("La URL no contiene un identificador válido.")
      return
    }

    let cancelled = false

    const redirectToSubtopic = async () => {
      try {
        const storedState = await loadAppState()
        if (cancelled) {
          return
        }

        const match = findSubtopicInAppState(storedState, decodedId)

        if (!match) {
          setStatus("not-found")
          return
        }

        window.localStorage.setItem(
          PENDING_SUBTOPIC_STORAGE_KEY,
          JSON.stringify({
            eraId: match.era.id,
            themeId: match.theme.id,
            subtopicId: match.subtopic.id,
          }),
        )

        setStatus("redirecting")
        router.replace("/")
      } catch (loadError) {
        console.error("[proposicion] Error preparing redirect", loadError)
        if (cancelled) {
          return
        }
        setError("No se pudo acceder a la información almacenada en el navegador.")
        setStatus("error")
      }
    }

    void redirectToSubtopic()

    return () => {
      cancelled = true
    }
  }, [decodedId, router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      {status === "checking" ? (
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="max-w-md text-sm text-balance">
            Verificando la información de la proposición…
          </p>
        </div>
      ) : null}

      {status === "redirecting" ? (
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="h-12 w-12 animate-spin" />
          <p className="max-w-md text-sm text-balance">
            Redirigiendo a la aplicación para abrir el subtema solicitado…
          </p>
        </div>
      ) : null}

      {status === "not-found" ? (
        <div className="flex flex-col items-center gap-4">
          <FileQuestion className="h-12 w-12 text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">No encontramos esa proposición</h1>
            <p className="max-w-md text-sm text-balance text-muted-foreground">
              Verifica el identificador o crea nuevamente el subtema con la URL de creación.
            </p>
          </div>
          <Button asChild>
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-col items-center gap-4">
          <XCircle className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Ocurrió un problema</h1>
            <p className="max-w-md text-sm text-balance text-muted-foreground">
              {error ?? "Intenta recargar la página o volver al inicio."}
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

export default PropositionRedirectPage
