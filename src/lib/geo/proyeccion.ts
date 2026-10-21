import type { Bbox, Posicion } from "./tipos"

/** Proyección Mercator ajustada a una caja del lienzo SVG (y crece hacia abajo). */
export interface ParametrosProyeccion {
  readonly oeste: number
  /** Ordenada Mercator (en grados) del borde norte del área proyectada. */
  readonly norteMercator: number
  /** Unidades del lienzo por grado. */
  readonly escala: number
  readonly desplazamientoX: number
  readonly desplazamientoY: number
}

export interface Caja {
  readonly x: number
  readonly y: number
  readonly ancho: number
  readonly alto: number
}

const GRADOS_POR_RADIAN = 180 / Math.PI

/** Ordenada Mercator expresada en grados, para que la escala sea la misma en ambos ejes. */
export function yMercator(latitud: number): number {
  return (
    GRADOS_POR_RADIAN *
    Math.log(Math.tan(Math.PI / 4 + latitud / GRADOS_POR_RADIAN / 2))
  )
}

export function proyectar(
  [lon, lat]: Posicion,
  parametros: ParametrosProyeccion
): readonly [x: number, y: number] {
  return [
    parametros.desplazamientoX + (lon - parametros.oeste) * parametros.escala,
    parametros.desplazamientoY +
      (parametros.norteMercator - yMercator(lat)) * parametros.escala,
  ]
}

/** Parámetros que encajan `bbox` en `caja` conservando la proporción y centrando el sobrante. */
export function ajustarProyeccion(
  bbox: Bbox,
  caja: Caja
): ParametrosProyeccion {
  const [oeste, sur, este, norte] = bbox
  const anchoGrados = este - oeste
  const altoGrados = yMercator(norte) - yMercator(sur)
  const escala = Math.min(caja.ancho / anchoGrados, caja.alto / altoGrados)
  return {
    oeste,
    norteMercator: yMercator(norte),
    escala,
    desplazamientoX: caja.x + (caja.ancho - anchoGrados * escala) / 2,
    desplazamientoY: caja.y + (caja.alto - altoGrados * escala) / 2,
  }
}
