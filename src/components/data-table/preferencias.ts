"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

/**
 * Preferencias de vista de cada tabla (densidad y columnas visibles) en
 * `localStorage`: son comodidades de cada persona, no estado compartible, por
 * eso no van en la URL. Si el almacenamiento no está disponible (modo privado,
 * bloqueado) se conservan en memoria durante la sesión.
 */

export const DENSIDADES = ["compacta", "normal", "comoda"] as const
export type Densidad = (typeof DENSIDADES)[number]

/** `false` = columna oculta (TanStack trata la ausencia como visible). */
export type VisibilidadColumnas = Record<string, boolean>

export interface PreferenciasTabla {
  densidad: Densidad
  visibilidad: VisibilidadColumnas
}

const PREFIJO = "amo:tabla:"
const EVENTO_CAMBIO = "amo:preferencias-tabla"

function esDensidad(valor: unknown): valor is Densidad {
  return (DENSIDADES as readonly unknown[]).includes(valor)
}

function esVisibilidad(valor: unknown): valor is VisibilidadColumnas {
  return (
    typeof valor === "object" &&
    valor !== null &&
    !Array.isArray(valor) &&
    Object.values(valor).every((visible) => typeof visible === "boolean")
  )
}

/**
 * Combina lo guardado con los valores por defecto. Tolera JSON corrupto o de
 * una versión anterior: lo que no se reconoce se ignora.
 */
export function interpretarPreferencias(
  crudo: string | null,
  porDefecto: PreferenciasTabla
): PreferenciasTabla {
  if (!crudo) return porDefecto
  try {
    const guardado: unknown = JSON.parse(crudo)
    if (typeof guardado !== "object" || guardado === null) return porDefecto
    const { densidad, visibilidad } = guardado as Record<string, unknown>
    return {
      densidad: esDensidad(densidad) ? densidad : porDefecto.densidad,
      visibilidad: esVisibilidad(visibilidad)
        ? { ...porDefecto.visibilidad, ...visibilidad }
        : porDefecto.visibilidad,
    }
  } catch {
    return porDefecto
  }
}

// Espejo en memoria: permite seguir funcionando sin localStorage.
const memoria = new Map<string, string | null>()

function leer(llave: string): string | null {
  if (!memoria.has(llave)) {
    let valor: string | null = null
    try {
      valor = window.localStorage.getItem(llave)
    } catch {
      // Almacenamiento bloqueado: se usan los valores por defecto.
    }
    memoria.set(llave, valor)
  }
  return memoria.get(llave) ?? null
}

function escribir(llave: string, valor: string): void {
  memoria.set(llave, valor)
  try {
    window.localStorage.setItem(llave, valor)
  } catch {
    // Sin almacenamiento persistente: la preferencia dura hasta recargar.
  }
  window.dispatchEvent(new Event(EVENTO_CAMBIO))
}

function suscribir(avisar: () => void): () => void {
  const alCambiarOtraPestana = (evento: StorageEvent) => {
    if (evento.key?.startsWith(PREFIJO)) memoria.delete(evento.key)
    avisar()
  }
  window.addEventListener("storage", alCambiarOtraPestana)
  window.addEventListener(EVENTO_CAMBIO, avisar)
  return () => {
    window.removeEventListener("storage", alCambiarOtraPestana)
    window.removeEventListener(EVENTO_CAMBIO, avisar)
  }
}

/**
 * @param clave identificador estable de la tabla (p. ej. "usuarios").
 * @param porDefecto debe ser estable (constante o `useMemo`).
 */
export function usePreferenciasTabla(
  clave: string,
  porDefecto: PreferenciasTabla
): [PreferenciasTabla, (cambios: Partial<PreferenciasTabla>) => void] {
  const llave = `${PREFIJO}${clave}`
  const crudo = useSyncExternalStore(
    suscribir,
    () => leer(llave),
    () => null
  )
  const preferencias = useMemo(
    () => interpretarPreferencias(crudo, porDefecto),
    [crudo, porDefecto]
  )
  const guardar = useCallback(
    (cambios: Partial<PreferenciasTabla>) =>
      escribir(llave, JSON.stringify({ ...preferencias, ...cambios })),
    [llave, preferencias]
  )
  return [preferencias, guardar]
}
