"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAvailableModels } from "@/app/actions"
import {
  DEFAULT_SUBTOPIC_COPY_TEMPLATE,
  SUBTOPIC_COPY_TEMPLATE_STORAGE_KEY,
} from "@/lib/copy-template"
import {
  GROQ_DEFAULT_MODEL,
  GROQ_DEFAULT_VARIANT_PROMPTS,
  GROQ_FALLBACK_MODELS,
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
  onCopyTemplateChange?: (template: string) => void
}

const createDefaultPrompts = (): Record<PropositionVariant, string> => ({
  reciproco: GROQ_DEFAULT_VARIANT_PROMPTS.reciproco,
  inverso: GROQ_DEFAULT_VARIANT_PROMPTS.inverso,
  contrareciproco: GROQ_DEFAULT_VARIANT_PROMPTS.contrareciproco,
})

export function SettingsModal({ open, onOpenChange, onCopyTemplateChange }: SettingsModalProps) {
  const [model, setModel] = useState(GROQ_DEFAULT_MODEL)
  const [variantPrompts, setVariantPrompts] = useState<Record<PropositionVariant, string>>(
    createDefaultPrompts,
  )
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [copyTemplate, setCopyTemplate] = useState(DEFAULT_SUBTOPIC_COPY_TEMPLATE)

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

    try {
      const storedTemplate = localStorage.getItem(SUBTOPIC_COPY_TEMPLATE_STORAGE_KEY)
      if (storedTemplate && typeof storedTemplate === "string") {
        setCopyTemplate(storedTemplate)
      } else {
        setCopyTemplate(DEFAULT_SUBTOPIC_COPY_TEMPLATE)
      }
    } catch (error) {
      console.warn("[v0] No se pudo leer el formato de copiado del subtema:", error)
      setCopyTemplate(DEFAULT_SUBTOPIC_COPY_TEMPLATE)
    }

    let isActive = true

    const loadModels = async () => {
      try {
        const models = await getAvailableModels()
        if (!isActive) return

        const normalized = Array.from(
          new Set([
            ...GROQ_FALLBACK_MODELS,
            ...(models.length ? models : []),
          ]),
        )

        const withSaved = savedModel
          ? Array.from(new Set([savedModel, ...normalized]))
          : normalized

        setAvailableModels(withSaved)
      } catch (error) {
        console.error("[v0] Error loading Groq models:", error)
        if (!isActive) return
        setAvailableModels((prev) =>
          prev.length ? prev : Array.from(new Set([...GROQ_FALLBACK_MODELS])),
        )
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
    localStorage.setItem(SUBTOPIC_COPY_TEMPLATE_STORAGE_KEY, copyTemplate)
    onCopyTemplateChange?.(copyTemplate)
    onOpenChange(false)
  }

  const handleReset = () => {
    const defaults = createDefaultPrompts()
    setModel(GROQ_DEFAULT_MODEL)
    setVariantPrompts(defaults)
    localStorage.removeItem(GROQ_MODEL_STORAGE_KEY)
    localStorage.removeItem(GROQ_VARIANT_PROMPTS_STORAGE_KEY)
    localStorage.removeItem(GROQ_LEGACY_PROMPT_STORAGE_KEY)
    localStorage.removeItem(SUBTOPIC_COPY_TEMPLATE_STORAGE_KEY)
    setCopyTemplate(DEFAULT_SUBTOPIC_COPY_TEMPLATE)
    onCopyTemplateChange?.(DEFAULT_SUBTOPIC_COPY_TEMPLATE)
  }

  const handlePromptChange = (variant: PropositionVariant, value: string) => {
    setVariantPrompts((current) => ({
      ...current,
      [variant]: value,
    }))
  }

  const handleCopyTemplateChange = (value: string) => {
    setCopyTemplate(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustes de Groq</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="copy-template">Formato para copiar el subtema</Label>
            <Textarea
              id="copy-template"
              value={copyTemplate}
              onChange={(event) => handleCopyTemplateChange(event.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Puedes usar los marcadores <code className="font-mono text-xs">{"{condicion}"}</code>,
              <code className="font-mono text-xs">{"{reciproco}"}</code>,
              <code className="font-mono text-xs">{"{inverso}"}</code> y
              <code className="font-mono text-xs">{"{contrareciproco}"}</code> para insertar las
              proposiciones correspondientes. También están disponibles
              <code className="font-mono text-xs">{"{subtema}"}</code> y
              <code className="font-mono text-xs">{"{tema}"}</code>.
            </p>
          </div>

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
                {availableModels.length === 0 &&
                  Array.from(new Set([...GROQ_FALLBACK_MODELS])).map((modelOption) => (
                    <SelectItem key={modelOption} value={modelOption}>
                      {modelOption}
                    </SelectItem>
                  ))}
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
