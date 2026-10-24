import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"

/** Columnas de la ficha: valores y conceptos; al lado, expedición y anunciante. */
export const COLUMNAS_FICHA_FACTURA =
  "grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"

export function EsqueletoResumenFacturas() {
  return <EsqueletoKpis cantidad={4} />
}

export function EsqueletoTablaFacturas() {
  return <EsqueletoTablaDatos columnas={7} filtros={2} />
}

function EsqueletoEncabezado() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      <Esqueleto className="h-8 w-40" />
      <Esqueleto className="h-4 w-full max-w-xl" />
    </div>
  )
}

/** Carga del listado: encabezado, resumen y tabla. */
export function EsqueletoListadoFacturas() {
  return (
    <ContenedorPagina>
      <EsqueletoEncabezado />
      <EsqueletoResumenFacturas />
      <EsqueletoTablaFacturas />
    </ContenedorPagina>
  )
}

/** Carga de la ficha: cabecera, aviso del estado y las dos columnas. */
export function EsqueletoFichaFactura() {
  return (
    <ContenedorPagina>
      <div role="status" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">Cargando la factura…</span>
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-7 w-28" />
          <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:p-6">
            <Esqueleto className="h-3 w-32" />
            <Esqueleto className="h-7 w-56 max-w-[60vw]" />
            <Esqueleto className="h-4 w-72 max-w-[70vw]" />
            <div className="mt-1 flex gap-2">
              <Esqueleto className="h-6 w-24 rounded-full" />
              <Esqueleto className="h-6 w-32 rounded-full" />
            </div>
          </div>
          <Esqueleto className="h-20 rounded-xl" />
        </div>
        <div className={COLUMNAS_FICHA_FACTURA}>
          <div className="flex flex-col gap-4">
            <Esqueleto className="h-72 rounded-xl" />
            <Esqueleto className="h-64 rounded-xl" />
          </div>
          <div className="flex flex-col gap-4">
            <Esqueleto className="h-56 rounded-xl" />
            <Esqueleto className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    </ContenedorPagina>
  )
}

/** Carga de la cartera: encabezado, totales, antigüedad y las dos listas. */
export function EsqueletoCartera() {
  return (
    <ContenedorPagina>
      <EsqueletoEncabezado />
      <div role="status" aria-busy="true" className="flex flex-col gap-4">
        <span className="sr-only">Cargando la cartera…</span>
        <EsqueletoKpis cantidad={4} />
        <Esqueleto className="h-40 rounded-xl" />
        <Esqueleto className="h-80 rounded-xl" />
      </div>
    </ContenedorPagina>
  )
}
