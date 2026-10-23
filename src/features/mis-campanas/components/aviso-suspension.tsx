import { CircleOff } from "lucide-react"

import { AvisoFicha } from "@/features/operacion/components/ficha"

export const TITULO_SUSPENSION = "Tu medio está suspendido"

/** D73: el medio suspendido conserva lo que tiene en curso mientras el equipo decide. */
export const TEXTO_SUSPENSION_EN_CURSO =
  "El equipo AMO revisa tus campañas en curso; mientras no te avisemos que se cancelan, puedes seguir cumpliéndolas."

const TEXTO_SUSPENSION_SIN_CURSO =
  "Mientras siga suspendido no verás ofertas nuevas ni podrás aceptarlas. Las campañas que ya terminaste siguen su curso."

/**
 * Aviso de suspensión en el tablero de «Mis campañas» y en cada ficha en
 * curso: qué pasa con lo que ya aceptó (lo sigue cumpliendo hasta que el
 * equipo AMO le avise que se cancela).
 */
export function AvisoSuspensionMedio({
  enCurso = true,
}: {
  /** Tiene campañas en curso (si no, solo se dice qué implica la suspensión). */
  enCurso?: boolean
}) {
  return (
    <AvisoFicha tono="aviso" icono={CircleOff} titulo={TITULO_SUSPENSION}>
      {enCurso ? TEXTO_SUSPENSION_EN_CURSO : TEXTO_SUSPENSION_SIN_CURSO}
    </AvisoFicha>
  )
}
