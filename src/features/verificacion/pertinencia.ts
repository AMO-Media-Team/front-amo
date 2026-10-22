/**
 * Pertinencia geográfica de un medio (ADM-006), módulo puro: el multiplicador
 * por municipio (`medio_pertinencia_geografica.multiplicador`, numeric(4,3)
 * entre 0,500 y 1,500) que el motor de precios aplica cuando una oferta se
 * segmenta a ese municipio. Sin fila, el multiplicador es neutro (1,000).
 */
import type { Tono } from "@/features/operacion/estados"
import { formatearPorcentaje } from "@/lib/format"

export const MULTIPLICADOR_MINIMO = 0.5
export const MULTIPLICADOR_MAXIMO = 1.5
export const MULTIPLICADOR_NEUTRO = 1
export const LARGO_MAXIMO_NOTAS = 500

/** Tres decimales, como la columna. */
export function redondearMultiplicador(valor: number): number {
  return Math.round(valor * 1000) / 1000
}

/**
 * Lo que se escribe en el campo («1,15», «1.150», «0,9») → número; `null` si
 * no es un decimal con hasta tres cifras después de la coma.
 */
export function parsearMultiplicador(texto: string): number | null {
  const limpio = texto.trim().replace(/\s+/g, "").replace(/×$/, "")
  if (!/^\d{1,2}([.,]\d{1,3})?$/.test(limpio)) return null
  return Number(limpio.replace(",", "."))
}

export function multiplicadorEnRango(valor: number): boolean {
  return (
    Number.isFinite(valor) &&
    valor >= MULTIPLICADOR_MINIMO &&
    valor <= MULTIPLICADOR_MAXIMO
  )
}

/** Valor del campo al editar: «1,150». */
export function textoMultiplicador(valor: number): string {
  return redondearMultiplicador(valor).toFixed(3).replace(".", ",")
}

export interface EfectoMultiplicador {
  tono: Tono
  /** «Sube el precio 15 %», «Baja el precio 10 %», «Precio sin ajuste». */
  texto: string
}

export function efectoMultiplicador(valor: number): EfectoMultiplicador {
  const redondeado = redondearMultiplicador(valor)
  const cambio = Math.abs(redondeado - MULTIPLICADOR_NEUTRO)
  if (cambio < 0.0005) return { tono: "neutro", texto: "Precio sin ajuste" }
  const porcentaje = formatearPorcentaje(cambio, cambio * 100 < 1 ? 1 : 0)
  return redondeado > MULTIPLICADOR_NEUTRO
    ? { tono: "exito", texto: `Sube el precio ${porcentaje}` }
    : { tono: "aviso", texto: `Baja el precio ${porcentaje}` }
}

export interface FilaPertinencia {
  municipioCodigo: string
  municipio: string
  departamento: string | null
  multiplicador: number
  notas: string | null
  clasificadoPor: string | null
  clasificadoAt: string | null
}

/** Mayor multiplicador primero; a igualdad, por nombre de municipio. */
export function ordenarPertinencia<T extends FilaPertinencia>(
  filas: readonly T[]
): T[] {
  return [...filas].sort(
    (a, b) =>
      b.multiplicador - a.multiplicador ||
      a.municipio.localeCompare(b.municipio, "es")
  )
}
