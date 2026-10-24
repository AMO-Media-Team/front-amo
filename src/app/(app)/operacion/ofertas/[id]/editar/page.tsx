import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoAsistente } from "@/features/asistente-oferta/components/esqueleto-asistente"
import { LimiteErrorAsistente } from "@/features/asistente-oferta/components/limite-error-asistente"
import { SeccionAsistente } from "@/features/asistente-oferta/components/seccion-asistente"
import { campanaDeOferta } from "@/features/asistente-oferta/queries"
import { esIdValido } from "@/features/asistente-oferta/rutas"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Editar oferta" }

/**
 * Edición asistida de una oferta en BORRADOR o DEVUELTA (ADM-014): el mismo
 * asistente del anunciante, por cuenta de la empresa dueña, con el aviso de
 * la gestión asistida; la campaña sale de la oferta. Exige TODOS sus
 * permisos: gestionar y ver ofertas, y ver la campaña. Una oferta en otro
 * estado se explica sin el asistente. Tipos de `params` explícitos: la ruta
 * es nueva en esta fase.
 */
export default async function PaginaEditarOfertaAsistida({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requerirPermiso("ofertas.gestionar")
  await requerirPermiso("ofertas.ver")
  const usuario = await requerirPermiso("campanas.ver")
  const { id } = await params
  if (!esIdValido(id)) notFound()
  const campanaId = await campanaDeOferta(id)
  if (!campanaId) notFound()
  return (
    <ContenedorPagina ancho="estrecho" className="max-w-4xl">
      <LimiteErrorAsistente recurso="la oferta">
        <Suspense
          fallback={<EsqueletoAsistente etiqueta="Cargando la oferta…" />}
        >
          <SeccionAsistente
            usuario={usuario}
            campanaId={campanaId}
            modo="editar"
            ofertaId={id}
            asistido
          />
        </Suspense>
      </LimiteErrorAsistente>
    </ContenedorPagina>
  )
}
