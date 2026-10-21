/**
 * Punto representativo de un país para traerlo a la vista en el globo. Módulo
 * puro apto para el cliente (no usa el catálogo completo de países).
 */
import type { Geometry, Position } from "geojson"

import type { Posicion } from "@/lib/geo/tipos"

interface Caja {
  oeste: number
  sur: number
  este: number
  norte: number
}

function cajaDe(anillo: readonly Position[]): Caja {
  const caja = {
    oeste: Infinity,
    sur: Infinity,
    este: -Infinity,
    norte: -Infinity,
  }
  for (const [longitud = 0, latitud = 0] of anillo) {
    caja.oeste = Math.min(caja.oeste, longitud)
    caja.este = Math.max(caja.este, longitud)
    caja.sur = Math.min(caja.sur, latitud)
    caja.norte = Math.max(caja.norte, latitud)
  }
  return caja
}

/**
 * Área del anillo (fórmula de Gauss, en grados²) corregida por la latitud:
 * solo sirve para comparar polígonos entre sí, y sin la corrección los
 * territorios polares pesarían de más.
 */
function areaComparable(anillo: readonly Position[], caja: Caja): number {
  let suma = 0
  let previo = anillo.at(-1)
  for (const punto of anillo) {
    if (previo) {
      suma +=
        (previo[0] ?? 0) * (punto[1] ?? 0) - (punto[0] ?? 0) * (previo[1] ?? 0)
    }
    previo = punto
  }
  const latitudMedia = ((caja.sur + caja.norte) / 2) * (Math.PI / 180)
  return (Math.abs(suma) / 2) * Math.cos(latitudMedia)
}

/**
 * Centro de la envolvente del polígono más grande de la geometría: en un país
 * con territorios apartados (Alaska, ultramar, islas) cae en el territorio
 * principal, no en medio del océano como el centro de la envolvente completa.
 */
export function centroDelMayorPoligono(geometria: Geometry): Posicion | null {
  const poligonos =
    geometria.type === "Polygon"
      ? [geometria.coordinates]
      : geometria.type === "MultiPolygon"
        ? geometria.coordinates
        : []
  let mayor: { area: number; caja: Caja } | null = null
  for (const [exterior] of poligonos) {
    if (!exterior || exterior.length < 3) continue
    const caja = cajaDe(exterior)
    const area = areaComparable(exterior, caja)
    if (!mayor || area > mayor.area) mayor = { area, caja }
  }
  if (!mayor) return null
  const { oeste, sur, este, norte } = mayor.caja
  return [(oeste + este) / 2, (sur + norte) / 2]
}
