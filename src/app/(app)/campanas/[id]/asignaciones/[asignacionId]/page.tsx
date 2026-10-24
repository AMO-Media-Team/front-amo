import { notFound, redirect } from "next/navigation"

import { UUID } from "@/features/operacion/components/ficha"
import { rutaSeguimiento } from "@/features/seguimiento/rutas"
import { requerirPermiso } from "@/lib/auth/dal"

/**
 * Una asignación de la campaña no tiene ficha propia para el anunciante: las
 * migas de su disputa enlazan este segmento y lleva a su tarjeta en el
 * seguimiento (`?asignacion=`, que la abre y la resalta), tras el DAL.
 */
export default async function PaginaAsignacionDeCampana({
  params,
}: PageProps<"/campanas/[id]/asignaciones/[asignacionId]">) {
  await requerirPermiso("asignaciones.ver_propias")
  const { id, asignacionId } = await params
  if (!UUID.test(id) || !UUID.test(asignacionId)) notFound()
  redirect(rutaSeguimiento(id, asignacionId))
}
