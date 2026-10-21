/**
 * Vida de las URL firmadas de Storage (módulo puro). Todos los buckets son
 * privados: cada lectura pasa por una URL firmada en el servidor que vence a
 * los segundos de `archivos.vigencia_url_firmada_segundos`
 * (docs/modelo-datos.md §7 y §8). La clave es pública (`es_publica`): la lee
 * cualquier usuario activo, no solo quien tiene `configuracion.ver`.
 */
import type { Json } from "@/types/database.types"

export const CLAVE_VIGENCIA_URL_FIRMADA =
  "archivos.vigencia_url_firmada_segundos"

/** Valor de la semilla: rige si la clave no se puede leer. */
export const VIGENCIA_URL_FIRMADA_POR_DEFECTO_S = 300

/** Rango que admite la configuración; fuera de él el valor no es confiable. */
const MINIMO_S = 30
const MAXIMO_S = 3600

/** Segundos de vigencia a partir del `valor` guardado (número o texto numérico). */
export function segundosDeVigencia(valor: Json | undefined): number {
  const numero = typeof valor === "string" ? Number(valor) : valor
  return typeof numero === "number" &&
    Number.isInteger(numero) &&
    numero >= MINIMO_S &&
    numero <= MAXIMO_S
    ? numero
    : VIGENCIA_URL_FIRMADA_POR_DEFECTO_S
}
