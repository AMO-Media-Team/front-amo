"use client"

import { useMemo, useSyncExternalStore } from "react"

/** Cada cuánto avanza el reloj compartido por las cuentas regresivas. */
export const PASO_RELOJ_MS = 30_000

/**
 * Avisa en cada frontera del paso (no 30 s después de suscribirse: así todas
 * las cuentas de la página cambian a la vez) y al volver a la pestaña, porque
 * el navegador frena los temporizadores de las pestañas ocultas.
 */
function suscribirReloj(avisar: () => void): () => void {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const programar = () => {
    const restante = PASO_RELOJ_MS - (Date.now() % PASO_RELOJ_MS)
    temporizador = setTimeout(() => {
      avisar()
      programar()
    }, restante + 20)
  }
  const alCambiarVisibilidad = () => {
    if (document.visibilityState === "visible") avisar()
  }
  programar()
  document.addEventListener("visibilitychange", alCambiarVisibilidad)
  return () => {
    clearTimeout(temporizador)
    document.removeEventListener("visibilitychange", alCambiarVisibilidad)
  }
}

/** Instante redondeado al paso del reloj: estable entre lecturas del mismo tramo. */
function instanteActual(): number {
  return Math.floor(Date.now() / PASO_RELOJ_MS) * PASO_RELOJ_MS
}

/**
 * Reloj que avanza cada 30 s. En la hidratación usa la hora del servidor
 * (`Date.now()` al pintar, sin desajustes) y luego la del dispositivo.
 * Sin hora del servidor devuelve `null` hasta hidratar: quien lo usa pinta
 * un marcador neutro en lugar de una hora que no coincidiría.
 */
export function useAhora(servidor: number): Date
export function useAhora(servidor?: number): Date | null
export function useAhora(servidor?: number): Date | null {
  const instante = useSyncExternalStore(
    suscribirReloj,
    instanteActual,
    () => servidor ?? null
  )
  return useMemo(
    () => (instante === null ? null : new Date(instante)),
    [instante]
  )
}
