/**
 * Transición de colores por zona. Mapbox no anima cambios de `feature-state`
 * (ni de propiedades con datos), así que se interpolan en JS cuadro a cuadro
 * y se escriben en el estado `color` de cada zona.
 */
import { interpolarColor, suavizar } from "./expresiones"

export type ColoresPorZona = ReadonlyMap<string, string>

export interface OpcionesAnimacion {
  /** Colores actuales (se actualizan cuadro a cuadro; sirven para encadenar animaciones). */
  readonly actuales: Map<string, string>
  readonly destino: ColoresPorZona
  /** Color desde/hacia el que aparecen o desaparecen las zonas sin dato. */
  readonly colorBase: string
  readonly duracionMs: number
  /** Escribe el color (o `null` = sin dato) de una zona en el mapa. */
  readonly escribir: (codigo: string, color: string | null) => void
}

/** Anima hasta `destino` y devuelve la función que cancela la animación. */
export function animarColores({
  actuales,
  destino,
  colorBase,
  duracionMs,
  escribir,
}: OpcionesAnimacion): () => void {
  const codigos = new Set([...actuales.keys(), ...destino.keys()])
  const origen = new Map(
    [...codigos].map((codigo) => [codigo, actuales.get(codigo) ?? colorBase])
  )

  const terminar = () => {
    for (const codigo of codigos) {
      const final = destino.get(codigo) ?? null
      escribir(codigo, final)
      if (final) actuales.set(codigo, final)
      else actuales.delete(codigo)
    }
  }

  if (duracionMs <= 0 || typeof requestAnimationFrame === "undefined") {
    terminar()
    return () => {}
  }

  let cuadro = 0
  const inicio = performance.now()
  const paso = (ahora: number) => {
    const t = Math.min(1, (ahora - inicio) / duracionMs)
    if (t >= 1) {
      terminar()
      return
    }
    const avance = suavizar(t)
    for (const codigo of codigos) {
      const color = interpolarColor(
        origen.get(codigo) ?? colorBase,
        destino.get(codigo) ?? colorBase,
        avance
      )
      actuales.set(codigo, color)
      escribir(codigo, color)
    }
    cuadro = requestAnimationFrame(paso)
  }
  cuadro = requestAnimationFrame(paso)
  return () => cancelAnimationFrame(cuadro)
}
