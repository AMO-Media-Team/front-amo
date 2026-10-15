import { describe, expect, it } from "vitest"

import { cantidadDecimales, numeroAEntrada, textoANumero } from "./numeros"

describe("textoANumero", () => {
  it("lee cifras escritas a la colombiana", () => {
    expect(textoANumero("1.250.000")).toBe(1_250_000)
    expect(textoANumero("15,5")).toBe(15.5)
    expect(textoANumero("1.250.000,75")).toBe(1_250_000.75)
    expect(textoANumero("$ 450.000")).toBe(450_000)
    expect(textoANumero("20 %")).toBe(20)
    expect(textoANumero("1,25×")).toBe(1.25)
  })

  it("acepta el punto decimal cuando no agrupa de a tres", () => {
    expect(textoANumero("15.5")).toBe(15.5)
    expect(textoANumero("0.155")).toBe(0.155)
    expect(textoANumero("1.5")).toBe(1.5)
    // Tres cifras tras el punto son miles en es-CO.
    expect(textoANumero("1.500")).toBe(1500)
  })

  it("admite signo", () => {
    expect(textoANumero("-3")).toBe(-3)
    expect(textoANumero("+7")).toBe(7)
  })

  it("devuelve null con vacío o texto que no es una cifra", () => {
    expect(textoANumero("")).toBeNull()
    expect(textoANumero("   ")).toBeNull()
    expect(textoANumero("abc")).toBeNull()
    expect(textoANumero("1,2,3")).toBeNull()
    expect(textoANumero("12.34,5")).toBeNull()
    expect(textoANumero("1e5")).toBeNull()
  })
})

describe("cantidadDecimales", () => {
  it("cuenta decimales sin ruido de coma flotante", () => {
    expect(cantidadDecimales(20)).toBe(0)
    expect(cantidadDecimales(15.5)).toBe(1)
    expect(cantidadDecimales(0.1 + 0.2)).toBe(1)
    expect(cantidadDecimales(1.2345)).toBe(4)
  })
})

describe("numeroAEntrada", () => {
  it("escribe el número como se teclearía en es-CO", () => {
    expect(numeroAEntrada(1_250_000)).toBe("1.250.000")
    expect(numeroAEntrada(15.5)).toBe("15,5")
    expect(numeroAEntrada(null)).toBe("")
    expect(numeroAEntrada(Number.NaN)).toBe("")
  })

  it("lo que escribe se vuelve a leer igual", () => {
    for (const valor of [0, 100, 1_250_000, 15.5, 0.155, 52_374]) {
      expect(textoANumero(numeroAEntrada(valor))).toBe(valor)
    }
  })
})
