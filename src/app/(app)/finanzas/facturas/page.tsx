import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  EsqueletoResumenFacturas,
  EsqueletoTablaFacturas,
} from "@/features/facturacion/components/esqueletos"
import { NuevaFactura } from "@/features/facturacion/components/nueva-factura"
import {
  SeccionResumenFacturas,
  SeccionTablaFacturas,
} from "@/features/facturacion/components/secciones"
import { SelectorPeriodoFacturas } from "@/features/facturacion/components/selector-periodo-facturas"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Facturas" }

/**
 * Facturas al anunciante (LIQ-008): lo por facturar, los borradores y las
 * expedidas con su saldo; filtros por estado, anunciante y periodo de emisión
 * en la URL. Con `facturas.gestionar`, «Nueva factura» genera el borrador
 * desde lo verificado sin facturar.
 */
export default async function PaginaFacturas({
  searchParams,
}: PageProps<"/finanzas/facturas">) {
  const usuario = await requerirPermiso("facturas.ver")
  const puedeCrear = tieneAlgunPermiso(usuario, ["facturas.gestionar"])

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Facturas"
        descripcion="Factura a los anunciantes lo verificado: genera el borrador, expídelo en el software de facturación, regístralo aquí y lleva sus pagos y notas crédito."
        acciones={
          <>
            <SelectorPeriodoFacturas />
            {puedeCrear ? <NuevaFactura /> : null}
          </>
        }
      />
      <LimiteErrorTabla recurso="el resumen de la facturación">
        <Suspense fallback={<EsqueletoResumenFacturas />}>
          <SeccionResumenFacturas />
        </Suspense>
      </LimiteErrorTabla>
      <LimiteErrorTabla recurso="las facturas">
        <Suspense fallback={<EsqueletoTablaFacturas />}>
          <SeccionTablaFacturas
            searchParams={searchParams}
            puedeCrear={puedeCrear}
          />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
