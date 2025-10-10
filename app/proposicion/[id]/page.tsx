"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { FileQuestion, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { findSubtopicInAppState, PENDING_SUBTOPIC_STORAGE_KEY } from "@/lib/external-subtopics"
import { parseClipboardJsonWithDiagnostics } from "@/lib/clipboard"
import { normalizeStringId } from "@/lib/utils"
import {
  loadAppState,
  saveAppState,
  type StoredAppState,
  type StoredProposition,
  type StoredSubtopic,
  type StoredTheme,
  type StoredEra,
} from "@/lib/storage"

type Status = "checking" | "redirecting" | "not-found" | "error"

type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"
type PropositionKind = PropositionType | "custom"

const PROPOSITION_TYPE_LABELS: Record<PropositionType, string> = {
  condicion: "Condición",
  reciproco: "Recíproco",
  inverso: "Inverso",
  contrareciproco: "Contra-Recíproco",
}

const buildDefaultLabel = (type: PropositionKind, index: number) => {
  if (type !== "custom" && PROPOSITION_TYPE_LABELS[type]) {
    return PROPOSITION_TYPE_LABELS[type]
  }

  return `Proposición ${index + 1}`
}

const sanitizeClipboardTextValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString()
  }

  return value != null ? String(value) : ""
}

const toStoredPropositions = (
  entries: any[],
  subtopicId: string,
): StoredProposition[] | null => {
  if (!entries.length) {
    return null
  }

  const idUsage = new Map<string, number>()

  return entries.map((entry, index) => {
    const rawTextValue =
      typeof entry === "string"
        ? entry
        : entry?.texto ?? entry?.text ?? (typeof entry === "number" ? entry.toString() : "")
    const textValue = sanitizeClipboardTextValue(rawTextValue)

    const rawType = typeof entry?.tipo === "string" ? entry.tipo.trim().toLowerCase() : undefined
    const normalizedType: PropositionKind =
      rawType === "condicion" ||
      rawType === "reciproco" ||
      rawType === "inverso" ||
      rawType === "contrareciproco"
        ? (rawType as PropositionType)
        : rawType === "custom"
          ? "custom"
          : "custom"

    const label =
      typeof entry?.etiqueta === "string" && entry.etiqueta.trim()
        ? entry.etiqueta.trim()
        : buildDefaultLabel(normalizedType, index)

    const idBase =
      normalizedType !== "custom"
        ? `${subtopicId}-${normalizedType}`
        : `${subtopicId}-custom-${index}`

    const usageCount = idUsage.get(idBase) ?? 0
    idUsage.set(idBase, usageCount + 1)

    const propositionId = usageCount === 0 ? idBase : `${idBase}-${usageCount}`

    return {
      id: propositionId,
      type: normalizedType,
      label,
      text: textValue,
      audios: [],
    }
  })
}

const extractSubtopicImport = (
  parsed: any[],
  subtopic: StoredSubtopic,
): { text: string; propositions: StoredProposition[] | null } | null => {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return null
  }

  let remaining = parsed
  let nextText = subtopic.text

  const first = parsed[0]

  if (
    first &&
    typeof first === "object" &&
    !Array.isArray(first) &&
    typeof first.tipo !== "string" &&
    "texto" in first
  ) {
    const maybeText = sanitizeClipboardTextValue(first.texto)
    if (maybeText.trim()) {
      nextText = maybeText
    }
    remaining = parsed.slice(1)
  }

  const propositions = toStoredPropositions(remaining, subtopic.id)

  return {
    text: nextText,
    propositions: propositions ?? subtopic.propositions ?? null,
  }
}

