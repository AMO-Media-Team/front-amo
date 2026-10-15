import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EsqueletoGrupos } from "@/features/operacion/components/esqueletos"
import {
  SeccionGruposAsignaciones,
  SeccionTablaAsignaciones,
} from "@/features/operacion/components/secciones-asignaciones"
import { SelectorPeriodoOperacion } from "@/features/operacion/components/selector-periodo-operacion"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Asignaciones" }

/**
 * Listado de asignaciones (consulta): los negocios entre una oferta y un
 * medio en cada estado de su máquina. Llegan filtrados desde las fichas
 * (`?medio=`, `?campana=`, `?anunciante=`) y desde los insights
 * (`?alerta=metricas`, `?desde=&hasta=`).
 */
export default async function PaginaAsignaciones({
  searchParams,
}: PageProps<"/operacion/asignaciones">) {
  const usuario = await requerirPermiso("asignaciones.ver")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Asignaciones"
        descripcion="Cada cupo aceptado por un medio, desde la aceptación hasta el pago: estado, evidencia y métricas."
        acciones={<SelectorPeriodoOperacion />}
      />

      <LimiteErrorTabla recurso="el resumen de asignaciones">
        <Suspense fallback={<EsqueletoGrupos />}>
          <SeccionGruposAsignaciones searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="las asignaciones">
        <Suspense fallback={<EsqueletoTablaDatos columnas={7} filtros={6} />}>
          <SeccionTablaAsignaciones
            searchParams={searchParams}
            verCampanas={tieneAlgunPermiso(usuario, ["campanas.ver"])}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
