import { notFound, redirect } from "next/navigation"

import { UUID } from "@/features/operacion/components/ficha"
import { rutaSeguimiento } from "@/features/seguimiento/rutas"
import { requerirPermiso } from "@/lib/auth/dal"

/**
 * `/campanas/[id]/asignaciones` no tiene vista propia: las migas de la
 * disputa enlazan este segmento y lleva a la pestaña «Seguimiento» de la
 * campaña, tras el DAL.
 */
export default async function PaginaAsignacionesDeCampana({
  params,
}: PageProps<"/campanas/[id]/asignaciones">) {
  await requerirPermiso("asignaciones.ver_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  redirect(rutaSeguimiento(id))
}
