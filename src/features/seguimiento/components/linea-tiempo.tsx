import { CLASES_TONO } from "@/features/operacion/components/distintivos"
import { formatearFechaHoraFija } from "@/features/operacion/formato"
import { cn } from "@/lib/utils"

import type { Hito } from "../presentacion"

/**
 * Hitos de la asignación en orden (aceptó, descargó, publicó, validación,
 * métricas, cumplida…) y, mientras no publica, el plazo pendiente. El color
 * del punto acompaña al texto; nunca es el único canal.
 */
export function LineaTiempo({
  hitos,
  etiqueta,
}: {
  hitos: readonly Hito[]
  /** Nombre de la lista para lectores de pantalla. */
  etiqueta: string
}) {
  if (hitos.length === 0) return null
  return (
    <ol aria-label={etiqueta} className="flex flex-col">
      {hitos.map((hito, indice) => {
        const ultimo = indice === hitos.length - 1
        return (
          <li key={hito.clave} className="relative flex gap-3 pb-3 last:pb-0">
            {ultimo ? null : (
              <span
                aria-hidden
                className="absolute top-3 bottom-0 left-[0.3125rem] w-px bg-border"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-card",
                hito.pendiente
                  ? "border border-dashed border-muted-foreground bg-card"
                  : CLASES_TONO[hito.tono].punto
              )}
            />
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "text-sm",
                  hito.pendiente ? "text-muted-foreground" : "font-medium"
                )}
              >
                {hito.titulo}
              </span>
              {hito.at ? (
                <time
                  dateTime={hito.at}
                  className="text-xs cifras text-muted-foreground"
                >
                  {formatearFechaHoraFija(hito.at)}
                </time>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
