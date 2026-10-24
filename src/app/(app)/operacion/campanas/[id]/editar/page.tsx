import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { EdicionCampana } from "@/features/campanas/components/paginas"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Editar campaña" }

/**
 * Edición de una campaña en borrador o activa por cuenta de su anunciante
 * (ADM-014): las mismas reglas que en «Mis campañas» (el presupuesto no baja
 * de lo comprometido y las fechas respetan las ofertas vivas), con el aviso
 * de la gestión asistida. Exige TODOS sus permisos: gestionar y ver
 * campañas, y ver anunciantes. Mientras carga, `loading.tsx`; un fallo al
 * leer lo recoge `(app)/error.tsx`. Tipos de `params` explícitos: la ruta es
 * nueva en esta fase.
 */
export default async function PaginaEditarCampanaAsistida({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requerirPermiso("campanas.gestionar")
  await requerirPermiso("campanas.ver")
  await requerirPermiso("anunciantes.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  return <EdicionCampana campanaId={id} asistido />
}
