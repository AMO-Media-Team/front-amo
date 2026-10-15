import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"
import { EsqueletoMapaIngresos } from "@/features/geo/components/esqueleto-mapa-ingresos"
import { cn } from "@/lib/utils"

/** Cinco indicadores con la misma rejilla que los reales. */
export function EsqueletoMetricasAccesos() {
  return (
    <EsqueletoKpis
      cantidad={5}
      className="grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1"
    />
  )
}

function Tarjeta({
  className,
  filas = 4,
}: {
  className?: string
  filas?: number
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Esqueleto className="size-8 rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-4 w-36" />
          <Esqueleto className="h-3 w-52 max-w-full" />
        </div>
      </div>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex justify-between gap-4">
            <Esqueleto className="h-3.5 w-32" />
            <Esqueleto className="h-3.5 w-12" />
          </div>
          <Esqueleto className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Alertas de seguridad + mapa de calor. */
export function EsqueletoSeguridadAccesos() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 lg:grid-cols-3">
      <span className="sr-only">Cargando alertas y actividad…</span>
      <Tarjeta filas={3} />
      <div
        aria-hidden
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5 lg:col-span-2"
      >
        <div className="flex flex-col gap-1.5">
          <Esqueleto className="h-4 w-44" />
          <Esqueleto className="h-3 w-72 max-w-full" />
        </div>
        <Esqueleto className="h-56 w-full rounded-lg" />
      </div>
    </div>
  )
}

/** Mapa de ingresos y rankings de países y ciudades (misma rejilla que `DisposicionOrigen`). */
export function EsqueletoOrigenAccesos() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando el origen de los ingresos…</span>
      <div className="flex flex-col gap-1.5">
        <Esqueleto className="h-5 w-48" />
        <Esqueleto className="h-3.5 w-80 max-w-full" />
      </div>
      <EsqueletoMapaIngresos />
      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta />
        <Tarjeta />
      </div>
    </div>
  )
}

/** Cabecera del registro + tabla. */
export function EsqueletoRegistroAccesos() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Esqueleto className="h-5 w-44" />
        <Esqueleto className="h-3.5 w-56" />
      </div>
      <EsqueletoTablaDatos columnas={6} filtros={6} />
    </div>
  )
}
