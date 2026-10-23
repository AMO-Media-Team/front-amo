import "server-only"

import { metricasDeCampana } from "../queries"
import type { CampanaMetricas } from "../tipos"
import { PanelMetricas } from "./panel-metricas"

/**
 * Pestaña «Métricas» de la ficha de campaña (Server Component, en su
 * `<Suspense>`): consulta el consolidado con la sesión y lo entrega al panel.
 * La página ya autorizó con el DAL; quien la monta decide si se muestra
 * (`reportes.ver`) y si se exporta (`reportes.exportar`).
 */
export async function SeccionMetricas({
  campana,
  puedeExportar,
}: {
  campana: CampanaMetricas
  puedeExportar: boolean
}) {
  const datos = await metricasDeCampana(campana)
  return <PanelMetricas datos={datos} puedeExportar={puedeExportar} />
}
