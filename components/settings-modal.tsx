"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_MODEL = "llama-3.3-70b-versatile"
const DEFAULT_PROMPT = `Según esta condición crea su recíproco, inverso, contra-recíproco.

Salida obligatoria en formato JSON:
{
  "reciproco": "texto del recíproco",
  "inverso": "texto del inverso",
  "contrareciproco": "texto del contra-recíproco"
}`

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      const savedModel = localStorage.getItem("groq_model") || DEFAULT_MODEL
      const savedPrompt = localStorage.getItem("groq_prompt") || DEFAULT_PROMPT
      setModel(savedModel)
      setPrompt(savedPrompt)

      getAvailableModels().then(setAvailableModels)
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
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un modelo" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((modelOption) => (
                  <SelectItem key={modelOption} value={modelOption}>
                    {modelOption}
                  </SelectItem>
                ))}
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
