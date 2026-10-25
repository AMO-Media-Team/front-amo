import { Esqueleto } from "@/components/feedback/esqueletos"
import { MarcoEsqueleto } from "@/features/dashboard/components/esqueletos-panel"
import { cn } from "@/lib/utils"

/** Fallback fiel de `ResumenReputacion`: la cifra principal y tres indicadores. */
export function EsqueletoResumenReputacion({
  className,
}: {
  className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-6",
        className
      )}
    >
      <span className="sr-only">Cargando tu reputación…</span>
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-4 w-3/5 max-w-60" />
        <Esqueleto className="h-10 w-2/5 max-w-40" />
        <Esqueleto className="h-4 w-11/12 max-w-md" />
        <Esqueleto className="mt-1 h-2.5 w-full rounded-full" />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
        {[0, 1, 2].map((indice) => (
          <div
            key={indice}
            className="flex flex-col gap-2 rounded-xl border p-3 sm:p-4"
          >
            <Esqueleto className="h-3 w-3/5" />
            <Esqueleto className="h-6 w-1/3" />
            <Esqueleto className="h-3 w-4/5" />
          </div>
        ))}
      </div>
      <Esqueleto className="h-3.5 w-4/5" />
    </div>
  )
}

/** Fallback fiel de `CasosReputacion`: algunos negocios y su pliegue. */
export function EsqueletoCasosReputacion({
  className,
}: {
  className?: string
}) {
  return (
    <MarcoEsqueleto className={className}>
      <div className="flex flex-col divide-y">
        {[0, 1, 2, 3].map((indice) => (
          <div key={indice} className="flex items-start gap-3 py-3">
            <Esqueleto className="size-4 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Esqueleto className="h-4 w-4/5" />
              <Esqueleto className="h-3 w-3/5" />
            </div>
            <Esqueleto className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <Esqueleto className="h-9 w-full" />
    </MarcoEsqueleto>
  )
}
