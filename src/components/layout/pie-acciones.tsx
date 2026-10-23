import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Pie fijo para las acciones principales de una pantalla del celular
 * («Aceptar / No me interesa», «Descargar», «Enviar evidencia»): queda al
 * alcance del pulgar, sobre la barra inferior (`--reserva-inferior`). Ningún
 * ancestro puede tener `overflow: hidden` (anula el `sticky`).
 */
export function PieAcciones({
  children,
  nota,
  etiqueta = "Acciones",
  className,
}: {
  children: ReactNode
  /** Texto breve a la izquierda (p. ej. el pago o el plazo). */
  nota?: ReactNode
  /** Nombre accesible de la región. */
  etiqueta?: string
  className?: string
}) {
  return (
    <div className="pointer-events-none sticky bottom-[calc(var(--reserva-inferior,env(safe-area-inset-bottom))+0.75rem)] z-20 flex justify-center">
      <section
        aria-label={etiqueta}
        className={cn(
          "pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border bg-popover/95 p-2 shadow-2xl ring-1 ring-foreground/5 backdrop-blur-xl",
          nota ? "pl-4" : null,
          className
        )}
      >
        {nota ? <div className="min-w-0 flex-1 text-sm">{nota}</div> : null}
        <div className="flex items-center gap-1.5 max-sm:w-full max-sm:justify-end max-sm:[&>*]:flex-1">
          {children}
        </div>
      </section>
    </div>
  )
}
