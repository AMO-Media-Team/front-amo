import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { UUID } from "@/features/operacion/components/ficha"
import {
  CabeceraAsignacion,
  CuerpoAsignacion,
} from "@/features/operacion/components/ficha-asignacion"
import { ProgresoAsignacion } from "@/features/operacion/components/linea-tiempo-asignacion"
import { obtenerAsignacion } from "@/features/operacion/queries/asignaciones"
import { requerirPermiso, tieneAlgunPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/asignaciones/[id]">): Promise<Metadata> {
  const usuario = await requerirPermiso("asignaciones.ver")
  const { id } = await params
  const asignacion = UUID.test(id)
    ? await obtenerAsignacion(id, tieneAlgunPermiso(usuario, ["auditoria.ver"]))
    : null
  return {
    title: asignacion
      ? `${asignacion.medio.nombre ?? "Asignación"} · ${asignacion.oferta.titulo ?? "oferta"}`
      : "Asignación",
  }
}

/**
 * Ficha de una asignación (consulta): avance por la máquina de estados,
 * evidencia y métricas por corte, línea de tiempo (con actor y motivo si el
 * rol ve la bitácora), precio congelado, ejecución, disputas y liquidación.
 */
export default async function PaginaAsignacion({
  params,
}: PageProps<"/operacion/asignaciones/[id]">) {
  const usuario = await requerirPermiso("asignaciones.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const asignacion = await obtenerAsignacion(
    id,
    tieneAlgunPermiso(usuario, ["auditoria.ver"])
  )
  if (!asignacion) notFound()

  return (
    <ContenedorPagina>
      <CabeceraAsignacion
        asignacion={asignacion}
        enlaces={{
          medio: tieneAlgunPermiso(usuario, ["medios.ver"]),
          campana: tieneAlgunPermiso(usuario, ["campanas.ver"]),
          anunciante: tieneAlgunPermiso(usuario, ["anunciantes.ver"]),
        }}
      />
      <ProgresoAsignacion progreso={asignacion.progreso} />
      <CuerpoAsignacion asignacion={asignacion} />
    </ContenedorPagina>
  )
}
