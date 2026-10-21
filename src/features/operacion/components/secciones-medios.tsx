import "server-only"

import { estadoTablaMedios } from "../estado-tablas"
import { catalogos } from "../queries/comun"
import { listarMedios, resumenMedios } from "../queries/medios"
import { MetricasMedios } from "./metricas-medios"
import { TablaMedios } from "./tabla-medios"

/**
 * Secciones del listado de medios que consultan (Server Components). Cada una
 * va en su `<Suspense>`: el encabezado se pinta de inmediato y los datos
 * llegan en streaming sin bloquearse entre sí.
 */

export async function SeccionMetricasMedios() {
  return <MetricasMedios resumen={await resumenMedios()} />
}

export async function SeccionTablaMedios({
  searchParams,
  verAsignaciones,
  verSegmentoRiesgo,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
  verAsignaciones: boolean
  verSegmentoRiesgo: boolean
}) {
  // Mismos parsers que la tabla del cliente: la URL es la fuente de verdad.
  const estado = await estadoTablaMedios.cargar(searchParams)
  const [pagina, { categorias }] = await Promise.all([
    listarMedios(estado, { verAsignaciones }),
    catalogos(),
  ])
  return (
    <TablaMedios
      filas={pagina.filas}
      total={pagina.total}
      categorias={[...categorias].map(([id, nombre]) => ({ id, nombre }))}
      conGmv={verAsignaciones}
      conSegmentoRiesgo={verSegmentoRiesgo}
    />
  )
}
