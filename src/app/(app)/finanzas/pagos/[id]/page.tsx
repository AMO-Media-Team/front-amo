import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { UUID } from "@/features/operacion/components/ficha"
import { VistaDispersion } from "@/features/pagos-medios/components/vista-dispersion"
import { detalleDispersion } from "@/features/pagos-medios/queries"
import { tituloDispersion } from "@/features/pagos-medios/textos"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requerirPermiso("liquidaciones.registrar_pago")
  const { id } = await params
  const detalle = UUID.test(id) ? await detalleDispersion(id) : null
  return {
    title: detalle
      ? `${tituloDispersion(detalle.dispersion.creadaAt)} · Pagos a medios`
      : "Archivo de pagos",
  }
}

/**
 * Ficha de un archivo de pagos (LIQ-005): quién y cuándo lo generó, su
 * descarga (firmada como servicio y registrada; exige «Ver datos sensibles»),
 * el avance de los pagos y sus liquidaciones, donde se registra cada pago
 * (LIQ-006).
 */
export default async function PaginaArchivoPagos({
  params,
  searchParams,
}: Props) {
  const usuario = await requerirPermiso("liquidaciones.registrar_pago")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const detalle = await detalleDispersion(id)
  if (!detalle) notFound()

  return (
    <ContenedorPagina>
      <VistaDispersion
        detalle={detalle}
        puedeVerDatosSensibles={tieneAlgunPermiso(usuario, [
          "datos_sensibles.ver",
        ])}
        searchParams={searchParams}
      />
    </ContenedorPagina>
  )
}
