"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Play, Mic, Headphones, Home, Plus, Settings, ArrowLeft, ArrowRight } from "lucide-react"
import { SettingsModal } from "@/components/settings-modal"
import { generatePropositions } from "./actions"
import {
  saveSubtopics,
  loadSubtopics,
  saveAudio,
  loadAudios,
  saveThemeName,
  loadThemeName,
} from "@/lib/storage"
import {
  isFileSystemSupported,
  requestDirectoryAccess,
  getSavedDirectoryHandle,
  writeJSONFile,
  readJSONFile,
  writeBlobFile,
  readBlobFile,
} from "@/lib/file-system"
import { LatexText } from "@/components/latex-text"

type PropositionType = "condicion" | "reciproco" | "inverso" | "contrareciproco"

interface Proposition {
  type: PropositionType
  text: string
  audios: Blob[]
}

interface Subtopic {
  id: string
  text: string
  propositions: Proposition[] | null
}

interface SubtopicData {
  id: string
  text: string
  propositions:
    | {
        type: PropositionType
        text: string
        audioCount: number
      }[]
    | null
}

type ViewState =
  | "home"
  | "subtopics"
  | "overview"
  | "recording"
  | "listening"
  | "countdown"
  | "prompt"

export default function PropositionsApp() {
  const [subtopics, setSubtopics] = useState<Subtopic[]>([
    { id: "1", text: "Si es Derivable entonces es Continuo", propositions: null },
  ])
  const [currentSubtopicId, setCurrentSubtopicId] = useState<string | null>(null)
  const [viewState, setViewState] = useState<ViewState>("home")
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [themeName, setThemeName] = useState("")

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [fileSystemHandle, setFileSystemHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [useFileSystem, setUseFileSystem] = useState(false)

  const currentSubtopic = subtopics.find((s) => s.id === currentSubtopicId)
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

      if (e.key === "g" && (viewState === "subtopics" || viewState === "home")) {
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
      const loadedSubtopics = await loadSubtopics()
      const storedThemeName = await loadThemeName()

      if (storedThemeName) {
        setThemeName(storedThemeName)
      }

      console.log("[v0] Loaded subtopics from IndexedDB:", loadedSubtopics)

      if (loadedSubtopics.length === 0) {
        console.log("[v0] No subtopics found in IndexedDB")
        setIsLoadingData(false)
        return
      }

      // Load subtopics with their propositions and audios
      const subtopicsWithAudios: Subtopic[] = await Promise.all(
        loadedSubtopics.map(async (subtopic) => {
          if (!subtopic.propositions) {
            console.log(`[v0] Subtopic ${subtopic.id} has no propositions`)
            return subtopic
          }

          console.log(`[v0] Loading audios for subtopic ${subtopic.id}`)
          // Load audios for this subtopic
          const audiosGrouped = await loadAudios(subtopic.id)

          // Map audios to propositions
          const propositionsWithAudios = subtopic.propositions.map((prop, propIndex) => ({
            ...prop,
            audios: audiosGrouped[propIndex] || [],
          }))

          return {
            ...subtopic,
            propositions: propositionsWithAudios,
          }
        }),
      )

      console.log("[v0] Final subtopics with audios:", subtopicsWithAudios)
      setSubtopics(subtopicsWithAudios)
    } catch (error) {
      console.error("[v0] Error loading persisted data:", error)
    } finally {
      setIsLoadingData(false)
      console.log("[v0] Finished loading persisted data")
    }
  }

  const loadFromFileSystem = async (handle: FileSystemDirectoryHandle) => {
    try {
      console.log("[v0] Reading subtopics.json from file system...")
      const data = await readJSONFile(handle, "subtopics.json")
      if (!data || !Array.isArray(data)) {
        console.log("[v0] No valid subtopics.json found")
        return
      }

      console.log("[v0] Found subtopics in file system:", data)

      const metadata = await readJSONFile(handle, "metadata.json")
      if (metadata && typeof metadata.themeName === "string") {
        setThemeName(metadata.themeName)
      }

      // Load subtopics with audios
      const subtopicsWithAudios: Subtopic[] = await Promise.all(
        data.map(async (subtopic: any) => {
          if (!subtopic.propositions) {
            return subtopic
          }

          // Load audios for each proposition
          const propositionsWithAudios = await Promise.all(
            subtopic.propositions.map(async (prop: any, propIndex: number) => {
              const audios: Blob[] = []
              let audioIndex = 0

              // Try to load all audio files for this proposition
              while (true) {
                const filename = `audio-${subtopic.id}-${propIndex}-${audioIndex}.webm`
                const blob = await readBlobFile(handle, filename)
                if (!blob) break
                audios.push(blob)
                audioIndex++
              }

              return {
                ...prop,
                audios,
              }
            }),
          )

          return {
            ...subtopic,
            propositions: propositionsWithAudios,
          }
        }),
      )

      console.log("[v0] Loaded subtopics from file system:", subtopicsWithAudios)
      setSubtopics(subtopicsWithAudios)
    } catch (error) {
      console.error("[v0] Error loading from file system:", error)
    }
  }

  useEffect(() => {
    if (!isLoadingData) {
      saveData()
    }
  }, [subtopics, isLoadingData, themeName])

  const saveData = async () => {
    try {
      if (useFileSystem && fileSystemHandle) {
        await saveToFileSystem(fileSystemHandle)
      } else {
        // Fallback to IndexedDB
        const subtopicsToSave = subtopics.map((subtopic) => ({
          id: subtopic.id,
          text: subtopic.text,
          propositions: subtopic.propositions
            ? subtopic.propositions.map((prop) => ({
                type: prop.type,
                text: prop.text,
                audios: [],
              }))
            : null,
        }))

        await saveSubtopics(subtopicsToSave)
        await saveThemeName(themeName)

        // Save audio blobs separately
        for (const subtopic of subtopics) {
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
    } catch (error) {
      console.error("[v0] Error saving data:", error)
    }
  }

  const saveToFileSystem = async (handle: FileSystemDirectoryHandle) => {
    try {
      // Save subtopics structure
      const subtopicsData = subtopics.map((subtopic) => ({
        id: subtopic.id,
        text: subtopic.text,
        propositions: subtopic.propositions
          ? subtopic.propositions.map((prop) => ({
              type: prop.type,
              text: prop.text,
            }))
          : null,
      }))

      await writeJSONFile(handle, "subtopics.json", subtopicsData)
      await writeJSONFile(handle, "metadata.json", { themeName })

      // Save audio files
      for (const subtopic of subtopics) {
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

  const addSubtopic = () => {
    const newSubtopic: Subtopic = {
      id: Date.now().toString(),
      text: "",
      propositions: null,
    }
    setSubtopics([...subtopics, newSubtopic])
  }

  const handleSelectSubtopic = (subtopic: Subtopic) => {
    setCurrentSubtopicId(subtopic.id)
    setCurrentIndex(0)
    if (subtopic.propositions && subtopic.propositions.length > 0) {
      setViewState("overview")
    } else {
      setViewState("subtopics")
    }
  }

  const handleImportFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        alert("No se puede acceder al portapapeles desde este navegador.")
        return
      }

      const rawText = await navigator.clipboard.readText()
      const trimmed = rawText.trim()

      if (!trimmed) {
        alert("El portapapeles está vacío.")
        return
      }

      let normalized = trimmed
      if (normalized.startsWith("{{")) {
        normalized = "[" + normalized.slice(2)
      }
      if (normalized.endsWith("}}")) {
        normalized = normalized.slice(0, -2) + "]"
      }

      let parsed: any
      try {
        parsed = JSON.parse(normalized)
      } catch (error) {
        console.error("[v0] Error parsing clipboard JSON:", error)
        alert("No se pudo interpretar el contenido del portapapeles.")
        return
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        alert("El contenido del portapapeles no tiene el formato esperado.")
        return
      }

      const [first, ...rest] = parsed
      const name = (first?.texto ?? first?.text ?? "").trim()

      if (!name) {
        alert("No se encontró el nombre del subtema en el portapapeles.")
        return
      }

      const typeOrder: PropositionType[] = ["condicion", "reciproco", "inverso", "contrareciproco"]
      const propositionsFromClipboard: Proposition[] = rest
        .map((item: any, index: number) => {
          const text = (item?.texto ?? item?.text ?? "").trim()
          if (!text) return null
          const type = typeOrder[index % typeOrder.length]
          return { type, text, audios: [] as Blob[] }
        })
        .filter((item): item is Proposition => item !== null)

      const newSubtopic: Subtopic = {
        id: Date.now().toString(),
        text: name,
        propositions: propositionsFromClipboard.length > 0 ? propositionsFromClipboard : null,
      }

      setSubtopics([...subtopics, newSubtopic])
      setCurrentSubtopicId(newSubtopic.id)
      setCurrentIndex(0)
      setViewState(newSubtopic.propositions ? "overview" : "subtopics")
    } catch (error) {
      console.error("[v0] Error importing from clipboard:", error)
      alert("Ocurrió un error al importar el subtema.")
    }
  }

  const updateSubtopicText = (id: string, text: string) => {
    setSubtopics(subtopics.map((s) => (s.id === id ? { ...s, text } : s)))
  }

  const evaluatePropositions = async (subtopicId: string) => {
    const subtopic = subtopics.find((s) => s.id === subtopicId)
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
        { type: "condicion", text: subtopic.text, audios: [] },
        { type: "reciproco", text: result.reciproco, audios: [] },
        { type: "inverso", text: result.inverso, audios: [] },
        { type: "contrareciproco", text: result.contrareciproco, audios: [] },
      ]

      setSubtopics(subtopics.map((s) => (s.id === subtopicId ? { ...s, propositions: newPropositions } : s)))

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

        setSubtopics(
          subtopics.map((s) => {
            if (s.id === currentSubtopicId && s.propositions) {
              const newPropositions = [...s.propositions]
              newPropositions[currentIndex].audios.push(audioBlob)
              return { ...s, propositions: newPropositions }
            }
            return s
          }),
        )

        stream.getTracks().forEach((track) => track.stop())
        setViewState("countdown")
      }

      mediaRecorder.start()
    } catch (error) {
      console.error("[v0] Error accessing microphone:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
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
    setViewState("home")
    setCurrentSubtopicId(null)
    setIsRecording(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }

  if (viewState === "home") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="w-full md:max-w-xl space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="theme-name">
                Tema
              </label>
              <input
                id="theme-name"
                type="text"
                value={themeName}
                onChange={(event) => setThemeName(event.target.value)}
                placeholder="Ingresa nombre tema"
                className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isFileSystemSupported() && !useFileSystem && (
                <Button variant="outline" onClick={activateFileSystemPersistence}>
                  Activar persistencia de archivos
                </Button>
              )}
              {useFileSystem ? (
                <span className="text-sm text-muted-foreground px-3 py-1 rounded-full bg-primary/10">
                  📁 Persistencia de archivos activa
                </span>
              ) : (
                <span className="text-sm text-muted-foreground px-3 py-1 rounded-full bg-muted">
                  💾 Guardado en navegador
                </span>
              )}
              <Button variant="outline" onClick={() => setViewState("subtopics")} className="bg-transparent">
                Gestionar subtemas
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleImportFromClipboard}
                className="hover:bg-primary/10"
                title="Importar desde portapapeles"
              >
                <Plus className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettingsModal(true)}
                className="hover:bg-primary/10"
                title="Ajustes (g)"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-balance">Subtemas</h2>
            {isLoadingData ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">Cargando datos...</p>
              </Card>
            ) : subtopics.length === 0 ? (
              <Card className="p-12 text-center space-y-2">
                <p className="text-lg font-medium text-foreground">Sin subtemas aún</p>
                <p className="text-sm text-muted-foreground">
                  Usa el botón “+” para importar un subtema desde el portapapeles o gestiona los subtemas manualmente.
                </p>
              </Card>
            ) : (
              <Card className="p-0 divide-y">
                {subtopics.map((subtopic) => {
                  const displayText = subtopic.text.trim() ? subtopic.text : "Subtema sin nombre"
                  return (
                    <button
                      key={subtopic.id}
                      onClick={() => handleSelectSubtopic(subtopic)}
                      className="w-full text-left p-6 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subtema</p>
                          <div className="text-lg font-semibold leading-relaxed text-foreground">
                            <LatexText text={displayText} />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className={subtopic.propositions ? "text-primary" : "text-muted-foreground"}>
                            {subtopic.propositions
                              ? `${subtopic.propositions.length} proposiciones listas`
                              : "Pendiente de evaluar"}
                          </span>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </Card>
            )}
          </div>

          <SettingsModal open={showSettingsModal} onOpenChange={setShowSettingsModal} />
        </div>
      </div>
    )
  }

  if (viewState === "subtopics") {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewState("home")}
                className="hover:bg-primary/10"
                title="Volver al tema"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-balance">Subtemas</h1>
                <p className="text-sm text-muted-foreground">
                  {themeName ? `Tema: ${themeName}` : "Tema sin título"}
                </p>
              </div>
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
                    {isGenerating ? "Generando..." : "Evaluar proposiciones"}
                  </Button>
                </div>
              ))}

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
            onClick={goToHome}
            className="hover:bg-primary/10"
            title="Volver a subtemas"
          >
            <Home className="w-6 h-6" />
          </Button>
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-3xl font-bold text-center mb-8 text-balance">Evaluación de Proposiciones</h1>

          <Card className="p-8 space-y-6">
            {propositions.map((prop, index) => (
              <div
                key={prop.type}
                className="flex items-start justify-between gap-6 p-6 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 space-y-2">
                  <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {index === 0 && "Condición"}
                    {index === 1 && "Recíproco"}
                    {index === 2 && "Inverso"}
                    {index === 3 && "Contra-Recíproco"}
                  </p>
                  <div className="text-lg leading-relaxed text-foreground font-mono tracking-wide break-words">
                    <LatexText text={prop.text} />
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
                {currentIndex === 0 && "Condición"}
                {currentIndex === 1 && "Recíproco"}
                {currentIndex === 2 && "Inverso"}
                {currentIndex === 3 && "Contra-Recíproco"}
              </p>
              <div className="text-2xl leading-relaxed font-mono tracking-wide text-foreground break-words">
                <LatexText text={currentProposition?.text ?? ""} />
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
