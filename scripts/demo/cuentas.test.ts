import { describe, expect, it } from "vitest"

import {
  ANUNCIANTES_CON_SEGUNDO_USUARIO,
  cuentasDemo,
  esCorreoDemo,
  mesesEntre,
  TOTAL_ANUNCIANTES,
  TOTAL_MEDIOS,
} from "./cuentas"

describe("cuentasDemo", () => {
  const cuentas = cuentasDemo()

  it("tiene una cuenta por actor y ninguna repetida", () => {
    const esperadas =
      5 + 3 + TOTAL_ANUNCIANTES + ANUNCIANTES_CON_SEGUNDO_USUARIO + TOTAL_MEDIOS
    expect(cuentas).toHaveLength(esperadas)
    expect(new Set(cuentas.map((cuenta) => cuenta.email)).size).toBe(esperadas)
  })

  it("solo las cuentas con nombre guardan credenciales y solo los roles internos llevan TOTP", () => {
    const conNombre = cuentas.filter((cuenta) => cuenta.variable !== null)
    expect(conNombre.map((cuenta) => cuenta.variable)).toEqual([
      "DEMO_ADMIN",
      "DEMO_OPERACIONES",
      "DEMO_FINANZAS",
      "DEMO_ANUNCIANTE",
      "DEMO_MEDIO",
    ])
    expect(
      cuentas.filter((cuenta) => cuenta.conTotp).map((cuenta) => cuenta.clase)
    ).toEqual(["ADMIN", "OPERACIONES", "FINANZAS"])
  })

  it("todas pasan por esCorreoDemo", () => {
    expect(cuentas.every((cuenta) => esCorreoDemo(cuenta.email))).toBe(true)
  })
})

describe("esCorreoDemo", () => {
  it("excluye las cuentas E2E y las reales", () => {
    expect(esCorreoDemo("e2e.admin@amo.test")).toBe(false)
    expect(esCorreoDemo("e2e.pista-geo@amo.test")).toBe(false)
    expect(esCorreoDemo("alguien@gmail.com")).toBe(false)
    expect(esCorreoDemo("demo.admin@amo.test.co")).toBe(false)
  })

  it("acepta mayúsculas y espacios alrededor", () => {
    expect(esCorreoDemo(" Medio-001@demo.amo.co ")).toBe(true)
    expect(esCorreoDemo("DEMO.MEDIO@amo.test")).toBe(true)
  })
})

describe("mesesEntre", () => {
  it("lista los meses hasta el mes civil de Bogotá", () => {
    expect(mesesEntre("2025-11", new Date("2026-02-10T12:00:00Z"))).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ])
  })

  it("usa la fecha de Bogotá y no la de UTC en el cambio de mes", () => {
    // 2026-10-01 03:00 UTC todavía es 30 de septiembre en Bogotá.
    expect(mesesEntre("2026-09", new Date("2026-10-01T03:00:00Z"))).toEqual([
      "2026-09-01",
    ])
  })

  it("rechaza un mes mal escrito", () => {
    expect(() => mesesEntre("2025-13", new Date())).toThrow()
    expect(() => mesesEntre("julio", new Date())).toThrow()
  })
})
