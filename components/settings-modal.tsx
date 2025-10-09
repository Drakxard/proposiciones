"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"
import {
  DEFAULT_PROMPT,
  DEFAULT_REASONER_MODEL,
  DEFAULT_UNIVERSAL_MODEL,
  GROQ_MODEL_GROUPS,
  type GroqModelGroups,
} from "@/lib/groq"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [universalModel, setUniversalModel] = useState(DEFAULT_UNIVERSAL_MODEL)
  const [reasonerModel, setReasonerModel] = useState(DEFAULT_REASONER_MODEL)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [availableModels, setAvailableModels] = useState<GroqModelGroups>(GROQ_MODEL_GROUPS)

  useEffect(() => {
    if (open) {
      const savedUniversalModel =
        localStorage.getItem("groq_universal_model") ||
        localStorage.getItem("groq_model") ||
        DEFAULT_UNIVERSAL_MODEL
      const savedReasonerModel =
        localStorage.getItem("groq_reasoner_model") || savedUniversalModel || DEFAULT_REASONER_MODEL
      const savedPrompt = localStorage.getItem("groq_prompt") || DEFAULT_PROMPT
      setUniversalModel(savedUniversalModel)
      setReasonerModel(savedReasonerModel)
      setPrompt(savedPrompt)

      getAvailableModels().then((models) => setAvailableModels(models))
    }
  }, [open])

  const handleSave = () => {
    localStorage.setItem("groq_model", universalModel)
    localStorage.setItem("groq_universal_model", universalModel)
    localStorage.setItem("groq_reasoner_model", reasonerModel)
    localStorage.setItem("groq_prompt", prompt)
    onOpenChange(false)
  }

  const handleReset = () => {
    setUniversalModel(DEFAULT_UNIVERSAL_MODEL)
    setReasonerModel(DEFAULT_REASONER_MODEL)
    setPrompt(DEFAULT_PROMPT)
    localStorage.removeItem("groq_model")
    localStorage.removeItem("groq_universal_model")
    localStorage.removeItem("groq_reasoner_model")
    localStorage.removeItem("groq_prompt")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes de Groq</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="universal-model">Modelo universal</Label>
              <Select value={universalModel} onValueChange={setUniversalModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un modelo universal" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.universal.map((modelOption) => (
                    <SelectItem key={modelOption.id} value={modelOption.id}>
                      <div className="flex flex-col">
                        <span>{modelOption.label}</span>
                        {modelOption.description && (
                          <span className="text-xs text-muted-foreground">{modelOption.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Selecciona el modelo universal principal que se utilizará para generar las proposiciones.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reasoner-model">Modelo razonador</Label>
              <Select value={reasonerModel} onValueChange={setReasonerModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un modelo razonador" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.reasoner.map((modelOption) => (
                    <SelectItem key={modelOption.id} value={modelOption.id}>
                      <div className="flex flex-col">
                        <span>{modelOption.label}</span>
                        {modelOption.description && (
                          <span className="text-xs text-muted-foreground">{modelOption.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Este modelo se utilizará para tareas de reescritura o razonamiento cuando sea necesario.
              </p>
            </div>
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
              Este prompt se enviará a Groq junto con la condición ingresada
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
