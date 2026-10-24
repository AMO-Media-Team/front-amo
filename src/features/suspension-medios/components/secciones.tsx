import "server-only"

import {
  alertasDelMedio,
  asignacionesEnCursoDelMedio,
  disputasDelMedio,
  LIMITE_DISPUTAS,
} from "../queries"
import { AlertasMedio } from "./alertas-medio"
import { DisputasMedio } from "./disputas-medio"
import { EnCursoSuspendido } from "./en-curso-suspendido"

/**
 * Secciones de la ficha del medio que consultan (Server Components). Cada una
 * va en su `<Diferida>`: llega en streaming y un fallo queda aislado.
 */

/** Pestaña «Disputas» (con `disputas.ver`). */
export async function SeccionDisputasMedio({
  medioId,
  verAsignaciones,
}: {
  medioId: string
  verAsignaciones: boolean
}) {
  const { disputas, cerradasTruncadas } = await disputasDelMedio(medioId)
  return (
    <DisputasMedio
      disputas={disputas}
      verAsignaciones={verAsignaciones}
      cerradasMostradas={cerradasTruncadas ? LIMITE_DISPUTAS : null}
    />
  )
}

/** Pestaña «Alertas» (con `asignaciones.ver`, que exige `alertas_metricas`). */
export async function SeccionAlertasMedio({ medioId }: { medioId: string }) {
  const { alertas, total } = await alertasDelMedio(medioId)
  return <AlertasMedio alertas={alertas} total={total} />
}

/** Medio SUSPENDIDO: lo que conserva en curso, para decidir si se cancela. */
export async function SeccionEnCursoSuspendido({
  medioId,
  verDisputas,
}: {
  medioId: string
  verDisputas: boolean
}) {
  return (
    <EnCursoSuspendido
      asignaciones={await asignacionesEnCursoDelMedio(medioId)}
      verDisputas={verDisputas}
    />
  )
}
