/**
 * Formatos de valores para ejes, tooltips, etiquetas y tablas de los gráficos.
 * Reutiliza `@/lib/format` (es-CO, COP sin decimales) para que la cifra del
 * gráfico coincida con la de tablas, tarjetas y exportaciones.
 */
import {
  formatearCompacto,
  formatearCOP,
  formatearCOPCompacto,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

export type FormatoValor =
  | "cop"
  | "copCompacto"
  | "numero"
  | "compacto"
  /** Fracción: 0,125 → 12,5 %. */
  | "porcentaje"
  | "decimal"

/** Cifra completa (tooltip, tabla alternativa). */
export function formatearValor(
  valor: number | null | undefined,
  formato: FormatoValor
): string {
  switch (formato) {
    case "cop":
      return formatearCOP(valor)
    case "copCompacto":
      return formatearCOPCompacto(valor)
    case "numero":
      return formatearNumero(valor)
    case "compacto":
      return formatearCompacto(valor)
    case "porcentaje":
      return formatearPorcentaje(valor, 1)
    case "decimal":
      return formatearNumero(valor, 2)
  }
}

/**
 * Marca de eje: compacta y redondeada ("$12,5 M", "25 mil", "40 %"), porque las
 * etiquetas del eje llevan los valores que no se rotulan directamente.
 */
export function formatearEje(valor: number, formato: FormatoValor): string {
  switch (formato) {
    case "cop":
    case "copCompacto":
      return formatearCOPCompacto(valor)
    case "numero":
    case "compacto":
      return Math.abs(valor) >= 10_000
        ? formatearCompacto(valor)
        : formatearNumero(valor)
    case "porcentaje":
      return formatearPorcentaje(valor, 0)
    case "decimal":
      return formatearNumero(valor, 1)
  }
}

/** Etiqueta directa sobre una marca (barra, segmento): compacta si es dinero. */
export function formatearEtiqueta(
  valor: number,
  formato: FormatoValor
): string {
  return formato === "cop"
    ? formatearCOPCompacto(valor)
    : formatearValor(valor, formato)
}

/** "1 asignación" / "12 asignaciones". */
export interface Unidad {
  singular: string
  plural: string
}

export function conUnidad(cantidad: number, unidad: Unidad): string {
  return `${formatearNumero(cantidad)} ${cantidad === 1 ? unidad.singular : unidad.plural}`
}
