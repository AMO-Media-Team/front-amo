import "server-only"

import { Esqueleto, EsqueletoKpis } from "@/components/feedback/esqueletos"

import type { RolListado, ActorRoles } from "../tipos"
import { ListadoRoles } from "./listado-roles"
import { MetricasRoles } from "./metricas-roles"

/**
 * Sección del listado que espera la consulta (Server Component dentro de
 * `<Suspense>`): el encabezado se pinta de inmediato y los roles llegan en
 * streaming. La promesa es la misma que usa la hoja de "copiar de".
 */
export async function SeccionListadoRoles({
  roles,
  actor,
}: {
  roles: Promise<RolListado[]>
  actor: ActorRoles
}) {
  const lista = await roles
  return (
    <>
      <MetricasRoles roles={lista} />
      <ListadoRoles roles={lista} actor={actor} />
    </>
  )
}

function EsqueletoTarjetaRol() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Esqueleto className="size-10 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Esqueleto className="h-4 w-36" />
            <Esqueleto className="h-3 w-24" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-3.5 w-full" />
          <Esqueleto className="h-3.5 w-2/3" />
        </div>
        <div className="flex gap-1.5">
          <Esqueleto className="h-6 w-28 rounded-full" />
          <Esqueleto className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border-t px-4 py-3 sm:px-5">
        <div className="flex justify-between">
          <Esqueleto className="h-3.5 w-20" />
          <Esqueleto className="h-3.5 w-24" />
        </div>
        <Esqueleto className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  )
}

/** Esqueleto fiel del listado: indicadores, barra de filtros y tarjetas. */
export function EsqueletoListadoRoles() {
  return (
    <>
      <EsqueletoKpis
        cantidad={4}
        className="grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      />
      <div role="status" aria-busy="true" className="flex flex-col gap-8">
        <span className="sr-only">Cargando roles…</span>
        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
          <Esqueleto className="h-8 w-full md:w-80" />
          <Esqueleto className="h-8 w-full max-w-96 md:w-96" />
        </div>
        <div className="flex flex-col gap-4">
          <Esqueleto className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, indice) => (
              <EsqueletoTarjetaRol key={indice} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
