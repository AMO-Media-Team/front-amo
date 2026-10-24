import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto } from "@/components/feedback/esqueletos"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoPestanas } from "@/features/liquidaciones/components/pestanas-liquidaciones"

/** Carga de las liquidaciones: encabezado, pestañas, título de la vista y su tabla. */
export default function CargandoLiquidaciones() {
  return (
    <ContenedorPagina>
      <div aria-hidden className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-44" />
        <Esqueleto className="h-4 w-full max-w-2xl" />
      </div>
      <EsqueletoPestanas />
      <div aria-hidden className="flex flex-col gap-1.5">
        <Esqueleto className="h-6 w-32" />
        <Esqueleto className="h-4 w-96 max-w-full" />
      </div>
      <EsqueletoTablaDatos columnas={6} />
    </ContenedorPagina>
  )
}
