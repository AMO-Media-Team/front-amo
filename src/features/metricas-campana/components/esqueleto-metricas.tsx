import { EsqueletoRejillaKpi } from "@/components/kpi/rejilla-kpi"
import { Esqueleto, EsqueletoGrafico } from "@/components/feedback/esqueletos"

/** Carga fiel de la pestaña «Métricas»: encabezado, indicadores, gráfico y tabla. */
export function EsqueletoMetricas() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando las métricas de la campaña…</span>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-5 w-52" />
          <Esqueleto className="h-3.5 w-80 max-w-full" />
        </div>
        <Esqueleto className="h-8 w-28" />
      </div>
      <EsqueletoRejillaKpi cantidad={6} columnas={3} />
      <EsqueletoRejillaKpi
        cantidad={4}
        columnas={4}
        className="md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4"
      />
      <EsqueletoGrafico alto="h-56" />
    </div>
  )
}
