"use client"

import * as m from "motion/react-m"
import { useId } from "react"

import { cn } from "@/lib/utils"

export interface OpcionSegmento<T extends string> {
  valor: T
  etiqueta: string
  /** Cifra opcional junto a la etiqueta (p. ej. cuántos elementos hay). */
  cantidad?: number
}

/**
 * Filtro de una sola elección como grupo de botones (`aria-pressed`), con un
 * indicador que se desliza a la opción activa (`layoutId`; con movimiento
 * reducido, `MotionConfig` lo vuelve instantáneo). En móvil ocupa el ancho
 * disponible y oculta las cifras para que todas las opciones quepan sin
 * desplazamiento horizontal.
 */
export function ControlSegmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
  className,
}: {
  /** Nombre accesible del grupo. */
  etiqueta: string
  opciones: readonly OpcionSegmento<T>[]
  valor: T
  onCambio: (valor: T) => void
  className?: string
}) {
  const idIndicador = useId()
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn(
        "flex h-8 w-full [scrollbar-width:none] items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 sm:inline-flex sm:w-auto sm:max-w-full",
        className
      )}
    >
      {opciones.map((opcion) => {
        const activa = opcion.valor === valor
        return (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={activa}
            onClick={() => onCambio(opcion.valor)}
            className={cn(
              "relative inline-flex h-7 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-none sm:px-2.5",
              activa && "text-foreground"
            )}
          >
            {activa ? (
              <m.span
                layoutId={idIndicador}
                aria-hidden
                transition={{ type: "spring", bounce: 0.18, duration: 0.4 }}
                className="absolute inset-0 rounded-md bg-background shadow-sm ring-1 ring-foreground/5 dark:bg-input/60"
              />
            ) : null}
            <span className="relative">{opcion.etiqueta}</span>
            {opcion.cantidad !== undefined ? (
              <span
                className={cn(
                  "relative rounded-full px-1.5 text-[0.6875rem] leading-4 cifras max-sm:hidden",
                  activa
                    ? "bg-primary/12 text-primary dark:bg-primary/25 dark:text-foreground"
                    : "bg-foreground/5"
                )}
              >
                {opcion.cantidad}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
