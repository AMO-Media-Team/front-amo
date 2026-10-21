"use client"

import { cn } from "@/lib/utils"

/**
 * Control segmentado para el pie de una `TarjetaGrafico` en móvil, donde las
 * acciones estándar de la tarjeta no dejan sitio en el encabezado. Solo usa
 * contenido en línea (`span` + `button`): en pantalla completa la tarjeta
 * envuelve el pie en un `<p>`, y el `div` de `ControlSegmentado` no es válido
 * ahí. Mismo aspecto que `ControlSegmentado`, sin el indicador animado.
 */
export function SegmentosEnLinea<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambio,
  className,
}: {
  /** Nombre accesible del grupo. */
  etiqueta: string
  opciones: readonly { valor: T; etiqueta: string }[]
  valor: T
  onCambio: (valor: T) => void
  className?: string
}) {
  return (
    <span
      role="group"
      aria-label={etiqueta}
      className={cn(
        "flex h-8 w-full items-center gap-0.5 rounded-lg bg-muted p-0.5",
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
              "inline-flex h-7 flex-1 items-center justify-center rounded-md px-2 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
              activa &&
                "bg-background text-foreground shadow-sm ring-1 ring-foreground/5 dark:bg-input/60"
            )}
          >
            {opcion.etiqueta}
          </button>
        )
      })}
    </span>
  )
}
