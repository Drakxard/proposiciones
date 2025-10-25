"use client"

import { useEffect, useMemo, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ClipboardParseDiagnostics, parseClipboardJsonWithDiagnostics } from "@/lib/clipboard"
import { MathText } from "@/components/math-text"

export interface SubtopicImportPayload {
  rawText: string
  diagnostics: ClipboardParseDiagnostics
}

interface SubtopicImportModalProps {
  open: boolean
  initialText: string
  clipboardError?: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: SubtopicImportPayload) => void
}

export function SubtopicImportModal({
  open,
  initialText,
  clipboardError,
  onOpenChange,
  onSubmit,
}: SubtopicImportModalProps) {
  const [value, setValue] = useState(initialText ?? "")

  useEffect(() => {
    if (open) {
      setValue(initialText ?? "")
    }
  }, [open, initialText])

  const diagnostics = useMemo(() => parseClipboardJsonWithDiagnostics(value), [value])
  const parsedLength = diagnostics.success && diagnostics.parsed ? diagnostics.parsed.length : 0

  const previewItems = useMemo(() => {
    if (!diagnostics.success || !diagnostics.parsed) {
      return []
    }

    return diagnostics.parsed
      .map((entry, index) => {
        let textValue = ""
        let typeValue: string | undefined

        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "bigint") {
          textValue = String(entry)
        } else if (entry && typeof entry === "object") {
          const rawText =
            typeof (entry as any).texto === "string"
              ? (entry as any).texto
              : typeof (entry as any).text === "string"
                ? (entry as any).text
                : (entry as any).texto != null || (entry as any).text != null
                  ? String((entry as any).texto ?? (entry as any).text)
                  : ""

          textValue = rawText
          if (typeof (entry as any).tipo === "string") {
            typeValue = (entry as any).tipo
          }
        }

        return {
          key: index,
          text: textValue,
          type: typeValue,
        }
      })
      .filter((item) => item.text.trim().length > 0)
  }, [diagnostics])

  const canImport = diagnostics.success && parsedLength > 0

  const handleSubmit = () => {
    if (!canImport) {
      return
    }

    onSubmit({
      rawText: value,
      diagnostics,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar subtema</DialogTitle>
          <DialogDescription>
            Pega el JSON generado por Groq o ajusta manualmente la información antes de importarla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {clipboardError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {clipboardError}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="mass-import-text">Contenido a importar</Label>
            <Textarea
              id="mass-import-text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={12}
              className="font-mono text-sm"
              placeholder='[\n  { "texto": "Condición" },\n  { "tipo": "reciproco", "texto": "..." }\n]'
            />
            <p className="text-xs text-muted-foreground">
              Puedes pegar varios elementos a la vez, incluso si vienen como <code>&#123;&#125;,&#123;&#125;,...</code>.
              La aplicación intentará corregir formateos comunes y solo bloqueará la importación si el JSON no se
              puede leer.
            </p>
          </div>

          {!diagnostics.success && diagnostics.error && value.trim() ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {diagnostics.error}
            </div>
          ) : null}

          {previewItems.length > 0 ? (
            <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Vista previa del contenido</h3>
                <p className="text-xs text-muted-foreground">
                  Asegúrate de que las expresiones en LaTeX se vean como esperas antes de importar el subtema.
                </p>
              </div>
              <div className="space-y-4">
                {previewItems.map((item, index) => (
                  <div key={item.key} className="space-y-1 rounded-md bg-background/80 p-3 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Elemento {index + 1}</span>
                      {item.type ? <span className="font-medium text-primary">Tipo: {item.type}</span> : null}
                    </div>
                    <MathText text={item.text} className="text-sm" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canImport}>
            Importar subtema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
