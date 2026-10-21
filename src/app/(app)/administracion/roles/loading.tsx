import { Esqueleto } from "@/components/feedback/esqueletos"
import { EsqueletoListadoRoles } from "@/features/roles/components/secciones-listado"

/** Carga del listado de roles: encabezado, indicadores, filtros y tarjetas. */
export default function CargandoRoles() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5">
          <Esqueleto className="h-7 w-56 sm:h-8" />
          <Esqueleto className="h-4 w-96 max-w-full" />
        </div>
        <Esqueleto className="h-8 w-28" />
      </div>
      <EsqueletoListadoRoles />
    </div>
  )
}
