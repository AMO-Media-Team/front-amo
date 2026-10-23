import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { FichaOfertaMedio } from "@/features/marketplace/components/ficha-oferta-medio"
import { disponibilidadAceptar } from "@/features/marketplace/presentacion"
import {
  consumoTopeMedio,
  detalleOfertaMedio,
} from "@/features/marketplace/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/ofertas/[id]">): Promise<Metadata> {
  await requerirPermiso("ofertas.marketplace")
  const { id } = await params
  const detalle = UUID.test(id) ? await detalleOfertaMedio(id) : null
  return { title: detalle?.titulo ?? "Oferta" }
}

/**
 * Detalle de una oferta para el medio (MED-009, MED-010): lo que publica,
 * cuánto recibe con cada cuenta, fechas y condiciones, y el pie para aceptar
 * o decir «No me interesa». La BD solo devuelve ofertas dirigidas a este
 * medio (o en las que ya tiene una asignación); si no, «No encontrado».
 */
export default async function PaginaOfertaMedio({
  params,
}: PageProps<"/ofertas/[id]">) {
  const usuario = await requerirPermiso("ofertas.marketplace")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const [detalle, consumo] = await Promise.all([
    detalleOfertaMedio(id),
    usuario.medioId ? consumoTopeMedio(usuario.medioId) : null,
  ])
  if (!detalle) notFound()

  const ahora = new Date()
  return (
    <ContenedorPagina ancho="estrecho">
      <FichaOfertaMedio
        detalle={detalle}
        disponibilidad={disponibilidadAceptar(detalle, ahora)}
        consumo={consumo}
        puedeAceptar={tieneAlgunPermiso(usuario, ["ofertas.aceptar"])}
        ahoraServidor={ahora.getTime()}
      />
    </ContenedorPagina>
  )
}
