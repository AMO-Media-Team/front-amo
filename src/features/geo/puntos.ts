/**
 * Puntos del modo calor (módulo puro). Privacidad: el servidor nunca entrega
 * coordenadas individuales; las agrega en una cuadrícula cuyo paso depende
 * del nivel (≥ 0,01° ≈ 1,1 km, la precisión con que se registran los
 * accesos) y suma los pesos de cada celda. Rendimiento: con más filas que el
 * tope, la muestra se reparte a lo largo de todo el periodo (páginas
 * equiespaciadas) y cada punto pesa `total / leídas`, así la forma del calor
 * no se sesga hacia los días más recientes.
 */
import type { NivelGeo } from "./metricas"
import type { PuntoGeo } from "./tipos"

/** Filas por solicitud: el tope de la API de Supabase (`max_rows`). */
export const FILAS_POR_PAGINA = 1000

/** Filas que se leen como máximo para un mapa de calor. */
export const MAXIMO_FILAS_CALOR = 12_000

/** Lado de la celda de agregación, en grados. */
export const PASO_CUADRICULA: Readonly<Record<NivelGeo, number>> = {
  internacional: 0.25,
  nacional: 0.05,
  departamental: 0.01,
}

/**
 * Rangos `[desde, hasta]` inclusivos que leer de `total` filas ordenadas: todas
 * si caben en `maximo`; si no, `maximo / tamano` páginas repartidas a lo largo
 * del total (muestra estratificada en el tiempo).
 */
export function paginasEstratificadas(
  total: number,
  maximo: number = MAXIMO_FILAS_CALOR,
  tamano: number = FILAS_POR_PAGINA
): [number, number][] {
  const filas = Math.max(0, Math.floor(total))
  if (filas === 0 || maximo <= 0 || tamano <= 0) return []
  if (filas <= maximo) {
    const paginas: [number, number][] = []
    for (let desde = 0; desde < filas; desde += tamano) {
      paginas.push([desde, Math.min(desde + tamano, filas) - 1])
    }
    return paginas
  }
  const cantidad = Math.max(1, Math.floor(maximo / tamano))
  const paso = filas / cantidad
  return Array.from({ length: cantidad }, (_, i): [number, number] => {
    const desde = Math.floor(i * paso)
    return [desde, Math.min(desde + tamano, filas) - 1]
  })
}

/** Filas efectivamente leídas por un conjunto de páginas. */
export function filasLeidas(
  paginas: readonly (readonly [number, number])[]
): number {
  return paginas.reduce((suma, [desde, hasta]) => suma + hasta - desde + 1, 0)
}

function aCelda(valor: number, paso: number): number {
  // Redondeo a la celda sin arrastrar errores binarios (0.35000000000000003).
  const decimales = Math.max(0, Math.ceil(-Math.log10(paso)) + 1)
  return Number((Math.round(valor / paso) * paso).toFixed(decimales))
}

export interface Coordenada {
  readonly lon: number
  readonly lat: number
}

/**
 * Agrega coordenadas en celdas de `paso` grados; cada celda pesa
 * `cantidad × factor`. Descarta coordenadas fuera de rango.
 */
export function agregarEnCuadricula(
  coordenadas: readonly Coordenada[],
  paso: number,
  factor = 1
): PuntoGeo[] {
  const celdas = new Map<string, [number, number, number]>()
  for (const { lon, lat } of coordenadas) {
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90
    ) {
      continue
    }
    const x = aCelda(lon, paso)
    const y = aCelda(lat, paso)
    const clave = `${x}|${y}`
    const celda = celdas.get(clave)
    if (celda) celda[2] += factor
    else celdas.set(clave, [x, y, factor])
  }
  return [...celdas.values()].map(([lon, lat, peso]): PuntoGeo => [
    lon,
    lat,
    Math.round(peso * 100) / 100,
  ])
}
