import { EsqueletoAreaGrafico } from "@/components/charts/esqueleto-grafico"
import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { EsqueletoRejillaKpi } from "@/components/kpi/rejilla-kpi"
import { cn } from "@/lib/utils"

import { rejillaIndicadores } from "../vista"

/** Una tarjeta del centro de reportes. */
function EsqueletoTarjetaReporte() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <Esqueleto className="size-10 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-4.5 w-40" />
        <Esqueleto className="h-3.5 w-full" />
        <Esqueleto className="h-3.5 w-4/5" />
      </div>
      <div className="flex gap-1.5">
        <Esqueleto className="h-5 w-16" />
        <Esqueleto className="h-5 w-24" />
        <Esqueleto className="h-5 w-20" />
      </div>
      <div className="flex flex-col gap-2 border-t pt-3">
        <Esqueleto className="h-3 w-32" />
        <Esqueleto className="h-3 w-48" />
      </div>
    </div>
  )
}

/** Centro de reportes: dos grupos de tarjetas. */
export function EsqueletoCentroReportes() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-10">
      <span className="sr-only">Cargando reportes…</span>
      {[4, 3].map((cantidad, grupo) => (
        <div key={grupo} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Esqueleto className="h-5 w-44" />
            <Esqueleto className="h-3.5 w-80 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: cantidad }, (_, i) => (
              <EsqueletoTarjetaReporte key={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Encabezado de página: antetítulo, título, descripción y una acción. */
export function EsqueletoEncabezadoReporte({
  conAccion = true,
}: {
  conAccion?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2.5">
        <Esqueleto className="h-3 w-36" />
        <Esqueleto className="h-7 w-56 sm:h-8" />
        <Esqueleto className="h-4 w-[34rem] max-w-full" />
      </div>
      {conAccion ? <Esqueleto className="h-8 w-28" /> : null}
    </div>
  )
}

/** Barra de filtros del reporte. */
export function EsqueletoFiltrosReporte({
  cantidad = 2,
}: {
  cantidad?: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: cantidad }, (_, i) => (
        <Esqueleto key={i} className={cn("h-8", i === 0 ? "w-44" : "w-36")} />
      ))}
    </div>
  )
}

function EsqueletoTarjetaGrafico({
  className,
  alto = "min-h-72",
}: {
  className?: string
  alto?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5",
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-4 w-48" />
        <Esqueleto className="h-3 w-72 max-w-full" />
      </div>
      <div className={cn("relative", alto)}>
        <div className="absolute inset-0">
          <EsqueletoAreaGrafico />
        </div>
      </div>
    </div>
  )
}

/** Cuerpo del reporte: resumen de filtros, indicadores, gráficos y tabla. */
export function EsqueletoCuerpoReporte({
  indicadores = 6,
}: {
  indicadores?: number
}) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando el reporte…</span>
      <Esqueleto className="h-4 w-80 max-w-full" />
      <EsqueletoRejillaKpi
        cantidad={indicadores}
        {...rejillaIndicadores(indicadores)}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <EsqueletoTarjetaGrafico className="lg:col-span-2" alto="min-h-80" />
        <EsqueletoTarjetaGrafico />
        <EsqueletoTarjetaGrafico />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-5 w-48" />
          <Esqueleto className="h-3.5 w-72 max-w-full" />
        </div>
        <EsqueletoTablaDatos columnas={6} filtros={1} />
      </div>
    </div>
  )
}
