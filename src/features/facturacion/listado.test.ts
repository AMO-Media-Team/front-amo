import { describe, expect, it } from "vitest"

import {
  atajoDePeriodo,
  corteEfectivo,
  estadoTablaFacturas,
  extremosDePreset,
  periodoEmision,
  rutaCartera,
  rutaFacturasFiltradas,
} from "./listado"

/** 23 de oct de 2026, 10:00 en Bogotá. */
const AHORA = new Date("2026-10-23T15:00:00Z")

describe("estado del listado en la URL", () => {
  it("lee estado, anunciante, periodo, orden y página con los mismos parsers", async () => {
    const estado = await estadoTablaFacturas.cargar(
      Promise.resolve({
        estado: "EMITIDA,VENCIDA,INVENTADO",
        anunciante: "0192F3A4-5B6C-7D8E-9F01-0000000000A1,no-uuid",
        desde: "2026-10-01",
        hasta: "2026-13-01",
        orden: "saldo.desc",
        pagina: "2",
      })
    )
    expect(estado.estado).toEqual(["EMITIDA", "VENCIDA"])
    expect(estado.anunciante).toEqual(["0192f3a4-5b6c-7d8e-9f01-0000000000a1"])
    expect(estado.desde).toBe("2026-10-01")
    expect(estado.hasta).toBeNull()
    expect(estado.orden).toEqual({ campo: "saldo", descendente: true })
    expect(estado.pagina).toBe(2)
  })

  it("por defecto, lo más reciente primero", async () => {
    const estado = await estadoTablaFacturas.cargar(Promise.resolve({}))
    expect(estado.orden).toEqual({ campo: "creada", descendente: true })
    expect(estado.estado).toEqual([])
  })

  it("enlaza al listado filtrado", () => {
    expect(rutaFacturasFiltradas({ estado: ["VENCIDA"] })).toBe(
      "/finanzas/facturas?estado=VENCIDA"
    )
    expect(
      rutaFacturasFiltradas({
        anunciante: "0192f3a4-5b6c-7d8e-9f01-0000000000a1",
      })
    ).toBe("/finanzas/facturas?anunciante=0192f3a4-5b6c-7d8e-9f01-0000000000a1")
  })
})

describe("periodo de emisión", () => {
  it("exige las dos fechas y las ordena si llegan invertidas", () => {
    expect(periodoEmision({ desde: "2026-10-01", hasta: null })).toBeNull()
    expect(
      periodoEmision({ desde: "2026-10-31", hasta: "2026-10-01" })
    ).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" })
  })

  it("los atajos se calculan en Bogotá y se reconocen en la URL", () => {
    expect(extremosDePreset("esteMes", AHORA)).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-23",
    })
    expect(extremosDePreset("mesAnterior", AHORA)).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    })
    expect(atajoDePeriodo(null, AHORA)).toBe("todo")
    expect(
      atajoDePeriodo({ desde: "2026-09-01", hasta: "2026-09-30" }, AHORA)
    ).toBe("mesAnterior")
    expect(
      atajoDePeriodo({ desde: "2026-09-02", hasta: "2026-09-30" }, AHORA)
    ).toBeNull()
  })
})

describe("cartera", () => {
  it("un corte futuro o vacío es hoy", () => {
    expect(corteEfectivo(null, "2026-10-23")).toBe("2026-10-23")
    expect(corteEfectivo("2026-12-31", "2026-10-23")).toBe("2026-10-23")
    expect(corteEfectivo("2026-09-30", "2026-10-23")).toBe("2026-09-30")
  })

  it("enlaza a la cartera con o sin corte", () => {
    expect(rutaCartera()).toBe("/finanzas/cartera")
    expect(rutaCartera("2026-09-30")).toBe("/finanzas/cartera?corte=2026-09-30")
  })
})
