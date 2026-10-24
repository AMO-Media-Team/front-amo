import { notFound, redirect } from "next/navigation"

import { UUID } from "@/features/operacion/components/ficha"
import { rutaCampana } from "@/features/operacion/rutas"
import { requerirPermiso } from "@/lib/auth/dal"

/**
 * `/operacion/campanas/[id]/ofertas` no tiene vista propia: las migas del
 * asistente asistido (ADM-014) enlazan este segmento y lleva a la ficha de
 * la campaña, cuya primera pestaña son sus ofertas, tras el DAL. Tipos de
 * `params` explícitos: la ruta es nueva en esta fase.
 */
export default async function PaginaOfertasDeCampanaInterna({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requerirPermiso("campanas.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  redirect(rutaCampana(id))
}
