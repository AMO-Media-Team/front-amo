import { InsigniaTono } from "@/features/operacion/components/distintivos"

import {
  ESTADOS_INTERNO,
  ESTADOS_TITULAR,
  esSemaforo,
  PRESENTACION_SEMAFORO,
  situacionPlazo,
} from "../presentacion"
import type { EstadoSolicitud, SolicitudBase } from "../tipos"

export type Perspectiva = "titular" | "interno"

/** Estado de la solicitud con la etiqueta de quien mira («Te pedimos información» / «Esperando al titular»). */
export function InsigniaEstadoSolicitud({
  estado,
  perspectiva,
  className,
}: {
  estado: EstadoSolicitud
  perspectiva: Perspectiva
  className?: string
}) {
  const { etiqueta, tono, descripcion } = (
    perspectiva === "titular" ? ESTADOS_TITULAR : ESTADOS_INTERNO
  )[estado]
  return (
    <InsigniaTono
      tono={tono}
      etiqueta={etiqueta}
      titulo={descripcion}
      className={className}
    />
  )
}

/**
 * Semáforo del plazo legal («Vencida», «Vence hoy», «Por vencer», «En
 * plazo»). Nada si el plazo no corre (esperando al titular o cerrada).
 * `hoy` es el día de Bogotá que calculó el servidor ('YYYY-MM-DD').
 */
export function InsigniaPlazo({
  solicitud,
  hoy,
  className,
}: {
  solicitud: Pick<SolicitudBase, "estado" | "plazoVence" | "alertaDesde">
  hoy: string
  className?: string
}) {
  const situacion = situacionPlazo(solicitud, hoy)
  if (!esSemaforo(situacion)) return null
  const { etiqueta, tono, descripcion } = PRESENTACION_SEMAFORO[situacion]
  return (
    <InsigniaTono
      tono={tono}
      etiqueta={etiqueta}
      titulo={descripcion}
      className={className}
    />
  )
}
