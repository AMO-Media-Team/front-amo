/**
 * Qué parte del globo queda a la vista de la cámara. Módulo puro (sin cargar
 * Mapbox).
 */
import type { Posicion } from "@/lib/geo/tipos"

const RADIANES = Math.PI / 180

/**
 * Más lejos que esto del centro de la cámara, una zona está en el borde del
 * globo (tan escorzada que no se lee) o en su cara oculta.
 */
export const ANGULO_A_LA_VISTA = 60

/** Ángulo (grados) entre dos puntos de la esfera, por el círculo máximo. */
export function distanciaAngular(a: Posicion, b: Posicion): number {
  const latitudA = a[1] * RADIANES
  const latitudB = b[1] * RADIANES
  const mediaLatitud = (latitudB - latitudA) / 2
  const mediaLongitud = ((b[0] - a[0]) * RADIANES) / 2
  const semiverseno =
    Math.sin(mediaLatitud) ** 2 +
    Math.cos(latitudA) * Math.cos(latitudB) * Math.sin(mediaLongitud) ** 2
  return (2 * Math.asin(Math.min(1, Math.sqrt(semiverseno)))) / RADIANES
}

/** Si `punto` se ve con claridad cuando la cámara mira a `centro`. */
export function estaALaVista(centro: Posicion, punto: Posicion): boolean {
  return distanciaAngular(centro, punto) <= ANGULO_A_LA_VISTA
}
