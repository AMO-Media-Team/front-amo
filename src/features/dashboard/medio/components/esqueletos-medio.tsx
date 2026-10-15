import { Esqueleto } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

import { MarcoEsqueleto } from "../../components/esqueletos-panel"

/** Fallback fiel de `HeroGanancias`: cifra héroe, variación y dos montos. */
export function EsqueletoHeroGanancias({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6",
        className
      )}
    >
      <span className="sr-only">Cargando tus ganancias…</span>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Esqueleto className="h-4 w-2/5 max-w-36" />
          <Esqueleto className="h-12 w-4/5 max-w-64 sm:h-[3.75rem]" />
          <Esqueleto className="h-5 w-11/12 max-w-72" />
        </div>
        <Esqueleto className="mt-1 hidden h-12 w-28 sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex min-w-0 flex-col gap-2 rounded-xl border p-3"
          >
            <Esqueleto className="h-3 w-3/5" />
            <Esqueleto className="h-6 w-4/5" />
            <Esqueleto className="h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Fallback fiel de `ProgresoTopeAnual`: cifra, barra con umbrales y aviso. */
export function EsqueletoTopeAnual({ className }: { className?: string }) {
  return (
    <MarcoEsqueleto className={className}>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <Esqueleto className="h-7 w-1/2" />
          <Esqueleto className="h-4 w-10" />
        </div>
        <div className="pt-1 pb-5">
          <Esqueleto className="h-3 w-full rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-3 w-full" />
          <Esqueleto className="h-3 w-3/4" />
        </div>
      </div>
    </MarcoEsqueleto>
  )
}

/** Fallback fiel de `Reputacion`: tres filas con su cifra a la derecha. */
export function EsqueletoReputacion({ className }: { className?: string }) {
  return (
    <MarcoEsqueleto className={className}>
      <div className="flex flex-col divide-y">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Esqueleto className="h-3.5 w-2/5" />
              <Esqueleto className="h-2.5 w-4/5" />
            </div>
            <Esqueleto className="h-6 w-14 shrink-0" />
          </div>
        ))}
      </div>
    </MarcoEsqueleto>
  )
}
