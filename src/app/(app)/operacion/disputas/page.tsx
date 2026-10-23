import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoResumenBandeja,
  EsqueletoTablaDisputas,
} from "@/features/disputas/components/esqueletos"
import {
  SeccionResumenBandeja,
  SeccionTablaDisputas,
} from "@/features/disputas/components/secciones"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Disputas" }

/**
 * Bandeja de disputas del equipo AMO (ADM-012): las abiertas primero y, entre
 * ellas, la más antigua arriba; filtros por estado, motivo y quién la abrió
 * en la URL. Cada disputa se atiende en su ficha; quien solo consulta
 * (FINANZAS) la ve en solo lectura.
 */
export default async function PaginaDisputas({
  searchParams,
}: PageProps<"/operacion/disputas">) {
  await requerirPermiso("disputas.ver")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Disputas"
        descripcion="Casos que abrieron los medios, los anunciantes o el equipo sobre una asignación. Revisa la conversación y las pruebas, y resuélvelos o descártalos."
      />
      <LimiteErrorTabla recurso="el resumen de las disputas">
        <Suspense fallback={<EsqueletoResumenBandeja />}>
          <SeccionResumenBandeja searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>
      <LimiteErrorTabla recurso="las disputas">
        <Suspense fallback={<EsqueletoTablaDisputas />}>
          <SeccionTablaDisputas searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
