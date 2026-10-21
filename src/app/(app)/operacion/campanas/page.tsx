import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import {
  SeccionMetricasCampanas,
  SeccionTablaCampanas,
} from "@/features/operacion/components/secciones-campanas"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Campañas" }

/**
 * Listado de campañas (consulta): vigencia, ofertas por plataforma, cupos y
 * presupuesto comprometido. Los enlaces desde otras fichas llegan filtrados
 * (`?anunciante=<id>`); la RLS decide qué campañas ve cada rol.
 */
export default async function PaginaCampanas({
  searchParams,
}: PageProps<"/operacion/campanas">) {
  await requerirPermiso("campanas.ver")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Campañas"
        descripcion="Las campañas de los anunciantes con sus ofertas, cupos y presupuesto comprometido."
      />

      <LimiteErrorTabla recurso="el resumen de campañas">
        <Suspense fallback={<EsqueletoIndicadores cantidad={5} />}>
          <SeccionMetricasCampanas />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="las campañas">
        <Suspense fallback={<EsqueletoTablaDatos columnas={7} filtros={3} />}>
          <SeccionTablaCampanas searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
