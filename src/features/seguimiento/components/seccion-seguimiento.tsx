import "server-only"

import type { EstadoCampana } from "@/features/operacion/estados"
import { requerirUsuario, tieneAlgunPermiso } from "@/lib/auth/dal"

import { seguimientoDeCampana } from "../queries"
import { PanelSeguimiento } from "./panel-seguimiento"

/**
 * Pestaña «Seguimiento» de la ficha de campaña (Server Component, en su
 * `<Suspense>`): consulta con la sesión y entrega los datos al panel, que se
 * actualiza solo desde el navegador. La página ya autorizó con el DAL; aquí
 * solo se pregunta si la persona puede disputar (para ofrecer el enlace: su
 * página lo vuelve a exigir).
 */
export async function SeccionSeguimiento({
  campanaId,
  estadoCampana,
}: {
  campanaId: string
  estadoCampana: EstadoCampana
}) {
  const [usuario, inicial] = await Promise.all([
    requerirUsuario(),
    seguimientoDeCampana(campanaId),
  ])
  return (
    <PanelSeguimiento
      inicial={inicial}
      estadoCampana={estadoCampana}
      puedeDisputar={tieneAlgunPermiso(usuario, ["disputas.abrir"])}
    />
  )
}
