/**
 * Área del mapa que los paneles no tapan. Módulo puro (sin cargar Mapbox).
 */
import type { MargenMapa } from "./tipos"

/** Aire entre la zona traída a la vista y el borde del panel que la tapaba. */
export const HOLGURA_AREA_LIBRE_PX = 56

function haciaElIntervalo(
  valor: number,
  minimo: number,
  maximo: number,
  holgura: number
): number {
  // Un área más estrecha que dos holguras: se apunta a su centro.
  const aire = Math.max(0, Math.min(holgura, (maximo - minimo) / 2))
  if (valor < minimo + aire) return valor - (minimo + aire)
  if (valor > maximo - aire) return valor - (maximo - aire)
  return 0
}

/**
 * Cuánto hay que desplazar la cámara (px, como `map.panBy`) para que `punto`
 * quede dentro del área libre: lo justo, sin recentrar el mapa. `[0, 0]` si ya
 * está a la vista.
 */
export function desplazamientoAlAreaLibre(
  punto: { readonly x: number; readonly y: number },
  lienzo: { readonly ancho: number; readonly alto: number },
  margen: MargenMapa,
  holgura: number = HOLGURA_AREA_LIBRE_PX
): [dx: number, dy: number] {
  return [
    haciaElIntervalo(
      punto.x,
      margen.left,
      lienzo.ancho - margen.right,
      holgura
    ),
    haciaElIntervalo(punto.y, margen.top, lienzo.alto - margen.bottom, holgura),
  ]
}

/** Centro del área libre: ahí dibuja Mapbox el centro de la cámara. */
export function centroAreaLibre(
  lienzo: { readonly ancho: number; readonly alto: number },
  margen: MargenMapa
): { x: number; y: number } {
  return {
    x: (lienzo.ancho + margen.left - margen.right) / 2,
    y: (lienzo.alto + margen.top - margen.bottom) / 2,
  }
}

/**
 * Posición final de `punto` (px) y desplazamiento respecto al centro del área
 * libre (`offset` de `map.easeTo`) al seleccionar una zona: primero la vista
 * se desliza del margen `previo` al `nuevo` (se abre o se cierra un panel) y,
 * si la zona aún queda tapada, se corre lo justo. `null`: basta con el
 * deslizamiento de los márgenes.
 */
export function encuadreDeZona(
  punto: { readonly x: number; readonly y: number },
  lienzo: { readonly ancho: number; readonly alto: number },
  previo: MargenMapa,
  nuevo: MargenMapa,
  holgura: number = HOLGURA_AREA_LIBRE_PX
): { offset: [number, number] } | null {
  const antes = centroAreaLibre(lienzo, previo)
  const despues = centroAreaLibre(lienzo, nuevo)
  const trasMargen = {
    x: punto.x + despues.x - antes.x,
    y: punto.y + despues.y - antes.y,
  }
  const [dx, dy] = desplazamientoAlAreaLibre(trasMargen, lienzo, nuevo, holgura)
  if (dx === 0 && dy === 0) return null
  return {
    offset: [trasMargen.x - dx - despues.x, trasMargen.y - dy - despues.y],
  }
}
