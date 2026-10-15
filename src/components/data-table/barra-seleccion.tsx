"use client"

import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"
import { X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { formatearNumero } from "@/lib/format"

interface BarraSeleccionProps {
  cantidad: number
  onLimpiar: () => void
  /** Acciones masivas del dominio (y la exportación de la selección). */
  children: ReactNode
}

/**
 * Barra flotante de acciones masivas: aparece al seleccionar filas y se ancla
 * al borde inferior de la ventana mientras la tabla está a la vista.
 */
export function BarraSeleccion({
  cantidad,
  onLimpiar,
  children,
}: BarraSeleccionProps) {
  const reducido = useReducedMotion()

  return (
    <AnimatePresence>
      {cantidad > 0 ? (
        <m.div
          key="barra-seleccion"
          role="region"
          aria-label="Acciones sobre la selección"
          initial={{
            opacity: 0,
            y: reducido ? 0 : 24,
            scale: reducido ? 1 : 0.97,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: reducido ? 0 : 16,
            scale: reducido ? 1 : 0.98,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover/95 p-1.5 pl-3 text-sm shadow-glow backdrop-blur-md"
        >
          <p className="font-medium cifras" aria-live="polite">
            {cantidad === 1
              ? "1 seleccionado"
              : `${formatearNumero(cantidad)} seleccionados`}
          </p>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-wrap items-center gap-1.5">{children}</div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Quitar la selección"
            title="Quitar la selección"
            onClick={onLimpiar}
          >
            <X aria-hidden />
          </Button>
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
