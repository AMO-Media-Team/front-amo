/**
 * Regla 5 — Métricas atípicas pendientes de validar (alertas de desviación
 * frente al histórico o de alcance mayor al múltiplo de seguidores). Es
 * `critico` si la más antigua espera más de 48 horas.
 */
import { formatearNumero, formatearRelativo } from "@/lib/format"

import { construirHref, RUTAS_INSIGHTS } from "../rutas"
import { capitalizar, enumerar } from "../textos"
import type { EntradaInsights, Insight } from "../tipos"

export const HORAS_CRITICO = 48
const MS_HORA = 3_600_000
/** Con 10 o más pendientes la relevancia se satura. */
const PENDIENTES_SATURACION = 10

function horasDesde(fecha: Date | string | null, ahora: Date): number | null {
  if (fecha === null) return null
  const instante = new Date(fecha).getTime()
  return Number.isNaN(instante) ? null : (ahora.getTime() - instante) / MS_HORA
}

export function reglaMetricasAtipicas(
  entrada: EntradaInsights
): Insight | null {
  const atipicas = entrada.metricasAtipicas
  if (!atipicas || atipicas.total < 1) return null

  const horas = horasDesde(atipicas.masAntiguaAt, entrada.ahora)
  const uno = atipicas.total === 1
  const motivos = [
    atipicas.desviacion > 0
      ? `${formatearNumero(atipicas.desviacion)} ${atipicas.desviacion === 1 ? "se desvía" : "se desvían"} del histórico del medio`
      : "",
    atipicas.multiplo > 0
      ? `${formatearNumero(atipicas.multiplo)} ${atipicas.multiplo === 1 ? "supera" : "superan"} el alcance esperado para sus seguidores`
      : "",
  ].filter(Boolean)
  const antiguedad =
    horas === null || atipicas.masAntiguaAt === null
      ? ""
      : ` La más antigua llegó ${formatearRelativo(atipicas.masAntiguaAt, entrada.ahora)}.`

  return {
    id: "metricas-atipicas",
    regla: 5,
    severidad: horas !== null && horas > HORAS_CRITICO ? "critico" : "atencion",
    titulo: uno
      ? "1 reporte de métricas atípico espera validación"
      : `${formatearNumero(atipicas.total)} reportes de métricas atípicos esperan validación`,
    detalle: `${motivos.length ? `${capitalizar(enumerar(motivos))}.` : "Tienen alertas de integridad."}${antiguedad}`,
    metrica: "metricas_pendientes",
    valor: atipicas.total,
    magnitud: Math.min(1, atipicas.total / PENDIENTES_SATURACION),
    accion: {
      etiqueta: "Revisar la cola de validación",
      href: construirHref(RUTAS_INSIGHTS.asignaciones, { alerta: "metricas" }),
    },
  }
}
