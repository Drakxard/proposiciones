"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_VARIANT_INSTRUCTIONS,
  GROQ_MODEL_STORAGE_KEY,
  GROQ_SYSTEM_PROMPT_STORAGE_KEY,
  GROQ_VARIANT_PROMPTS_STORAGE_KEY,
  VARIANT_LABELS,
  type PropositionVariant,
} from "@/lib/groq-config"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const VARIANT_KEYS: PropositionVariant[] = ["reciproco", "inverso", "contrareciproco"]

const createDefaultVariantPrompts = (): Record<PropositionVariant, string> => ({
  ...DEFAULT_VARIANT_INSTRUCTIONS,
})

const parseStoredVariantPrompts = (raw: string | null) => {
  const parsedPrompts = createDefaultVariantPrompts()

  if (!raw) {
    return parsedPrompts
  }

  try {
    const stored = JSON.parse(raw)
    for (const key of VARIANT_KEYS) {
      const value = stored?.[key]
      if (typeof value === "string") {
        parsedPrompts[key] = value
      }
    }
  } catch (error) {
    console.error("[v0] Error parsing stored Groq variant prompts:", error)
  }

  return parsedPrompts
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [model, setModel] = useState(DEFAULT_GROQ_MODEL)
  const [prompt, setPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [variantPrompts, setVariantPrompts] = useState<Record<PropositionVariant, string>>(
    () => createDefaultVariantPrompts(),
  )
  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      return
    }

    const savedModel = localStorage.getItem(GROQ_MODEL_STORAGE_KEY) || DEFAULT_GROQ_MODEL
    const savedPrompt = localStorage.getItem(GROQ_SYSTEM_PROMPT_STORAGE_KEY) || DEFAULT_SYSTEM_PROMPT
    const savedVariantPrompts = parseStoredVariantPrompts(
      localStorage.getItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY),
    )
    setModel(savedModel)
    setPrompt(savedPrompt)
    setVariantPrompts(savedVariantPrompts)

    let isActive = true

    const loadModels = async () => {
      try {
        const models = await getAvailableModels()
        if (!isActive) return

        const normalized = Array.from(new Set(models.length ? models : [DEFAULT_GROQ_MODEL]))

        if (!normalized.includes(savedModel)) {
          normalized.unshift(savedModel)
        }

        setAvailableModels(normalized)
      } catch (error) {
        console.error("[v0] Error loading Groq models:", error)
        if (!isActive) return
        setAvailableModels((prev) => (prev.length ? prev : [DEFAULT_GROQ_MODEL]))
      }
    }

    loadModels()

    return () => {
      isActive = false
    }
  }, [open])

  const handleSave = () => {
    localStorage.setItem(GROQ_MODEL_STORAGE_KEY, model)
    localStorage.setItem(GROQ_SYSTEM_PROMPT_STORAGE_KEY, prompt)
    localStorage.setItem(
      GROQ_VARIANT_PROMPTS_STORAGE_KEY,
      JSON.stringify(variantPrompts),
    )
    onOpenChange(false)
  }

  const handleReset = () => {
    setModel(DEFAULT_GROQ_MODEL)
    setPrompt(DEFAULT_SYSTEM_PROMPT)
    setVariantPrompts(createDefaultVariantPrompts())
    localStorage.removeItem(GROQ_MODEL_STORAGE_KEY)
    localStorage.removeItem(GROQ_SYSTEM_PROMPT_STORAGE_KEY)
    localStorage.removeItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY)
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
                {availableModels.length === 0 && (
                  <SelectItem value={DEFAULT_GROQ_MODEL}>{DEFAULT_GROQ_MODEL}</SelectItem>
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
              Este prompt se enviará a Groq junto con la condición ingresada
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Prompts por tipo de proposición</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Personaliza el mensaje que se enviará para cada tipo. Puedes usar las variables
                <code className="mx-1 rounded bg-muted px-1 py-0.5">{"{{condicion}}"}</code>,
                <code className="mx-1 rounded bg-muted px-1 py-0.5">{"{{proposicion_actual}}"}</code>
                y <code className="mx-1 rounded bg-muted px-1 py-0.5">{"{{tipo}}"}</code> para insertar
                la condición original, el texto actual y el nombre del tipo respectivamente.
              </p>
            </div>

            <div className="space-y-4">
              {VARIANT_KEYS.map((key) => {
                const variantLabel = VARIANT_LABELS[key]
                const capitalizedLabel = variantLabel
                  ? `${variantLabel.charAt(0).toUpperCase()}${variantLabel.slice(1)}`
                  : key

                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`variant-prompt-${key}`}>
                      Prompt para {capitalizedLabel}
                    </Label>
                    <Textarea
                      id={`variant-prompt-${key}`}
                      value={variantPrompts[key]}
                      onChange={(event) =>
                        setVariantPrompts((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                )
              })}
            </div>
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
