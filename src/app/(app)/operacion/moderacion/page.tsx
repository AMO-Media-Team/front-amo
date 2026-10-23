import type { Metadata } from "next"
import { Suspense } from "react"

import { LimiteErrorTabla } from "@/components/data-table/limite-error-tabla"
import { ContenedorPagina } from "@/components/layout/contenedor-pagina"
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina"
import { cargarParametrosModeracion } from "@/features/moderacion/cola"
import { ColaModeracion } from "@/features/moderacion/components/cola-moderacion"
import { EsqueletoCola } from "@/features/verificacion/components/esqueletos"
import { requerirPermiso } from "@/lib/auth/dal"

export const metadata: Metadata = { title: "Moderación" }

/**
 * Cola de moderación de ofertas (ADM-005): las ofertas en revisión, la
 * enviada hace más tiempo primero, con anunciante, campaña, formato,
 * presupuesto y la fecha límite de aceptación. La página va en la URL
 * (`?pagina=`); cada oferta se decide en su ficha interna.
 */
export default async function PaginaModeracion({
  searchParams,
}: PageProps<"/operacion/moderacion">) {
  await requerirPermiso("ofertas.moderar")
  const { pagina } = await cargarParametrosModeracion(searchParams)

  return (
    <ContenedorPagina>
      <EncabezadoPagina
        titulo="Moderación"
        descripcion="Ofertas que los anunciantes enviaron a revisión. Revisa cada una y publícala, devuélvela con comentarios o recházala."
      />
      <LimiteErrorTabla recurso="la cola de moderación">
        <Suspense
          key={pagina}
          fallback={
            <EsqueletoCola etiqueta="Cargando la cola de moderación…" />
          }
        >
          <ColaModeracion pagina={pagina} />
        </Suspense>
      </LimiteErrorTabla>
    </ContenedorPagina>
  )
}
