import type { ReactNode, Ref } from "react"

import { cn } from "@/lib/utils"

interface TooltipFlotanteProps {
  /** El padre lo mueve con `style.transform` en cada movimiento del puntero (sin re-render). */
  ref?: Ref<HTMLDivElement>
  visible: boolean
  children: ReactNode
  className?: string
}

/**
 * Tooltip de vidrio que sigue al puntero sobre el mapa. No es interactivo
 * (`pointer-events: none`) y se oculta a lectores de pantalla: la misma
 * información está en el ranking y en el panel de detalle.
 */
export function TooltipFlotante({
  ref,
  visible,
  children,
  className,
}: TooltipFlotanteProps) {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-30 will-change-transform",
        "transition-opacity duration-150 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div className="min-w-44 rounded-xl vidrio px-3 py-2.5 text-xs shadow-lg shadow-black/20">
        {children}
      </div>
    </div>
  )
}

/** Posición del tooltip: a la derecha y arriba del puntero, volteado cerca de los bordes. */
export function posicionTooltip(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  contenedor: { width: number; height: number }
): string {
  const margen = 14
  const izquierda =
    x + margen + ancho > contenedor.width ? x - margen - ancho : x + margen
  const arriba = y - margen - alto < 0 ? y + margen : y - margen - alto
  return `translate3d(${Math.max(4, izquierda)}px, ${Math.max(4, arriba)}px, 0)`
}
