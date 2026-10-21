import "server-only"

import { estadoTablaUsuarios } from "../estado-tabla"
import { listarUsuarios, resumenUsuarios, rolesVisibles } from "../queries"
import { MetricasUsuarios } from "./metricas-usuarios"
import { TablaUsuarios } from "./tabla-usuarios"

/**
 * Secciones del listado que consultan (Server Components). Cada una va dentro
 * de su `<Suspense>` en la página: el encabezado se pinta de inmediato y los
 * datos llegan en streaming, sin bloquearse entre sí.
 */

export async function SeccionMetricasUsuarios() {
  return <MetricasUsuarios resumen={await resumenUsuarios()} />
}

export async function SeccionTablaUsuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Mismos parsers que la tabla del cliente: la URL es la fuente de verdad.
  const estado = await estadoTablaUsuarios.cargar(searchParams)
  const [pagina, roles] = await Promise.all([
    listarUsuarios(estado),
    rolesVisibles(),
  ])
  return (
    <TablaUsuarios filas={pagina.filas} total={pagina.total} roles={roles} />
  )
}
