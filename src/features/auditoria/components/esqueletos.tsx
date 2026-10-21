import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

/** Cuatro indicadores de la bitácora con la misma rejilla que los reales. */
export function EsqueletoMetricasBitacora() {
  return (
    <EsqueletoKpis
      cantidad={4}
      className="grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4"
    />
  )
}

/** Selector de vista + resumen + tabla, mientras llegan los eventos. */
export function EsqueletoRegistrosBitacora() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Esqueleto className="h-8 w-52 rounded-lg" />
        <Esqueleto className="h-4 w-44" />
      </div>
      <EsqueletoTablaDatos columnas={5} filtros={5} />
    </div>
  )
}

/** Encabezado con título, descripción y dos acciones (periodo y exportar). */
export function EsqueletoEncabezado({ acciones = 2 }: { acciones?: number }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2.5">
        <Esqueleto className="h-7 w-40 sm:h-8" />
        <Esqueleto className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: acciones }, (_, i) => (
          <Esqueleto key={i} className={cn("h-8", i === 0 ? "w-40" : "w-28")} />
        ))}
      </div>
    </div>
  )
}
