import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import {
  SeccionMetricasMedios,
  SeccionTablaMedios,
} from "@/features/operacion/components/secciones-medios"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Medios" }

/**
 * Listado de medios (consulta). El estado de la tabla vive en la URL; los
 * enlaces de otros módulos llegan ya filtrados (`?segmento=en_riesgo`,
 * `?departamento=52`). La RLS decide qué medios ve cada rol.
 */
export default async function PaginaMedios({
  searchParams,
}: PageProps<"/operacion/medios">) {
  const usuario = await requerirPermiso("medios.ver")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Medios"
        descripcion="La red de medios: verificación, cuentas sociales y desempeño de cada uno."
      />

      <LimiteErrorTabla recurso="el resumen de medios">
        <Suspense fallback={<EsqueletoIndicadores cantidad={6} />}>
          <SeccionMetricasMedios />
        </Suspense>
      </LimiteErrorTabla>

      <LimiteErrorTabla recurso="los medios">
        <Suspense fallback={<EsqueletoTablaDatos columnas={7} filtros={5} />}>
          <SeccionTablaMedios
            searchParams={searchParams}
            verAsignaciones={tieneAlgunPermiso(usuario, ["asignaciones.ver"])}
            verSegmentoRiesgo={tieneAlgunPermiso(usuario, ["inicio.admin"])}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
