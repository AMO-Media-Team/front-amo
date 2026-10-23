import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EsqueletoMarketplace } from "@/features/marketplace/components/esqueletos"
import { SeccionMarketplace } from "@/features/marketplace/components/secciones"
import { DESCRIPCION_MARKETPLACE } from "@/features/marketplace/presentacion"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Ofertas" }

/**
 * Marketplace del medio (MED-008): las ofertas que puede aceptar hoy con sus
 * cuentas verificadas, con el pago, los cupos de su franja y la fecha límite.
 * Filtros, orden, «Ver las que rechacé» y página en la URL. Si aún no puede
 * ver ofertas, explica el motivo y cómo resolverlo.
 */
export default async function PaginaOfertas({
  searchParams,
}: PageProps<"/ofertas">) {
  await requerirPermiso("ofertas.marketplace")

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Ofertas"
        descripcion={DESCRIPCION_MARKETPLACE}
      />
      <LimiteErrorTabla recurso="las ofertas">
        <Suspense fallback={<EsqueletoMarketplace />}>
          <SeccionMarketplace searchParams={searchParams} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
