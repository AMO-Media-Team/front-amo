import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"

import type { VistaPagosMedios } from "../rutas"
import { EsqueletoNavegacionPagos } from "./navegacion-pagos"

/** «Por pagar» mientras llega: las cuatro tarjetas, el panel de las listas y la tabla. */
export function EsqueletoPorPagar() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando las liquidaciones por pagar…</span>
      <div aria-hidden className="flex flex-col gap-3 lg:flex-row">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {[0, 1, 2, 3].map((indice) => (
            <Esqueleto key={indice} className="h-[4.25rem] rounded-xl" />
          ))}
        </div>
        <Esqueleto className="h-[4.25rem] rounded-xl lg:w-[25rem]" />
      </div>
      <EsqueletoTablaDatos columnas={6} filtros={2} />
    </div>
  )
}

export function EsqueletoDispersiones() {
  return <EsqueletoTablaDatos columnas={4} filtros={0} />
}

/** Título y descripción de la vista (mismo alto que los reales). */
function EsqueletoTituloVista() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      <Esqueleto className="h-6 w-32" />
      <Esqueleto className="h-4 w-full max-w-lg" />
    </div>
  )
}

/** Carga de Pagos a medios: encabezado, vistas y la vista activa. */
export function EsqueletoPaginaPagos({ vista }: { vista?: VistaPagosMedios }) {
  return (
    <ContenedorPagina>
      <div aria-hidden className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-48" />
        <Esqueleto className="h-4 w-full max-w-xl" />
      </div>
      <EsqueletoNavegacionPagos activa={vista} />
      <EsqueletoTituloVista />
      {vista === "dispersiones" ? (
        <EsqueletoDispersiones />
      ) : (
        <EsqueletoPorPagar />
      )}
    </ContenedorPagina>
  )
}

/** Carga de la ficha de un archivo: cabecera, cifras y tabla. */
export function EsqueletoFichaDispersion() {
  return (
    <ContenedorPagina>
      <div role="status" aria-busy="true" className="flex flex-col gap-6">
        <span className="sr-only">Cargando el archivo de pagos…</span>
        <div aria-hidden className="flex flex-col gap-4">
          <Esqueleto className="h-7 w-40" />
          <Esqueleto className="h-36 rounded-2xl" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[0, 1, 2, 3].map((indice) => (
              <Esqueleto key={indice} className="h-[4.75rem] rounded-xl" />
            ))}
          </div>
        </div>
        <EsqueletoTituloVista />
        <EsqueletoTablaDatos columnas={5} filtros={1} />
      </div>
    </ContenedorPagina>
  )
}
