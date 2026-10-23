import "server-only"

import type { EstadoCampana } from "@/features/operacion/estados"

import { seguimientoDeCampana } from "../queries"
import { PanelSeguimiento } from "./panel-seguimiento"

/**
 * Pestaña «Seguimiento» de la ficha de campaña (Server Component, en su
 * `<Suspense>`): consulta con la sesión y entrega los datos al panel, que se
 * actualiza solo desde el navegador. La página ya autorizó con el DAL.
 */
export async function SeccionSeguimiento({
  campanaId,
  estadoCampana,
}: {
  campanaId: string
  estadoCampana: EstadoCampana
}) {
  const inicial = await seguimientoDeCampana(campanaId)
  return <PanelSeguimiento inicial={inicial} estadoCampana={estadoCampana} />
}
