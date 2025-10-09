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
  const parsed = diagnostics.success && diagnostics.parsed ? diagnostics.parsed : []

  const [subtopicInfo, ...propositionEntries] = parsed

  const previewIssues: string[] = []
  let subtopicText = ""

  if (
    subtopicInfo &&
    typeof subtopicInfo === "object" &&
    typeof (subtopicInfo as any).texto === "string"
  ) {
    subtopicText = (subtopicInfo as any).texto as string
  }

  if (diagnostics.success) {
    if (!subtopicText) {
      previewIssues.push(
        "El primer elemento debe incluir la propiedad 'texto' con el contenido del subtema.",
      )
    }

    propositionEntries.forEach((entry, index) => {
      const rawText =
        typeof entry === "string"
          ? entry
          : typeof entry?.texto === "string"
            ? entry.texto
            : typeof entry === "number"
              ? entry.toString()
              : ""

      if (!rawText.trim()) {
        previewIssues.push(`La proposición ${index + 1} no tiene texto.`)
      }
    })
  }

  const canImport = diagnostics.success && !previewIssues.length && parsed.length > 0

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
              Puedes pegar varios elementos a la vez. La aplicación intentará corregir formateos comunes y
              mostrará los errores detectados antes de importar.
            </p>
          </div>

          {value.trim() ? (
            <div className="space-y-3">
              {diagnostics.success && diagnostics.normalizedText ? (
                <div className="rounded-md border bg-muted/40 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Vista previa normalizada</p>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-3 text-xs">
                    {diagnostics.normalizedText}
                  </pre>
                </div>
              ) : null}

              {diagnostics.appliedFixes.length ? (
                <div className="rounded-md border border-primary/30 bg-primary/10 p-4 text-sm text-primary-foreground">
                  <p className="font-medium">Correcciones automáticas aplicadas:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {diagnostics.appliedFixes.map((fix) => (
                      <li key={fix}>{fix}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs opacity-80">
                    Estas correcciones se recordarán automáticamente. Si pegas contenido con el mismo patrón, se
                    aplicarán de nuevo sin que tengas que corregirlo manualmente.
                  </p>
                </div>
              ) : null}

              {diagnostics.success ? (
                <div className="rounded-md border p-4">
                  <p className="text-sm font-medium">Resumen detectado</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <span className="font-semibold">Subtema:</span>{" "}
                      {subtopicText ? subtopicText : <span className="text-muted-foreground">Sin texto</span>}
                    </div>
                    <div>
                      <span className="font-semibold">Proposiciones:</span> {propositionEntries.length}
                    </div>
                  </div>
                  {propositionEntries.length ? (
                    <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {propositionEntries.map((entry, index) => {
                        const rawText =
                          typeof entry === "string"
                            ? entry
                            : typeof entry?.texto === "string"
                              ? entry.texto
                              : typeof entry === "number"
                                ? entry.toString()
                                : ""
                        const typeLabel =
                          entry && typeof entry === "object" && typeof entry?.tipo === "string"
                            ? (entry.tipo as string)
                            : "custom"
                        return (
                          <li key={index}>
                            <span className="font-medium">#{index + 1}</span>{" "}
                            <span className="uppercase tracking-wide text-xs text-muted-foreground">[{typeLabel}]</span>{" "}
                            {rawText || <span className="text-muted-foreground">Sin texto</span>}
                          </li>
                        )
                      })}
                    </ol>
                  ) : null}
                </div>
              ) : null}

              {!diagnostics.success && diagnostics.error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {diagnostics.error}
                </div>
              ) : null}

              {previewIssues.length ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  <p className="font-medium">Revisa antes de importar:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {previewIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
