"use client"

import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Play,
  Mic,
  Headphones,
  Home,
  Plus,
  Settings,
  ArrowLeft,
  Loader2,
  RotateCcw,
  History,
} from "lucide-react"
import { SettingsModal } from "@/components/settings-modal"
import { ErasModal, type EraSummary } from "@/components/eras-modal"
import { SubtopicImportModal, type SubtopicImportPayload } from "@/components/subtopic-import-modal"
import { generatePropositionVariant, rewriteProposition } from "./actions"
import {
  GROQ_DEFAULT_VARIANT_PROMPTS,
  GROQ_LEGACY_PROMPT_STORAGE_KEY,
  GROQ_MODEL_STORAGE_KEY,
  GROQ_VARIANT_PROMPTS_STORAGE_KEY,
  type PropositionVariant,
} from "@/lib/groq"
import {
  loadThemes,
  loadAudios,
  saveAppState,
  loadAppState,
  type StoredAppState,
  type StoredEra,
} from "@/lib/storage"
import { PENDING_SUBTOPIC_STORAGE_KEY } from "@/lib/external-subtopics"
import { ensureStringId } from "@/lib/utils"
import {
  isFileSystemSupported,
  requestDirectoryAccess,
  getSavedDirectoryHandle,
  writeJSONFile,
  readJSONFile,
  writeBlobFile,
  readBlobFile,
} from "@/lib/file-system"

type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"

type PropositionKind = PropositionType | "custom"

interface Proposition {
  id: string
  type: PropositionKind
  label: string
  text: string
  audios: Blob[]
}

interface Subtopic {
  id: string
  text: string
  propositions: Proposition[] | null
}

interface Theme {
  id: string
  name: string
  subtopics: Subtopic[]
}
type ViewState = 
  | "themes" 
  | "subtopics" 
  | "overview" 
  | "recording" 
  | "listening" 
  | "countdown" 
  | "prompt"

interface Era {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  closedAt: number | null
  themes: Theme[]
}

const createEraId = () => `era-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const cloneThemes = (themes: Theme[]): Theme[] =>
  themes.map((theme) => ({
    ...theme,
    subtopics: theme.subtopics.map((subtopic) => ({
      ...subtopic,
      propositions: subtopic.propositions
        ? subtopic.propositions.map((prop) => ({
            ...prop,
            audios: [...prop.audios],
          }))
        : null,
    })),
  }))

const cloneEra = (era: Era): Era => ({
  ...era,
  themes: cloneThemes(era.themes),
})

const summarizeEra = (era: Era): EraSummary => {
  let subtopicCount = 0
  let propositionCount = 0
  let audioCount = 0

  for (const theme of era.themes) {
    subtopicCount += theme.subtopics.length
    for (const subtopic of theme.subtopics) {
      if (!subtopic.propositions) continue
      propositionCount += subtopic.propositions.length
      for (const prop of subtopic.propositions) {
        audioCount += prop.audios.length
      }
    }
  }

  return {
    id: era.id,
    name: era.name,
    createdAt: era.createdAt,
    updatedAt: era.updatedAt,
    closedAt: era.closedAt,
    themeCount: era.themes.length,
    subtopicCount,
    propositionCount,
    audioCount,
  }
}

const DEFAULT_INITIAL_THEMES: Theme[] = [
  {
    id: "theme-1",
    name: "Tema de ejemplo",
    subtopics: [
      { id: "1", text: "Si es Derivable entonces es Continuo", propositions: null },
    ],
  },
]

const createBlankEra = (name?: string): Era => {
  const timestamp = Date.now()
  return {
    id: createEraId(),
    name: name ?? `Ciclo ${new Date(timestamp).toLocaleDateString()}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
    themes: [],
  }
}

const propositionTypeLabels: Record<PropositionType, string> = {
  condicion: "Condición",
  reciproco: "Recíproco",
  inverso: "Inverso",
  contrareciproco: "Contra-Recíproco",
}

const STANDARD_PROPOSITION_TYPES: PropositionType[] = [
  "condicion",
  "reciproco",
  "inverso",
  "contrareciproco",
]

const createVariantPromptDefaults = (): Record<PropositionVariant, string> => ({
  reciproco: GROQ_DEFAULT_VARIANT_PROMPTS.reciproco,
  inverso: GROQ_DEFAULT_VARIANT_PROMPTS.inverso,
  contrareciproco: GROQ_DEFAULT_VARIANT_PROMPTS.contrareciproco,
})

const mapIndexToType = (index: number): PropositionKind => {
  switch (index) {
    case 0:
      return "condicion"
    case 1:
      return "reciproco"
    case 2:
      return "inverso"
    case 3:
      return "contrareciproco"
    default:
      return "custom"
  }
}

const getLabelForProposition = (type: PropositionKind, index: number) => {
  if (type !== "custom" && propositionTypeLabels[type]) {
    return propositionTypeLabels[type as PropositionType]
  }
  return `Proposición ${index + 1}`
}

const normalizeStoredEra = (storedEra: StoredEra): Era => {
  const createdAt = storedEra.createdAt ?? Date.now()
  const updatedAt = storedEra.updatedAt ?? createdAt
  const eraId = ensureStringId(storedEra.id, createEraId())

  return {
    id: eraId,
    name: storedEra.name ?? "Ciclo sin nombre",
    createdAt,
    updatedAt,
    closedAt: storedEra.closedAt ?? null,
    themes: (storedEra.themes ?? []).map((theme, themeIndex) => {
      const themeId = ensureStringId(theme.id, `${eraId}-theme-${themeIndex}`)

      return {
        id: themeId,
        name: theme.name ?? `Tema ${themeIndex + 1}`,
        subtopics: (theme.subtopics ?? []).map((subtopic, subIndex) => {
          const subtopicId = ensureStringId(
            subtopic.id,
            `${themeId}-subtopic-${subIndex}`,
          )

          return {
            id: subtopicId,
            text: subtopic.text ?? "",
            propositions: subtopic.propositions
              ? subtopic.propositions.map((prop, propIndex) => ({
                  id: ensureStringId(prop.id, `${subtopicId}-${propIndex}`),
                  type: (prop.type ?? "custom") as PropositionKind,
                  label: prop.label ?? `Proposición ${propIndex + 1}`,
                  text: prop.text ?? "",
                  audios: prop.audios ? [...prop.audios] : [],
                }))
              : null,
          }
        }),
      }
    }),
  }
}

