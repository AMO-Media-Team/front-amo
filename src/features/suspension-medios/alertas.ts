/**
 * Alertas de integridad de las métricas de un medio en su ficha (INT-003,
 * INT-004, ADM-002), módulo puro: qué anotó quien las validó, en qué orden se
 * muestran y cuántas hay por estado. Por qué se marcó cada una lo explica
 * `@/features/operacion/alertas`, la misma fuente que la cola de validación y
 * la ficha de la asignación. Las alertas son una herramienta del equipo AMO:
 * ni el medio ni el anunciante las ven (D67).
 */
import type { EstadoValidacion } from "@/features/operacion/estados"

import type { AlertaDelMedio } from "./tipos"

/** Qué dejó anotado quien la validó, o que aún espera validación. */
export function notaValidacion(
  alerta: Pick<AlertaDelMedio, "estado" | "observaciones">
): { etiqueta: string; texto: string } {
  const observaciones = alerta.observaciones?.trim() || null
  switch (alerta.estado) {
    case "PENDIENTE":
      return {
        etiqueta: "Por validar",
        texto:
          "Espera la validación del equipo AMO: aprobarla exige anotar qué se revisó.",
      }
    case "APROBADA":
      return {
        etiqueta: "Lo que se revisó",
        texto: observaciones ?? "Se aprobó sin anotaciones.",
      }
    case "RECHAZADA":
      return {
        etiqueta: "Motivo del rechazo",
        texto: observaciones ?? "Se rechazó sin anotaciones.",
      }
  }
}

const ORDEN_ESTADO: Readonly<Record<EstadoValidacion, number>> = {
  PENDIENTE: 0,
  RECHAZADA: 1,
  APROBADA: 1,
}

/** Primero las que esperan validación; después, de la más reciente a la más antigua. */
export function ordenarAlertas<
  T extends Pick<AlertaDelMedio, "estado" | "creadaAt" | "metricaId">,
>(alertas: readonly T[]): T[] {
  return [...alertas].sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      b.creadaAt.localeCompare(a.creadaAt) ||
      a.metricaId.localeCompare(b.metricaId)
  )
}

export interface ResumenAlertas {
  total: number
  porValidar: number
  aprobadas: number
  rechazadas: number
}

export function resumirAlertas(
  alertas: readonly Pick<AlertaDelMedio, "estado">[]
): ResumenAlertas {
  const contarEstado = (estado: EstadoValidacion) =>
    alertas.filter((alerta) => alerta.estado === estado).length
  return {
    total: alertas.length,
    porValidar: contarEstado("PENDIENTE"),
    aprobadas: contarEstado("APROBADA"),
    rechazadas: contarEstado("RECHAZADA"),
  }
}
