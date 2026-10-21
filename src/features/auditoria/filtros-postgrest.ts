/**
 * Filtros de PostgREST descritos como datos (módulo puro): así se prueban sin
 * red y se aplican igual en la tabla, la línea de tiempo y la exportación.
 * Solo se construyen con valores ya validados (enums, ISO2, UUID, slugs) salvo
 * la búsqueda libre, que pasa por `patronBusqueda`.
 */

export type FiltroPostgrest =
  | {
      columna: string
      operador: "eq" | "gte" | "lt" | "in" | "is"
      valor: string
    }
  | { o: string }

/** `in.(a,b)` para valores ya validados (sin comas ni paréntesis). */
export function lista(valores: readonly string[]): string {
  return `(${valores.join(",")})`
}

const RESERVADOS = /[,()"'\\*%:;]/g
const LONGITUD_MAXIMA = 80

/**
 * Texto de búsqueda → patrón `ilike` entre comillas para un `or=(…)`. Se quitan
 * los caracteres con significado en PostgREST o en LIKE; `null` si no queda nada.
 */
export function patronBusqueda(texto: string): string | null {
  const limpio = texto
    .replace(RESERVADOS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LONGITUD_MAXIMA)
  return limpio ? `"*${limpio}*"` : null
}

/** Condiciones `ilike` sobre varias columnas, para unir en un `or`. */
export function condicionesBusqueda(
  columnas: readonly string[],
  patron: string
): string[] {
  return columnas.map((columna) => `${columna}.ilike.${patron}`)
}

export interface VentanaFiltro {
  desde: string
  hastaExclusivo: string
}

/** `[desde, hastaExclusivo)` sobre la columna de tiempo. */
export function filtrosVentana(
  ventana: VentanaFiltro,
  columna = "created_at"
): FiltroPostgrest[] {
  return [
    { columna, operador: "gte", valor: ventana.desde },
    { columna, operador: "lt", valor: ventana.hastaExclusivo },
  ]
}

export interface CursorTiempo {
  /** `created_at` ISO del último elemento cargado. */
  at: string
  id: number
}

/**
 * Paginación por conjunto (keyset) sobre `(created_at desc, id desc)`: lo
 * siguiente es "más antiguo que el cursor, o del mismo instante con id menor".
 */
export function filtroCursor(cursor: CursorTiempo): FiltroPostgrest {
  const instante = `"${cursor.at}"`
  return {
    o: `created_at.lt.${instante},and(created_at.eq.${instante},id.lt.${cursor.id})`,
  }
}

/** Interfaz mínima del constructor de consultas de supabase-js que usamos. */
interface ConsultaFiltrable {
  filter(columna: string, operador: string, valor: unknown): ConsultaFiltrable
  or(expresion: string): ConsultaFiltrable
}

/**
 * Aplica los filtros con `.filter()`/`.or()`. Varios `or` se combinan con AND
 * (PostgREST los recibe como parámetros separados). La conversión de tipos es
 * local: los genéricos de columnas de supabase-js no admiten nombres dinámicos.
 */
export function aplicarFiltros<T>(
  consulta: T,
  filtros: readonly FiltroPostgrest[]
): T {
  let actual = consulta as unknown as ConsultaFiltrable
  for (const filtro of filtros) {
    actual =
      "o" in filtro
        ? actual.or(filtro.o)
        : actual.filter(filtro.columna, filtro.operador, filtro.valor)
  }
  return actual as unknown as T
}
