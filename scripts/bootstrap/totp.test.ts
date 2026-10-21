import { describe, expect, it } from "vitest"

import {
  codigoHotp,
  codigoTotp,
  decodificarBase32,
  segundosRestantesTotp,
} from "./totp"

// Vectores de los RFC 4226 (HOTP) y 6238 (TOTP, SHA-1): clave ASCII "12345678901234567890".
const CLAVE_ASCII = Buffer.from("12345678901234567890", "ascii")
const CLAVE_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

describe("decodificarBase32", () => {
  it("decodifica la clave de los RFC", () => {
    expect(decodificarBase32(CLAVE_BASE32).equals(CLAVE_ASCII)).toBe(true)
  })

  it("tolera minúsculas, espacios y relleno", () => {
    const agrupada = "gezd gnbv gy3t qojq gezd gnbv gy3t qojq=="
    expect(decodificarBase32(agrupada).equals(CLAVE_ASCII)).toBe(true)
  })

  it("rechaza caracteres fuera del alfabeto", () => {
    expect(() => decodificarBase32("ABC1")).toThrow(/base32/)
  })
})

describe("codigoHotp", () => {
  it.each([
    [0, "755224"],
    [1, "287082"],
    [9, "520489"],
  ])("contador %i → %s (RFC 4226)", (contador, esperado) => {
    expect(codigoHotp(CLAVE_ASCII, contador)).toBe(esperado)
  })
})

describe("codigoTotp", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [2000000000, "69279037"],
  ])("t = %i s → %s (RFC 6238, 8 dígitos)", (segundos, esperado) => {
    expect(codigoTotp(CLAVE_BASE32, segundos * 1000, 8)).toBe(esperado)
  })

  it("usa 6 dígitos por defecto (como las apps autenticadoras)", () => {
    expect(codigoTotp(CLAVE_BASE32, 59_000)).toBe("287082")
  })
})

describe("segundosRestantesTotp", () => {
  it("cuenta hasta el siguiente múltiplo de 30 s", () => {
    expect(segundosRestantesTotp(0)).toBe(30)
    expect(segundosRestantesTotp(29_000)).toBe(1)
    expect(segundosRestantesTotp(31_500)).toBe(29)
  })
})
