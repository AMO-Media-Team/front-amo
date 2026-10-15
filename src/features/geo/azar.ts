/**
 * Azar determinista (misma semilla, mismos números) para el proveedor
 * simulado y para dispersar puntos alrededor de una cabecera municipal sin
 * que el mapa de calor "salte" entre recargas.
 */
import type { Posicion } from "@/lib/geo/tipos"

import type { PuntoGeo } from "./tipos"

/** FNV-1a de 32 bits. */
export function hash(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Generador mulberry32 sembrado con el texto: números en [0, 1). */
export function generador(semilla: string): () => number {
  let estado = hash(semilla)
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const azar = (semilla: string): number => generador(semilla)()

/** Máximo de puntos por zona: más no cambia la forma del mapa de calor. */
export const PUNTOS_MAXIMOS_POR_ZONA = 14

/**
 * Reparte `total` en hasta 14 puntos dentro de un círculo de `radioGrados`
 * alrededor de `centro` (distribución uniforme en área), con coordenadas
 * redondeadas a 2 decimales (≈ 1 km, la misma precisión de los accesos).
 */
export function puntosAlrededor(
  centro: Posicion,
  total: number,
  semilla: string,
  radioGrados: number
): PuntoGeo[] {
  if (!(total > 0)) return []
  const cantidad = Math.min(PUNTOS_MAXIMOS_POR_ZONA, Math.ceil(total))
  const aleatorio = generador(`puntos|${semilla}`)
  const redondear = (valor: number) => Math.round(valor * 100) / 100
  return Array.from({ length: cantidad }, (): PuntoGeo => {
    const angulo = aleatorio() * Math.PI * 2
    const distancia = radioGrados * Math.sqrt(aleatorio())
    return [
      redondear(centro[0] + Math.cos(angulo) * distancia),
      redondear(centro[1] + Math.sin(angulo) * distancia),
      total / cantidad,
    ]
  })
}

/** Funde puntos con las mismas coordenadas sumando su peso. */
export function fundirPuntos(puntos: readonly PuntoGeo[]): PuntoGeo[] {
  const acumulado = new Map<string, PuntoGeo>()
  for (const [lon, lat, peso] of puntos) {
    const clave = `${lon}|${lat}`
    const previo = acumulado.get(clave)
    acumulado.set(clave, [lon, lat, (previo?.[2] ?? 0) + peso])
  }
  return [...acumulado.values()]
}
