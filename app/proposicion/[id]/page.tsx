"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { BookOpenText, FileQuestion, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadAppState } from "@/lib/storage"
import { findSubtopicInAppState } from "@/lib/external-subtopics"

type ViewProposition = {
  id: string
  label: string
  text: string
}

type ViewSubtopic = {
  id: string
  text: string
  propositions: ViewProposition[]
}

type Status = "loading" | "ready" | "not-found" | "error"

const PropositionPage = () => {
  const [status, setStatus] = useState<Status>("loading")
  const [error, setError] = useState<string | null>(null)
  const [subtopic, setSubtopic] = useState<ViewSubtopic | null>(null)
  const [themeName, setThemeName] = useState<string>("")
  const [eraName, setEraName] = useState<string>("")

  const params = useParams<{ id: string }>()
  const rawId = params?.id ?? ""
  const decodedId = useMemo(() => decodeURIComponent(rawId), [rawId])

  useEffect(() => {
    if (!decodedId) {
      setError("La URL no contiene un identificador de proposición válido.")
      setStatus("error")
      return
    }

    let cancelled = false

    const loadSubtopic = async () => {
      try {
        const stored = await loadAppState()
        if (cancelled) return

        const match = findSubtopicInAppState(stored, decodedId)

        if (!match) {
          setStatus("not-found")
          return
        }

        const propositions: ViewProposition[] = match.subtopic.propositions
          ? match.subtopic.propositions.map((proposition) => ({
              id: proposition.id,
              label: proposition.label,
              text: proposition.text,
            }))
          : []

        setSubtopic({
          id: match.subtopic.id,
          text: match.subtopic.text,
          propositions,
        })
        setThemeName(match.theme.name)
        setEraName(match.era.name)
        setStatus("ready")
      } catch (loadError) {
        console.error("[proposicion] Error loading subtopic", loadError)
        if (!cancelled) {
          setError("No se pudo cargar la información almacenada en el navegador.")
          setStatus("error")
        }
      }
    }

    void loadSubtopic()

    return () => {
      cancelled = true
    }
  }, [decodedId])

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 px-4 py-10">
      {status === "loading" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <p className="max-w-lg text-balance text-muted-foreground">
            Buscando la proposición solicitada…
          </p>
        </div>
      ) : null}

      {status === "ready" && subtopic ? (
        <div className="flex w-full max-w-3xl flex-col gap-6">
          <header className="space-y-2 text-center">
            <h1 className="text-3xl font-semibold">{subtopic.text || "Proposición sin título"}</h1>
            <p className="text-sm text-muted-foreground">
              ID: <span className="font-mono">{subtopic.id}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Tema: <span className="font-medium text-foreground">{themeName}</span> · Ciclo: {" "}
              <span className="font-medium text-foreground">{eraName}</span>
            </p>
          </header>

          {subtopic.propositions.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {subtopic.propositions.map((proposition) => (
                <Card key={proposition.id}>
                  <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                    <BookOpenText className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base font-semibold">
                      {proposition.label || "Proposición"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {proposition.text ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {proposition.text}
                      </p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground/80">
                        Aún no hay contenido para esta proposición.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 py-6 text-muted-foreground">
                <FileQuestion className="h-5 w-5" />
                <p className="text-sm">
                  Este subtema todavía no tiene proposiciones registradas. Abre la aplicación para
                  completarlo.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/">Abrir la aplicación</Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/nuevaproposicion/${encodeURIComponent(subtopic.id)}="${encodeURIComponent(subtopic.text)}"`}
              >
                Crear nuevamente
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {status === "not-found" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <FileQuestion className="h-12 w-12 text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">No encontramos esa proposición</h1>
            <p className="max-w-lg text-balance text-muted-foreground">
              Verifica que el identificador sea correcto o crea el subtema nuevamente usando la URL de
              creación.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Ocurrió un problema</h1>
            <p className="max-w-lg text-balance text-muted-foreground">
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

export default PropositionPage
