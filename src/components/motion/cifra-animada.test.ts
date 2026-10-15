import { describe, expect, it } from "vitest"

import {
  formatearCompacto,
  formatearCOP,
  formatearCOPCompacto,
  LOCALE,
} from "@/lib/format"

import { cifraAnimada, type FormatoNumero } from "./cifra-animada"

/** El texto que NumberFlow compone: prefijo + cifra con Intl + sufijo. */
function textoAnimado(valor: number, formato: FormatoNumero, decimales = 0) {
  const cifra = cifraAnimada(valor, formato, decimales)
  const numero = new Intl.NumberFormat(LOCALE, cifra.formato).format(
    cifra.valor
  )
  return `${cifra.prefijo}${numero}${cifra.sufijo}`
}

const VALORES = [
  0, 950, 8_400, 96_200, 999_950, 1_300_000, 1_656_000_000, 250_900_000_000,
  1.3e12, -13_500, -2_589_800_000,
]

describe("cifraAnimada", () => {
  it.each(VALORES)(
    "la cifra compacta animada se lee igual que la escrita (%d)",
    (valor) => {
      expect(textoAnimado(valor, "compacto")).toBe(formatearCompacto(valor))
      expect(textoAnimado(valor, "copCompacto")).toBe(
        formatearCOPCompacto(valor)
      )
    }
  )

  it("en pesos compactos anima la magnitud y deja el signo antes del símbolo", () => {
    expect(cifraAnimada(-1_300_000, "copCompacto", 0)).toMatchObject({
      valor: 1.3,
      prefijo: "-$",
      sufijo: "\u00a0M",
    })
  })

  it("los demás formatos pasan el valor tal cual a Intl", () => {
    expect(textoAnimado(184_320_000, "cop")).toBe(formatearCOP(184_320_000))
    expect(cifraAnimada(0.125, "porcentaje", 1)).toMatchObject({
      valor: 0.125,
      formato: { style: "percent", maximumFractionDigits: 1 },
      prefijo: "",
      sufijo: "",
    })
    expect(cifraAnimada(36.52, "numero", 1)).toMatchObject({
      valor: 36.52,
      formato: { maximumFractionDigits: 1 },
    })
  })
})
