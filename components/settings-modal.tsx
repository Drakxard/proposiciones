"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"
import {
  GROQ_DEFAULT_MODEL,
  GROQ_DEFAULT_VARIANT_PROMPTS,
  GROQ_LEGACY_PROMPT_STORAGE_KEY,
  GROQ_MODEL_STORAGE_KEY,
  GROQ_VARIANT_KEYS,
  GROQ_VARIANT_LABELS,
  GROQ_VARIANT_PROMPTS_STORAGE_KEY,
  type PropositionVariant,
} from "@/lib/groq"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const createDefaultPrompts = (): Record<PropositionVariant, string> => ({
  reciproco: GROQ_DEFAULT_VARIANT_PROMPTS.reciproco,
  inverso: GROQ_DEFAULT_VARIANT_PROMPTS.inverso,
  contrareciproco: GROQ_DEFAULT_VARIANT_PROMPTS.contrareciproco,
})

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [model, setModel] = useState(GROQ_DEFAULT_MODEL)
  const [variantPrompts, setVariantPrompts] = useState<Record<PropositionVariant, string>>(
    createDefaultPrompts,
  )
  const [availableModels, setAvailableModels] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      return
    }

    const savedModel = localStorage.getItem(GROQ_MODEL_STORAGE_KEY) || GROQ_DEFAULT_MODEL
    setModel(savedModel)

    let prompts = createDefaultPrompts()

    try {
      const storedPrompts = localStorage.getItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY)

      if (storedPrompts) {
        const parsed = JSON.parse(storedPrompts)
        if (parsed && typeof parsed === "object") {
          prompts = {
            ...prompts,
            ...Object.fromEntries(
              GROQ_VARIANT_KEYS.map((variant) => [
                variant,
                typeof parsed[variant] === "string"
                  ? String(parsed[variant])
                  : prompts[variant],
              ]),
            ),
          }
        }
      } else {
        const legacyPrompt = localStorage.getItem(GROQ_LEGACY_PROMPT_STORAGE_KEY)
        if (legacyPrompt) {
          prompts = {
            reciproco: legacyPrompt,
            inverso: legacyPrompt,
            contrareciproco: legacyPrompt,
          }
        }
      }
    } catch (error) {
      console.warn("[v0] No se pudieron leer los prompts de Groq:", error)
    }

    setVariantPrompts(prompts)

    let isActive = true

    const loadModels = async () => {
      try {
        const models = await getAvailableModels()
        if (!isActive) return

        const normalized = Array.from(new Set(models.length ? models : [GROQ_DEFAULT_MODEL]))

        if (!normalized.includes(savedModel)) {
          normalized.unshift(savedModel)
        }

        setAvailableModels(normalized)
      } catch (error) {
        console.error("[v0] Error loading Groq models:", error)
        if (!isActive) return
        setAvailableModels((prev) => (prev.length ? prev : [GROQ_DEFAULT_MODEL]))
      }
    }

    loadModels()

    return () => {
      isActive = false
    }
  }, [open])

  const handleSave = () => {
    localStorage.setItem(GROQ_MODEL_STORAGE_KEY, model)
    localStorage.setItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY, JSON.stringify(variantPrompts))
    localStorage.removeItem(GROQ_LEGACY_PROMPT_STORAGE_KEY)
    onOpenChange(false)
  }

  const handleReset = () => {
    const defaults = createDefaultPrompts()
    setModel(GROQ_DEFAULT_MODEL)
    setVariantPrompts(defaults)
    localStorage.removeItem(GROQ_MODEL_STORAGE_KEY)
    localStorage.removeItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY)
    localStorage.removeItem(GROQ_LEGACY_PROMPT_STORAGE_KEY)
  }

  const handlePromptChange = (variant: PropositionVariant, value: string) => {
    setVariantPrompts((current) => ({
      ...current,
      [variant]: value,
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes de Groq</DialogTitle>
          <DialogDescription>
            Configura el modelo y personaliza los prompts utilizados para generar variaciones de
            las proposiciones.
          </DialogDescription>
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
                  <SelectItem value={GROQ_DEFAULT_MODEL}>{GROQ_DEFAULT_MODEL}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Selecciona el modelo de Groq a utilizar</p>
          </div>

          <div className="space-y-6">
            {GROQ_VARIANT_KEYS.map((variant) => (
              <div key={variant} className="space-y-2">
                <Label htmlFor={`prompt-${variant}`}>
                  Prompt para el {GROQ_VARIANT_LABELS[variant]}
                </Label>
                <Textarea
                  id={`prompt-${variant}`}
                  value={variantPrompts[variant]}
                  onChange={(event) => handlePromptChange(variant, event.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  Puedes usar <code className="font-mono text-xs">{"{{condicion}}"}</code> para insertar la condición base
                  automáticamente.
                </p>
              </div>
            ))}
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