const PRACTICE_VIEW_STATES: ViewState[] = [
  "recording",
  "prompt",
  "listening",
  "countdown",
]
export default function PropositionsApp() {
  const initialTimestamp = useMemo(() => Date.now(), [])
  const [themes, setThemes] = useState<Theme[]>(() => cloneThemes(DEFAULT_INITIAL_THEMES))
  const [currentEra, setCurrentEra] = useState<Era>(() => ({
    id: createEraId(),
    name: "Ciclo inicial",
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp,
    closedAt: null,
    themes: cloneThemes(DEFAULT_INITIAL_THEMES),
  }))
  const [eraHistory, setEraHistory] = useState<Era[]>([])
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(null)
  const [currentSubtopicId, setCurrentSubtopicId] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>("themes")
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showErasModal, setShowErasModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importInitialText, setImportInitialText] = useState("")
  const [importClipboardError, setImportClipboardError] = useState<string | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [generatingPropositionId, setGeneratingPropositionId] = useState<string | null>(null)
  const [generatingVariantId, setGeneratingVariantId] = useState<string | null>(null)

  // 👇 de codex/modify-subtopic-display-behavior
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [showRelaxAnimation, setShowRelaxAnimation] = useState(false)
  const [focusedItem, setFocusedItem] = useState<
    | { scope: "theme"; id: string }
    | { scope: "subtopic"; id: string }
    | { scope: "proposition"; id: string }
    | null
  >(null)
  const [pendingPracticeIndex, setPendingPracticeIndex] = useState<number | null>(null)
  const [pendingExternalNavigation, setPendingExternalNavigation] = useState<
    { eraId: string; themeId: string; subtopicId: string } | null
  >(null)
  const hasTriedExternalNavigationRefresh = useRef(false)
  const hasRefreshedForPendingExternalNavigation = useRef(false)

  // 👇 de main
  const [rewritingPropositionId, setRewritingPropositionId] = useState<string | null>(null)
  const [rewritePreview, setRewritePreview] = useState<{ propositionId: string; text: string } | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [fileSystemHandle, setFileSystemHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [useFileSystem, setUseFileSystem] = useState(false)

  const applyStoredAppState = useCallback((state: StoredAppState) => {
    const normalizedCurrent = normalizeStoredEra(state.currentEra)
    const normalizedHistory = (state.eraHistory ?? []).map(normalizeStoredEra)

    setCurrentEra(normalizedCurrent)
    setThemes(cloneThemes(normalizedCurrent.themes))
    setEraHistory(normalizedHistory)
  }, [])

  const refreshAppStateForExternalNavigation = useCallback(async () => {
    try {
      const storedState = await loadAppState()
      if (storedState) {
        applyStoredAppState(storedState)
      }
    } catch (refreshError) {
      console.error("[v0] Error refreshing app state for external navigation:", refreshError)
    }
  }, [applyStoredAppState])

  useEffect(() => {
    if (isLoadingData) {
      return
    }

    if (typeof window === "undefined") {
      return
    }

    try {
      const raw = window.localStorage.getItem(PENDING_SUBTOPIC_STORAGE_KEY)
      if (!raw) {
        return
      }

      window.localStorage.removeItem(PENDING_SUBTOPIC_STORAGE_KEY)

      const parsed = JSON.parse(raw) as {
        eraId?: string
        themeId?: string
        subtopicId?: string
      } | null

      if (!parsed?.eraId || !parsed.themeId || !parsed.subtopicId) {
        return
      }

      hasTriedExternalNavigationRefresh.current = false
      setPendingExternalNavigation({
        eraId: parsed.eraId,
        themeId: parsed.themeId,
        subtopicId: parsed.subtopicId,
      })
    } catch (error) {
      console.warn("[v0] No se pudo procesar la navegación externa pendiente:", error)
    }
  }, [isLoadingData])

  useEffect(() => {
    if (!pendingExternalNavigation) {
      hasRefreshedForPendingExternalNavigation.current = false
      return
    }

    if (isLoadingData) {
      return
    }

    if (!hasRefreshedForPendingExternalNavigation.current) {
      hasRefreshedForPendingExternalNavigation.current = true
      void refreshAppStateForExternalNavigation()
    }
  }, [
    pendingExternalNavigation,
    isLoadingData,
    refreshAppStateForExternalNavigation,
  ])

  const buildStoredAppState = (): StoredAppState => ({
    currentEra: cloneEra({ ...currentEra, themes: cloneThemes(themes) }) as StoredEra,
    eraHistory: eraHistory.map((era) => cloneEra(era) as StoredEra),
  })

  const closeCurrentCycle = () => {
    if (isLoadingData) return
    const confirmed = window.confirm(
      "¿Cerrar el ciclo actual? Se guardará en el historial y comenzarás uno nuevo.",
    )

    if (!confirmed) {
      return
    }

    const timestamp = Date.now()
    const archivedEra = {
      ...cloneEra({ ...currentEra, themes: cloneThemes(themes) }),
      updatedAt: timestamp,
      closedAt: timestamp,
    }

    setEraHistory((prev) => [archivedEra, ...prev])

    const newEra = createBlankEra(`Nuevo ciclo ${new Date(timestamp).toLocaleDateString()}`)
    setCurrentEra(newEra)
    setThemes([])
    setCurrentThemeId(null)
    setCurrentSubtopicId(null)
    setViewState("themes")
    setPendingPracticeIndex(null)
    setFocusedItem(null)
    setRewritePreview(null)
    setCurrentIndex(0)
    setIsRecording(false)
    setCountdown(5)
    setShowErasModal(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  const handleSelectEra = (eraId: string) => {
    const target = eraHistory.find((era) => era.id === eraId)
    if (!target) {
      return
    }

    const snapshot = cloneEra({ ...currentEra, themes: cloneThemes(themes) })
    const remainingHistory = eraHistory.filter((era) => era.id !== eraId)

    setEraHistory([snapshot, ...remainingHistory])

    const reopenedEra = {
      ...cloneEra(target),
      closedAt: null,
      updatedAt: Date.now(),
    }

    setCurrentEra(reopenedEra)
    setThemes(cloneThemes(target.themes))
    setShowErasModal(false)
    setViewState("themes")
    setCurrentThemeId(null)
    setCurrentSubtopicId(null)
    setPendingPracticeIndex(null)
    setFocusedItem(null)
    setRewritePreview(null)
    setCurrentIndex(0)
    setIsRecording(false)
    setCountdown(5)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  const handleRenameEra = (eraId: string, name: string) => {
    if (eraId === currentEra.id) {
      setCurrentEra((prev) => ({
        ...prev,
        name,
        updatedAt: Date.now(),
      }))
    } else {
      setEraHistory((prev) =>
        prev.map((era) =>
          era.id === eraId
            ? {
                ...era,
                name,
                updatedAt: Date.now(),
              }
            : era,
        ),
      )
    }
  }

  const currentEraSummary = useMemo(() => summarizeEra(currentEra), [currentEra])
  const historySummaries = useMemo(() => eraHistory.map(summarizeEra), [eraHistory])

  const currentTheme = currentThemeId ? themes.find((t) => t.id === currentThemeId) ?? null : null
  const subtopics = currentTheme?.subtopics ?? []
  const currentSubtopic =
    currentSubtopicId && currentTheme
      ? currentTheme.subtopics.find((s) => s.id === currentSubtopicId) ?? null
      : null
  const propositions = currentSubtopic?.propositions || []
  const isPracticeView = PRACTICE_VIEW_STATES.includes(viewState)
  const hasContentAtIndex = useCallback(
    (index: number) => {
      const target = propositions[index]
      return Boolean(target && target.text && target.text.trim().length > 0)
    },
    [propositions],
  )
  const findNextFilledIndex = useCallback(
    (fromIndex: number) => {
      for (let i = fromIndex + 1; i < propositions.length; i += 1) {
        if (hasContentAtIndex(i)) {
          return i
        }
      }
      return -1
    },
    [hasContentAtIndex, propositions.length],
  )
  const findPreviousFilledIndex = useCallback(
    (fromIndex: number) => {
      for (let i = fromIndex - 1; i >= 0; i -= 1) {
        if (hasContentAtIndex(i)) {
          return i
        }
      }
      return -1
    },
    [hasContentAtIndex],
  )
  const canGoToPrevious = findPreviousFilledIndex(currentIndex) !== -1
  const canGoToNext = findNextFilledIndex(currentIndex) !== -1
  const isNavigationLocked = isRecording || viewState === "countdown"
  const isVariantGenerationActive = generatingVariantId !== null
  const isGenerationBusy = generatingVariantId !== null || generatingPropositionId !== null

  const updateThemeById = (themeId: string, updater: (theme: Theme) => Theme) => {
    setThemes((prev) => prev.map((theme) => (theme.id === themeId ? updater(theme) : theme)))
  }

  const updateSubtopicById = (
    themeId: string,
    subtopicId: string,
    updater: (subtopic: Subtopic) => Subtopic,
  ) => {
    updateThemeById(themeId, (theme) => ({
      ...theme,
      subtopics: theme.subtopics.map((subtopic) =>
        subtopic.id === subtopicId ? updater(subtopic) : subtopic,
      ),
    }))
  }

  const ensureStandardPropositions = (themeId: string, subtopicId: string) => {
    updateSubtopicById(themeId, subtopicId, (subtopic) => {
      const existing = subtopic.propositions ?? []

      const standardEntries = STANDARD_PROPOSITION_TYPES.map((type, index) => {
        const existingEntry = existing.find((prop) => prop.type === type) ?? null
        const label = getLabelForProposition(type, index)

        if (existingEntry) {
          const existingText =
            typeof existingEntry.text === "string" ? existingEntry.text : ""
          const hasExistingText = existingText.trim().length > 0
          const resolvedText = hasExistingText
            ? existingText
            : type === "condicion"
              ? subtopic.text
              : ""

          return {
            ...existingEntry,
            id: existingEntry.id ?? `${subtopic.id}-${type}`,
            type,
            label,
            text: resolvedText,
            audios: [...existingEntry.audios],
          }
        }

        const defaultText =
          type === "condicion" && subtopic.text.trim().length > 0
            ? subtopic.text
            : ""

        return {
          id: `${subtopic.id}-${type}`,
          type,
          label,
          text: defaultText,
          audios: [],
        }
      })

      const additionalEntries = existing
        .filter((prop) => !STANDARD_PROPOSITION_TYPES.includes(prop.type as PropositionType))
        .map((prop) => ({ ...prop, audios: [...prop.audios] }))

      return {
        ...subtopic,
        propositions: [...standardEntries, ...additionalEntries],
      }
    })
  }

  useEffect(() => {
    if (!pendingExternalNavigation) {
      return
    }

    const { eraId, themeId, subtopicId } = pendingExternalNavigation

    const requestRefresh = () => {
      if (hasTriedExternalNavigationRefresh.current) {
        return false
      }

      hasTriedExternalNavigationRefresh.current = true
      void refreshAppStateForExternalNavigation()
      return true
    }

    if (eraId !== currentEra.id) {
      const targetEra = eraHistory.find((era) => era.id === eraId)

      if (!targetEra) {
        console.warn("[v0] No se encontró el ciclo solicitado para la navegación externa:", eraId)
        if (requestRefresh()) {
          return
        }

        hasTriedExternalNavigationRefresh.current = false
        setPendingExternalNavigation(null)
        return
      }

      const snapshot = cloneEra({ ...currentEra, themes: cloneThemes(themes) })
      const remainingHistory = eraHistory.filter((era) => era.id !== eraId)

      setEraHistory([snapshot, ...remainingHistory])

      const reopenedEra = {
        ...cloneEra(targetEra),
        closedAt: null,
        updatedAt: Date.now(),
      }

      setCurrentEra(reopenedEra)
      setThemes(cloneThemes(targetEra.themes))
      return
    }

    const theme = themes.find((item) => item.id === themeId)

    if (!theme) {
      console.warn("[v0] No se encontró el tema solicitado para la navegación externa:", themeId)
      if (requestRefresh()) {
        return
      }

      hasTriedExternalNavigationRefresh.current = false
      setPendingExternalNavigation(null)
      return
    }

    const subtopic = theme.subtopics.find((item) => item.id === subtopicId)

    if (!subtopic) {
      console.warn("[v0] No se encontró el subtema solicitado para la navegación externa:", subtopicId)
      if (requestRefresh()) {
        return
      }

      hasTriedExternalNavigationRefresh.current = false
      setPendingExternalNavigation(null)
      return
    }

    ensureStandardPropositions(themeId, subtopicId)

    const initialIndex = subtopic.propositions
      ? subtopic.propositions.findIndex((prop) => prop.text.trim())
      : subtopic.text.trim()
        ? 0
        : -1

    setCurrentThemeId(themeId)
    setCurrentSubtopicId(subtopicId)
    setCurrentIndex(initialIndex >= 0 ? initialIndex : 0)
    setPendingPracticeIndex(null)
    setViewState("overview")

    hasTriedExternalNavigationRefresh.current = false
    setPendingExternalNavigation(null)
  }, [
    pendingExternalNavigation,
    currentEra,
    eraHistory,
    themes,
    ensureStandardPropositions,
    refreshAppStateForExternalNavigation,
  ])

  const getGroqSettings = (): {
    model?: string
    variantPrompts: Record<PropositionVariant, string>
  } => {
    const defaults = createVariantPromptDefaults()

    if (typeof window === "undefined") {
      return { model: undefined, variantPrompts: defaults }
    }

    try {
      const storedModel = window.localStorage.getItem(GROQ_MODEL_STORAGE_KEY)
      const storedPrompts = window.localStorage.getItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY)

      const prompts: Record<PropositionVariant, string> = { ...defaults }

      if (storedPrompts) {
        try {
          const parsed = JSON.parse(storedPrompts)
          if (parsed && typeof parsed === "object") {
            (Object.keys(prompts) as PropositionVariant[]).forEach((variant) => {
              if (typeof parsed[variant] === "string") {
                prompts[variant] = String(parsed[variant])
              }
            })
          }
        } catch (parseError) {
          console.warn("[v0] No se pudieron analizar los prompts de Groq:", parseError)
        }
      } else {
        const legacyPrompt = window.localStorage.getItem(GROQ_LEGACY_PROMPT_STORAGE_KEY)
        if (legacyPrompt) {
          (Object.keys(prompts) as PropositionVariant[]).forEach((variant) => {
            prompts[variant] = legacyPrompt
          })
        }
      }

      return {
        model: storedModel ?? undefined,
        variantPrompts: prompts,
      }
    } catch (error) {
      console.warn("[v0] No se pudieron leer los ajustes de Groq:", error)
      return { model: undefined, variantPrompts: defaults }
    }
  }

  const generateVariantForSubtopic = async (proposition: Proposition) => {
    if (!currentThemeId || !currentSubtopicId || !currentSubtopic) {
      return
    }

    if (proposition.type === "condicion" || proposition.type === "custom") {
      return
    }

    if (!currentSubtopic.text.trim()) {
      alert("Agrega una condición antes de generar nuevas proposiciones.")
      return
    }

    const { model, variantPrompts } = getGroqSettings()
    const variantType = proposition.type as PropositionVariant
    const promptTemplate = variantPrompts[variantType]
    setGeneratingVariantId(proposition.id)

    try {
      const result = await generatePropositionVariant(
        currentSubtopic.text,
        variantType,
        model,
        promptTemplate,
      )

      if ("error" in result) {
        throw new Error(result.error)
      }

      updateSubtopicById(currentThemeId, currentSubtopicId, (subtopic) => {
        if (!subtopic.propositions) {
          return subtopic
        }

        const index = subtopic.propositions.findIndex((prop) => prop.id === proposition.id)
        if (index === -1) {
          return subtopic
        }

        const updated = [...subtopic.propositions]
        updated[index] = { ...updated[index], text: result.text }

        return {
          ...subtopic,
          propositions: updated,
        }
      })
    } catch (error) {
      console.error("[v0] Error generating proposition variant:", error)
      alert("Error al generar la proposición. Intenta nuevamente.")
    } finally {
      setGeneratingVariantId(null)
    }
  }

  const handleImportModalOpenChange = (open: boolean) => {
    setShowImportModal(open)
    if (!open) {
      setImportClipboardError(null)
    }
  }

  const handleImportModalSubmit = ({ rawText, diagnostics }: SubtopicImportPayload) => {
    if (!currentThemeId) {
      return
    }

    try {
      const parsed = diagnostics.parsed ?? []

      if (!parsed.length) {
        throw new Error("El contenido importado está vacío.")
      }

      const [subtopicInfo, ...propositionEntries] = parsed

      if (!subtopicInfo || typeof subtopicInfo.texto !== "string") {
        throw new Error("El primer elemento debe incluir la propiedad 'texto'.")
      }

      const newSubtopicId = `subtopic-${Date.now()}`

      const propositions: Proposition[] | null = propositionEntries.length
        ? propositionEntries.map((entry: any, index: number) => {
            const rawTextValue =
              typeof entry === "string"
                ? entry
                : entry?.texto ?? (typeof entry === "number" ? entry.toString() : "")
            const textValue =
              typeof rawTextValue === "string" ? rawTextValue : String(rawTextValue ?? "")

            const incomingType = entry?.tipo as PropositionKind | undefined
            const baseType = incomingType ?? "custom"
            const label =
              typeof entry?.etiqueta === "string"
                ? entry.etiqueta
                : baseType !== "custom" && propositionTypeLabels[baseType as PropositionType]
                  ? propositionTypeLabels[baseType as PropositionType]
                  : getLabelForProposition(baseType, index)

            return {
              id: `${newSubtopicId}-${index}`,
              type: baseType,
              label,
              text: textValue,
              audios: [],
            }
          })
        : null

      updateThemeById(currentThemeId, (theme) => ({
        ...theme,
        subtopics: [
          ...theme.subtopics,
          {
            id: newSubtopicId,
            text: subtopicInfo.texto,
            propositions,
          },
        ],
      }))

      const normalizedText = diagnostics.normalizedText || rawText.trim()
      setImportInitialText(normalizedText)
      setShowImportModal(false)
      setImportClipboardError(null)

      if (typeof window !== "undefined") {
        try {
          if (normalizedText) {
            window.localStorage.setItem("subtopic-import:last-text", normalizedText)
          }

          if (diagnostics.appliedFixes.length) {
            window.localStorage.setItem(
              "subtopic-import:last-fixes",
              JSON.stringify(diagnostics.appliedFixes),
            )
          } else {
            window.localStorage.removeItem("subtopic-import:last-fixes")
          }
        } catch (storageError) {
          console.warn("[v0] No se pudo guardar el historial de importación:", storageError)
        }
      }
    } catch (error: any) {
      console.error("[v0] Error importing subtopic:", error)
      alert(
        error?.message
          ? `No se pudo importar el subtema: ${error.message}`
          : "No se pudo importar el subtema con el contenido proporcionado.",
      )
    }
  }

  const sharedModals = (
    <>
      <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
      <ErasModal
        open={showErasModal}
        onOpenChange={setShowErasModal}
        currentEra={currentEraSummary}
        history={historySummaries}
        onSelectEra={handleSelectEra}
        onRenameEra={handleRenameEra}
      />
      <SubtopicImportModal
        open={showImportModal}
        initialText={importInitialText}
        clipboardError={importClipboardError}
        onOpenChange={handleImportModalOpenChange}
        onSubmit={handleImportModalSubmit}
      />
    </>
  )

  const deleteTheme = (themeId: string) => {
    setThemes((prev) => prev.filter((theme) => theme.id !== themeId))
    if (currentThemeId === themeId) {
      setCurrentThemeId(null)
      setCurrentSubtopicId(null)
      setViewState("themes")
    }
    if (focusedItem?.scope === "theme" && focusedItem.id === themeId) {
      setFocusedItem(null)
    }
  }

  const deleteSubtopic = (subtopicId: string) => {
    if (!currentThemeId) return

    const isDeletingCurrent = currentSubtopicId === subtopicId

    updateThemeById(currentThemeId, (theme) => ({
      ...theme,
      subtopics: theme.subtopics.filter((subtopic) => subtopic.id !== subtopicId),
    }))

    if (isDeletingCurrent) {
      setCurrentSubtopicId(null)
      if (viewState !== "subtopics") {
        setViewState("subtopics")
      }
    }

    if (focusedItem?.scope === "subtopic" && focusedItem.id === subtopicId) {
      setFocusedItem(null)
    }
  }

  const deleteProposition = (propositionId: string) => {
    if (!currentThemeId || !currentSubtopicId) return

    const remainingPropositions = (currentSubtopic?.propositions ?? []).filter(
      (prop) => prop.id !== propositionId,
    )

    setThemes((prevThemes) =>
      prevThemes.map((theme) => {
        if (theme.id !== currentThemeId) {
          return theme
        }

        return {
          ...theme,
          subtopics: theme.subtopics.map((subtopic) => {
            if (subtopic.id !== currentSubtopicId || !subtopic.propositions) {
              return subtopic
            }

            const filtered = subtopic.propositions.filter((prop) => prop.id !== propositionId)

            return {
              ...subtopic,
              propositions: filtered.length > 0 ? filtered : [],
            }
          }),
        }
      }),
    )

    ensureStandardPropositions(currentThemeId, currentSubtopicId)

    if (remainingPropositions.length === 0) {
      setCurrentIndex(0)
    } else {
      setCurrentIndex((prev) => Math.min(prev, remainingPropositions.length - 1))
    }

    if (focusedItem?.scope === "proposition" && focusedItem.id === propositionId) {
      setFocusedItem(null)
    }
  }

  const deleteFocusedItem = () => {
    if (!focusedItem) return

    switch (focusedItem.scope) {
      case "theme":
        deleteTheme(focusedItem.id)
        break
      case "subtopic":
        deleteSubtopic(focusedItem.id)
        break
      case "proposition":
        deleteProposition(focusedItem.id)
        break
    }
  }

  const MathText = ({ text }: { text: string }) => {
    const [isKatexReady, setIsKatexReady] = useState(
      typeof window !== "undefined" && Boolean((window as any).katex),
    )
    const segments = useMemo(() => {
      const tokens: { type: "text" | "math"; content: string; display: boolean }[] = []
      if (!text) {
        return [{ type: "text", content: "", display: false }]
      }

      const regex = /\$\$(.+?)\$\$|\$(.+?)\$/gs
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        const [fullMatch, displayMath, inlineMath] = match
        const startIndex = match.index

        if (startIndex > lastIndex) {
          tokens.push({
            type: "text",
            content: text.slice(lastIndex, startIndex),
            display: false,
          })
        }

        const mathContent = (displayMath ?? inlineMath ?? "").trim()
        tokens.push({
          type: "math",
          content: mathContent,
          display: Boolean(displayMath),
        })

        lastIndex = startIndex + fullMatch.length
      }

      if (lastIndex < text.length) {
        tokens.push({ type: "text", content: text.slice(lastIndex), display: false })
      }

      if (tokens.length === 0) {
        tokens.push({ type: "text", content: text, display: false })
      }

      return tokens
    }, [text])

    const segmentRefs = useRef<(HTMLSpanElement | null)[]>([])

    useEffect(() => {
      if (typeof window === "undefined") return
      if ((window as any).katex) {
        setIsKatexReady(true)
        return
      }

      if (!document.getElementById("katex-styles")) {
        const link = document.createElement("link")
        link.id = "katex-styles"
        link.rel = "stylesheet"
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        document.head.appendChild(link)
      }

      const existingScript = document.getElementById("katex-script") as HTMLScriptElement | null
      if (existingScript) {
        const handleLoad = () => setIsKatexReady(true)
        if ((window as any).katex) {
          setIsKatexReady(true)
        } else {
          existingScript.addEventListener("load", handleLoad, { once: true })
        }
        return
      }

      const script = document.createElement("script")
      script.id = "katex-script"
      script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
      script.async = true
      script.onload = () => setIsKatexReady(true)
      script.onerror = () => console.error("No se pudo cargar KaTeX")
      document.head.appendChild(script)
    }, [])

    useEffect(() => {
      if (!isKatexReady) return
      const katex = (window as any).katex
      if (!katex) return

      segments.forEach((segment, index) => {
        if (segment.type === "math") {
          const element = segmentRefs.current[index]
          if (element) {
            try {
              katex.render(segment.content, element, {
                throwOnError: false,
                displayMode: segment.display,
              })
            } catch (error) {
              console.error("[v0] Error rendering KaTeX:", error)
              element.textContent = segment.content
            }
          }
        }
      })
    }, [isKatexReady, segments])

    return (
      <span className="math-text whitespace-pre-wrap break-words">
        {segments.map((segment, index) => {
          if (segment.type === "math") {
            return (
              <span
                key={index}
                ref={(el) => {
                  segmentRefs.current[index] = el
                }}
                className={segment.display ? "block my-2" : "inline"}
              />
            )
          }

          return <span key={index}>{segment.content}</span>
        })}
      </span>
    )
  }

  const mediaRecorder = mediaRecorderRef.current

  const handleNavigateProposition = useCallback(
    (direction: "previous" | "next") => {
      if (!isPracticeView) {
        return
      }

      if (isRecording || viewState === "countdown") {
        return
      }

      const targetIndex =
        direction === "previous"
          ? findPreviousFilledIndex(currentIndex)
          : findNextFilledIndex(currentIndex)

      if (targetIndex === -1) {
        return
      }

      if (audioRef.current) {
        const currentAudio = audioRef.current
        currentAudio.pause()
        if (currentAudio.src && currentAudio.src.startsWith("blob:")) {
          URL.revokeObjectURL(currentAudio.src)
        }
        audioRef.current = null
      }

      setCurrentIndex(targetIndex)
      setCountdown(5)
      setViewState("recording")
    },
    [
      currentIndex,
      findNextFilledIndex,
      findPreviousFilledIndex,
      isPracticeView,
      isRecording,
      viewState,
    ],
  )

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)

      if (isTyping) {
        return
      }

      if (e.key.toLowerCase() === "g") {
        e.preventDefault()
        closeCurrentCycle()
        return
      }

      if (e.key.toLowerCase() === "h") {
        e.preventDefault()
        setShowErasModal(true)
        return
      }

      if (e.key === " " && viewState === "overview") {
        e.preventDefault()
        const firstAvailable = findNextFilledIndex(-1)
        if (firstAvailable !== -1) {
          setCurrentIndex(firstAvailable)
          setViewState("recording")
          setCountdown(5)
        }
        return
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (isPracticeView) {
          e.preventDefault()
          handleNavigateProposition(e.key === "ArrowLeft" ? "previous" : "next")
        }
        return
      }

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        if ((viewState === "recording" || viewState === "prompt") && !mediaRecorderRef.current) {
          startRecording()
        } else if (mediaRecorderRef.current) {
          stopRecording()
        }
      }

      if (e.key.toLowerCase() === "q" || e.key.toLowerCase() === "x") {
        if (
          viewState === "themes" ||
          viewState === "subtopics" ||
          viewState === "overview"
        ) {
          e.preventDefault()
          deleteFocusedItem()
        }
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [
    viewState,
    propositions.length,
    mediaRecorder,
    focusedItem,
    currentThemeId,
    currentSubtopicId,
    isPracticeView,
    handleNavigateProposition,
    findNextFilledIndex,
  ])

  useEffect(() => {
    setFocusedItem(null)
  }, [viewState])

  useEffect(() => {
    if (isLoadingData) return
    setCurrentEra((prev) => ({
      ...prev,
      themes: cloneThemes(themes),
      updatedAt: Date.now(),
    }))
  }, [themes, isLoadingData])

  useEffect(() => {
    loadPersistedData()
  }, [])

  const loadPersistedData = async () => {
    try {
      console.log("[v0] Starting to load persisted data...")

      let storedState: StoredAppState | null = null
      let fileSystemState: StoredAppState | null = null

      let shouldPreferIndexedDb = false
      if (typeof window !== "undefined") {
        try {
          shouldPreferIndexedDb = Boolean(
            window.localStorage.getItem(PENDING_SUBTOPIC_STORAGE_KEY),
          )
          if (shouldPreferIndexedDb) {
            console.log(
              "[v0] Pending external navigation detected, preferring IndexedDB data",
            )
          }
        } catch (error) {
          console.warn(
            "[v0] Could not inspect pending external navigation flag:",
            error,
          )
        }
      }

      if (isFileSystemSupported()) {
        const handle = await getSavedDirectoryHandle()
        if (handle) {
          console.log("[v0] Found saved file system handle, loading from file system...")
          setFileSystemHandle(handle)
          setUseFileSystem(true)
          fileSystemState = await loadFromFileSystem(handle)

          if (fileSystemState && !shouldPreferIndexedDb) {
            applyStoredAppState(fileSystemState)
            setIsLoadingData(false)
            console.log("[v0] Successfully loaded from file system")
            return
          }

          if (fileSystemState && shouldPreferIndexedDb) {
            console.log(
              "[v0] Loaded state from file system but will prefer IndexedDB for freshness",
            )
          }
        }
      }

      if (!storedState) {
        storedState = await loadAppState()
      }

      if (storedState) {
        console.log("[v0] Loaded app state from IndexedDB")
        applyStoredAppState(storedState)
        setIsLoadingData(false)
        return
      }

      if (fileSystemState) {
        console.log("[v0] Falling back to file system state after IndexedDB miss")
        applyStoredAppState(fileSystemState)
        setIsLoadingData(false)
        return
      }

      console.log("[v0] Loading legacy data from IndexedDB...")
      const loadedThemes = await loadThemes()

      if (loadedThemes.length === 0) {
        console.log("[v0] No legacy themes found in IndexedDB")
        const freshEra = {
          ...createBlankEra("Ciclo inicial"),
          themes: cloneThemes(DEFAULT_INITIAL_THEMES),
        }
        setCurrentEra(freshEra)
        setThemes(cloneThemes(freshEra.themes))
        setEraHistory([])
        setIsLoadingData(false)
        return
      }

      const firstTheme = loadedThemes[0] as any
      let migratedThemes: Theme[] = []

      if (firstTheme && !("name" in firstTheme)) {
        console.log("[v0] Legacy subtopics structure detected, converting to themes")
        const legacySubtopics: any[] = loadedThemes as any[]

        const legacySubtopicsWithAudios: Subtopic[] = await Promise.all(
          legacySubtopics.map(async (subtopic: any, subtopicIndex: number) => {
            const fallbackSubtopicId = `legacy-${subtopicIndex}`
            const subtopicId = ensureStringId(subtopic.id, fallbackSubtopicId)

            if (!subtopic.propositions) {
              return {
                id: subtopicId,
                text: subtopic.text ?? "",
                propositions: null,
              }
            }

            const audiosGrouped = await loadAudios(subtopicId)
            const propositionsWithAudios: Proposition[] = subtopic.propositions.map(
              (prop: any, propIndex: number) => {
                const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind
                const fallbackPropId = `${subtopicId}-${propIndex}`

                return {
                  id: ensureStringId(prop.id, fallbackPropId),
                  type,
                  label: prop.label ?? getLabelForProposition(type, propIndex),
                  text: prop.text ?? "",
                  audios: audiosGrouped[propIndex] || [],
                }
              },
            )

            return {
              id: subtopicId,
              text: subtopic.text ?? "",
              propositions: propositionsWithAudios,
            }
          }),
        )

        migratedThemes = [
          {
            id: "legacy-theme",
            name: "Tema legado",
            subtopics: legacySubtopicsWithAudios,
          },
        ]
      } else {
        migratedThemes = await Promise.all(
          loadedThemes.map(async (theme: any, themeIndex: number) => {
            const fallbackThemeId = `theme-${themeIndex}`
            const themeId = ensureStringId(theme.id, fallbackThemeId)

            const subtopicsWithAudios: Subtopic[] = await Promise.all(
              (theme.subtopics || []).map(async (subtopic: any, subtopicIndex: number) => {
                const fallbackSubtopicId = `${themeId}-subtopic-${subtopicIndex}`
                const subtopicId = ensureStringId(subtopic.id, fallbackSubtopicId)

                if (!subtopic.propositions) {
                  return {
                    id: subtopicId,
                    text: subtopic.text ?? "",
                    propositions: null,
                  }
                }

                const audiosGrouped = await loadAudios(subtopicId)
                const propositionsWithAudios: Proposition[] = subtopic.propositions.map(
                  (prop: any, propIndex: number) => {
                    const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind
                    const fallbackPropId = `${subtopicId}-${propIndex}`

                    return {
                      id: ensureStringId(prop.id, fallbackPropId),
                      type,
                      label: prop.label ?? getLabelForProposition(type, propIndex),
                      text: prop.text ?? "",
                      audios: audiosGrouped[propIndex] || [],
                    }
                  },
                )

                return {
                  id: subtopicId,
                  text: subtopic.text ?? "",
                  propositions: propositionsWithAudios,
                }
              }),
            )

            return {
              id: themeId,
              name: theme.name ?? `Tema ${themeIndex + 1}`,
              subtopics: subtopicsWithAudios,
            }
          }),
        )
      }

      const migratedEra: Era = {
        id: createEraId(),
        name: "Ciclo migrado",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        closedAt: null,
        themes: migratedThemes,
      }

      setCurrentEra(migratedEra)
      setThemes(cloneThemes(migratedEra.themes))
      setEraHistory([])
      await saveAppState({
        currentEra: cloneEra(migratedEra) as StoredEra,
        eraHistory: [],
      })
    } catch (error) {
      console.error("[v0] Error loading persisted data:", error)
    } finally {
      setIsLoadingData(false)
      console.log("[v0] Finished loading persisted data")
    }
  }

  const loadFromFileSystem = async (
    handle: FileSystemDirectoryHandle,
  ): Promise<StoredAppState | null> => {
    try {
      console.log("[v0] Reading app-state.json from file system...")
      const stateData = await readJSONFile(handle, "app-state.json")

      const readAudioBlob = async (
        eraId: string,
        subtopicId: string,
        propIndex: number,
        audioIndex: number,
      ) => {
        const modernFilename = `audio-${eraId}-${subtopicId}-${propIndex}-${audioIndex}.webm`
        let blob = await readBlobFile(handle, modernFilename)
        if (!blob) {
          const legacyFilename = `audio-${subtopicId}-${propIndex}-${audioIndex}.webm`
          blob = await readBlobFile(handle, legacyFilename)
        }
        return blob
      }

      const hydrateEra = async (rawEra: any, fallbackName: string, index: number): Promise<StoredEra> => {
        const eraId = ensureStringId(rawEra?.id, createEraId())
        const createdAt = rawEra?.createdAt ?? Date.now()
        const updatedAt = rawEra?.updatedAt ?? createdAt
        const themes = await Promise.all(
          ((rawEra?.themes as any[]) ?? []).map(async (theme, themeIndex) => {
            const themeId = ensureStringId(theme?.id, `${eraId}-theme-${themeIndex}`)
            const subtopics = await Promise.all(
              ((theme?.subtopics as any[]) ?? []).map(async (subtopic, subIndex) => {
                const subtopicId = ensureStringId(
                  subtopic?.id,
                  `${themeId}-subtopic-${subIndex}`,
                )
                const propositionsRaw = subtopic?.propositions as any[] | null

                if (!propositionsRaw) {
                  return {
                    id: subtopicId,
                    text: subtopic?.text ?? "",
                    propositions: null,
                  }
                }

                const propositions = await Promise.all(
                  propositionsRaw.map(async (prop, propIndex) => {
                    const audioCount = typeof prop?.audioCount === "number" ? prop.audioCount : undefined
                    const audios: Blob[] = []

                    if (typeof audioCount === "number") {
                      for (let audioIndex = 0; audioIndex < audioCount; audioIndex++) {
                        const blob = await readAudioBlob(eraId, subtopicId, propIndex, audioIndex)
                        if (blob) {
                          audios.push(blob)
                        }
                      }
                    } else {
                      let audioIndex = 0
                      while (true) {
                        const blob = await readAudioBlob(eraId, subtopicId, propIndex, audioIndex)
                        if (!blob) break
                        audios.push(blob)
                        audioIndex++
                      }
                    }

                    const type = (prop?.type ?? "custom") as PropositionKind

                    return {
                      id: ensureStringId(prop?.id, `${subtopicId}-${propIndex}`),
                      type,
                      label: prop?.label ?? getLabelForProposition(type, propIndex),
                      text: prop?.text ?? "",
                      audios,
                    }
                  }),
                )

                return {
                  id: subtopicId,
                  text: subtopic?.text ?? "",
                  propositions,
                }
              }),
            )

            return {
              id: themeId,
              name: theme?.name ?? `Tema ${themeIndex + 1}`,
              subtopics,
            }
          }),
        )

        return {
          id: eraId,
          name: rawEra?.name ?? `${fallbackName} ${index + 1}`,
          createdAt,
          updatedAt,
          closedAt: rawEra?.closedAt ?? null,
          themes,
        }
      }

      if (stateData && typeof stateData === "object") {
        const currentEra = await hydrateEra(stateData.currentEra, "Ciclo", 0)
        const historyRaw: any[] = Array.isArray(stateData.eraHistory) ? stateData.eraHistory : []
        const history = await Promise.all(historyRaw.map((era, index) => hydrateEra(era, "Ciclo", index + 1)))

        return {
          currentEra,
          eraHistory: history,
        }
      }

      console.log("[v0] app-state.json not found, falling back to themes.json")

      let legacyData = await readJSONFile(handle, "themes.json")
      if (!legacyData) {
        console.log("[v0] themes.json not found, trying legacy subtopics.json")
        legacyData = await readJSONFile(handle, "subtopics.json")
      }

      if (!legacyData || !Array.isArray(legacyData)) {
        console.log("[v0] No valid data found in file system")
        return null
      }

      const firstTheme = legacyData[0] as any

      if (firstTheme && !("name" in firstTheme)) {
        const legacySubtopicsWithAudios: Subtopic[] = await Promise.all(
          legacyData.map(async (subtopic: any, subtopicIndex: number) => {
            const fallbackSubtopicId = `legacy-${subtopicIndex}`
            const subtopicId = ensureStringId(subtopic.id, fallbackSubtopicId)

            if (!subtopic.propositions) {
              return {
                id: subtopicId,
                text: subtopic.text ?? "",
                propositions: null,
              }
            }

            const propositionsWithAudios = await Promise.all(
              subtopic.propositions.map(async (prop: any, propIndex: number) => {
                const audios: Blob[] = []
                let audioIndex = 0

                while (true) {
                  const filename = `audio-${subtopicId}-${propIndex}-${audioIndex}.webm`
                  const blob = await readBlobFile(handle, filename)
                  if (!blob) break
                  audios.push(blob)
                  audioIndex++
                }

                const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind
                const fallbackPropId = `${subtopicId}-${propIndex}`

                return {
                  id: ensureStringId(prop.id, fallbackPropId),
                  type,
                  label: prop.label ?? getLabelForProposition(type, propIndex),
                  text: prop.text ?? "",
                  audios,
                }
              }),
            )

            return {
              id: subtopicId,
              text: subtopic.text ?? "",
              propositions: propositionsWithAudios,
            }
          }),
        )

        return {
          currentEra: {
            id: createEraId(),
            name: "Ciclo desde archivos",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            closedAt: null,
            themes: [
              {
                id: "legacy-theme",
                name: "Tema legado",
                subtopics: legacySubtopicsWithAudios,
              },
            ],
          },
          eraHistory: [],
        }
      }

      const themesWithAudios: Theme[] = await Promise.all(
        legacyData.map(async (theme: any, themeIndex: number) => {
          const fallbackThemeId = `theme-${themeIndex}`
          const themeId = ensureStringId(theme.id, fallbackThemeId)

          const subtopicsWithAudios: Subtopic[] = await Promise.all(
            (theme.subtopics || []).map(async (subtopic: any, subtopicIndex: number) => {
              const fallbackSubtopicId = `${themeId}-subtopic-${subtopicIndex}`
              const subtopicId = ensureStringId(subtopic.id, fallbackSubtopicId)

              if (!subtopic.propositions) {
                return {
                  id: subtopicId,
                  text: subtopic.text ?? "",
                  propositions: null,
                }
              }

              const propositionsWithAudios = await Promise.all(
                subtopic.propositions.map(async (prop: any, propIndex: number) => {
                  const audios: Blob[] = []
                  let audioIndex = 0

                  while (true) {
                    const filename = `audio-${subtopicId}-${propIndex}-${audioIndex}.webm`
                    const blob = await readBlobFile(handle, filename)
                    if (!blob) break
                    audios.push(blob)
                    audioIndex++
                  }

                  const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind
                  const fallbackPropId = `${subtopicId}-${propIndex}`

                  return {
                    id: ensureStringId(prop.id, fallbackPropId),
                    type,
                    label: prop.label ?? getLabelForProposition(type, propIndex),
                    text: prop.text ?? "",
                    audios,
                  }
                }),
              )

              return {
                id: subtopicId,
                text: subtopic.text ?? "",
                propositions: propositionsWithAudios,
              }
            }),
          )

          return {
            id: themeId,
            name: theme.name ?? `Tema ${themeIndex + 1}`,
            subtopics: subtopicsWithAudios,
          }
        }),
      )

      return {
        currentEra: {
          id: createEraId(),
          name: "Ciclo desde archivos",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          closedAt: null,
          themes: themesWithAudios,
        },
        eraHistory: [],
      }
    } catch (error) {
      console.error("[v0] Error loading from file system:", error)
      return null
    }
  }

  useEffect(() => {
    if (!isLoadingData) {
      saveData()
    }
  }, [themes, eraHistory, currentEra, useFileSystem, fileSystemHandle, isLoadingData])

  const saveData = async () => {
    try {
      const appState = buildStoredAppState()
      await saveAppState(appState)

      if (useFileSystem && fileSystemHandle) {
        await saveToFileSystem(fileSystemHandle, appState)
      }
    } catch (error) {
      console.error("[v0] Error saving data:", error)
    }
  }

  const saveToFileSystem = async (
    handle: FileSystemDirectoryHandle,
    appState: StoredAppState,
  ) => {
    try {
      const prepareEraForJson = (era: StoredEra) => ({
        id: era.id,
        name: era.name,
        createdAt: era.createdAt,
        updatedAt: era.updatedAt,
        closedAt: era.closedAt,
        themes: era.themes.map((theme) => ({
          id: theme.id,
          name: theme.name,
          subtopics: theme.subtopics.map((subtopic) => ({
            id: subtopic.id,
            text: subtopic.text,
            propositions: subtopic.propositions
              ? subtopic.propositions.map((prop) => ({
                  id: prop.id,
                  type: prop.type,
                  label: prop.label,
                  text: prop.text,
                  audioCount: prop.audios.length,
                }))
              : null,
          })),
        })),
      })

      const jsonPayload = {
        currentEra: prepareEraForJson(appState.currentEra),
        eraHistory: appState.eraHistory.map(prepareEraForJson),
      }

      await writeJSONFile(handle, "app-state.json", jsonPayload)
      await writeJSONFile(
        handle,
        "themes.json",
        appState.currentEra.themes.map((theme) => ({
          id: theme.id,
          name: theme.name,
          subtopics: theme.subtopics.map((subtopic) => ({
            id: subtopic.id,
            text: subtopic.text,
            propositions: subtopic.propositions
              ? subtopic.propositions.map((prop) => ({
                  id: prop.id,
                  type: prop.type,
                  label: prop.label,
                  text: prop.text,
                }))
              : null,
          })),
        })),
      )

      const erasToPersist = [appState.currentEra, ...appState.eraHistory]

      for (const era of erasToPersist) {
        for (const theme of era.themes) {
          for (const subtopic of theme.subtopics) {
            if (!subtopic.propositions) continue
            for (let propIndex = 0; propIndex < subtopic.propositions.length; propIndex++) {
              const prop = subtopic.propositions[propIndex]
              for (let audioIndex = 0; audioIndex < prop.audios.length; audioIndex++) {
                const filename = `audio-${era.id}-${subtopic.id}-${propIndex}-${audioIndex}.webm`
                await writeBlobFile(handle, filename, prop.audios[audioIndex])
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[v0] Error saving to file system:", error)
    }
  }

  const activateFileSystemPersistence = async () => {
    try {
      const handle = await requestDirectoryAccess()
      if (handle) {
        setFileSystemHandle(handle)
        setUseFileSystem(true)
        // Save current data to file system
        await saveToFileSystem(handle, buildStoredAppState())
      }
    } catch (error: any) {
      if (error?.message?.includes("Cross origin") || error?.message?.includes("cross-origin")) {
        alert(
          "La persistencia de archivos no está disponible en el preview.\n\n" +
            "Para usar esta función:\n" +
            "1. Despliega la aplicación en Vercel\n" +
            "2. O descarga el código y ejecútalo localmente\n\n" +
            "Mientras tanto, tus datos se guardan automáticamente en el navegador usando IndexedDB.",
        )
      } else {
        console.error("[v0] Error activating file system persistence:", error)
      }
    }
  }

  const addTheme = () => {
    const newTheme: Theme = {
      id: `theme-${Date.now()}`,
      name: "Nuevo tema",
      subtopics: [],
    }
    setThemes((prev) => [...prev, newTheme])
  }

  const updateThemeName = (id: string, name: string) => {
    updateThemeById(id, (theme) => ({
      ...theme,
      name,
    }))
  }

  const openTheme = (id: string) => {
    setCurrentThemeId(id)
    setCurrentSubtopicId(null)
    setViewState("subtopics")
  }

  const importSubtopicFromClipboard = async () => {
    if (!currentThemeId) return

    let clipboardText = ""
    let clipboardError: string | null = null

    if (navigator.clipboard?.readText) {
      try {
        clipboardText = await navigator.clipboard.readText()
      } catch (error) {
        console.error("[v0] Error reading clipboard:", error)
        clipboardError =
          "No se pudo leer el portapapeles automáticamente. Pega o ajusta el contenido manualmente."
      }
    } else {
      clipboardError =
        "El navegador no permite leer el portapapeles automáticamente. Pega el contenido manualmente."
    }

    let initialText = clipboardText
    let reuseMessage = ""

    if (!initialText && typeof window !== "undefined") {
      try {
        const lastText = window.localStorage.getItem("subtopic-import:last-text")
        if (lastText) {
          initialText = lastText
          reuseMessage =
            "Se cargó el último formato importado para ayudarte a reutilizarlo o corregirlo rápidamente."
        }
      } catch (storageError) {
        console.warn("[v0] No se pudo recuperar el historial de importación:", storageError)
      }
    }

    const combinedMessage = clipboardError
      ? reuseMessage
        ? `${clipboardError} ${reuseMessage}`
        : clipboardError
      : reuseMessage

    setImportInitialText(initialText ?? "")
    setImportClipboardError(combinedMessage || null)
    setShowImportModal(true)
  }

  const addSubtopic = () => {
    if (!currentThemeId) return

    const newSubtopic: Subtopic = {
      id: Date.now().toString(),
      text: "",
      propositions: null,
    }

    updateThemeById(currentThemeId, (theme) => ({
      ...theme,
      subtopics: [...theme.subtopics, newSubtopic],
    }))
  }

  const updateSubtopicText = (id: string, text: string) => {
    if (!currentThemeId) return

    updateSubtopicById(currentThemeId, id, (subtopic) => {
      const updated: Subtopic = {
        ...subtopic,
        text,
      }

      if (subtopic.propositions) {
        updated.propositions = subtopic.propositions.map((prop) =>
          prop.type === "condicion"
            ? {
                ...prop,
                text,
              }
            : prop,
        )
      }

      return updated
    })
  }

  const openSubtopicDetail = (subtopicId: string) => {
    if (!currentThemeId) return

    const theme = themes.find((t) => t.id === currentThemeId)
    const subtopic = theme?.subtopics.find((item) => item.id === subtopicId)

    if (!subtopic) {
      return
    }

    ensureStandardPropositions(currentThemeId, subtopicId)

    const initialIndex = subtopic.propositions
      ? subtopic.propositions.findIndex((prop) => prop.text.trim())
      : subtopic.text.trim()
        ? 0
        : -1

    setCurrentSubtopicId(subtopicId)
    setCurrentIndex(initialIndex >= 0 ? initialIndex : 0)
    setPendingPracticeIndex(null)
    setViewState("overview")
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })

        if (currentThemeId && currentSubtopicId) {
          updateSubtopicById(currentThemeId, currentSubtopicId, (subtopic) => {
            if (!subtopic.propositions) {
              return subtopic
            }

            if (!subtopic.propositions[currentIndex]) {
              return subtopic
            }

            const newPropositions = [...subtopic.propositions]
            newPropositions[currentIndex] = {
              ...newPropositions[currentIndex],
              audios: [...newPropositions[currentIndex].audios, audioBlob],
            }

            return {
              ...subtopic,
              propositions: newPropositions,
            }
          })
        }

        setIsRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        setViewState("countdown")
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error("[v0] Error accessing microphone:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      setIsRecording(false)
    }
  }

  useEffect(() => {
    if (viewState === "countdown" && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (viewState === "countdown" && countdown === 0) {
      playAudio()
    }
  }, [viewState, countdown])

  const playAudio = () => {
    const audios = propositions[currentIndex]?.audios || []
    if (audios.length > 0) {
      const latestAudio = audios[audios.length - 1]
      const audioUrl = URL.createObjectURL(latestAudio)
      const audioElement = new Audio(audioUrl)
      audioRef.current = audioElement

      audioElement.onended = () => {
        setViewState("prompt")
        URL.revokeObjectURL(audioUrl)
      }

      audioElement.play()
      setViewState("listening")
    }
  }

  const handleContinue = () => {
    const nextIndex = findNextFilledIndex(currentIndex)

    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex)
      setViewState("recording")
      setCountdown(5)
    } else {
      setPendingPracticeIndex(null)
      setViewState("overview")
    }
  }

  const handleFinishForToday = () => {
    setShowRelaxAnimation(true)
    setTimeout(() => {
      setShowRelaxAnimation(false)
      setPendingPracticeIndex(null)
      setViewState("overview")
    }, 5000)
  }

  const playRecordedAudio = (propIndex: number) => {
    const audios = propositions[propIndex]?.audios || []
    if (audios.length > 0) {
      const latestAudio = audios[audios.length - 1]
      const audioUrl = URL.createObjectURL(latestAudio)
      const audioElement = new Audio(audioUrl)
      audioElement.play()
      audioElement.onended = () => URL.revokeObjectURL(audioUrl)
    }
  }

  const goToProposition = (index: number) => {
    if (!hasContentAtIndex(index) || isRecording) {
      return
    }

    if (audioRef.current) {
      const currentAudio = audioRef.current
      currentAudio.pause()
      if (currentAudio.src && currentAudio.src.startsWith("blob:")) {
        URL.revokeObjectURL(currentAudio.src)
      }
      audioRef.current = null
    }

    setCurrentIndex(index)
    setViewState("recording")
    setCountdown(5)
  }

  useEffect(() => {
    if (viewState === "overview" && pendingPracticeIndex !== null) {
      const requestedIndex = pendingPracticeIndex
      const targetIndex =
        typeof requestedIndex === "number" && hasContentAtIndex(requestedIndex)
          ? requestedIndex
          : findNextFilledIndex(
              typeof requestedIndex === "number" ? requestedIndex - 1 : -1,
            )

      setPendingPracticeIndex(null)

      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex)
        setViewState("recording")
        setCountdown(5)
      }
    }
  }, [
    viewState,
    pendingPracticeIndex,
    hasContentAtIndex,
    findNextFilledIndex,
  ])

  const expandCustomProposition = async (subtopicId: string, propositionId: string) => {
    if (!currentThemeId) return

    const theme = themes.find((t) => t.id === currentThemeId)
    const subtopic = theme?.subtopics.find((s) => s.id === subtopicId)
    if (!subtopic?.propositions) return

    const index = subtopic.propositions.findIndex((prop) => prop.id === propositionId)
    if (index === -1) return

    const proposition = subtopic.propositions[index]
    if (proposition.type !== "custom") return

    if (!proposition.text.trim()) {
      alert("Agrega contenido a la proposición personalizada antes de generar variantes.")
      return
    }

    setGeneratingPropositionId(propositionId)
    try {
      const { model, variantPrompts } = getGroqSettings()

      const variants: { type: PropositionVariant; text: string }[] = []
      for (const variant of [
        "reciproco",
        "inverso",
        "contrareciproco",
      ] as PropositionVariant[]) {
        const promptTemplate = variantPrompts[variant]
        const result = await generatePropositionVariant(
          proposition.text,
          variant,
          model,
          promptTemplate,
        )

        if ("error" in result) {
          throw new Error(result.error)
        }

        variants.push({ type: variant, text: result.text })
      }

      const generated: Proposition[] = [
        {
          id: `${propositionId}-condicion`,
          type: "condicion",
          label: propositionTypeLabels.condicion,
          text: proposition.text,
          audios: proposition.audios,
        },
        ...variants.map((variant) => ({
          id: `${propositionId}-${variant.type}`,
          type: variant.type,
          label: propositionTypeLabels[variant.type as PropositionType],
          text: variant.text,
          audios: [],
        })),
      ]

      updateSubtopicById(currentThemeId, subtopicId, (current) => {
        if (!current.propositions) {
          return current
        }

        const updated = [...current.propositions]
        updated.splice(index, 1, ...generated)

        return {
          ...current,
          propositions: updated,
        }
      })

      setCurrentSubtopicId(subtopicId)
      setPendingPracticeIndex(index)
      setViewState("overview")
    } catch (error) {
      console.error("[v0] Error generating propositions for custom entry:", error)
      alert("Error al generar las variantes de esta proposición. Intenta nuevamente.")
    } finally {
      setGeneratingPropositionId(null)
    }
  }

  const handleRewriteProposition = async (target: Proposition) => {
    if (!currentSubtopic) {
      return
    }

    const conditionText =
      currentSubtopic.text ||
      currentSubtopic.propositions?.find((prop) => prop.type === "condicion")?.text ||
      ""

    if (target.type === "condicion") {
      alert("Edita la condición directamente en el campo principal.")
      return
    }

    if (target.type === "custom") {
      if (typeof window === "undefined") {
        return
      }

      const typeLabel = target.label
      const defaultPrompt = `Condicion: ${conditionText}, quiero que hagas el ${typeLabel}`
      const userPrompt = window.prompt(
        "Escribe cómo quieres rehacer la proposición:",
        defaultPrompt,
      )

      if (!userPrompt || !userPrompt.trim()) {
        return
      }

      const { model } = getGroqSettings()

      setRewritePreview(null)
      setRewritingPropositionId(target.id)

      try {
        const result = await rewriteProposition(userPrompt, model)

        if ("error" in result) {
          throw new Error(result.error)
        }

        setRewritePreview({ propositionId: target.id, text: result.text })
      } catch (error) {
        console.error("[v0] Error rewriting proposition:", error)
        alert("Error al rehacer la proposición. Intenta nuevamente.")
      } finally {
        setRewritingPropositionId(null)
      }

      return
    }

    if (!conditionText.trim()) {
      alert("Agrega una condición antes de rehacer esta proposición.")
      return
    }

    const { model, variantPrompts } = getGroqSettings()
    const variantType = target.type as PropositionVariant
    const promptTemplate = variantPrompts[variantType]

    setRewritePreview(null)
    setRewritingPropositionId(target.id)

    try {
      const result = await generatePropositionVariant(
        conditionText,
        variantType,
        model,
        promptTemplate,
      )

      if ("error" in result) {
        throw new Error(result.error)
      }

      setRewritePreview({ propositionId: target.id, text: result.text })
    } catch (error) {
      console.error("[v0] Error rewriting proposition:", error)
      alert("Error al rehacer la proposición. Intenta nuevamente.")
    } finally {
      setRewritingPropositionId(null)
    }
  }

  const confirmRewritePreview = () => {
    const preview = rewritePreview

    if (!preview || !currentThemeId || !currentSubtopicId) {
      setRewritePreview(null)
      return
    }

    updateSubtopicById(currentThemeId, currentSubtopicId, (subtopic) => {
      if (!subtopic.propositions) {
        return subtopic
      }

      const index = subtopic.propositions.findIndex(
        (prop) => prop.id === preview.propositionId,
      )

      if (index === -1) {
        return subtopic
      }

      const updated = [...subtopic.propositions]
      updated[index] = { ...updated[index], text: preview.text }

      return {
        ...subtopic,
        propositions: updated,
      }
    })

    setRewritePreview(null)
  }

  const retryRewritePreview = () => {
    const preview = rewritePreview

    if (!preview || rewritingPropositionId) {
      return
    }

    const target = propositions.find((prop) => prop.id === preview.propositionId)
    setRewritePreview(null)

    if (target) {
      handleRewriteProposition(target)
    }
  }

  const cancelRewritePreview = () => {
    setRewritePreview(null)
  }

  const goToHome = () => {
    setViewState("themes")
    setCurrentSubtopicId(null)
    setIsRecording(false)
    setPendingPracticeIndex(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  if (viewState === "themes") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-balance">Temas</h1>
            <div className="flex items-center gap-2">
              {isFileSystemSupported() && !useFileSystem && (
                <Button variant="outline" onClick={activateFileSystemPersistence}>
                  Activar persistencia de archivos
                </Button>
              )}
              {useFileSystem && (
                <span className="text-sm text-muted-foreground px-3 py-1 rounded-full bg-primary/10">
                  Persistencia activa
                </span>
              )}
              {!useFileSystem && (
                <span className="text-sm text-muted-foreground px-3 py-1 rounded-full bg-muted">
                  💾 Guardado en navegador
                </span>
              )}
              <Button variant="ghost" size="icon" onClick={addTheme} title="Agregar tema">
                <Plus className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowErasModal(true)}
                title="Historial de ciclos (h)"
              >
                <History className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setShowSettingsModal(true)} title="Ajustes">
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {isLoadingData ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">Cargando datos...</p>
            </Card>
          ) : themes.length === 0 ? (
            <Card className="p-12 text-center space-y-4">
              <p className="text-muted-foreground">No hay temas registrados todavía.</p>
              <Button onClick={addTheme}>
                <Plus className="w-4 h-4 mr-2" /> Crear primer tema
              </Button>
            </Card>
          ) : (
            <Card className="p-4 space-y-3">
              {themes.map((theme) => {
                const isSelected = focusedItem?.scope === "theme" && focusedItem.id === theme.id
                return (
                  <div
                    key={theme.id}
                    onClick={() => openTheme(theme.id)}
                    onMouseEnter={() => setFocusedItem({ scope: "theme", id: theme.id })}
                    onFocus={() => setFocusedItem({ scope: "theme", id: theme.id })}
                    tabIndex={0}
                    className={`flex items-center gap-4 p-4 rounded-lg border transition cursor-pointer focus:outline-none ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    }`}
                  >
                  <input
                    type="text"
                    value={theme.name}
                    onChange={(e) => updateThemeName(theme.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Tema sin nombre"
                    className="flex-1 bg-transparent text-lg font-medium focus:outline-none"
                  />
                  <span className="text-sm text-muted-foreground">{theme.subtopics.length} subtemas</span>
                </div>
                )
              })}
            </Card>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Selecciona una fila y presiona Q o X para eliminarla.
          </p>
        </div>

        {sharedModals}
      </div>
    )
  }

  if (viewState === "subtopics") {
    if (!currentTheme) {
      return null
    }
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setViewState("themes")} title="Volver a temas">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <input
                type="text"
                value={currentTheme.name}
                onChange={(e) => updateThemeName(currentTheme.id, e.target.value)}
                className="text-3xl font-bold bg-transparent focus:outline-none"
                placeholder="Tema sin nombre"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={importSubtopicFromClipboard}
                title="Importar subtema desde portapapeles"
              >
                <Plus className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setShowSettingsModal(true)} title="Ajustes (g)">
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {isLoadingData ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">Cargando datos...</p>
            </Card>
          ) : subtopics.length === 0 ? (
            <Card className="p-12 text-center space-y-4">
              <p className="text-muted-foreground">
                Este tema aún no tiene subtemas. Usa el botón [+] para importar desde el portapapeles.
              </p>
            </Card>
          ) : (
            <Card className="p-6 space-y-4">
              {subtopics.map((subtopic) => {
                const isSelected = focusedItem?.scope === "subtopic" && focusedItem.id === subtopic.id
                return (
                  <div
                    key={subtopic.id}
                    className={`flex items-center gap-4 rounded-lg p-2 transition ${
                      isSelected ? "bg-primary/10" : "hover:bg-muted/40"
                    }`}
                    onMouseEnter={() => setFocusedItem({ scope: "subtopic", id: subtopic.id })}
                    onFocus={() => setFocusedItem({ scope: "subtopic", id: subtopic.id })}
                    tabIndex={0}
                  >
                    <input
                      type="text"
                      value={subtopic.text}
                      onChange={(e) => updateSubtopicText(subtopic.id, e.target.value)}
                      onFocus={() => setFocusedItem({ scope: "subtopic", id: subtopic.id })}
                      placeholder="Ingresa una condición o teorema..."
                      className="flex-1 px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                      onClick={() => openSubtopicDetail(subtopic.id)}
                      disabled={!subtopic.text.trim() || isLoadingData || isGenerationBusy}
                      className="whitespace-nowrap"
                    >
                      Ver subtema
                    </Button>
                  </div>
                )
              })}
            </Card>
          )}
          <p className="text-xs text-muted-foreground text-center">
            Selecciona una fila y presiona Q o X para eliminarla.
          </p>
        </div>

        {sharedModals}
      </div>
    )
  }

  if (showRelaxAnimation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <div className="text-center space-y-6">
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 animate-ping opacity-75"></div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-pulse"></div>
          </div>
          <p className="text-2xl font-medium text-foreground">Excelente trabajo 🌟</p>
          <p className="text-muted-foreground">Descansa y vuelve cuando estés listo</p>
        </div>
      </div>
    )
  }

  if (viewState === "overview") {
    if (!currentTheme || !currentSubtopic) {
      return null
    }

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="fixed top-4 left-4 flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setViewState("subtopics")}
            className="hover:bg-primary/10"
            title="Volver a subtemas"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToHome}
            className="hover:bg-primary/10"
            title="Volver a temas"
          >
            <Home className="w-6 h-6" />
          </Button>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          {propositions.length === 0 ? (
            <Card className="p-8 space-y-4 text-center">
              <p className="text-muted-foreground">
                Este subtema no tiene proposiciones disponibles en este momento.
              </p>
              <Button onClick={() => ensureStandardPropositions(currentTheme.id, currentSubtopic.id)}>
                Restaurar proposiciones base
              </Button>
            </Card>
          ) : (
            <>
              <Card className="p-8 space-y-6">
                {propositions.map((prop, index) => {
                  const isSelected = focusedItem?.scope === "proposition" && focusedItem.id === prop.id
                  const hasContent = prop.text.trim().length > 0
                  const isStandardVariant =
                    prop.type !== "custom" && prop.type !== "condicion"

                  return (
                    <div
                      key={prop.id}
                      className={`p-6 rounded-lg transition-colors space-y-4 ${
                        isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                      onMouseEnter={() => setFocusedItem({ scope: "proposition", id: prop.id })}
                      onFocus={() => setFocusedItem({ scope: "proposition", id: prop.id })}
                      tabIndex={0}
                    >
                    <div className="flex items-start justify-between gap-6">
                      <div className="flex-1 space-y-2">
                        <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                          {prop.label}
                        </p>
                        <div className="text-lg leading-relaxed text-foreground break-words">
                          {hasContent ? (
                            <MathText text={prop.text} />
                          ) : (
                            <p className="text-sm italic text-muted-foreground">
                              Aún no has generado esta proposición.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isStandardVariant && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateVariantForSubtopic(prop)}
                            disabled={
                              generatingVariantId === prop.id ||
                              generatingPropositionId !== null ||
                              isRecording
                            }
                            className="whitespace-nowrap"
                          >
                            {generatingVariantId === prop.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando...
                              </>
                            ) : hasContent ? (
                              "Regenerar"
                            ) : (
                              "Generar"
                            )}
                          </Button>
                        )}
                        {prop.type === "custom" && currentSubtopic && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => expandCustomProposition(currentSubtopic.id, prop.id)}
                            disabled={
                              generatingPropositionId === prop.id ||
                              isVariantGenerationActive ||
                              isRecording
                            }
                            className="whitespace-nowrap"
                          >
                            {generatingPropositionId === prop.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando...
                              </>
                            ) : (
                              "Generar variantes"
                            )}
                          </Button>
                        )}
                        {prop.audios.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => playRecordedAudio(index)}
                            className="hover:bg-primary/10"
                            title="Reproducir último audio"
                          >
                            <Play className="w-5 h-5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRewriteProposition(prop)}
                          className="hover:bg-primary/10"
                          title="Rehacer esta proposición"
                          disabled={rewritingPropositionId === prop.id || !hasContent}
                        >
                          {rewritingPropositionId === prop.id ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-5 h-5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => goToProposition(index)}
                          className="hover:bg-primary/10"
                          title="Practicar esta proposición"
                          disabled={!hasContent}
                        >
                          <Headphones className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                    {rewritePreview && rewritePreview.propositionId === prop.id && (
                      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
                        <p className="text-sm font-medium text-primary uppercase tracking-wide">
                          Previsualización
                        </p>
                        <div className="text-base leading-relaxed text-foreground break-words">
                          <MathText text={rewritePreview.text} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" onClick={confirmRewritePreview}>
                            Confirmar
                          </Button>
                          <Button size="sm" variant="outline" onClick={retryRewritePreview}>
                            Reintentar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelRewritePreview}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                    </div>
                  )
                })}
              </Card>
              <p className="text-center text-sm text-muted-foreground">
                Presiona la barra espaciadora para iniciar la práctica.
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Selecciona una proposición y presiona Q o X para eliminarla.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  const currentProposition = propositions[currentIndex]
  const currentPropositionHasContent = Boolean(
    currentProposition?.text && currentProposition.text.trim().length > 0,
  )

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="fixed top-4 left-4 flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setPendingPracticeIndex(null)
            setViewState("overview")
          }}
          className="hover:bg-primary/10"
          title="Volver al subtema"
        >
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToHome}
          className="hover:bg-primary/10"
          title="Volver a temas"
        >
          <Home className="w-6 h-6" />
        </Button>
      </div>

      <div className="max-w-4xl w-full space-y-8">
        <Card className="p-12 space-y-6">
          {isPracticeView && propositions.length > 0 && (
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNavigateProposition("previous")}
                disabled={!canGoToPrevious || isNavigationLocked}
                className="w-16 justify-center font-semibold"
                aria-label="Proposición anterior"
                title="Proposición anterior"
              >
                {"<-"}
              </Button>
              <span className="text-sm font-medium text-muted-foreground">
                Proposición {currentIndex + 1} de {propositions.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNavigateProposition("next")}
                disabled={!canGoToNext || isNavigationLocked}
                className="w-16 justify-center font-semibold"
                aria-label="Proposición siguiente"
                title="Proposición siguiente"
              >
                {"->"}
              </Button>
            </div>
          )}
          <div className="flex items-start justify-between gap-8">
            <div className="flex-1 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {currentProposition?.label}
              </p>
              <div className="text-2xl leading-relaxed text-foreground break-words">
                {currentPropositionHasContent ? (
                  <MathText text={currentProposition?.text ?? ""} />
                ) : (
                  <p className="text-base italic text-muted-foreground">
                    Genera o selecciona una proposición para practicarla.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-3">
                <Headphones className="w-12 h-12 text-primary flex-shrink-0" />
                {currentProposition && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRewriteProposition(currentProposition)}
                    disabled={
                      rewritingPropositionId === currentProposition.id || !currentPropositionHasContent
                    }
                    className="whitespace-nowrap"
                  >
                    {rewritingPropositionId === currentProposition.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rehaciendo...
                      </>
                    ) : (
                      "Rehacer proposición"
                    )}
                  </Button>
                )}
              </div>
              {currentProposition?.type === "custom" && currentSubtopic && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => expandCustomProposition(currentSubtopic.id, currentProposition.id)}
                  disabled={
                    generatingPropositionId === currentProposition.id ||
                    isVariantGenerationActive ||
                    isRecording
                  }
                  className="whitespace-nowrap"
                >
                  {generatingPropositionId === currentProposition.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando...
                    </>
                  ) : (
                    "Generar variantes"
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {rewritePreview && currentProposition && rewritePreview.propositionId === currentProposition.id && (
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">Previsualización</p>
              <div className="text-lg leading-relaxed text-foreground break-words">
                <MathText text={rewritePreview.text} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={confirmRewritePreview}>Confirmar</Button>
              <Button variant="outline" onClick={retryRewritePreview}>
                Reintentar
              </Button>
              <Button variant="ghost" onClick={cancelRewritePreview}>
                Cancelar
              </Button>
            </div>
          </Card>
        )}

        <div className="text-center space-y-6">
          {viewState === "recording" && !isRecording && (
            <div className="space-y-4">
              <Button size="lg" onClick={startRecording} className="text-lg px-8 py-6">
                <Mic className="w-5 h-5 mr-2" />
                Demuéstralo
              </Button>
              <p className="text-sm text-muted-foreground">Presiona espacio/enter para comenzar a grabar</p>
            </div>
          )}

          {isRecording && (
            <div className="space-y-6">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full bg-destructive/20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full bg-destructive/40 animate-pulse"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Mic className="w-10 h-10 text-destructive" />
                </div>
              </div>
              <p className="text-xl font-medium text-foreground">Grabando...</p>
              <p className="text-sm text-muted-foreground">Presiona espacio/enter para finalizar</p>
            </div>
          )}

          {viewState === "countdown" && (
            <div className="space-y-4">
              <div className="text-6xl font-bold text-primary animate-pulse">{countdown}</div>
              <p className="text-muted-foreground">Escuchando tu grabación...</p>
            </div>
          )}

          {viewState === "listening" && (
            <div className="space-y-4">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-spin-slow"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Play className="w-10 h-10 text-primary" />
                </div>
              </div>
              <p className="text-xl font-medium text-foreground">Reproduciendo...</p>
            </div>
          )}

          {viewState === "prompt" && (
            <div className="space-y-6">
              <p className="text-xl font-medium text-foreground">¿Continuar con la siguiente proposición?</p>
              <div className="flex gap-4 justify-center">
                <Button size="lg" onClick={handleContinue} className="px-8">
                  Sí
                </Button>
                <Button size="lg" variant="outline" onClick={handleFinishForToday} className="px-8 bg-transparent">
                  Estoy bien por hoy
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Presiona espacio/enter para grabar de nuevo si no estás satisfecho
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-start flex-wrap">
          {currentProposition?.audios.map((_, audioIdx) => (
            <div
              key={`${currentProposition.type}-${audioIdx}`}
              className="w-10 h-10 flex items-center justify-center text-muted-foreground"
              title={`Audio ${audioIdx + 1}`}
            >
              <Headphones className="w-5 h-5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
