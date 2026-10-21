/**
 * Qué recibe NumberFlow para cada formato de `NumeroAnimado`. Módulo puro: la
 * cifra animada debe leerse igual que la escrita por `@/lib/format`.
 */
import type { Format } from "@number-flow/react"

import {
  descomponerCompacto,
  OPCIONES_NUMERO,
  opcionesPorcentaje,
  prefijoCOPCompacto,
} from "@/lib/format"

export type FormatoNumero =
  "numero" | "cop" | "copCompacto" | "compacto" | "porcentaje"

export interface CifraAnimada {
  valor: number
  formato: Format
  prefijo: string
  sufijo: string
}

/**
 * Valor, opciones de Intl y adornos de la cifra. La notación compacta no usa
 * la de `Intl`: anima la cifra ya escalada con la abreviatura de
 * `descomponerCompacto` ("1,3" + " M"), la regla única de la app.
 */
export function cifraAnimada(
  valor: number,
  formato: FormatoNumero,
  decimales: number
): CifraAnimada {
  const sinAdornos = { prefijo: "", sufijo: "" }
  switch (formato) {
    case "cop":
      return { valor, formato: OPCIONES_NUMERO.cop, ...sinAdornos }
    case "copCompacto": {
      const cifra = descomponerCompacto(valor)
      // Por debajo de mil no se abrevia: es la cifra completa en pesos.
      if (!cifra.sufijo) return cifraAnimada(valor, "cop", decimales)
      return {
        // El signo va antes del símbolo ("-$1,3 M"): se anima la magnitud.
        valor: Math.abs(cifra.valor),
        formato: OPCIONES_NUMERO.compacto,
        prefijo: prefijoCOPCompacto(cifra.valor),
        sufijo: cifra.sufijo,
      }
    }
    case "compacto": {
      const cifra = descomponerCompacto(valor)
      return {
        valor: cifra.valor,
        formato: OPCIONES_NUMERO.compacto,
        prefijo: "",
        sufijo: cifra.sufijo,
      }
    }
    case "porcentaje":
      return { valor, formato: opcionesPorcentaje(decimales), ...sinAdornos }
    case "numero":
      return {
        valor,
        formato: { maximumFractionDigits: decimales },
        ...sinAdornos,
      }
  }
}
