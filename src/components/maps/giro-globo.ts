/**
 * Modelo del giro del globo en la vista mundial (sin Mapbox ni DOM, para
 * poder probarlo): velocidad de crucero según el zoom, arranque y frenado
 * suaves, y avance de la longitud del centro.
 *
 * El planeta gira hacia el este, así que para quien lo mira desde fuera las
 * costas pasan de izquierda a derecha: el centro de la cámara se corre hacia
 * el oeste (longitud decreciente).
 */

export const GIRO = {
  /** Segundos de una vuelta completa a velocidad de crucero (2° por segundo). */
  periodoS: 180,
  /** Hasta este zoom se gira a velocidad plena… */
  zoomPleno: 2.2,
  /** …y desde este no se gira: de cerca se está leyendo el mapa. */
  zoomNulo: 4.2,
  /** Constantes de tiempo: arranca con calma y se detiene pronto. */
  tauArranqueMs: 1400,
  tauFrenadoMs: 240,
  /** Espera tras la última interacción antes de volver a girar. */
  reanudarTrasMs: 2600,
  /** Espera al montar o al volver a quedar libre (sin interacción previa). */
  rearmarTrasMs: 900,
  /**
   * Tope por cuadro: al volver de otra pestaña no hay salto, y un equipo
   * lento (hasta 4 cuadros por segundo) conserva la velocidad real.
   */
  cuadroMaximoMs: 250,
  /** Por debajo de esta velocidad (°/s) se considera detenido. */
  umbralReposo: 0.004,
} as const

const VELOCIDAD_PLENA = 360 / GIRO.periodoS

/** Tiempo que avanza el giro en un cuadro: nunca negativo ni mayor que el tope. */
export function tiempoDeCuadro(transcurridoMs: number): number {
  return Math.min(Math.max(transcurridoMs, 0), GIRO.cuadroMaximoMs)
}

/** Velocidad de crucero en grados por segundo para un zoom dado. */
export function velocidadCrucero(zoom: number): number {
  if (zoom <= GIRO.zoomPleno) return VELOCIDAD_PLENA
  if (zoom >= GIRO.zoomNulo) return 0
  const tramo = (GIRO.zoomNulo - zoom) / (GIRO.zoomNulo - GIRO.zoomPleno)
  return VELOCIDAD_PLENA * tramo
}

/**
 * Acerca la velocidad actual a la objetivo con suavizado exponencial
 * (independiente de la tasa de cuadros). Frenar es más rápido que arrancar.
 */
export function acercarVelocidad(
  actual: number,
  objetivo: number,
  dtMs: number
): number {
  if (dtMs <= 0) return actual
  const tau = objetivo < actual ? GIRO.tauFrenadoMs : GIRO.tauArranqueMs
  const siguiente = objetivo + (actual - objetivo) * Math.exp(-dtMs / tau)
  return Math.abs(siguiente - objetivo) < GIRO.umbralReposo
    ? objetivo
    : siguiente
}

/** Longitud del centro tras `dtMs` a `velocidad` (°/s), normalizada a [-180, 180). */
export function girarLongitud(
  longitud: number,
  velocidad: number,
  dtMs: number
): number {
  const siguiente = longitud - velocidad * (dtMs / 1000)
  return ((((siguiente + 180) % 360) + 360) % 360) - 180
}
