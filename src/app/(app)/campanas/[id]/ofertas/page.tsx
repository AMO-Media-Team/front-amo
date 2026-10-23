import { notFound, redirect } from "next/navigation"

import { rutaMiCampana } from "@/features/campanas/rutas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

/**
 * `/campanas/[id]/ofertas` no tiene vista propia: las migas enlazan este
 * segmento y lleva a la pestaña «Ofertas» de la ficha, tras el DAL.
 */
export default async function PaginaOfertasDeCampana({
  params,
}: PageProps<"/campanas/[id]/ofertas">) {
  await requerirPermiso("campanas.gestionar_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  redirect(rutaMiCampana(id, "ofertas"))
}
