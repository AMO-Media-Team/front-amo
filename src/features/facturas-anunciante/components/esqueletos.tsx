import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"

/** Mismas medidas que `ContenedorPagina` (el `loading.tsx` no lo usa: no anima). */
const CONTENEDOR =
  "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"

/** Carga del listado: encabezado con el buscador por fechas, resumen y tabla. */
export function EsqueletoListadoFacturas() {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">Cargando tus facturas…</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-32 sm:h-8" />
          <Esqueleto className="h-4 w-96 max-w-full" />
        </div>
        <Esqueleto className="h-9 w-full sm:w-48" />
      </div>
      <EsqueletoIndicadores cantidad={3} />
      <EsqueletoTablaDatos columnas={7} filtros={2} />
    </div>
  )
}

/** Conceptos de la factura mientras llegan en streaming. */
export function EsqueletoConceptos() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando los conceptos…</span>
      <Esqueleto className="h-12 rounded-lg" />
      {Array.from({ length: 4 }, (_, indice) => (
        <Esqueleto key={indice} className="h-16 rounded-lg" />
      ))}
    </div>
  )
}

/** Carga de la ficha: volver, cabecera, totales, datos y secciones. */
export function EsqueletoFichaFactura() {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">Cargando la factura…</span>
      <div className="flex flex-col gap-4">
        <Esqueleto className="h-7 w-28" />
        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-5">
            <Esqueleto className="size-14 shrink-0 rounded-2xl sm:size-16" />
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-3 w-40" />
              <Esqueleto className="h-7 w-56 max-w-[60vw]" />
              <Esqueleto className="h-4 w-48" />
              <div className="mt-1 flex gap-2">
                <Esqueleto className="h-6 w-24 rounded-full" />
                <Esqueleto className="h-6 w-28 rounded-full" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:items-end">
            <Esqueleto className="h-9 w-40 rounded-lg" />
            <Esqueleto className="h-3 w-40" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Esqueleto className="h-80 rounded-xl lg:col-span-3" />
        <Esqueleto className="h-80 rounded-xl lg:col-span-2" />
      </div>
      <Esqueleto className="h-40 rounded-xl" />
      <Esqueleto className="h-72 rounded-xl" />
    </div>
  )
}
