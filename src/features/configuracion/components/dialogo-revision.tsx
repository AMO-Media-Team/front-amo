"use client"

import { GitCompareArrows, type LucideIcon } from "lucide-react"
import { type ReactNode, useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import type { ResultadoAccion } from "@/lib/result"
import { cn } from "@/lib/utils"

const ERROR_INESPERADO = "No se pudo completar la acción. Intenta de nuevo."

/**
 * Confirmación de un cambio con su revisión (antes → después, impacto). Un
 * fallo de la acción se muestra dentro del diálogo, que sigue abierto para
 * corregir o reintentar.
 */
export function DialogoRevision({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  icono: Icono = GitCompareArrows,
  children,
  textoConfirmar = "Confirmar cambio",
  destructivo = false,
  focoAlCerrar,
  onConfirmar,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  titulo: string
  descripcion?: ReactNode
  icono?: LucideIcon
  children?: ReactNode
  textoConfirmar?: string
  destructivo?: boolean
  /**
   * A dónde va el foco al cerrar. Devuelve `null` para el comportamiento por
   * defecto (el elemento que lo tenía al abrir).
   */
  focoAlCerrar?: () => HTMLElement | null
  onConfirmar: () => Promise<ResultadoAccion<unknown>>
}) {
  const [pendiente, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function cambiarAbierto(valor: boolean) {
    if (pendiente) return
    if (!valor) setError(null)
    onAbiertoChange(valor)
  }

  function confirmar() {
    setError(null)
    iniciar(async () => {
      try {
        const resultado = await onConfirmar()
        if (resultado.ok) onAbiertoChange(false)
        else setError(resultado.error)
      } catch {
        setError(ERROR_INESPERADO)
      }
    })
  }

  return (
    <Dialog open={abierto} onOpenChange={cambiarAbierto}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 p-0 sm:max-w-lg"
        finalFocus={focoAlCerrar}
      >
        <DialogHeader className="flex-row items-start gap-3 border-b px-5 py-4 text-left">
          <span
            aria-hidden
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              destructivo
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/12 text-primary"
            )}
          >
            <Icono className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-base font-semibold">
              {titulo}
            </DialogTitle>
            {descripcion ? (
              <DialogDescription>{descripcion}</DialogDescription>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex max-h-[min(60vh,32rem)] flex-col gap-4 overflow-y-auto px-5 py-4">
          {children}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mx-0 mb-0 bg-muted/30 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => cambiarAbierto(false)}
            disabled={pendiente}
          >
            Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={pendiente}
            variant={destructivo ? "destructive" : "default"}
          >
            {pendiente ? (
              <Spinner aria-label="Guardando" data-icon="inline-start" />
            ) : null}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
