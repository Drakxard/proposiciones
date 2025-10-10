"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import { useMemo } from "react"

export interface EraSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  closedAt: number | null
  themeCount: number
  subtopicCount: number
  propositionCount: number
  audioCount: number
}

interface ErasModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEra: EraSummary | null
  history: EraSummary[]
  onSelectEra: (id: string) => void
  onRenameEra?: (id: string, name: string) => void
}

const formatRelative = (timestamp: number) => {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: es })
}

export function ErasModal({
  open,
  onOpenChange,
  currentEra,
  history,
  onSelectEra,
  onRenameEra,
}: ErasModalProps) {
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.updatedAt - a.updatedAt),
    [history],
  )

  const handleRename = (id: string, currentName: string) => {
    const newName = window.prompt("Nuevo nombre para esta era", currentName)
    if (newName && newName.trim() && onRenameEra) {
      onRenameEra(id, newName.trim())
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Historial de ciclos</DialogTitle>
          <DialogDescription>
            Consulta los ciclos anteriores, vuelve a abrirlos o renómbralos para mantener tu
            organización al día.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {currentEra && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Ciclo actual</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    En curso
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRename(currentEra.id, currentEra.name)}
                    disabled={!onRenameEra}
                  >
                    Renombrar
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-medium">{currentEra.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Creado {formatRelative(currentEra.createdAt)} • Última actividad {formatRelative(currentEra.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>{currentEra.themeCount} temas</span>
                    <span>{currentEra.subtopicCount} subtemas</span>
                    <span>{currentEra.propositionCount} proposiciones</span>
                    <span>{currentEra.audioCount} audios</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Eras anteriores</h2>
            {sortedHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no has cerrado ningún ciclo. Cuando cierres el actual aparecerá aquí.
              </p>
            ) : (
              <div className="space-y-3">
                {sortedHistory.map((era) => (
                  <div key={era.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-medium">{era.name}</p>
                          <span className="rounded-full border border-dashed border-muted-foreground/50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {era.closedAt ? `Cerrado ${formatRelative(era.closedAt)}` : "Guardado"}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Creado {formatRelative(era.createdAt)} • Última actividad {formatRelative(era.updatedAt)}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{era.themeCount} temas</span>
                          <span>{era.subtopicCount} subtemas</span>
                          <span>{era.propositionCount} proposiciones</span>
                          <span>{era.audioCount} audios</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        <Button variant="outline" size="sm" onClick={() => onSelectEra(era.id)}>
                          Volver a este ciclo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRename(era.id, era.name)}
                          disabled={!onRenameEra}
                        >
                          Renombrar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
