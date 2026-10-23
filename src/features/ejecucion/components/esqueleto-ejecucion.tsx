import { Esqueleto } from "@/components/feedback/esqueletos"

/** Lo que se ve mientras carga la evidencia o un corte de métricas. */
export function EsqueletoEjecucion({ secciones = 3 }: { secciones?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando…</span>
      <Esqueleto className="h-8 w-40" />
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="h-8 w-3/4" />
        <Esqueleto className="h-4 w-full max-w-md" />
      </div>
      <Esqueleto className="h-5 w-64" />
      {Array.from({ length: secciones }, (_, indice) => (
        <div
          key={indice}
          className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5"
        >
          <Esqueleto className="h-5 w-48" />
          <Esqueleto className="h-4 w-full max-w-sm" />
          <Esqueleto className="h-10 w-full" />
        </div>
      ))}
      <Esqueleto className="h-14 w-full rounded-2xl" />
    </div>
  )
}
