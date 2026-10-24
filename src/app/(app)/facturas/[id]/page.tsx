import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { FichaFactura } from "@/features/facturas-anunciante/components/ficha-factura"
import { SinEmpresaFacturas } from "@/features/facturas-anunciante/components/sin-empresa"
import { obtenerFacturaAnunciante } from "@/features/facturas-anunciante/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"
import { serializarFecha } from "@/lib/fechas"

export async function generateMetadata({
  params,
}: PageProps<"/facturas/[id]">): Promise<Metadata> {
  const usuario = await requerirPermiso("facturas.ver_propias")
  const { id } = await params
  const factura =
    usuario.anuncianteId && UUID.test(id)
      ? await obtenerFacturaAnunciante(
          usuario.anuncianteId,
          id,
          serializarFecha(new Date())
        )
      : null
  return { title: factura ? `Factura ${factura.numero}` : "Factura" }
}

/**
 * Ficha de una factura de la empresa (ANU-013): totales, pagos con sus
 * retenciones y soporte, notas crédito, conceptos y descargas firmadas como
 * el usuario. Es el destino de `/ir/facturas/{id}` para el anunciante (aviso
 * `factura.emitida`). Un fallo al leer lo recoge `(app)/error.tsx`.
 */
export default async function PaginaFactura({
  params,
}: PageProps<"/facturas/[id]">) {
  const usuario = await requerirPermiso("facturas.ver_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (!usuario.anuncianteId) {
    return (
      <ContenedorPagina>
        <EncabezadoPagina titulo="Factura" />
        <SinEmpresaFacturas />
      </ContenedorPagina>
    )
  }

  // Sin `<Suspense>` alrededor: una factura ajena o inexistente responde 404
  // antes de empezar a transmitir (la navegación ya muestra el esqueleto).
  return (
    <FichaFactura
      usuario={usuario}
      anuncianteId={usuario.anuncianteId}
      facturaId={id}
    />
  )
}
