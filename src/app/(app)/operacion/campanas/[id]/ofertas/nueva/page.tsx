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
 * Asistente de oferta nueva por cuenta del anunciante dueño de la campaña
 * (ADM-014): el mismo de «Mis campañas», con el aviso de la gestión asistida
 * y los enlaces de Operación; al enviar va a la ficha interna de la oferta.
 * Exige TODOS sus permisos (el catálogo no los encadena): gestionar ofertas,
 * verlas (el borrador recién creado se vuelve a leer) y ver la campaña.
 * `?ofertas=` trae los borradores que el asistente ya creó y `?paso=` el
 * paso a la vista. Tipos de `params`/`searchParams` explícitos: la ruta es
 * nueva en esta fase.
 */
export default async function PaginaNuevaOfertaAsistida({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requerirPermiso("ofertas.gestionar")
  await requerirPermiso("ofertas.ver")
  const usuario = await requerirPermiso("campanas.ver")
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
            asistido
          />
        </Suspense>
      </LimiteErrorAsistente>
    </ContenedorPagina>
  )
}
