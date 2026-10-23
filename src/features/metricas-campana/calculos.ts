/**
 * Cálculos del consolidado de una campaña (módulo puro, docs/kpis.md §0.3–§2):
 * totales como cociente de sumas reconstruidos desde las filas de
 * `desempeno_anunciante`, el rango de verificaciones que se consulta y los
 * resultados parciales de lo que aún no se verifica.
 */
import { razonPonderada } from "@/features/reportes/definiciones/desempeno-campanas"
import { sumar } from "@/features/reportes/indicadores"
import { estaCumplida, quedoSinCompletar } from "@/features/seguimiento/estados"
import { resultadosAsignacion } from "@/features/seguimiento/presentacion"
import type { AsignacionSeguimiento } from "@/features/seguimiento/tipos"
import { serializarFecha } from "@/lib/fechas"

import type {
  CampanaMetricas,
  FilaDesempeno,
  PeriodoVerificacion,
  ResultadosParciales,
  TotalesCampana,
} from "./tipos"

/**
 * Totales desde las filas de un corte que cubre todas las asignaciones (el
 * de plataforma: cada una tiene exactamente una). Cada razón de una fila es
 * Σ bruto ÷ Σ denominador de sus asignaciones con denominador positivo, así
 * que razón × denominador recupera el numerador y el cociente de las sumas es
 * el total exacto (salvo el redondeo de la BD).
 */
export function totalesDesdeFilas(
  filas: readonly FilaDesempeno[]
): TotalesCampana {
  const cpm = razonPonderada(
    filas,
    (f) => f.cpm,
    (f) => f.impresiones
  )
  const costoInteraccion = razonPonderada(
    filas,
    (f) => f.costoInteraccion,
    (f) => f.interacciones
  )
  const engagement = razonPonderada(
    filas,
    (f) => f.engagement,
    (f) => f.alcance
  )
  const costoAlcance = razonPonderada(
    filas,
    (f) => f.costoAlcance,
    (f) => f.alcance
  )
  return {
    verificadas: sumar(filas, (f) => f.asignaciones),
    inversion: sumar(filas, (f) => f.gmv),
    alcance: sumar(filas, (f) => f.alcance),
    impresiones: sumar(filas, (f) => f.impresiones),
    interacciones: sumar(filas, (f) => f.interacciones),
    reproducciones: sumar(filas, (f) => f.reproducciones),
    clics: sumar(filas, (f) => f.clics),
    cpm: cpm.valor,
    costoInteraccion: costoInteraccion.valor,
    engagement: engagement.valor,
    costoAlcance: costoAlcance.valor,
  }
}

/**
 * Del primer al último día (Bogotá) en que se verificó una asignación
 * cumplida de la campaña: el periodo exacto que `desempeno_anunciante` debe
 * recorrer. `null` si ninguna está verificada.
 */
export function periodoVerificacion(
  asignaciones: readonly Pick<
    AsignacionSeguimiento,
    "estado" | "verificadaAt"
  >[]
): PeriodoVerificacion | null {
  const dias = asignaciones
    .filter((a) => estaCumplida(a.estado) && a.verificadaAt)
    .map((a) => new Date(a.verificadaAt as string))
    .filter((fecha) => !Number.isNaN(fecha.getTime()))
    .map(serializarFecha)
    .sort()
  if (dias.length === 0) return null
  return { desde: dias[0], hasta: dias[dias.length - 1] }
}

/**
 * Asignaciones en pie aún sin verificar: las que ya tienen cortes aprobados
 * (con la suma de su último corte por publicación) y las que siguen en
 * ejecución sin ninguno. Las caídas no cuentan: ya no darán resultados.
 */
export function resultadosParciales(
  asignaciones: readonly Pick<
    AsignacionSeguimiento,
    "estado" | "publicaciones"
  >[]
): ResultadosParciales {
  const parciales: ResultadosParciales = {
    conCortes: 0,
    alcance: 0,
    impresiones: 0,
    interacciones: 0,
    enEjecucion: 0,
  }
  for (const asignacion of asignaciones) {
    if (estaCumplida(asignacion.estado) || quedoSinCompletar(asignacion.estado))
      continue
    const resultados = resultadosAsignacion(asignacion.publicaciones)
    if (!resultados) {
      parciales.enEjecucion++
      continue
    }
    parciales.conCortes++
    parciales.alcance += resultados.alcance
    parciales.impresiones += resultados.impresiones
    parciales.interacciones += resultados.interacciones
  }
  return parciales
}

/** ¿Hay algo pendiente de verificar? (el consolidado es parcial). */
export function hayParciales(parciales: ResultadosParciales): boolean {
  return parciales.conCortes > 0 || parciales.enEjecucion > 0
}

/** Lo que la pestaña y los documentos necesitan de la ficha de la campaña. */
export function campanaMetricas(campana: CampanaMetricas): CampanaMetricas {
  return {
    id: campana.id,
    nombre: campana.nombre,
    marca: campana.marca,
    estado: campana.estado,
    fechaInicio: campana.fechaInicio,
    fechaFin: campana.fechaFin,
  }
}
