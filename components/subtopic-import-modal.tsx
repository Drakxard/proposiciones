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
