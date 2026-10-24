import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoPestanas,
  PestanasLiquidaciones,
} from "@/features/liquidaciones/components/pestanas-liquidaciones"
import { VistaLiquidacionesActiva } from "@/features/liquidaciones/components/vista-activa"
import {
  accesoLiquidaciones,
  cargarVista,
} from "@/features/liquidaciones/vistas"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Liquidaciones" }

/**
 * Liquidaciones a medios (LIQ-001, LIQ-002, LIQ-003, LIQ-007): lo verificado
 * por liquidar con el corte por periodo, los borradores por aprobar (quien
 * genera no aprueba) y las aprobadas, pagadas y anuladas. La vista va en la
 * URL (`?vista=pendientes|borrador|aprobadas|pagadas|anuladas`, con la
 * búsqueda, los filtros, el orden y la página de su tabla). La BD decide qué
 * ve y qué puede hacer cada rol.
 */
export default async function PaginaLiquidaciones({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await requerirPermiso("liquidaciones.ver")
  const acceso = accesoLiquidaciones(usuario)
  const { vista } = await cargarVista(searchParams)

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Liquidaciones"
        descripcion="Corta cada periodo lo verificado por medio, revisa retenciones y seguridad social, y aprueba lo que generó otra persona del equipo: después vienen el documento soporte y el pago."
      />
      <LimiteErrorTabla recurso="las vistas de liquidaciones">
        <Suspense fallback={<EsqueletoPestanas />}>
          <PestanasLiquidaciones activa={vista} />
        </Suspense>
      </LimiteErrorTabla>
      <VistaLiquidacionesActiva
        vista={vista}
        searchParams={searchParams}
        acceso={acceso}
        actorId={usuario.id}
      />
    </ContenedorPagina>
  )
}
