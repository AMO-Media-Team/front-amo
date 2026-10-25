import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { UUID } from "@/features/operacion/components/ficha"
import { FichaSolicitud } from "@/features/privacidad/components/ficha-solicitud"
import { textoRadicado, TIPOS } from "@/features/privacidad/presentacion"
import { obtenerSolicitudInterna } from "@/features/privacidad/queries"
import { requerirPermiso } from "@/lib/auth/dal"
import { serializarFecha } from "@/lib/fechas"

export async function generateMetadata({
  params,
}: PageProps<"/administracion/privacidad/[id]">): Promise<Metadata> {
  await requerirPermiso("privacidad.gestionar")
  const { id } = await params
  const solicitud = UUID.test(id) ? await obtenerSolicitudInterna(id) : null
  if (!solicitud) return { title: "Solicitud de datos personales" }
  return {
    title: `${TIPOS[solicitud.tipo].etiqueta} ${textoRadicado(solicitud.numero)}`,
  }
}

/**
 * Ficha de una solicitud de titular de datos (CTA-007): el titular y su
 * organización, la solicitud con su plazo legal, la línea de tiempo y las
 * acciones del equipo (`privacidad.gestionar`): tomarla en trámite, pedir
 * información, prorrogar, responder con soporte, ver los datos del titular
 * y, para una supresión o revocatoria, simular y ejecutar la supresión. La BD
 * vuelve a comprobarlo todo.
 */
export default async function PaginaSolicitudTitular({
  params,
}: PageProps<"/administracion/privacidad/[id]">) {
  const usuario = await requerirPermiso("privacidad.gestionar")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const solicitud = await obtenerSolicitudInterna(id)
  if (!solicitud) notFound()

  return (
    <ContenedorPagina>
      <FichaSolicitud
        solicitud={solicitud}
        usuario={usuario}
        hoy={serializarFecha(new Date())}
      />
    </ContenedorPagina>
  )
}
