"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Play, Mic, Headphones, Home, Plus, Settings, ArrowLeft } from "lucide-react"
import { SettingsModal } from "@/components/settings-modal"
import { MathText } from "@/components/math-text"
import { generatePropositions } from "./actions"
import { saveThemes, loadThemes, loadSubtopics, saveAudio, loadAudios } from "@/lib/storage"
import {
  isFileSystemSupported,
  requestDirectoryAccess,
  getSavedDirectoryHandle,
  writeJSONFile,
  readJSONFile,
  writeBlobFile,
  readBlobFile,
} from "@/lib/file-system"

interface Proposition {
  id: string
  text: string
  audios: Blob[]
}

interface Subtopic {
  id: string
  text: string
  propositions: Proposition[] | null
}

interface StoredProposition {
  id: string
  text: string
  audioCount: number
}

interface SubtopicData {
  id: string
  text: string
  propositions: StoredProposition[] | null
}

interface Theme {
  id: string
  name: string
  subtopics: Subtopic[]
}

interface ThemeData {
  id: string
  name: string
  subtopics: SubtopicData[]
}

type ViewState =
  | "themes"
  | "subtopics"
  | "overview"
  | "recording"
  | "listening"
  | "countdown"
  | "prompt"

export default function PropositionsApp() {
  const [themes, setThemes] = useState<Theme[]>([
    {
      id: "theme-1",
      name: "Tema de ejemplo",
      subtopics: [
        { id: "subtopic-1", text: "Si es Derivable entonces es Continuo", propositions: null },
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

  const currentTheme = themes.find((theme) => theme.id === currentThemeId) || null
  const subtopics = currentTheme?.subtopics ?? []
  const currentSubtopic = subtopics.find((s) => s.id === currentSubtopicId) || null
  const propositions = currentSubtopic?.propositions || []

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

  const hydrateThemes = async (themeData: ThemeData[]): Promise<Theme[]> => {
    return await Promise.all(
      themeData.map(async (theme) => {
        const hydratedSubtopics: Subtopic[] = await Promise.all(
          (theme.subtopics || []).map(async (subtopic) => {
            if (!subtopic.propositions) {
              return { id: subtopic.id, text: subtopic.text, propositions: null }
            }

            const audiosGrouped = await loadAudios(subtopic.id)
            const propositionsWithAudios: Proposition[] = subtopic.propositions.map((prop, index) => ({
              id: prop.id || `${subtopic.id}-prop-${index}`,
              text: prop.text,
              audios: audiosGrouped[index] || [],
            }))

            return { id: subtopic.id, text: subtopic.text, propositions: propositionsWithAudios }
          }),
        )

        return {
          id: theme.id,
          name: theme.name,
          subtopics: hydratedSubtopics,
        }
      }),
    )
  }

  const loadPersistedData = async () => {
    try {
      console.log("[v0] Starting to load persisted data...")

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
      const loadedThemes = await loadThemes()

      if (loadedThemes.length > 0) {
        console.log("[v0] Loaded themes from IndexedDB:", loadedThemes)
        const hydrated = await hydrateThemes(loadedThemes)
        setThemes(hydrated)
        return
      }

      console.log("[v0] No themes found, attempting to load legacy subtopics...")
      const legacySubtopics = await loadSubtopics()

      if (legacySubtopics.length === 0) {
        console.log("[v0] No legacy data found")
        return
      }

      const legacyTheme: Theme = {
        id: "legacy-theme",
        name: "Tema migrado",
        subtopics: await Promise.all(
          legacySubtopics.map(async (subtopic) => {
            if (!subtopic.propositions) {
              return { id: subtopic.id, text: subtopic.text, propositions: null }
            }

            const audiosGrouped = await loadAudios(subtopic.id)
            const propositionsWithAudios: Proposition[] = subtopic.propositions.map((prop: any, index: number) => ({
              id: prop.id || prop.type || `${subtopic.id}-prop-${index}`,
              text: prop.text,
              audios: audiosGrouped[index] || [],
            }))

            return { id: subtopic.id, text: subtopic.text, propositions: propositionsWithAudios }
          }),
        ),
      }

      setThemes([legacyTheme])
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

      if ((!data || !Array.isArray(data)) && !data?.length) {
        console.log("[v0] themes.json not found, trying legacy subtopics.json")
        data = await readJSONFile(handle, "subtopics.json")
        if (!data || !Array.isArray(data)) {
          console.log("[v0] No valid data found in file system")
          return
        }

        const legacyThemeData: ThemeData = {
          id: "legacy-theme",
          name: "Tema migrado",
          subtopics: data,
        }

        const hydrated = await hydrateThemes([legacyThemeData])
        setThemes(hydrated)
        return
      }

      const hydrated = await hydrateThemes(data as ThemeData[])
      console.log("[v0] Loaded themes from file system:", hydrated)
      setThemes(hydrated)
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
        const themesToSave: ThemeData[] = themes.map((theme) => ({
          id: theme.id,
          name: theme.name,
          subtopics: theme.subtopics.map((subtopic) => ({
            id: subtopic.id,
            text: subtopic.text,
            propositions: subtopic.propositions
              ? subtopic.propositions.map((prop) => ({
                  id: prop.id,
                  text: prop.text,
                  audioCount: prop.audios.length,
                }))
              : null,
          })),
        }))

        await saveThemes(themesToSave)

        for (const theme of themes) {
          for (const subtopic of theme.subtopics) {
            if (!subtopic.propositions) continue
            for (let propIndex = 0; propIndex < subtopic.propositions.length; propIndex++) {
              const prop = subtopic.propositions[propIndex]
              for (let audioIndex = 0; audioIndex < prop.audios.length; audioIndex++) {
                await saveAudio(subtopic.id, propIndex, audioIndex, prop.audios[audioIndex])
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
      const themesData: ThemeData[] = themes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        subtopics: theme.subtopics.map((subtopic) => ({
          id: subtopic.id,
          text: subtopic.text,
          propositions: subtopic.propositions
            ? subtopic.propositions.map((prop) => ({
                id: prop.id,
                text: prop.text,
                audioCount: prop.audios.length,
              }))
            : null,
        })),
      }))

      await writeJSONFile(handle, "themes.json", themesData)

      for (const theme of themes) {
        for (const subtopic of theme.subtopics) {
          if (!subtopic.propositions) continue
          for (let propIndex = 0; propIndex < subtopic.propositions.length; propIndex++) {
            const prop = subtopic.propositions[propIndex]
            for (let audioIndex = 0; audioIndex < prop.audios.length; audioIndex++) {
              const filename = `audio-${subtopic.id}-${propIndex}-${audioIndex}.webm`
              await writeBlobFile(handle, filename, prop.audios[audioIndex])
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

  const updateThemeById = (themeId: string, updater: (theme: Theme) => Theme) => {
    setThemes((prevThemes) =>
      prevThemes.map((theme) => (theme.id === themeId ? updater(theme) : theme)),
    )
  }

  const addTheme = () => {
    const newTheme: Theme = {
      id: `theme-${Date.now()}`,
      name: "Nuevo tema",
      subtopics: [],
    }
    setThemes((prevThemes) => [...prevThemes, newTheme])
  }

  const updateThemeName = (themeId: string, name: string) => {
    setThemes((prevThemes) =>
      prevThemes.map((theme) => (theme.id === themeId ? { ...theme, name } : theme)),
    )
  }

  const openTheme = (themeId: string) => {
    setCurrentThemeId(themeId)
    setCurrentSubtopicId(null)
    setViewState("subtopics")
  }

  const importFromClipboard = async () => {
    if (!currentThemeId) return
    try {
      const clipboardText = await navigator.clipboard.readText()
      const parsed = JSON.parse(clipboardText)

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Formato de portapapeles inválido")
      }

      const normalizedTexts = parsed.map((item) => {
        if (typeof item === "string") return item.trim()
        if (item && typeof item.texto === "string") return item.texto.trim()
        if (item && typeof item.text === "string") return item.text.trim()
        throw new Error("Formato de portapapeles inválido")
      })

      const [subtopicTitle, ...propositionTexts] = normalizedTexts
      if (!subtopicTitle) {
        throw new Error("El portapapeles no contiene un título de subtema válido")
      }

      const newSubtopicId = `subtopic-${Date.now()}`
      const propositionsList: Proposition[] = propositionTexts.map((text, index) => ({
        id: `${newSubtopicId}-custom-${index}`,
        text,
        audios: [],
      }))

      const newSubtopic: Subtopic = {
        id: newSubtopicId,
        text: subtopicTitle,
        propositions: propositionsList.length > 0 ? propositionsList : null,
      }

      updateThemeById(currentThemeId, (theme) => ({
        ...theme,
        subtopics: [...theme.subtopics, newSubtopic],
      }))
    } catch (error) {
      console.error("[v0] Error importing from clipboard:", error)
      alert("No se pudo importar el contenido del portapapeles. Verifica el formato e intenta nuevamente.")
    }
  }

  const addSubtopic = () => {
    if (!currentThemeId) return
    const newSubtopic: Subtopic = {
      id: `subtopic-${Date.now()}`,
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
    updateThemeById(currentThemeId, (theme) => ({
      ...theme,
      subtopics: theme.subtopics.map((subtopic) =>
        subtopic.id === id ? { ...subtopic, text } : subtopic,
      ),
    }))
  }

  const evaluatePropositions = async (subtopicId: string) => {
    if (!currentThemeId) return
    const subtopic = subtopics.find((s) => s.id === subtopicId)
    if (!subtopic || !subtopic.text.trim()) return

    console.log("[v0] Evaluating propositions for subtopic:", subtopic)
    console.log("[v0] Subtopic has propositions?", !!subtopic.propositions)

    if (subtopic.propositions && subtopic.propositions.length > 0) {
      console.log("[v0] Propositions already exist, going to interface")
      setCurrentThemeId(currentThemeId)
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
        { id: `${subtopic.id}-condicion`, text: subtopic.text, audios: [] },
        { id: `${subtopic.id}-reciproco`, text: result.reciproco, audios: [] },
        { id: `${subtopic.id}-inverso`, text: result.inverso, audios: [] },
        { id: `${subtopic.id}-contrareciproco`, text: result.contrareciproco, audios: [] },
      ]

      updateThemeById(currentThemeId, (theme) => ({
        ...theme,
        subtopics: theme.subtopics.map((s) =>
          s.id === subtopicId ? { ...s, propositions: newPropositions } : s,
        ),
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
          setThemes((prevThemes) =>
            prevThemes.map((theme) => {
              if (theme.id !== currentThemeId) {
                return theme
              }

              return {
                ...theme,
                subtopics: theme.subtopics.map((subtopic) => {
                  if (subtopic.id === currentSubtopicId && subtopic.propositions) {
                    const updatedPropositions = subtopic.propositions.map((prop, index) => {
                      if (index !== currentIndex) {
                        return prop
                      }
                      return {
                        ...prop,
                        audios: [...prop.audios, audioBlob],
                      }
                    })

                    return { ...subtopic, propositions: updatedPropositions }
                  }
                  return subtopic
                }),
              }
            }),
          )
        }

        stream.getTracks().forEach((track) => track.stop())
        setViewState("countdown")
        setIsRecording(false)
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
    }
    setIsRecording(false)
  }

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [showRelaxAnimation, setShowRelaxAnimation] = useState(false)

  const propositionLabels = ["Condición", "Recíproco", "Inverso", "Contra-Recíproco"]

  const getPropositionLabel = (index: number) => {
    if (propositions.length === propositionLabels.length) {
      return propositionLabels[index] ?? `Proposición ${index + 1}`
    }
    return `Proposición ${index + 1}`
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
    setCurrentThemeId(null)
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-balance">Temas</h1>
              <p className="text-muted-foreground">
                Administra tus temas y accede a sus subtemas y proposiciones.
              </p>
            </div>
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
              <Button variant="outline" size="icon" onClick={addTheme} title="Agregar tema">
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
          ) : (
            <Card className="p-6 space-y-4">
              {themes.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">
                  No hay temas guardados. Usa el botón + para crear uno nuevo.
                </p>
              ) : (
                themes.map((theme) => (
                  <div key={theme.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={theme.name}
                      onChange={(e) => updateThemeName(theme.id, e.target.value)}
                      placeholder="Nombre del tema"
                      className="flex-1 px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button onClick={() => openTheme(theme.id)} className="sm:w-auto whitespace-nowrap">
                      Acceder
                    </Button>
                  </div>
                ))
              )}
            </Card>
          )}
        </div>

        <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
      </div>
    )
  }

  if (viewState === "subtopics") {
    if (!currentTheme) {
      return (
        <div className="min-h-screen bg-background p-8">
          <div className="max-w-3xl mx-auto">
            <Card className="p-12 space-y-4 text-center">
              <p className="text-muted-foreground">Selecciona un tema desde la capa principal.</p>
              <Button onClick={goToHome} className="mx-auto">
                Volver a temas
              </Button>
            </Card>
          </div>
          <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToHome}
                className="hover:bg-primary/10"
                title="Volver a temas"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <input
                type="text"
                value={currentTheme.name}
                onChange={(e) => updateThemeName(currentTheme.id, e.target.value)}
                className="text-3xl font-bold bg-transparent focus:outline-none focus:ring-2 focus:ring-ring px-3 py-2 rounded-md border border-transparent focus:border-ring"
              />
            </div>
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
              <Button
                variant="outline"
                size="icon"
                onClick={importFromClipboard}
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
          ) : (
            <Card className="p-6 space-y-4">
              {subtopics.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">
                  Aún no hay subtemas. Usa el botón + para importar o crear uno nuevo.
                </p>
              ) : (
                subtopics.map((subtopic) => (
                  <div key={subtopic.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={subtopic.text}
                      onChange={(e) => updateSubtopicText(subtopic.id, e.target.value)}
                      placeholder="Ingresa un subtema..."
                      className="flex-1 px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button
                      onClick={() => evaluatePropositions(subtopic.id)}
                      disabled={!subtopic.text.trim() || isGenerating || isLoadingData}
                      className="whitespace-nowrap"
                    >
                      {isGenerating ? "Generando..." : "Evaluar proposiciones"}
                    </Button>
                  </div>
                ))
              )}

              <Button variant="outline" onClick={addSubtopic} className="w-full bg-transparent">
                <Plus className="w-4 h-4 mr-2" />
                Agregar subtema
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
          <h1 className="text-3xl font-bold text-center mb-8 text-balance">Evaluación de Proposiciones</h1>

          <Card className="p-8 space-y-6">
            {propositions.map((prop, index) => (
              <div
                key={prop.id}
                className="flex items-start justify-between gap-6 p-6 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {getPropositionLabel(index)}
                  </p>
                  <MathText text={prop.text} className="text-lg leading-relaxed text-foreground" />
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
          title="Volver a subtemas"
        >
          <Home className="w-6 h-6" />
        </Button>
      </div>

      <div className="max-w-4xl w-full space-y-8">
        <Card className="p-12">
          <div className="flex items-start justify-between gap-8">
            <div className="flex-1 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {getPropositionLabel(currentIndex)}
              </p>
              {currentProposition && (
                <MathText text={currentProposition.text} className="text-2xl leading-relaxed text-foreground" />
              )}
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
              key={`${currentProposition.id}-${audioIdx}`}
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
