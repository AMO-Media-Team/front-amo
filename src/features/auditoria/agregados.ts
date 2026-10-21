/**
 * Agregados en memoria sobre una muestra de filas (módulo puro), compartidos
 * por Auditoría y Accesos mientras no existan RPC de resumen en la BD:
 * conteos por clave, series por día/semana de Bogotá y el troceo de lecturas
 * en páginas (PostgREST devuelve como máximo 1.000 filas por solicitud).
 */
import { diasEnRango, type RangoFechas, serializarFecha } from "@/lib/fechas"

/** Filas por solicitud que admite la API (`max_rows` de Supabase). */
export const FILAS_POR_SOLICITUD = 1000

/** Rangos `[desde, hasta]` inclusivos para leer `total` filas (hasta `maximo`). */
export function rangosDePaginas(
  total: number,
  maximo: number,
  tamano: number = FILAS_POR_SOLICITUD
): [number, number][] {
  const filas = Math.max(0, Math.min(total, maximo))
  const rangos: [number, number][] = []
  for (let desde = 0; desde < filas; desde += tamano) {
    rangos.push([desde, Math.min(desde + tamano, filas) - 1])
  }
  return rangos
}

export interface Conteo<K> {
  clave: K
  cantidad: number
}

/** Conteo por clave, de mayor a menor (desempate estable por orden de aparición). */
export function contarPor<T, K>(
  filas: readonly T[],
  clave: (fila: T) => K | null | undefined
): Conteo<K>[] {
  const conteos = new Map<K, number>()
  for (const fila of filas) {
    const k = clave(fila)
    if (k === null || k === undefined) continue
    conteos.set(k, (conteos.get(k) ?? 0) + 1)
  }
  return [...conteos]
    .map(([k, cantidad]) => ({ clave: k, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
}

/** Días por punto de la serie: diarios hasta 31 días; semanales en adelante. */
export function tamanoTramo(rango: RangoFechas): number {
  return diasEnRango(rango) <= 31 ? 1 : 7
}

/**
 * Cantidad de instantes por día (o semana) de Bogotá dentro del rango, con
 * ceros en los tramos sin datos: sirve para el minigráfico de un indicador.
 */
export function serieTemporal(
  instantes: readonly string[],
  rango: RangoFechas
): number[] {
  const dias = diasEnRango(rango)
  const tramo = tamanoTramo(rango)
  const indicePorDia = new Map<string, number>()
  for (let dia = 0; dia < dias; dia += 1) {
    const fecha = new Date(rango.desde.getTime() + dia * 86_400_000)
    indicePorDia.set(serializarFecha(fecha), Math.floor(dia / tramo))
  }
  const serie = new Array<number>(Math.ceil(dias / tramo)).fill(0)
  for (const instante of instantes) {
    const indice = indicePorDia.get(serializarFecha(new Date(instante)))
    if (indice !== undefined) serie[indice] += 1
  }
  return serie
}
