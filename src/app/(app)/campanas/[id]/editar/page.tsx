import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { EdicionCampana } from "@/features/campanas/components/paginas"
import { SinEmpresa } from "@/features/campanas/components/sin-empresa"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Editar campaña" }

/**
 * Edición de una campaña en borrador o activa (ANU-003): el presupuesto no
 * baja de lo comprometido y las fechas respetan las ofertas vivas. Mientras
 * carga, `loading.tsx`; un fallo al leer lo recoge `(app)/error.tsx`.
 */
export default async function PaginaEditarCampana({
  params,
}: PageProps<"/campanas/[id]/editar">) {
  const usuario = await requerirPermiso("campanas.gestionar_propias")
  const { id } = await params
  if (!UUID.test(id)) notFound()
  if (!usuario.anuncianteId) {
    return (
      <ContenedorPagina ancho="estrecho">
        <EncabezadoPagina titulo="Editar campaña" />
        <SinEmpresa />
      </ContenedorPagina>
    )
  }
  return <EdicionCampana anuncianteId={usuario.anuncianteId} campanaId={id} />
}
