/**
 * Cifras de un KPI según su unidad: texto completo (lectores de pantalla,
 * tooltips, variación) y formato de la cifra animada de la tarjeta, compacto
 * cuando el número no cabe en media columna móvil.
 */
import type { FormatoNumero } from "@/components/motion/numero-animado"
import {
  formatearCOP,
  formatearNumero,
  formatearPorcentaje,
} from "@/lib/format"

import type { UnidadKpi } from "./tipos"

export interface FormatoCifraKpi {
  formato: FormatoNumero
  decimales?: number
  sufijo?: string
}

/** A partir de estos valores la tarjeta usa notación compacta ($184,3 M). */
const COMPACTO_DESDE: Readonly<Partial<Record<UnidadKpi, number>>> = {
  COP: 1_000_000,
  personas: 100_000,
  conteo: 1_000_000,
}

function esGrande(unidad: UnidadKpi, valor: number): boolean {
  const umbral = COMPACTO_DESDE[unidad]
  return umbral !== undefined && Math.abs(valor) >= umbral
}

/** Formato de `NumeroAnimado` para la cifra principal de la tarjeta. */
export function formatoCifraKpi(
  unidad: UnidadKpi,
  valor: number
): FormatoCifraKpi {
  switch (unidad) {
    case "COP":
      return { formato: esGrande(unidad, valor) ? "copCompacto" : "cop" }
    case "%":
      return { formato: "porcentaje", decimales: 1 }
    case "h":
      return { formato: "numero", decimales: 1, sufijo: " h" }
    case "factor":
      return { formato: "numero", decimales: 2, sufijo: " ×" }
    case "personas":
    case "conteo":
      return { formato: esGrande(unidad, valor) ? "compacto" : "numero" }
  }
}

/** Cifra completa, sin abreviar: "$ 184.320.000", "12,5 %", "36,5 horas". */
export function formatearValorKpi(valor: number, unidad: UnidadKpi): string {
  switch (unidad) {
    case "COP":
      return formatearCOP(valor)
    case "%":
      return formatearPorcentaje(valor, 1)
    case "h":
      return `${formatearNumero(valor, 1)} horas`
    case "factor":
      return `${formatearNumero(valor, 2)} ×`
    case "personas":
    case "conteo":
      return formatearNumero(valor)
  }
}
