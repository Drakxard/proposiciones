"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { loadAppState } from "@/lib/storage"

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

interface SubtopicResult {
  subtopic: StoredSubtopic
  themeName: string
}

const findSubtopic = (themes: StoredTheme[] | undefined, subtopicId: string): SubtopicResult | null => {
  if (!themes) {
    return null
  }

  for (const theme of themes) {
    const match = theme.subtopics.find((subtopic) => subtopic.id === subtopicId)
    if (match) {
      return { subtopic: match, themeName: theme.name }
    }
  }

  return null
}

type LoadStatus = "loading" | "ready" | "not-found" | "error"

export default function PropositionPage() {
  const params = useParams<{ id: string | string[] }>()
  const idParam = params?.id
  const subtopicId = useMemo(() => {
    const value = Array.isArray(idParam) ? idParam[0] : idParam
    return decodeURIComponent(value ?? "")
  }, [idParam])
  const [status, setStatus] = useState<LoadStatus>("loading")
  const [themeName, setThemeName] = useState<string | null>(null)
  const [subtopic, setSubtopic] = useState<StoredSubtopic | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        if (!subtopicId) {
          setStatus("not-found")
          return
        }

        const state = await loadAppState()

        if (!active) {
          return
        }

        if (!state) {
          setStatus("not-found")
          return
        }

        const currentEraMatch = findSubtopic(state.currentEra?.themes, subtopicId)

        if (currentEraMatch) {
          setSubtopic(currentEraMatch.subtopic)
          setThemeName(currentEraMatch.themeName)
          setStatus("ready")
          return
        }

        for (const era of state.eraHistory ?? []) {
          const historicalMatch = findSubtopic(era.themes, subtopicId)
          if (historicalMatch) {
            setSubtopic(historicalMatch.subtopic)
            setThemeName(historicalMatch.themeName)
            setStatus("ready")
            return
          }
        }

        setStatus("not-found")
      } catch (error) {
        console.error("Error al cargar el subtema", error)
        if (active) {
          setStatus("error")
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [subtopicId])

  let content: ReactNode

  if (status === "loading") {
    content = <p className="text-muted-foreground">Cargando información del subtema...</p>
  } else if (status === "not-found") {
    content = (
      <p className="text-muted-foreground">
        No encontramos un subtema con el identificador <code>{subtopicId}</code>.
      </p>
    )
  } else if (status === "error") {
    content = (
      <p className="text-destructive">
        Ocurrió un error inesperado al recuperar la información del subtema.
      </p>
    )
  } else if (subtopic) {
    content = (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{subtopic.text || "Subtema sin título"}</CardTitle>
          <CardDescription>
            <span className="block">Identificador: {subtopicId}</span>
            {themeName ? <span className="block">Tema: {themeName}</span> : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subtopic.propositions && subtopic.propositions.length > 0 ? (
            <div className="space-y-2">
              <h2 className="text-lg font-medium">Proposiciones</h2>
              <ul className="space-y-2">
                {subtopic.propositions.map((proposition) => (
                  <li key={proposition.id} className="rounded-lg border p-3 text-left">
                    <p className="text-sm font-semibold">{proposition.label}</p>
                    <p className="text-sm text-muted-foreground">{proposition.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">Este subtema aún no tiene proposiciones registradas.</p>
          )}
        </CardContent>
      </Card>
    )
  } else {
    content = null
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Detalle del subtema</h1>
        <p className="text-muted-foreground">
          Consulta la información disponible para el identificador <code>{subtopicId}</code>.
        </p>
      </header>
      {content}
      <div className="flex justify-center">
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  )
}
