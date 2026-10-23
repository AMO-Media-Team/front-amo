import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { FichaOfertaAnunciante } from "@/features/ofertas/components/ficha-oferta-anunciante"
import { obtenerOferta } from "@/features/ofertas/queries"
import {
  rutaOfertaAnunciante,
  rutaOfertaInterna,
} from "@/features/ofertas/rutas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/campanas/[id]/ofertas/[ofertaId]">): Promise<Metadata> {
  await requerirPermiso("ofertas.gestionar_propias")
  const { ofertaId } = await params
  const oferta = UUID.test(ofertaId) ? await obtenerOferta(ofertaId) : null
  return { title: oferta?.titulo ?? "Oferta" }
}

/**
 * Ficha de la oferta para su anunciante (ANU-009, ANU-014): estado y
 * devolución, resumen, creativos, historial y acciones. La RLS solo deja ver
 * las ofertas de su empresa. El equipo AMO revisa las ofertas en su ficha
 * interna, con la moderación.
 */
export default async function PaginaOfertaAnunciante({
  params,
}: PageProps<"/campanas/[id]/ofertas/[ofertaId]">) {
  const usuario = await requerirPermiso("ofertas.gestionar_propias")
  const { id, ofertaId } = await params
  if (!UUID.test(id) || !UUID.test(ofertaId)) notFound()
  if (usuario.rol.tipo !== "ANUNCIANTE") redirect(rutaOfertaInterna(ofertaId))

  const oferta = await obtenerOferta(ofertaId)
  if (!oferta) notFound()
  // Enlaces viejos o escritos a mano: la oferta vive dentro de su campaña.
  if (oferta.campana.id !== id) {
    redirect(rutaOfertaAnunciante(oferta.campana.id, oferta.id))
  }

  return (
    <ContenedorPagina>
      <FichaOfertaAnunciante oferta={oferta} usuario={usuario} />
    </ContenedorPagina>
  )
}
