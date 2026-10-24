import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { FichaDisputa } from "@/features/disputas/components/ficha-disputa"
import { MOTIVOS } from "@/features/disputas/presentacion"
import { obtenerDisputaInterna } from "@/features/disputas/queries"
import { UUID } from "@/features/operacion/components/ficha"
import { requerirPermiso } from "@/lib/auth/dal"

export async function generateMetadata({
  params,
}: PageProps<"/operacion/disputas/[id]">): Promise<Metadata> {
  await requerirPermiso("disputas.ver")
  const { id } = await params
  const disputa = UUID.test(id) ? await obtenerDisputaInterna(id) : null
  if (!disputa) return { title: "Disputa" }
  const motivo = MOTIVOS[disputa.motivo].etiqueta.toLocaleLowerCase("es-CO")
  return {
    title: disputa.asignacion?.medio.nombre
      ? `Disputa por ${motivo} · ${disputa.asignacion.medio.nombre}`
      : `Disputa por ${motivo}`,
  }
}

/**
 * Ficha interna de una disputa (ADM-012): la asignación resumida, quién la
 * abrió y por qué, la conversación con las notas internas y los adjuntos, y
 * la decisión con `disputas.resolver` (tomar en revisión, resolver con su
 * efecto o descartar). La BD vuelve a comprobarlo todo.
 */
export default async function PaginaDisputa({
  params,
}: PageProps<"/operacion/disputas/[id]">) {
  const usuario = await requerirPermiso("disputas.ver")
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const disputa = await obtenerDisputaInterna(id)
  if (!disputa) notFound()

  return (
    <ContenedorPagina>
      <FichaDisputa disputa={disputa} usuario={usuario} />
    </ContenedorPagina>
  )
}
