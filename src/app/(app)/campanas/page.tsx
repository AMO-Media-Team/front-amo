import { Plus } from "lucide-react"
import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EnlaceBoton } from "@/components/layout/enlace-boton"
import {
  SeccionResumenCampanas,
  SeccionTablaCampanas,
} from "@/features/campanas/components/secciones"
import { SinEmpresa } from "@/features/campanas/components/sin-empresa"
import { RUTA_NUEVA_CAMPANA } from "@/features/campanas/rutas"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Mis campañas" }

/**
 * «Mis campañas» (ANU-002, ANU-003): las campañas de la empresa, también las
 * que crearon los compañeros, con estado, vigencia, ofertas por estado y
 * presupuesto. Búsqueda, filtro por estado, orden y página en la URL
 * (`?estado=ACTIVA` llega desde el inicio). La RLS limita todo a la empresa.
 */
export default async function PaginaMisCampanas({
  searchParams,
}: PageProps<"/campanas">) {
  const usuario = await requerirPermiso("campanas.gestionar_propias")
  const anuncianteId = usuario.anuncianteId

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Mis campañas"
        descripcion="Las campañas de tu empresa con sus ofertas y su presupuesto. Tu equipo ve y gestiona las mismas."
        acciones={
          anuncianteId ? (
            <EnlaceBoton href={RUTA_NUEVA_CAMPANA} className="max-sm:w-full">
              <Plus data-icon="inline-start" aria-hidden />
              Crear campaña
            </EnlaceBoton>
          ) : null
        }
      />

      {anuncianteId ? (
        <>
          <LimiteErrorTabla recurso="el resumen de tus campañas">
            <Suspense fallback={<EsqueletoIndicadores cantidad={4} />}>
              <SeccionResumenCampanas anuncianteId={anuncianteId} />
            </Suspense>
          </LimiteErrorTabla>
          <LimiteErrorTabla recurso="tus campañas">
            <Suspense
              fallback={<EsqueletoTablaDatos columnas={5} filtros={1} />}
            >
              <SeccionTablaCampanas
                anuncianteId={anuncianteId}
                searchParams={searchParams}
                puedeCrear
              />
            </Suspense>
          </LimiteErrorTabla>
        </>
      ) : (
        <SinEmpresa />
      )}
    </ContenedorPagina>
  )
}
