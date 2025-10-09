"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"
import {
  DEFAULT_SYSTEM_PROMPT,
  MODEL_KIND_LABEL,
  MODEL_KIND_ORDER,
  MODEL_OPTIONS,
  UNIVERSAL_MODEL_ID,
  isAllowedGroqModel,
  type ModelOption,
} from "@/lib/groq"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [model, setModel] = useState(UNIVERSAL_MODEL_ID)
  const [prompt, setPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])

  useEffect(() => {
    if (open) {
      const savedModel = localStorage.getItem("groq_model")
      const savedPrompt = localStorage.getItem("groq_prompt") || DEFAULT_SYSTEM_PROMPT

      setModel(isAllowedGroqModel(savedModel) ? savedModel : UNIVERSAL_MODEL_ID)
      setPrompt(savedPrompt)

      getAvailableModels()
        .then(setAvailableModels)
        .catch(() => setAvailableModels(MODEL_OPTIONS))
    }
  }, [open])

  const handleSave = () => {
    const persistedModel = isAllowedGroqModel(model) ? model : UNIVERSAL_MODEL_ID
    localStorage.setItem("groq_model", persistedModel)
    localStorage.setItem("groq_prompt", prompt)
    onOpenChange(false)
  }

  const handleReset = () => {
    setModel(UNIVERSAL_MODEL_ID)
    setPrompt(DEFAULT_SYSTEM_PROMPT)
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
                {MODEL_KIND_ORDER.map((kind) => {
                  const optionsForKind = availableModels.filter((option) => option.kind === kind)
                  if (!optionsForKind.length) {
                    return null
                  }

                  return (
                    <SelectGroup key={kind}>
                      <SelectLabel>{MODEL_KIND_LABEL[kind]}</SelectLabel>
                      {optionsForKind.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          <div className="flex flex-col">
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground leading-tight">
                              {option.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Define el modelo universal o razonador que se aplicará en todas las operaciones de Groq.
            </p>
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
