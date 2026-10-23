/**
 * Los cortes de métricas de una publicación (módulo puro): cuándo se habilita
 * cada uno (publicación + 24 h, 72 h o 7 días, como `fn_metricas_coherencia`),
 * hasta cuándo se espera la carga (`metricas.plazo_carga_horas`, como
 * `proximas_acciones_medio`) y cómo se nombran en voz del medio.
 */
import type { Corte, CorteFijo } from "./tipos"

const HORA_MS = 3_600_000

/** Horas desde la publicación hasta que se puede cargar cada corte. */
export const HORAS_CORTE: Readonly<Record<CorteFijo, number>> = {
  H24: 24,
  H72: 72,
  D7: 7 * 24,
}

/** Orden en que ocurren (el de `fn_metricas_coherencia`). */
export const ORDEN_CORTE: Readonly<Record<CorteFijo, number>> = {
  H24: 1,
  H72: 2,
  D7: 3,
}

/** `metricas.plazo_carga_horas` sembrado: lo que rige si no se puede leer. */
export const PLAZO_CARGA_HORAS_POR_DEFECTO = 48

export const NOMBRES_CORTE: Readonly<
  Record<Corte, { largo: string; corto: string }>
> = {
  H24: { largo: "24 horas", corto: "24 h" },
  H72: { largo: "72 horas", corto: "72 h" },
  D7: { largo: "7 días", corto: "7 d" },
  PERSONALIZADO: { largo: "un periodo personalizado", corto: "Personalizado" },
}

/** «Métricas de 24 horas», «Métricas de un periodo personalizado». */
export function tituloCorte(corte: Corte): string {
  return `Métricas de ${NOMBRES_CORTE[corte].largo}`
}

export function esCorteFijo(corte: Corte): corte is CorteFijo {
  return corte !== "PERSONALIZADO"
}

/** La oferta pide ese corte (el personalizado siempre se puede cargar, MED-014). */
export function cortePermitido(
  corte: Corte,
  requeridos: readonly Corte[]
): boolean {
  return corte === "PERSONALIZADO" || requeridos.includes(corte)
}

/** Cortes fijos que pide la oferta, en el orden en que ocurren. */
export function cortesDeLaOferta(requeridos: readonly Corte[]): CorteFijo[] {
  return requeridos
    .filter(esCorteFijo)
    .filter((corte, indice, todos) => todos.indexOf(corte) === indice)
    .sort((a, b) => ORDEN_CORTE[a] - ORDEN_CORTE[b])
}

function sumarHoras(iso: string, horas: number): Date | null {
  const base = new Date(iso).getTime()
  return Number.isFinite(base) ? new Date(base + horas * HORA_MS) : null
}

/**
 * Desde cuándo se puede cargar el corte: la publicación más su tiempo. El
 * personalizado no espera (`null`).
 */
export function disponibleDesde(
  fechaPublicacion: string,
  corte: Corte
): Date | null {
  return esCorteFijo(corte)
    ? sumarHoras(fechaPublicacion, HORAS_CORTE[corte])
    : null
}

/** Hasta cuándo se espera la carga del corte; después llega el aviso de atraso. */
export function venceCarga(
  fechaPublicacion: string,
  corte: Corte,
  plazoCargaHoras: number
): Date | null {
  return esCorteFijo(corte)
    ? sumarHoras(fechaPublicacion, HORAS_CORTE[corte] + plazoCargaHoras)
    : null
}

/** ¿Ya se cumplió el tiempo del corte? */
export function corteDisponible(
  fechaPublicacion: string,
  corte: Corte,
  ahora: Date
): boolean {
  const desde = disponibleDesde(fechaPublicacion, corte)
  return desde === null || desde.getTime() <= ahora.getTime()
}
