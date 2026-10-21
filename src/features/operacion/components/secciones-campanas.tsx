import "server-only"

import { serializarFecha } from "@/lib/fechas"

import { estadoTablaCampanas } from "../estado-tablas"
import { opcionesAnunciantes } from "../queries/anunciantes"
import { listarCampanas, resumenCampanas } from "../queries/campanas"
import { MetricasCampanas } from "./metricas-campanas"
import { TablaCampanas } from "./tabla-campanas"

/**
 * Secciones del listado de campañas que consultan (Server Components), cada
 * una en su `<Suspense>` para llegar en streaming sin bloquearse.
 */

export async function SeccionMetricasCampanas() {
  return <MetricasCampanas resumen={await resumenCampanas()} />
}

export async function SeccionTablaCampanas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const estado = await estadoTablaCampanas.cargar(searchParams)
  const [pagina, anunciantes] = await Promise.all([
    listarCampanas(estado),
    opcionesAnunciantes(),
  ])
  return (
    <TablaCampanas
      filas={pagina.filas}
      total={pagina.total}
      anunciantes={anunciantes}
      hoy={serializarFecha(new Date())}
    />
  )
}
