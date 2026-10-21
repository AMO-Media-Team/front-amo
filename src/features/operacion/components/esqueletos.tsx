import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"
import { cn } from "@/lib/utils"

import { CLASES_REJILLA } from "./tarjeta-resumen"

/** Mismas medidas que `ContenedorPagina` (el `loading.tsx` no lo usa: no anima). */
const CONTENEDOR =
  "mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"

/** Indicadores de un listado mientras llegan en streaming. */
export function EsqueletoIndicadores({
  cantidad,
}: {
  cantidad: keyof typeof CLASES_REJILLA
}) {
  return (
    <EsqueletoKpis cantidad={cantidad} className={CLASES_REJILLA[cantidad]} />
  )
}

/** Carga de un listado de operación: encabezado, indicadores y tabla. */
export function EsqueletoListado({
  etiqueta,
  indicadores,
  columnas,
  filtros,
}: {
  etiqueta: string
  indicadores: keyof typeof CLASES_REJILLA
  columnas: number
  filtros: number
}) {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">{etiqueta}</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-40 sm:h-8" />
          <Esqueleto className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <EsqueletoIndicadores cantidad={indicadores} />
      <EsqueletoTablaDatos columnas={columnas} filtros={filtros} />
    </div>
  )
}

/** Grupos de estados del listado de asignaciones (barra y seis opciones). */
export function EsqueletoGrupos() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando el resumen de asignaciones…</span>
      <Esqueleto className="h-1.5 w-full rounded-full" />
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, indice) => (
          <Esqueleto key={indice} className="h-[4.25rem] rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/** Carga del listado de asignaciones: encabezado con periodo, grupos y tabla. */
export function EsqueletoListadoAsignaciones() {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">Cargando las asignaciones…</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-44 sm:h-8" />
          <Esqueleto className="h-4 w-96 max-w-full" />
        </div>
        <Esqueleto className="h-9 w-44" />
      </div>
      <EsqueletoGrupos />
      <EsqueletoTablaDatos columnas={7} filtros={6} />
    </div>
  )
}

/** Cabecera de ficha (volver, identidad y lateral) mientras carga. */
function EsqueletoCabecera({ redonda }: { redonda: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Esqueleto className="h-7 w-28" />
      <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-5">
          <Esqueleto
            className={cn(
              "size-14 shrink-0 sm:size-16",
              redonda ? "rounded-full" : "rounded-2xl"
            )}
          />
          <div className="flex flex-col gap-2">
            <Esqueleto className="h-3 w-28" />
            <Esqueleto className="h-7 w-64 max-w-[60vw]" />
            <Esqueleto className="h-4 w-48" />
            <div className="mt-1 flex gap-2">
              <Esqueleto className="h-6 w-24 rounded-full" />
              <Esqueleto className="h-6 w-20 rounded-full" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <Esqueleto className="h-3 w-40" />
          <Esqueleto className="h-3 w-32" />
        </div>
      </div>
    </div>
  )
}

/** Carga de una ficha: cabecera, indicadores, pestañas y contenido. */
export function EsqueletoFicha({
  etiqueta,
  indicadores = 5,
  pestanas = 4,
  redonda = false,
}: {
  etiqueta: string
  indicadores?: keyof typeof CLASES_REJILLA
  pestanas?: number
  redonda?: boolean
}) {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">{etiqueta}</span>
      <EsqueletoCabecera redonda={redonda} />
      <EsqueletoIndicadores cantidad={indicadores} />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: pestanas }, (_, indice) => (
          <Esqueleto key={indice} className="h-7 w-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Esqueleto className="h-72 rounded-xl lg:col-span-3" />
        <Esqueleto className="h-72 rounded-xl lg:col-span-2" />
      </div>
    </div>
  )
}

/** Carga de la ficha de una asignación: cabecera, progreso y dos columnas. */
export function EsqueletoFichaAsignacion() {
  return (
    <div role="status" aria-busy="true" className={CONTENEDOR}>
      <span className="sr-only">Cargando la asignación…</span>
      <EsqueletoCabecera redonda={false} />
      <Esqueleto className="h-24 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Esqueleto className="h-80 rounded-xl" />
          <Esqueleto className="h-64 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Esqueleto className="h-96 rounded-xl" />
          <Esqueleto className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
