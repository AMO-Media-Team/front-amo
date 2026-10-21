import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"

/** Carga del listado de usuarios: encabezado, cinco indicadores y la tabla. */
export default function CargandoUsuarios() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-40 sm:h-8" />
          <Esqueleto className="h-4 w-80 max-w-full" />
        </div>
        <Esqueleto className="h-8 w-36" />
      </div>
      <EsqueletoKpis
        cantidad={5}
        className="grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5"
      />
      <EsqueletoTablaDatos columnas={6} filtros={4} />
    </div>
  )
}
