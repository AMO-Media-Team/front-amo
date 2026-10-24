import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { FichaFactura } from "@/features/facturacion/components/ficha-factura"
import { sugerenciaNumeracion } from "@/features/facturacion/presentacion"
import {
  diasVencimientoFacturas,
  lineasFactura,
  notasCreditoFactura,
  obtenerFactura,
  pagosFactura,
  resolucionFacturaActiva,
} from "@/features/facturacion/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/finanzas/facturas/[id]">): Promise<Metadata> {
  await requerirPermiso("facturas.ver")
  const { id } = await params
  const factura = UUID.test(id) ? await obtenerFactura(id) : null
  if (!factura) return { title: "Factura" }
  return {
    title: factura.numero
      ? `Factura ${factura.numero}`
      : `Borrador · ${factura.anunciante?.nombreComercial ?? "factura"}`,
  }
}

/**
 * Ficha de una factura al anunciante (LIQ-008): el borrador con su archivo de
 * carga, el registro de la factura expedida y su anulación; la expedida con
 * su PDF, CUFE, pagos y notas crédito. Cada acción según el permiso del rol;
 * la BD vuelve a comprobarlo todo.
 */
export default async function PaginaFactura({
  params,
}: PageProps<"/finanzas/facturas/[id]">) {
  const usuario = await requerirPermiso("facturas.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const factura = await obtenerFactura(id)
  if (!factura) notFound()

  const permisos = {
    gestionar: tieneAlgunPermiso(usuario, ["facturas.gestionar"]),
    registrarPago: tieneAlgunPermiso(usuario, ["pagos.registrar"]),
    verAsignaciones: tieneAlgunPermiso(usuario, ["asignaciones.ver"]),
    verAnunciantes: tieneAlgunPermiso(usuario, ["anunciantes.ver"]),
  }
  const conExpedicion = factura.estado === "BORRADOR" && permisos.gestionar
  const [lineas, pagos, notas, resolucion, diasVencimiento] = await Promise.all(
    [
      permisos.verAsignaciones ? lineasFactura(id) : [],
      pagosFactura(id),
      notasCreditoFactura(id),
      conExpedicion ? resolucionFacturaActiva() : null,
      conExpedicion ? diasVencimientoFacturas() : null,
    ]
  )

  return (
    <ContenedorPagina>
      <FichaFactura
        factura={factura}
        lineas={lineas}
        pagos={pagos}
        notas={notas}
        permisos={permisos}
        expedicion={
          conExpedicion
            ? {
                sugerencia: sugerenciaNumeracion(resolucion),
                resolucion: resolucion?.numero ?? null,
                diasVencimiento,
              }
            : null
        }
        ahora={new Date()}
      />
    </ContenedorPagina>
  )
}
