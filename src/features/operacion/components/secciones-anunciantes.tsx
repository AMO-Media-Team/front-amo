import "server-only"

import { estadoTablaAnunciantes } from "../estado-tablas"
import {
  listarAnunciantes,
  paisesDeAnunciantes,
  type PermisosAnunciantes,
  resumenAnunciantes,
} from "../queries/anunciantes"
import { catalogos } from "../queries/comun"
import { MetricasAnunciantes } from "./metricas-anunciantes"
import { TablaAnunciantes } from "./tabla-anunciantes"

/**
 * Secciones del listado de anunciantes que consultan (Server Components),
 * cada una en su `<Suspense>` para llegar en streaming sin bloquearse.
 */

export async function SeccionMetricasAnunciantes() {
  return <MetricasAnunciantes resumen={await resumenAnunciantes()} />
}

export async function SeccionTablaAnunciantes({
  searchParams,
  permisos,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  permisos: PermisosAnunciantes
}) {
  const estado = await estadoTablaAnunciantes.cargar(searchParams)
  const [pagina, { sectores }, paises] = await Promise.all([
    listarAnunciantes(estado, permisos),
    catalogos(),
    paisesDeAnunciantes(),
  ])
  return (
    <TablaAnunciantes
      filas={pagina.filas}
      total={pagina.total}
      sectores={[...sectores].map(([id, nombre]) => ({ id, nombre }))}
      paises={paises}
      conCartera={permisos.verCartera}
    />
  )
}