const applyImportToState = (
  state: StoredAppState,
  match: { subtopic: StoredSubtopic; theme: StoredTheme; era: StoredEra },
  update: { text: string; propositions: StoredProposition[] | null },
): StoredAppState | null => {
  const targetEraId = normalizeStringId(match.era.id)
  const targetThemeId = normalizeStringId(match.theme.id)
  const targetSubtopicId = normalizeStringId(match.subtopic.id)

  if (!targetEraId || !targetThemeId || !targetSubtopicId) {
    return null
  }

  const timestamp = Date.now()

  const updateEra = (era: StoredEra): { era: StoredEra; updated: boolean } => {
    let eraUpdated = false

    const themes = era.themes.map((theme) => {
      if (normalizeStringId(theme.id) !== targetThemeId) {
        return theme
      }

      let themeUpdated = false

      const subtopics = theme.subtopics.map((subtopic) => {
        if (normalizeStringId(subtopic.id) !== targetSubtopicId) {
          return subtopic
        }

        themeUpdated = true
        return {
          ...subtopic,
          text: update.text,
          propositions: update.propositions,
        }
      })

      if (!themeUpdated) {
        return theme
      }

      eraUpdated = true
      return {
        ...theme,
        subtopics,
      }
    })

    if (!eraUpdated) {
      return { era, updated: false }
    }

    return {
      era: {
        ...era,
        themes,
        updatedAt: timestamp,
      },
      updated: true,
    }
  }

  if (normalizeStringId(state.currentEra.id) === targetEraId) {
    const { era, updated } = updateEra(state.currentEra)
    if (updated) {
      return {
        ...state,
        currentEra: era,
      }
    }
  }

  const history = state.eraHistory.map((era) => {
    if (normalizeStringId(era.id) !== targetEraId) {
      return era
    }

    const { era: updatedEra, updated } = updateEra(era)
    return updated ? updatedEra : era
  })

  const didUpdateHistory = history.some((era, index) => era !== state.eraHistory[index])

  if (didUpdateHistory) {
    return {
      ...state,
      eraHistory: history,
    }
  }

  return null
}

const maybeImportFromClipboard = async (
  state: StoredAppState,
  match: { subtopic: StoredSubtopic; theme: StoredTheme; era: StoredEra },
) => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    console.warn("[proposicion] Clipboard API not available for automatic import")
    return
  }

  let clipboardText = ""

  try {
    clipboardText = await navigator.clipboard.readText()
  } catch (readError) {
    console.warn("[proposicion] Could not read clipboard for import", readError)
    return
  }

  if (!clipboardText.trim()) {
    console.log("[proposicion] Clipboard is empty, skipping import")
    return
  }

  const diagnostics = parseClipboardJsonWithDiagnostics(clipboardText)

  if (!diagnostics.success || !diagnostics.parsed?.length) {
    console.warn("[proposicion] Clipboard content is not valid for import", diagnostics.error)
    return
  }

  const update = extractSubtopicImport(diagnostics.parsed, match.subtopic)

  if (!update) {
    return
  }

  const updatedState = applyImportToState(state, match, update)

  if (!updatedState) {
    return
  }

  try {
    await saveAppState(updatedState)
    console.log("[proposicion] Imported propositions from clipboard", {
      entryCount: diagnostics.parsed.length,
    })
  } catch (persistError) {
    console.error("[proposicion] Failed to persist imported propositions", persistError)
  }
}

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
        console.log("[proposicion] Looking for subtopic in stored state", decodedId)
        const storedState = await loadAppState()
        if (cancelled) {
          return
        }

        console.log("[proposicion] Loaded stored state", {
          hasStoredState: Boolean(storedState),
          currentEraId: storedState?.currentEra?.id,
          themeCount: storedState?.currentEra?.themes?.length,
        })
        const match = findSubtopicInAppState(storedState, decodedId)

        if (!match) {
          console.warn("[proposicion] Subtopic not found in stored state", decodedId)
          setStatus("not-found")
          return
        }

        console.log("[proposicion] Found subtopic match", {
          eraId: match.era.id,
          themeId: match.theme.id,
          subtopicId: match.subtopic.id,
        })

        await maybeImportFromClipboard(storedState, match)

        window.localStorage.setItem(
          PENDING_SUBTOPIC_STORAGE_KEY,
          JSON.stringify({
            eraId: match.era.id,
            themeId: match.theme.id,
            subtopicId: match.subtopic.id,
            title: match.subtopic.title ?? match.subtopic.text,
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
