import "server-only"

import { serializarFecha } from "@/lib/fechas"

import { estadoTablaMisCampanas } from "../estado-tabla"
import { listarMisCampanas, resumenMisCampanas } from "../queries"
import { ResumenCampanas } from "./resumen-mis-campanas"
import { TablaMisCampanas } from "./tabla-mis-campanas"

/**
 * Secciones que consultan (Server Components), cada una en su `<Suspense>`
 * para llegar en streaming sin bloquear la página.
 */

/** Cifras de la empresa; sin campañas no hay nada que resumir (habla el vacío de la tabla). */
export async function SeccionResumenCampanas({
  anuncianteId,
}: {
  anuncianteId: string
}) {
  const resumen = await resumenMisCampanas(anuncianteId)
  return resumen.total > 0 ? <ResumenCampanas resumen={resumen} /> : null
}

export async function SeccionTablaCampanas({
  anuncianteId,
  searchParams,
  puedeCrear,
}: {
  anuncianteId: string
  searchParams: Promise<Record<string, string | string[] | undefined>>
  puedeCrear: boolean
}) {
  const estado = await estadoTablaMisCampanas.cargar(searchParams)
  const pagina = await listarMisCampanas(anuncianteId, estado)
  return (
    <TablaMisCampanas
      filas={pagina.filas}
      total={pagina.total}
      hoy={serializarFecha(new Date())}
      puedeCrear={puedeCrear}
    />
  )
}
