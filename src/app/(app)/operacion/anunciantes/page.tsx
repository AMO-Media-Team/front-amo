import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import {
  SeccionMetricasAnunciantes,
  SeccionTablaAnunciantes,
} from "@/features/operacion/components/secciones-anunciantes"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Anunciantes" }

/**
 * Listado de anunciantes (consulta). El NIT se muestra completo (es un dato
 * público de la empresa: docs/modelo-datos.md §3.5) y la cartera solo llega
 * con `facturas.ver`; la RLS decide qué empresas ve cada rol.
 */
export default async function PaginaAnunciantes({
  searchParams,
}: PageProps<"/operacion/anunciantes">) {
  const usuario = await requerirPermiso("anunciantes.ver")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Anunciantes"
        descripcion="Las empresas que pautan en AMO: verificación, campañas, inversión y cartera."
      />

      <LimiteErrorTabla recurso="el resumen de anunciantes">
        <Suspense fallback={<EsqueletoIndicadores cantidad={5} />}>
          <SeccionMetricasAnunciantes />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="los anunciantes">
        <Suspense fallback={<EsqueletoTablaDatos columnas={7} filtros={3} />}>
          <SeccionTablaAnunciantes
            searchParams={searchParams}
            permisos={{
              verCartera: tieneAlgunPermiso(usuario, ["facturas.ver"]),
            }}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
