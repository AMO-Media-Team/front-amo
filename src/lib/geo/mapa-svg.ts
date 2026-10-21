import { proyectar } from "./proyeccion"
import {
  PROYECCION_CONTINENTAL,
  PROYECCION_SAN_ANDRES,
} from "./svg-departamentos"
import type { Posicion } from "./tipos"

// Todo el territorio continental queda al este de -79,1°; el archipiélago, al oeste de -81,3°.
const LONGITUD_LIMITE_ARCHIPIELAGO = -80

/**
 * Coordenadas del lienzo `VIEWBOX_COLOMBIA` para una posición geográfica, p. ej. para
 * marcar medios o accesos sobre el mini-mapa. Las posiciones del archipiélago se
 * ubican dentro de `RECUADRO_SAN_ANDRES`.
 */
export function proyectarEnMapaColombia(
  posicion: Posicion
): readonly [x: number, y: number] {
  const parametros =
    posicion[0] < LONGITUD_LIMITE_ARCHIPIELAGO
      ? PROYECCION_SAN_ANDRES
      : PROYECCION_CONTINENTAL
  return proyectar(posicion, parametros)
}
