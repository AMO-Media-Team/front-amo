import Link from "next/link"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { formatearNumero } from "@/lib/format"
import { cn } from "@/lib/utils"

import { contadoresLiquidaciones } from "../queries"
import {
  etiquetaPestana,
  rutaVistaLiquidaciones,
  VISTAS,
  VISTAS_LIQUIDACIONES,
  type VistaLiquidaciones,
} from "../vistas"

const CLASES_REJILLA = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"

/**
 * Pestañas de las vistas con su contador. Son enlaces (la vista va en la URL
 * y la activa lleva `aria-current`): se comparten, sobreviven al recargar y
 * funcionan sin JavaScript. Dos por fila en el teléfono, sin desplazamiento
 * horizontal.
 */
export async function PestanasLiquidaciones({
  activa,
}: {
  activa: VistaLiquidaciones
}) {
  const contadores = await contadoresLiquidaciones()
  return (
    <nav aria-label="Vistas de liquidaciones">
      <ul className={CLASES_REJILLA}>
        {VISTAS_LIQUIDACIONES.map((vista) => {
          const actual = vista === activa
          const cantidad = contadores[vista]
          return (
            <li key={vista} className="min-w-0">
              <Link
                href={rutaVistaLiquidaciones(vista)}
                scroll={false}
                aria-current={actual ? "page" : undefined}
                aria-label={etiquetaPestana(vista, cantidad)}
                title={VISTAS[vista].descripcion}
                className={cn(
                  "flex min-h-14 items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:anillo-foco",
                  actual &&
                    "border-primary/50 bg-primary/6 ring-1 ring-primary/30 hover:bg-primary/10"
                )}
              >
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    actual ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {VISTAS[vista].titulo}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 text-xl leading-none font-semibold cifras",
                    cantidad === 0 ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {formatearNumero(cantidad)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Mientras llegan los contadores (también en `loading.tsx`). */
export function EsqueletoPestanas() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando las vistas…</span>
      <div aria-hidden className={CLASES_REJILLA}>
        {VISTAS_LIQUIDACIONES.map((vista) => (
          <Esqueleto key={vista} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
