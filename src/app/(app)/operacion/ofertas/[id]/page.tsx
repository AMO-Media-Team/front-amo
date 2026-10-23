import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { FichaOfertaInterna } from "@/features/moderacion/components/ficha-oferta-interna"
import { obtenerOferta } from "@/features/ofertas/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/ofertas/[id]">): Promise<Metadata> {
  await requerirPermiso("ofertas.ver")
  const { id } = await params
  const oferta = UUID.test(id) ? await obtenerOferta(id) : null
  return { title: oferta?.titulo ?? "Oferta" }
}

/**
 * Ficha interna de una oferta (ADM-005): vista completa (segmentación,
 * presupuesto y cupos, condiciones, creativos e historial). Decidir exige
 * además `ofertas.moderar`: publicar, devolver, rechazar o cancelar la
 * publicada; la BD vuelve a comprobarlo todo.
 */
export default async function PaginaOfertaInterna({
  params,
}: PageProps<"/operacion/ofertas/[id]">) {
  const usuario = await requerirPermiso("ofertas.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const oferta = await obtenerOferta(id)
  if (!oferta) notFound()

  return (
    <ContenedorPagina>
      <FichaOfertaInterna oferta={oferta} usuario={usuario} />
    </ContenedorPagina>
  )
}
