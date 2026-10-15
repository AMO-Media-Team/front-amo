import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { cargarFiltros } from "@/features/notificaciones/esquemas"
import { BotonMarcarTodas } from "@/features/notificaciones/components/boton-marcar-todas"
import { EsqueletoListaBandeja } from "@/features/notificaciones/components/esqueletos-bandeja"
import {
  BarraFiltros,
  RielFiltros,
} from "@/features/notificaciones/components/filtros-bandeja"
import { MarcoBandeja } from "@/features/notificaciones/components/marco-bandeja"
import { SeccionBandeja } from "@/features/notificaciones/components/seccion-bandeja"
import { contarNoLeidas } from "@/features/notificaciones/queries"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Notificaciones" }

/**
 * Bandeja de notificaciones propias. Filtros (leídas/no leídas y tipo) en la
 * URL; la lista se transmite en su `<Suspense>` con su propio límite de error
 * y el conteo de no leídas lo mantiene al día el sondeo del cliente.
 */
export default async function PaginaNotificaciones({
  searchParams,
}: PageProps<"/notificaciones">) {
  await requerirPermiso("notificaciones.ver")
  const [filtros, conteo] = await Promise.all([
    cargarFiltros(searchParams),
    contarNoLeidas(),
  ])

  const lista = (
    <LimiteErrorTabla recurso="tus notificaciones">
      <Suspense fallback={<EsqueletoListaBandeja />}>
        <SeccionBandeja filtros={filtros} />
      </Suspense>
    </LimiteErrorTabla>
  )

  return (
    <ContenedorPagina className="max-w-6xl">
      <MarcoBandeja>
        <EncabezadoPagina
          titulo="Notificaciones"
          descripcion="Avisos de ofertas, asignaciones, pagos y de la seguridad de tu cuenta."
          acciones={<BotonMarcarTodas inicial={conteo} />}
        />
        {/* Sin la tabla (migración 8 pendiente) no hay nada que filtrar. */}
        {conteo.disponible ? (
          <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
            <RielFiltros inicial={conteo} />
            <div className="flex min-w-0 flex-col gap-4">
              <BarraFiltros inicial={conteo} className="lg:hidden" />
              {lista}
            </div>
          </div>
        ) : (
          lista
        )}
      </MarcoBandeja>
    </ContenedorPagina>
  )
}
