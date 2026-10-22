/**
 * Navegación de un asistente por pasos (lógica pura, sin React).
 *
 * - `actual`: índice del paso a la vista.
 * - `alcanzado`: el paso más lejano al que se puede ir sin volver a validar
 *   (los anteriores ya se validaron, o venían completos de un borrador).
 *
 * Retroceder siempre se puede; avanzar exige validar el paso actual y nunca
 * salta más allá de `alcanzado`.
 */

export interface EstadoNavegacion {
  readonly actual: number
  readonly alcanzado: number
}

export interface InfoPaso {
  /** El paso ya tiene todo lo obligatorio (p. ej. al reabrir un borrador). */
  readonly completo?: boolean
}

/**
 * - `actual`: el que se ve.
 * - `completado`: ya validado y sin cambios pendientes.
 * - `disponible`: se puede abrir, pero aún no se ha validado.
 * - `bloqueado`: falta completar un paso anterior.
 */
export type EstadoPaso = "actual" | "completado" | "disponible" | "bloqueado"

/** Primer paso sin completar (los anteriores lo están); con todo completo, el último. */
export function alcanceInicial(pasos: readonly InfoPaso[]): number {
  const pendiente = pasos.findIndex((paso) => !paso.completo)
  return pendiente === -1 ? Math.max(0, pasos.length - 1) : pendiente
}

/** Índice del paso con ese id, o -1 si no existe (o no se pidió ninguno). */
export function indiceDe(
  ids: readonly string[],
  id: string | null | undefined
): number {
  return id ? ids.indexOf(id) : -1
}

/**
 * Paso que se muestra para el pedido en la URL (recarga, enlace o borrador):
 * nunca uno aún bloqueado; sin pedido (o desconocido), el primero.
 */
export function pasoVisible(pedido: number, alcanzado: number): number {
  return pedido < 0 ? 0 : Math.min(pedido, alcanzado)
}

export function puedeIrA(
  estado: EstadoNavegacion,
  destino: number,
  total: number
): boolean {
  return (
    Number.isInteger(destino) &&
    destino >= 0 &&
    destino < total &&
    destino <= estado.alcanzado
  )
}

/** Ir hacia adelante pasa por la validación del paso actual; hacia atrás, no. */
export function exigeValidacion(
  estado: EstadoNavegacion,
  destino: number
): boolean {
  return destino > estado.actual
}

/** Paso siguiente (tras validar el actual): amplía lo alcanzado. */
export function avanzar(
  estado: EstadoNavegacion,
  total: number
): EstadoNavegacion {
  const siguiente = Math.min(estado.actual + 1, Math.max(0, total - 1))
  return {
    actual: siguiente,
    alcanzado: Math.max(estado.alcanzado, siguiente),
  }
}

export function retroceder(estado: EstadoNavegacion): EstadoNavegacion {
  return { ...estado, actual: Math.max(0, estado.actual - 1) }
}

/** Salto directo (indicador o «Editar» en la revisión); si no se puede, no cambia. */
export function saltarA(
  estado: EstadoNavegacion,
  destino: number,
  total: number
): EstadoNavegacion {
  return puedeIrA(estado, destino, total)
    ? { ...estado, actual: destino }
    : estado
}

export function estadoPaso(
  indice: number,
  estado: EstadoNavegacion,
  info: InfoPaso = {}
): EstadoPaso {
  if (indice === estado.actual) return "actual"
  if (indice < estado.alcanzado && info.completo !== false) return "completado"
  if (indice <= estado.alcanzado) return "disponible"
  return "bloqueado"
}

/** Fracción del recorrido (0–1] para la barra de progreso, contando el paso actual. */
export function fraccionProgreso(actual: number, total: number): number {
  if (total <= 1) return 1
  return Math.min(1, Math.max(0, (actual + 1) / total))
}

export function textoPaso(indice: number, total: number): string {
  return `Paso ${indice + 1} de ${total}`
}
