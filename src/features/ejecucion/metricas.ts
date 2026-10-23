/**
 * Métricas por corte (MED-014; módulo puro): qué puede hacer el medio con un
 * corte según la evidencia, el estado de la asignación y la revisión de AMO
 * (las reglas de `private.puedo_cargar_metricas` y de la política UPDATE), y
 * el intervalo de un corte personalizado tal como lo exige
 * `fn_metricas_coherencia` (desde el día de la publicación hasta, como mucho,
 * el momento de la captura).
 */
import { parsearFecha, serializarFecha } from "@/lib/fechas"

import { cortePermitido, disponibleDesde, esCorteFijo } from "./cortes"
import type {
  AsignacionEjecucion,
  Corte,
  CorteComparable,
  EstadoAsignacion,
  MetricaEjecucion,
  PublicacionEjecucion,
} from "./tipos"
import { cifrasDe } from "./coherencia"

const DIA_MS = 86_400_000

/** Estados en que el medio carga o corrige métricas (`puedo_cargar_metricas`). */
export const ESTADOS_CON_METRICAS: ReadonlySet<EstadoAsignacion> = new Set([
  "PUBLICADA",
  "EVIDENCIA_VALIDADA",
  "METRICAS_CARGADAS",
])

export type SituacionMetricas =
  /** La oferta no pide ese corte. */
  | { tipo: "corte-no-pedido" }
  /** Esa publicación aún no tiene evidencia. */
  | { tipo: "sin-evidencia" }
  /** AMO rechazó la evidencia: primero se corrige. */
  | { tipo: "evidencia-rechazada" }
  /** Falta la evidencia válida de otra publicación de la oferta. */
  | { tipo: "faltan-evidencias" }
  /** El corte aún no se cumple desde la publicación. */
  | { tipo: "bloqueada"; desde: string }
  | { tipo: "cargar" }
  | { tipo: "corregir"; observaciones: string | null }
  /** Enviada y por revisar: se puede corregir. */
  | { tipo: "en-revision" }
  /** Aprobada: solo el equipo AMO la corrige. */
  | { tipo: "aprobada" }
  /** La asignación ya no admite métricas (verificada, cancelada…). */
  | { tipo: "cerrada" }

export function situacionMetricas(
  asignacion: Pick<AsignacionEjecucion, "estado" | "cortesRequeridos">,
  publicacion: Pick<PublicacionEjecucion, "estado" | "fechaPublicacion"> | null,
  corte: Corte,
  metrica: Pick<MetricaEjecucion, "estado" | "observaciones"> | null,
  ahora: Date
): SituacionMetricas {
  if (!cortePermitido(corte, asignacion.cortesRequeridos)) {
    return { tipo: "corte-no-pedido" }
  }
  if (!publicacion) return { tipo: "sin-evidencia" }
  if (metrica?.estado === "APROBADA") return { tipo: "aprobada" }
  const evidenciaAbierta =
    asignacion.estado === "CONTENIDO_ENTREGADO" ||
    asignacion.estado === "PUBLICADA"
  if (publicacion.estado === "RECHAZADA") {
    return evidenciaAbierta
      ? { tipo: "evidencia-rechazada" }
      : { tipo: "cerrada" }
  }
  // Otra publicación de la oferta aún no tiene evidencia válida.
  if (asignacion.estado === "CONTENIDO_ENTREGADO") {
    return { tipo: "faltan-evidencias" }
  }
  if (!ESTADOS_CON_METRICAS.has(asignacion.estado)) return { tipo: "cerrada" }
  if (metrica?.estado === "RECHAZADA") {
    return { tipo: "corregir", observaciones: metrica.observaciones }
  }
  if (metrica?.estado === "PENDIENTE") return { tipo: "en-revision" }
  const desde = disponibleDesde(publicacion.fechaPublicacion, corte)
  if (desde && desde.getTime() > ahora.getTime()) {
    return { tipo: "bloqueada", desde: desde.toISOString() }
  }
  return { tipo: "cargar" }
}

/** ¿La situación deja guardar el corte? */
export function admiteGuardar(situacion: SituacionMetricas): boolean {
  return (
    situacion.tipo === "cargar" ||
    situacion.tipo === "corregir" ||
    situacion.tipo === "en-revision"
  )
}

/**
 * El corte que se edita: el fijo de la publicación o, en el personalizado, el
 * que se pidió por id. Un personalizado sin id es uno nuevo.
 */
export function metricaDelCorte(
  metricas: readonly MetricaEjecucion[],
  corte: Corte,
  metricaId: string | null
): MetricaEjecucion | null {
  if (esCorteFijo(corte)) {
    return metricas.find((metrica) => metrica.corte === corte) ?? null
  }
  if (!metricaId) return null
  return (
    metricas.find(
      (metrica) => metrica.id === metricaId && metrica.corte === "PERSONALIZADO"
    ) ?? null
  )
}

/** Los otros cortes, con las cifras con que la BD los compara. */
export function cortesComparables(
  otros: readonly MetricaEjecucion[]
): CorteComparable[] {
  return otros.map((metrica) => ({
    id: metrica.id,
    corte: metrica.corte,
    estado: metrica.estado,
    ...cifrasDe(metrica.valores),
  }))
}

export interface PeriodoPersonalizado {
  /** 00:00 de Bogotá del primer día. */
  desde: string
  /** Fin del último día o el momento de la captura, lo que llegue antes. */
  hasta: string
}

/**
 * Intervalo de un corte personalizado a partir de los días elegidos
 * (`YYYY-MM-DD` en Bogotá) y el momento de la captura; `null` si algún día no
 * es válido. Determinista: un reintento produce el mismo intervalo
 * (`metricas_personalizado_key` lo hace idempotente).
 */
export function periodoPersonalizado(
  desde: string,
  hasta: string,
  fechaCorte: string
): PeriodoPersonalizado | null {
  const inicio = parsearFecha(desde)
  const ultimo = parsearFecha(hasta)
  const captura = new Date(fechaCorte).getTime()
  if (!inicio || !ultimo || !Number.isFinite(captura)) return null
  // Colombia no cambia de hora: el día siguiente empieza 24 h después.
  const fin = Math.min(ultimo.getTime() + DIA_MS, captura)
  return {
    desde: inicio.toISOString(),
    hasta: new Date(fin).toISOString(),
  }
}

/**
 * Días que eligió el medio para un periodo guardado: el fin es exclusivo (el
 * inicio del día siguiente o el momento de la captura).
 */
export function diasDelPeriodo(
  desde: string,
  hasta: string
): { desde: string; hasta: string } {
  return {
    desde: diaDe(desde),
    hasta: diaDe(new Date(new Date(hasta).getTime() - 1).toISOString()),
  }
}

/** Día de Bogotá de un instante (`YYYY-MM-DD`). */
export function diaDe(iso: string): string {
  return serializarFecha(new Date(iso))
}
