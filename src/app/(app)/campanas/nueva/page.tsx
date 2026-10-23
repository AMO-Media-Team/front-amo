import type { Metadata } from "next"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { NuevaCampana } from "@/features/campanas/components/paginas"
import { SinEmpresa } from "@/features/campanas/components/sin-empresa"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Nueva campaña" }

/**
 * Alta de una campaña (ANU-003): nombre, marca o producto, objetivo, fechas y
 * presupuesto. Nace en borrador; se activa desde su ficha cuando la empresa
 * está verificada. Mientras carga, `loading.tsx`; un fallo al leer lo recoge
 * `(app)/error.tsx`.
 */
export default async function PaginaNuevaCampana() {
  const usuario = await requerirPermiso("campanas.gestionar_propias")
  if (!usuario.anuncianteId) {
    return (
      <ContenedorPagina ancho="estrecho">
        <EncabezadoPagina titulo="Nueva campaña" />
        <SinEmpresa />
      </ContenedorPagina>
    )
  }
  return <NuevaCampana anuncianteId={usuario.anuncianteId} />
}
