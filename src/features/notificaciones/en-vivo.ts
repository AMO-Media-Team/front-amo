/**
 * Aviso en vivo (NOT-007): constantes, textos y el estado «canal conectado»
 * que comparten la campana y las demás vistas del conteo. Lo escribe
 * `useCanalNotificaciones` (tiempo-real.ts) y lo lee `useConteoNoLeidas`
 * (fuente.ts) para espaciar el sondeo de respaldo: todas las vistas sondean
 * al mismo ritmo (React Query lleva un temporizador por vista).
 */
import { useSyncExternalStore } from "react"

import type { AvisoEnVivo } from "./esquemas"
import { etiquetaCategoria } from "./presentacion"

/** Evento del broadcast privado `usuario:{id}` (`private.fn_notificacion_realtime`). */
export const EVENTO_NOTIFICACION = "notificacion"
/** Solo los urgentes se anuncian a los lectores de pantalla. */
export const PRIORIDAD_URGENTE = 2

/** Sondeo de respaldo sin canal (error, tiempo agotado o cierre). */
export const INTERVALO_SONDEO_MS = 60_000
/** Con el canal conectado el sondeo solo cubre lo que se pierda. */
export const INTERVALO_SONDEO_EN_VIVO_MS = 300_000
/** Una ráfaga de avisos refresca la lista una sola vez. */
export const ESPERA_INVALIDACION_MS = 1_000
/** Esperas antes de volver a abrir un canal que cerró el servidor. */
export const ESPERAS_RECONEXION_MS = [1_000, 5_000, 15_000, 30_000, 60_000]

export function topicoUsuario(usuarioId: string): string {
  return `usuario:${usuarioId}`
}

export function intervaloSondeo(enVivo: boolean): number {
  return enVivo ? INTERVALO_SONDEO_EN_VIVO_MS : INTERVALO_SONDEO_MS
}

export function esperaReconexion(intento: number): number {
  const indice = Math.min(
    Math.max(intento, 0),
    ESPERAS_RECONEXION_MS.length - 1
  )
  return ESPERAS_RECONEXION_MS[indice]
}

function resumenNoLeidas(total: number): string {
  return total === 1 ? "Tienes 1 sin leer." : `Tienes ${total} sin leer.`
}

/**
 * Texto para la región viva: solo para prioridad 2. El aviso en vivo no trae
 * el título (el contenido se lee después con la sesión, bajo RLS), así que se
 * nombra la categoría; el conteo hace que dos avisos seguidos no repitan el
 * mismo texto (un lector de pantalla no volvería a anunciarlo).
 */
export function textoAnuncio(aviso: AvisoEnVivo): string | null {
  if (aviso.prioridad < PRIORIDAD_URGENTE) return null
  return `Nuevo aviso urgente: ${etiquetaCategoria(aviso.tipo)}. ${resumenNoLeidas(aviso.no_leidas)}`
}

// ── Estado compartido «canal conectado» ──────────────────────────────────────

let enVivo = false
const oyentes = new Set<() => void>()

export function fijarEnVivo(valor: boolean): void {
  if (valor === enVivo) return
  enVivo = valor
  for (const avisar of oyentes) avisar()
}

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar)
  return () => oyentes.delete(avisar)
}

/** `true` mientras el canal del usuario está suscrito (en el servidor, `false`). */
export function useEnVivo(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => enVivo,
    () => false
  )
}
