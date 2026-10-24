import type { Metadata } from "next"
import { Suspense } from "react"

import { EsqueletoTablaDatos } from "@/components/data-table/esqueleto-tabla"
import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import {
  SeccionResumenFacturas,
  SeccionTablaFacturas,
} from "@/features/facturas-anunciante/components/secciones"
import { SelectorPeriodoFacturas } from "@/features/facturas-anunciante/components/selector-periodo-facturas"
import { SinEmpresaFacturas } from "@/features/facturas-anunciante/components/sin-empresa"
import { EsqueletoIndicadores } from "@/features/operacion/components/esqueletos"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Facturas" }

/**
 * Facturas de la empresa (ANU-013): lo que debe (por pagar, vencido y el
 * próximo vencimiento) y el historial de facturas expedidas con su estado de
 * pago, saldo, vencimiento, CUFE y PDF. El buscador por fechas filtra por la
 * emisión (`?desde=&hasta=`); estado (`?estado=`), campaña (`?campana=`,
 * desde la ficha de una campaña), búsqueda, orden y página también van en la
 * URL. La RLS limita todo a las facturas expedidas de la propia empresa.
 */
export default async function PaginaFacturas({
  searchParams,
}: PageProps<"/facturas">) {
  const usuario = await requerirPermiso("facturas.ver_propias")
  const anuncianteId = usuario.anuncianteId

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Facturas"
        descripcion="Lo que AMO le ha facturado a tu empresa: estado de pago, saldo, vencimiento, CUFE y PDF de cada factura."
        acciones={
          anuncianteId ? (
            <SelectorPeriodoFacturas className="max-sm:w-full" />
          ) : null
        }
      />

      {anuncianteId ? (
        <>
          <LimiteErrorTabla recurso="el resumen de tus facturas">
            <Suspense fallback={<EsqueletoIndicadores cantidad={3} />}>
              <SeccionResumenFacturas anuncianteId={anuncianteId} />
            </Suspense>
          </LimiteErrorTabla>
          <LimiteErrorTabla recurso="tus facturas">
            <Suspense
              fallback={<EsqueletoTablaDatos columnas={7} filtros={2} />}
            >
              <SeccionTablaFacturas
                anuncianteId={anuncianteId}
                searchParams={searchParams}
              />
            </Suspense>
          </LimiteErrorTabla>
        </>
      ) : (
        <SinEmpresaFacturas />
      )}
    </ContenedorPagina>
  )
}
