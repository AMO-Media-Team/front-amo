import { Plus } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import { puedeGestionarCampanasAsistidas } from "@/features/campanas/gestion"
import { rutaNuevaCampanaAsistida } from "@/features/campanas/rutas-gestion"
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
 * (`?anunciante=<id>`); la RLS decide qué campañas ve cada rol. Con los
 * permisos de la gestión asistida (ADM-014), «Nueva campaña» por cuenta de un
 * anunciante.
 */
export default async function PaginaCampanas({
  searchParams,
}: PageProps<"/operacion/campanas">) {
  const usuario = await requerirPermiso("campanas.ver")
  const puedeCrear =
    usuario.rol.tipo === "ADMIN" &&
    puedeGestionarCampanasAsistidas(usuario.permisos)

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Campañas"
        descripcion="Las campañas de los anunciantes con sus ofertas, cupos y presupuesto comprometido."
        acciones={
          puedeCrear ? (
            <EnlaceBoton
              href={rutaNuevaCampanaAsistida()}
              className="max-sm:w-full"
            >
              <Plus data-icon="inline-start" aria-hidden />
              Nueva campaña
            </EnlaceBoton>
          ) : null
        }
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
