import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoAsistente } from "@/features/asistente-oferta/components/esqueleto-asistente"
import { LimiteErrorAsistente } from "@/features/asistente-oferta/components/limite-error-asistente"
import { SeccionAsistente } from "@/features/asistente-oferta/components/seccion-asistente"
import { esIdValido } from "@/features/asistente-oferta/rutas"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Editar oferta" }

/**
 * Edición de una oferta en BORRADOR o DEVUELTA (ANU-009): el mismo asistente
 * con sus datos cargados y los pasos completos marcados; una devuelta muestra
 * el comentario de la moderación. Tipos de `params` explícitos: la ruta es
 * nueva en esta fase.
 */
export default async function PaginaEditarOferta({
  params,
}: {
  params: Promise<{ id: string; ofertaId: string }>
}) {
  const usuario = await requerirPermiso("ofertas.gestionar_propias")
  const { id, ofertaId } = await params
  if (!esIdValido(id) || !esIdValido(ofertaId)) notFound()
  return (
    <ContenedorPagina ancho="estrecho" className="max-w-4xl">
      <LimiteErrorAsistente recurso="la oferta">
        <Suspense
          fallback={<EsqueletoAsistente etiqueta="Cargando la oferta…" />}
        >
          <SeccionAsistente
            usuario={usuario}
            campanaId={id}
            modo="editar"
            ofertaId={ofertaId}
          />
        </Suspense>
      </LimiteErrorAsistente>
    </ContenedorPagina>
  )
}
