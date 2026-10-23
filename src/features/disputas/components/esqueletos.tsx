import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"

/** Columnas de la ficha: la conversación y, al lado, la decisión y la asignación. */
export const COLUMNAS_FICHA_DISPUTA =
  "grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]"

/** Resumen de la bandeja mientras llegan los conteos (mismas tres tarjetas). */
export function EsqueletoResumenBandeja() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      <span className="sr-only">Contando las disputas…</span>
      {[0, 1, 2].map((indice) => (
        <Esqueleto key={indice} className="h-[4.25rem] rounded-xl" />
      ))}
    </div>
  )
}

/** Tabla de la bandeja mientras llega del servidor. */
export function EsqueletoTablaDisputas() {
  return <EsqueletoTablaDatos columnas={6} filtros={3} />
}

/** Carga de la bandeja: encabezado, resumen y tabla. */
export function EsqueletoBandeja() {
  return (
    <ContenedorPagina>
      <div aria-hidden className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-40" />
        <Esqueleto className="h-4 w-full max-w-xl" />
      </div>
      <EsqueletoResumenBandeja />
      <EsqueletoTablaDisputas />
    </ContenedorPagina>
  )
}

/** Carga de la ficha: cabecera, aviso del estado, conversación y columna lateral. */
export function EsqueletoFichaDisputa() {
  return (
    <ContenedorPagina>
      <div role="status" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">Cargando la disputa…</span>
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-7 w-28" />
          <div className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-5">
              <Esqueleto className="size-14 shrink-0 rounded-2xl sm:size-16" />
              <div className="flex flex-col gap-2">
                <Esqueleto className="h-3 w-36" />
                <Esqueleto className="h-7 w-64 max-w-[60vw]" />
                <Esqueleto className="h-4 w-52 max-w-[50vw]" />
                <div className="mt-1 flex gap-2">
                  <Esqueleto className="h-6 w-24 rounded-full" />
                  <Esqueleto className="h-6 w-32 rounded-full" />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Esqueleto className="h-3 w-40" />
              <Esqueleto className="h-3 w-32" />
            </div>
          </div>
          <Esqueleto className="h-28 rounded-xl" />
        </div>
        <div className={COLUMNAS_FICHA_DISPUTA}>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
            <Esqueleto className="h-5 w-40" />
            {[0, 1, 2].map((indice) => (
              <div key={indice} className="flex gap-3">
                <Esqueleto className="size-8 shrink-0 rounded-full" />
                <Esqueleto className="h-24 flex-1 rounded-xl" />
              </div>
            ))}
            <Esqueleto className="h-36 rounded-xl" />
          </div>
          <div className="flex flex-col gap-4">
            <Esqueleto className="h-72 rounded-xl" />
            <Esqueleto className="h-80 rounded-xl" />
          </div>
        </div>
      </div>
    </ContenedorPagina>
  )
}
