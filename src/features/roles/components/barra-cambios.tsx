"use client"

import { AnimatePresence } from "motion/react"
import * as m from "motion/react-m"
import { Minus, Plus, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"

import { EASE_SUAVE } from "@/components/motion/aparecer"
import { pluralizar } from "../presentacion"

/**
 * Barra pegajosa al pie de la matriz mientras haya cambios sin guardar:
 * cuántos, cuántos se otorgan y retiran, y las acciones Descartar / Revisar.
 */
export function BarraCambios({
  agregados,
  quitados,
  atajo,
  onDescartar,
  onRevisar,
}: {
  agregados: number
  quitados: number
  /** Texto del atajo de teclado para guardar (⌘S o Ctrl+S). */
  atajo: string
  onDescartar: () => void
  onRevisar: () => void
}) {
  const cambios = agregados + quitados
  return (
    <AnimatePresence>
      {cambios > 0 ? (
        <m.div
          key="barra-cambios"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_SUAVE }}
          className="pointer-events-none sticky bottom-3 z-30 flex justify-center sm:bottom-5"
        >
          <div
            role="region"
            aria-label="Cambios sin guardar"
            className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-popover/90 p-2 pl-4 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl sm:flex-nowrap"
          >
            <span aria-hidden className="relative flex size-2.5 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
              <span className="relative size-2.5 rounded-full bg-primary" />
            </span>
            <p className="min-w-0 flex-1 text-sm" aria-live="polite">
              <span className="font-semibold cifras">
                {pluralizar(cambios, "cambio", "cambios")}
              </span>{" "}
              <span className="text-muted-foreground">sin guardar</span>
            </p>
            <div className="flex items-center gap-1.5 text-xs font-medium cifras max-sm:hidden">
              {agregados > 0 ? (
                <span className="inline-flex h-6 items-center gap-0.5 rounded-full bg-success/12 px-2 text-success">
                  <Plus className="size-3" aria-hidden />
                  {agregados}
                  <span className="sr-only">se otorgan</span>
                </span>
              ) : null}
              {quitados > 0 ? (
                <span className="inline-flex h-6 items-center gap-0.5 rounded-full bg-destructive/10 px-2 text-destructive">
                  <Minus className="size-3" aria-hidden />
                  {quitados}
                  <span className="sr-only">se retiran</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-end">
              <Button variant="ghost" onClick={onDescartar}>
                <Undo2 data-icon="inline-start" aria-hidden />
                Descartar
              </Button>
              <Button onClick={onRevisar}>
                Revisar y guardar
                <Kbd className="ml-0.5 bg-black/20 text-primary-foreground max-md:hidden dark:bg-primary-foreground/15">
                  {atajo}
                </Kbd>
              </Button>
            </div>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
