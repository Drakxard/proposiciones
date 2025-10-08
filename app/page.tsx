"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Play, Mic, Headphones, Home, Plus, Settings, ArrowLeft } from "lucide-react"
import { SettingsModal } from "@/components/settings-modal"
import { generatePropositions } from "./actions"
import { saveThemes, loadThemes, saveAudio, loadAudios } from "@/lib/storage"
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

type ViewState = "themes" | "subtopics" | "overview" | "recording" | "listening" | "countdown" | "prompt"

export default function PropositionsApp() {
  const [themes, setThemes] = useState<Theme[]>([
    {
      id: "theme-1",
      name: "Tema de ejemplo",
      subtopics: [
        { id: "1", text: "Si es Derivable entonces es Continuo", propositions: null },
      ],
    },
  ])
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(null)
  const [currentSubtopicId, setCurrentSubtopicId] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>("themes")
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [fileSystemHandle, setFileSystemHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [useFileSystem, setUseFileSystem] = useState(false)

  const currentTheme = currentThemeId ? themes.find((t) => t.id === currentThemeId) ?? null : null
  const subtopics = currentTheme?.subtopics ?? []
  const currentSubtopic =
    currentSubtopicId && currentTheme
      ? currentTheme.subtopics.find((s) => s.id === currentSubtopicId) ?? null
      : null
  const propositions = currentSubtopic?.propositions || []

  const propositionTypeLabels: Record<PropositionType, string> = {
    condicion: "Condición",
    reciproco: "Recíproco",
    inverso: "Inverso",
    contrareciproco: "Contra-Recíproco",
  }

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

      if (e.key === "g" && (viewState === "themes" || viewState === "subtopics")) {
        e.preventDefault()
        setShowSettingsModal(true)
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
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [viewState, mediaRecorderRef.current])

  useEffect(() => {
    loadPersistedData()
  }, [])

  const loadPersistedData = async () => {
    try {
      console.log("[v0] Starting to load persisted data...")

      // Try to get saved file system handle first
      if (isFileSystemSupported()) {
        const handle = await getSavedDirectoryHandle()
        if (handle) {
          console.log("[v0] Found saved file system handle, loading from file system...")
          setFileSystemHandle(handle)
          setUseFileSystem(true)
          await loadFromFileSystem(handle)
          setIsLoadingData(false)
          console.log("[v0] Successfully loaded from file system")
          return
        }
      }

      console.log("[v0] Loading from IndexedDB...")
      // Fallback to IndexedDB
      const loadedThemes = await loadThemes()

      console.log("[v0] Loaded themes from IndexedDB:", loadedThemes)

      if (loadedThemes.length === 0) {
        console.log("[v0] No themes found in IndexedDB")
        setIsLoadingData(false)
        return
      }

      const firstTheme = loadedThemes[0] as any

      if (firstTheme && !("name" in firstTheme)) {
        console.log("[v0] Legacy subtopics structure detected, converting to themes")
        const legacySubtopics: any[] = loadedThemes as any[]

        const legacySubtopicsWithAudios: Subtopic[] = await Promise.all(
          legacySubtopics.map(async (subtopic: any, subtopicIndex: number) => {
            if (!subtopic.propositions) {
              return {
                id: subtopic.id ?? `legacy-${subtopicIndex}`,
                text: subtopic.text ?? "",
                propositions: null,
              }
            }

            const audiosGrouped = await loadAudios(subtopic.id)
            const propositionsWithAudios: Proposition[] = subtopic.propositions.map(
              (prop: any, propIndex: number) => {
                const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind
                return {
                  id: prop.id ?? `${subtopic.id}-${propIndex}`,
                  type,
                  label: prop.label ?? getLabelForProposition(type, propIndex),
                  text: prop.text ?? "",
                  audios: audiosGrouped[propIndex] || [],
                }
              },
            )

            return {
              id: subtopic.id ?? `legacy-${subtopicIndex}`,
              text: subtopic.text ?? "",
              propositions: propositionsWithAudios,
            }
          }),
        )

        setThemes([
          {
            id: "legacy-theme",
            name: "Tema legado",
            subtopics: legacySubtopicsWithAudios,
          },
        ])
        return
      }

      // Load themes with their propositions and audios
      const themesWithAudios: Theme[] = await Promise.all(
        loadedThemes.map(async (theme: any, themeIndex: number) => {
          const subtopicsWithAudios: Subtopic[] = await Promise.all(
            (theme.subtopics || []).map(async (subtopic: any, subtopicIndex: number) => {
              if (!subtopic.propositions) {
                return {
                  id: subtopic.id ?? `${theme.id ?? themeIndex}-subtopic-${subtopicIndex}`,
                  text: subtopic.text ?? "",
                  propositions: null,
                }
              }

              const audiosGrouped = await loadAudios(subtopic.id)
              const propositionsWithAudios: Proposition[] = subtopic.propositions.map(
                (prop: any, propIndex: number) => {
                  const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind
                  return {
                    id: prop.id ?? `${subtopic.id}-${propIndex}`,
                    type,
                    label: prop.label ?? getLabelForProposition(type, propIndex),
                    text: prop.text ?? "",
                    audios: audiosGrouped[propIndex] || [],
                  }
                },
              )

              return {
                id: subtopic.id ?? `${theme.id ?? themeIndex}-subtopic-${subtopicIndex}`,
                text: subtopic.text ?? "",
                propositions: propositionsWithAudios,
              }
            }),
          )

          return {
            id: theme.id ?? `theme-${themeIndex}`,
            name: theme.name ?? `Tema ${themeIndex + 1}`,
            subtopics: subtopicsWithAudios,
          }
        }),
      )

      console.log("[v0] Final themes with audios:", themesWithAudios)
      setThemes(themesWithAudios)
    } catch (error) {
      console.error("[v0] Error loading persisted data:", error)
    } finally {
      setIsLoadingData(false)
      console.log("[v0] Finished loading persisted data")
    }
  }

  const loadFromFileSystem = async (handle: FileSystemDirectoryHandle) => {
    try {
      console.log("[v0] Reading themes.json from file system...")
      let data = await readJSONFile(handle, "themes.json")

      if (!data) {
        console.log("[v0] themes.json not found, trying legacy subtopics.json")
        data = await readJSONFile(handle, "subtopics.json")
      }

      if (!data || !Array.isArray(data)) {
        console.log("[v0] No valid data found in file system")
        return
      }

      console.log("[v0] Found data in file system:", data)

      const firstTheme = data[0] as any

      if (firstTheme && !("name" in firstTheme)) {
        const legacySubtopicsWithAudios: Subtopic[] = await Promise.all(
          data.map(async (subtopic: any, subtopicIndex: number) => {
            if (!subtopic.propositions) {
              return {
                id: subtopic.id ?? `legacy-${subtopicIndex}`,
                text: subtopic.text ?? "",
                propositions: null,
              }
            }

            const propositionsWithAudios = await Promise.all(
              subtopic.propositions.map(async (prop: any, propIndex: number) => {
                const audios: Blob[] = []
                let audioIndex = 0

                while (true) {
                  const filename = `audio-${subtopic.id}-${propIndex}-${audioIndex}.webm`
                  const blob = await readBlobFile(handle, filename)
                  if (!blob) break
                  audios.push(blob)
                  audioIndex++
                }

                const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind

                return {
                  id: prop.id ?? `${subtopic.id}-${propIndex}`,
                  type,
                  label: prop.label ?? getLabelForProposition(type, propIndex),
                  text: prop.text ?? "",
                  audios,
                }
              }),
            )

            return {
              id: subtopic.id ?? `legacy-${subtopicIndex}`,
              text: subtopic.text ?? "",
              propositions: propositionsWithAudios,
            }
          }),
        )

        setThemes([
          {
            id: "legacy-theme",
            name: "Tema legado",
            subtopics: legacySubtopicsWithAudios,
          },
        ])
        return
      }

      const themesWithAudios: Theme[] = await Promise.all(
        data.map(async (theme: any, themeIndex: number) => {
          const subtopicsWithAudios: Subtopic[] = await Promise.all(
            (theme.subtopics || []).map(async (subtopic: any, subtopicIndex: number) => {
              if (!subtopic.propositions) {
                return {
                  id: subtopic.id ?? `${theme.id ?? themeIndex}-subtopic-${subtopicIndex}`,
                  text: subtopic.text ?? "",
                  propositions: null,
                }
              }

              const propositionsWithAudios = await Promise.all(
                subtopic.propositions.map(async (prop: any, propIndex: number) => {
                  const audios: Blob[] = []
                  let audioIndex = 0

                  while (true) {
                    const filename = `audio-${subtopic.id}-${propIndex}-${audioIndex}.webm`
                    const blob = await readBlobFile(handle, filename)
                    if (!blob) break
                    audios.push(blob)
                    audioIndex++
                  }

                  const type = (prop.type ?? mapIndexToType(propIndex)) as PropositionKind

                  return {
                    id: prop.id ?? `${subtopic.id}-${propIndex}`,
                    type,
                    label: prop.label ?? getLabelForProposition(type, propIndex),
                    text: prop.text ?? "",
                    audios,
                  }
                }),
              )

              return {
                id: subtopic.id ?? `${theme.id ?? themeIndex}-subtopic-${subtopicIndex}`,
                text: subtopic.text ?? "",
                propositions: propositionsWithAudios,
              }
            }),
          )

          return {
            id: theme.id ?? `theme-${themeIndex}`,
            name: theme.name ?? `Tema ${themeIndex + 1}`,
            subtopics: subtopicsWithAudios,
          }
        }),
      )

      console.log("[v0] Loaded themes from file system:", themesWithAudios)
      setThemes(themesWithAudios)
    } catch (error) {
      console.error("[v0] Error loading from file system:", error)
    }
  }

  useEffect(() => {
    if (!isLoadingData) {
      saveData()
    }
  }, [themes, isLoadingData])

  const saveData = async () => {
    try {
      if (useFileSystem && fileSystemHandle) {
        await saveToFileSystem(fileSystemHandle)
      } else {
        // Fallback to IndexedDB
        const themesToSave = themes.map((theme) => ({
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
        }))

        await saveThemes(themesToSave)

        // Save audio blobs separately
        for (const theme of themes) {
          for (const subtopic of theme.subtopics) {
            if (subtopic.propositions) {
              for (let propIndex = 0; propIndex < subtopic.propositions.length; propIndex++) {
                const prop = subtopic.propositions[propIndex]
                for (let audioIndex = 0; audioIndex < prop.audios.length; audioIndex++) {
                  await saveAudio(subtopic.id, propIndex, audioIndex, prop.audios[audioIndex])
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("[v0] Error saving data:", error)
    }
  }

  const saveToFileSystem = async (handle: FileSystemDirectoryHandle) => {
    try {
      // Save themes structure
      const themesData = themes.map((theme) => ({
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
      }))

      await writeJSONFile(handle, "themes.json", themesData)

      // Save audio files
      for (const theme of themes) {
        for (const subtopic of theme.subtopics) {
          if (subtopic.propositions) {
            for (let propIndex = 0; propIndex < subtopic.propositions.length; propIndex++) {
              const prop = subtopic.propositions[propIndex]
              for (let audioIndex = 0; audioIndex < prop.audios.length; audioIndex++) {
                const filename = `audio-${subtopic.id}-${propIndex}-${audioIndex}.webm`
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
        await saveToFileSystem(handle)
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

    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("El acceso al portapapeles no está disponible")
      }

      const clipboardText = await navigator.clipboard.readText()
      const parsed = JSON.parse(clipboardText)

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Formato inválido del portapapeles")
      }

      const [subtopicInfo, ...propositionEntries] = parsed

      if (!subtopicInfo || typeof subtopicInfo.texto !== "string") {
        throw new Error("El primer elemento debe incluir la propiedad 'texto'")
      }

      const newSubtopicId = `subtopic-${Date.now()}`

      const propositions: Proposition[] | null = propositionEntries.length
        ? propositionEntries.map((entry: any, index: number) => {
            const rawText =
              typeof entry === "string"
                ? entry
                : entry?.texto ?? (typeof entry === "number" ? entry.toString() : "")
            const textValue = typeof rawText === "string" ? rawText : String(rawText ?? "")

            const incomingType = entry?.tipo as PropositionKind | undefined
            const baseType = incomingType || mapIndexToType(index)
            const label =
              typeof entry?.etiqueta === "string"
                ? entry.etiqueta
                : incomingType && incomingType !== "custom" && propositionTypeLabels[incomingType as PropositionType]
                  ? propositionTypeLabels[incomingType as PropositionType]
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
    } catch (error: any) {
      console.error("[v0] Error importing from clipboard:", error)
      alert(
        error?.message
          ? `No se pudo importar el subtema: ${error.message}`
          : "No se pudo importar el subtema desde el portapapeles.",
      )
    }
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

    updateSubtopicById(currentThemeId, id, (subtopic) => ({
      ...subtopic,
      text,
    }))
  }

  const evaluatePropositions = async (subtopicId: string) => {
    if (!currentThemeId) return

    const theme = themes.find((t) => t.id === currentThemeId)
    const subtopic = theme?.subtopics.find((s) => s.id === subtopicId)
    if (!subtopic || !subtopic.text.trim()) return

    console.log("[v0] Evaluating propositions for subtopic:", subtopic)
    console.log("[v0] Subtopic has propositions?", !!subtopic.propositions)

    if (subtopic.propositions && subtopic.propositions.length > 0) {
      console.log("[v0] Propositions already exist, going to interface")
      setCurrentSubtopicId(subtopicId)
      setCurrentIndex(0)
      setViewState("recording")
      setCountdown(5)
      return
    }

    console.log("[v0] No propositions found, generating with Groq...")
    setIsGenerating(true)
    try {
      const result = await generatePropositions(subtopic.text)

      if ("error" in result) {
        throw new Error(result.error)
      }

      console.log("[v0] Generated propositions:", result)

      const newPropositions: Proposition[] = [
        {
          id: `${subtopic.id}-condicion`,
          type: "condicion",
          label: propositionTypeLabels.condicion,
          text: subtopic.text,
          audios: [],
        },
        {
          id: `${subtopic.id}-reciproco`,
          type: "reciproco",
          label: propositionTypeLabels.reciproco,
          text: result.reciproco,
          audios: [],
        },
        {
          id: `${subtopic.id}-inverso`,
          type: "inverso",
          label: propositionTypeLabels.inverso,
          text: result.inverso,
          audios: [],
        },
        {
          id: `${subtopic.id}-contrareciproco`,
          type: "contrareciproco",
          label: propositionTypeLabels.contrareciproco,
          text: result.contrareciproco,
          audios: [],
        },
      ]

      updateSubtopicById(currentThemeId, subtopicId, (current) => ({
        ...current,
        propositions: newPropositions,
      }))

      setCurrentSubtopicId(subtopicId)
      setCurrentIndex(0)
      setViewState("recording")
      setCountdown(5)
    } catch (error) {
      console.error("[v0] Error generating propositions:", error)
      alert("Error al generar proposiciones. Por favor, intenta de nuevo.")
    } finally {
      setIsGenerating(false)
    }
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

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [showRelaxAnimation, setShowRelaxAnimation] = useState(false)

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
    if (currentIndex < propositions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setViewState("recording")
      setCountdown(5)
    } else {
      setViewState("overview")
    }
  }

  const handleFinishForToday = () => {
    setShowRelaxAnimation(true)
    setTimeout(() => {
      setShowRelaxAnimation(false)
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
    setCurrentIndex(index)
    setViewState("recording")
    setCountdown(5)
  }

  const goToHome = () => {
    setViewState("themes")
    setCurrentSubtopicId(null)
    setIsRecording(false)
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
                  📁 Persistencia de archivos activa
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
              <Button variant="ghost" size="icon" onClick={() => setShowSettingsModal(true)} title="Ajustes (g)">
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
              {themes.map((theme) => (
                <div
                  key={theme.id}
                  onClick={() => openTheme(theme.id)}
                  className="flex items-center gap-4 p-4 rounded-lg border border-transparent hover:border-border hover:bg-muted/40 transition cursor-pointer"
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
              ))}
            </Card>
          )}
        </div>

        <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
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
                Este tema aún no tiene subtemas. Usa el botón [+] para importar desde el portapapeles o agrega uno manualmente.
              </p>
              <Button variant="outline" onClick={addSubtopic}>
                <Plus className="w-4 h-4 mr-2" /> Agregar subtema manual
              </Button>
            </Card>
          ) : (
            <Card className="p-6 space-y-4">
              {subtopics.map((subtopic) => (
                <div key={subtopic.id} className="flex items-center gap-4">
                  <input
                    type="text"
                    value={subtopic.text}
                    onChange={(e) => updateSubtopicText(subtopic.id, e.target.value)}
                    placeholder="Ingresa una condición o teorema..."
                    className="flex-1 px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button
                    onClick={() => evaluatePropositions(subtopic.id)}
                    disabled={!subtopic.text.trim() || isGenerating || isLoadingData}
                    className="whitespace-nowrap"
                  >
                    {isGenerating ? "Generando..." : subtopic.propositions ? "Acceder" : "Evaluar proposiciones"}
                  </Button>
                </div>
              ))}

              <Button variant="outline" onClick={addSubtopic} className="w-full bg-transparent">
                <Plus className="w-4 h-4 mr-2" />
                Agregar subtema manual
              </Button>
            </Card>
          )}
        </div>

        <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
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
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="fixed top-4 left-4 flex gap-2">
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
          <h1 className="text-3xl font-bold text-center mb-8 text-balance">Evaluación de Proposiciones</h1>

          <Card className="p-8 space-y-6">
            {propositions.map((prop, index) => (
              <div
                key={prop.id}
                className="flex items-start justify-between gap-6 p-6 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {prop.label}
                  </p>
                  <div className="text-lg leading-relaxed text-foreground break-words">
                    <MathText text={prop.text} />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
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
                    onClick={() => goToProposition(index)}
                    className="hover:bg-primary/10"
                  >
                    <Headphones className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    )
  }

  const currentProposition = propositions[currentIndex]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="fixed top-4 left-4 flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewState("overview")}
          className="hover:bg-primary/10"
          title="Volver a vista general"
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
        <Card className="p-12">
          <div className="flex items-start justify-between gap-8">
            <div className="flex-1 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {currentProposition?.label}
              </p>
              <div className="text-2xl leading-relaxed text-foreground break-words">
                <MathText text={currentProposition?.text ?? ""} />
              </div>
            </div>
            <Headphones className="w-12 h-12 text-primary flex-shrink-0" />
          </div>
        </Card>

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
