import { describe, expect, it } from "vitest"

import { esHuellaHex, momentoCaptura } from "./codigo"

describe("esHuellaHex", () => {
  it("solo hex de 64 en minúsculas", () => {
    expect(esHuellaHex("a".repeat(64))).toBe(true)
    expect(esHuellaHex("A".repeat(64))).toBe(false)
    expect(esHuellaHex("a".repeat(63))).toBe(false)
    expect(esHuellaHex(null)).toBe(false)
  })
})

describe("momentoCaptura", () => {
  it("a tiempo si se cargó antes del vencimiento, con el margen en minutos", () => {
    expect(
      momentoCaptura("2026-10-22T15:00:00Z", "2026-10-22T15:30:00Z")
    ).toEqual({ aTiempo: true, margenMinutos: 30 })
  })

  it("tarde si se cargó después (la BD no deja aprobarla)", () => {
    expect(
      momentoCaptura("2026-10-22T16:05:00Z", "2026-10-22T16:00:00Z")
    ).toEqual({ aTiempo: false, margenMinutos: -5 })
  })

  it("el mismo instante del vencimiento aún vale", () => {
    expect(
      momentoCaptura("2026-10-22T16:00:00Z", "2026-10-22T16:00:00Z")?.aTiempo
    ).toBe(true)
  })

  it("sin código (verificación manual) no aplica", () => {
    expect(momentoCaptura("2026-10-22T16:00:00Z", null)).toBeNull()
    expect(momentoCaptura("no es fecha", "2026-10-22T16:00:00Z")).toBeNull()
  })
})
