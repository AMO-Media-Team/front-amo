import type { ReactNode } from "react"

import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

// Anchos fijos (no aleatorios): servidor y cliente pintan lo mismo.
const ANCHOS = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3", "w-3/4"] as const

function Encabezado() {
  return (
    <div className="flex items-start justify-between gap-3">
      {/* Anchos en %, con tope: un ancho fijo desborda la rejilla en móvil. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Esqueleto className="h-4 w-1/2 max-w-44" />
        <Esqueleto className="h-3 w-11/12 max-w-64" />
      </div>
    </div>
  )
}

/** Marco común de los esqueletos de `TarjetaPanel`: borde, relleno y encabezado. */
export function MarcoEsqueleto({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <span className="sr-only">Cargando…</span>
      <Encabezado />
      {children}
    </div>
  )
}

/** Fallback de una `TarjetaPanel` con lista (actividad, alertas, salud). */
export function EsqueletoLista({
  filas = 5,
  className,
}: {
  filas?: number
  className?: string
}) {
  return (
    <MarcoEsqueleto className={className}>
      <div className="flex flex-col gap-3.5">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Esqueleto className="size-8 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Esqueleto className={cn("h-3.5", ANCHOS[i % ANCHOS.length])} />
              <Esqueleto className="h-2.5 w-2/5" />
            </div>
            <Esqueleto className="h-4 w-10 shrink-0" />
          </div>
        ))}
      </div>
    </MarcoEsqueleto>
  )
}

/**
 * Mini-mapa junto a su ranking cuando la celda mide al menos 28 rem; con
 * menos, el mapa va arriba (lado a lado, el ranking quedaría en menos de
 * 210 px y recortaría nombres y cifras). Lo comparten los bloques y su
 * esqueleto.
 */
export const REJILLA_MAPA_RANKING =
  "grid flex-1 items-center gap-5 @md/bloque:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
export const MAPA_EN_REJILLA = "mx-auto w-full max-w-64 @md/bloque:max-w-none"

/** Fallback del bloque de mapa + ranking (top departamentos, cobertura). */
export function EsqueletoMapaRanking({ className }: { className?: string }) {
  return (
    <MarcoEsqueleto className={className}>
      <div className={REJILLA_MAPA_RANKING}>
        <Esqueleto
          className={cn("aspect-[4/5] rounded-2xl", MAPA_EN_REJILLA)}
        />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Esqueleto className="size-6 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-between gap-3">
                  <Esqueleto className={cn("h-3", ANCHOS[i % ANCHOS.length])} />
                  <Esqueleto className="h-3 w-12" />
                </div>
                <Esqueleto className="h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </MarcoEsqueleto>
  )
}
