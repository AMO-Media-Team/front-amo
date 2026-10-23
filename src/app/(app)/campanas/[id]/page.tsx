import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { FichaMiCampana } from "@/features/campanas/components/ficha-campana"
import { SinEmpresa } from "@/features/campanas/components/sin-empresa"
import { obtenerMiCampana } from "@/features/campanas/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/campanas/[id]">): Promise<Metadata> {
  const usuario = await requerirPermiso("campanas.gestionar_propias")
  const { id } = await params
  const campana =
    usuario.anuncianteId && UUID.test(id)
      ? await obtenerMiCampana(usuario.anuncianteId, id)
      : null
  return { title: campana?.nombre ?? "Campaña" }
}

/**
 * Ficha de una campaña de la empresa (ANU-003, ANU-014): estado y acciones,
 * presupuesto disponible y comprometido, y sus ofertas (`?pestana=ofertas`,
 * destino de `/campanas/[id]/ofertas`) con las devueltas destacadas. Un fallo
 * al leer lo recoge `(app)/error.tsx`.
 */
export default async function PaginaMiCampana({
  params,
}: PageProps<"/campanas/[id]">) {
  const usuario = await requerirPermiso("campanas.gestionar_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (!usuario.anuncianteId) {
    return (
      <ContenedorPagina>
        <EncabezadoPagina titulo="Campaña" />
        <SinEmpresa />
      </ContenedorPagina>
    )
  }

  // Sin `<Suspense>`: una campaña ajena o inexistente responde 404 antes de
  // empezar a transmitir (la navegación ya muestra `(app)/loading.tsx`).
  return (
    <FichaMiCampana
      usuario={usuario}
      anuncianteId={usuario.anuncianteId}
      campanaId={id}
    />
  )
}
