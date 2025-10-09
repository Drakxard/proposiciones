"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"
import { DEFAULT_MODEL, DEFAULT_PROMPT } from "@/lib/groq"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)

  useEffect(() => {
    if (open) {
      const savedModel = localStorage.getItem("groq_model") || DEFAULT_MODEL
      const savedPrompt = localStorage.getItem("groq_prompt") || DEFAULT_PROMPT
      setModel(savedModel)
      setPrompt(savedPrompt)

      setIsLoadingModels(true)
      getAvailableModels()
        .then((models) => {
          let normalized = models.length ? [...models] : [DEFAULT_MODEL]

          if (savedModel && !normalized.includes(savedModel)) {
            normalized = [savedModel, ...normalized]
          }

          setAvailableModels(normalized)
          setModel((current) => {
            if (current && normalized.includes(current)) {
              return current
            }

            if (savedModel && normalized.includes(savedModel)) {
              return savedModel
            }

            return normalized[0]
          })
        })
        .catch((error) => {
          console.error("[v0] Error fetching Groq models:", error)
          setAvailableModels([DEFAULT_MODEL])
          setModel((current) => current || DEFAULT_MODEL)
        })
        .finally(() => setIsLoadingModels(false))
    }
  }, [open])

  const handleSave = () => {
    localStorage.setItem("groq_model", model)
    localStorage.setItem("groq_prompt", prompt)
    onOpenChange(false)
  }

  const handleReset = () => {
    setModel(DEFAULT_MODEL)
    setPrompt(DEFAULT_PROMPT)
    localStorage.removeItem("groq_model")
    localStorage.removeItem("groq_prompt")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes de Groq</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="model">Modelo de Groq</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger disabled={isLoadingModels || availableModels.length === 0}>
                <SelectValue placeholder={isLoadingModels ? "Cargando modelos..." : "Selecciona un modelo"} />
              </SelectTrigger>
              <SelectContent>
                {availableModels.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {isLoadingModels ? "Cargando modelos..." : "No se encontraron modelos disponibles"}
                  </div>
                ) : (
                  availableModels.map((modelOption) => (
                    <SelectItem key={modelOption} value={modelOption}>
                      {modelOption}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Selecciona el modelo de Groq a utilizar</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt del sistema</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Este prompt se enviará a Groq para generar cada variante individual cuando la solicites.
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleReset}>
              Restaurar valores por defecto
            </Button>
            <Button onClick={handleSave}>Guardar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
