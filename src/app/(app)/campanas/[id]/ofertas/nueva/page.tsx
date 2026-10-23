import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EsqueletoAsistente } from "@/features/asistente-oferta/components/esqueleto-asistente"
import { LimiteErrorAsistente } from "@/features/asistente-oferta/components/limite-error-asistente"
import { SeccionAsistente } from "@/features/asistente-oferta/components/seccion-asistente"
import {
  esIdValido,
  PARAMETRO_OFERTAS,
  parsearIdsOfertas,
} from "@/features/asistente-oferta/rutas"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Nueva oferta" }

/**
 * Asistente de oferta nueva (ANU-004…009): uno o varios formatos de la
 * campaña, cada uno su oferta. `?ofertas=` trae los borradores que el
 * asistente ya creó (al recargar continúa) y `?paso=` el paso a la vista.
 * Tipos de `params`/`searchParams` explícitos: la ruta es nueva en esta fase.
 */
export default async function PaginaNuevaOferta({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await requerirPermiso("ofertas.gestionar_propias")
  const { id } = await params
  if (!esIdValido(id)) notFound()
  const ofertaIds = parsearIdsOfertas((await searchParams)[PARAMETRO_OFERTAS])
  return (
    <ContenedorPagina ancho="estrecho" className="max-w-4xl">
      <LimiteErrorAsistente recurso="el asistente de oferta">
        <Suspense fallback={<EsqueletoAsistente />}>
          <SeccionAsistente
            usuario={usuario}
            campanaId={id}
            modo="nueva"
            ofertaIds={ofertaIds}
          />
        </Suspense>
      </LimiteErrorAsistente>
    </ContenedorPagina>
  )
}
