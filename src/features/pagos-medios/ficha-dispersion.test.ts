import { describe, expect, it } from "vitest"

import {
  avanceDispersion,
  paginaLiquidacionesDispersion,
} from "./ficha-dispersion"
import type { DispersionFila, LiquidacionDeDispersion } from "./tipos"

function liquidacion(
  id: string,
  cambios: Partial<LiquidacionDeDispersion> = {}
): LiquidacionDeDispersion {
  return {
    id,
    medio: `Medio ${id}`,
    periodoInicio: "2026-10-01",
    periodoFin: "2026-10-15",
    montoNeto: 100,
    estado: "APROBADA",
    fechaPago: null,
    referenciaPago: null,
    documentoListo: true,
    fechaMinimaPago: "2026-10-16",
    ...cambios,
  }
}

const DISPERSION: DispersionFila = {
  id: "disp",
  creadaAt: "2026-10-18T17:14:34Z",
  cantidad: 5,
  montoTotal: 500,
  generadaPor: "Finanzas E2E",
  esDemo: false,
}

const LIQUIDACIONES = [
  liquidacion("a", { medio: "Zeta Radio", estado: "PAGADA", montoNeto: 120.5 }),
  liquidacion("b", { medio: "Álamo Estéreo", montoNeto: 80 }),
  liquidacion("c", { medio: "Beta TV", estado: "ANULADA" }),
  liquidacion("d", { medio: "Radio Ñuñoa", montoNeto: 300 }),
]

describe("avanceDispersion", () => {
  it("cuenta pagadas, por registrar, anuladas y las que pasaron a otro archivo", () => {
    expect(
      avanceDispersion({ dispersion: DISPERSION, liquidaciones: LIQUIDACIONES })
    ).toEqual({
      pagadas: 1,
      porPagar: 2,
      anuladas: 1,
      enOtroArchivo: 1,
      montoPagado: 120.5,
      montoPorPagar: 380,
    })
  })
})

describe("paginaLiquidacionesDispersion", () => {
  const base = {
    q: "",
    estado: [] as ("APROBADA" | "PAGADA" | "ANULADA")[],
    orden: { campo: "estado" as const, descendente: false },
    pagina: 1,
    tamano: 20 as const,
  }

  it("por omisión, primero las que faltan por pagar (y por medio)", () => {
    expect(
      paginaLiquidacionesDispersion(LIQUIDACIONES, base).filas.map((f) => f.id)
    ).toEqual(["b", "d", "a", "c"])
  })

  it("busca por medio sin tildes y filtra por estado", () => {
    expect(
      paginaLiquidacionesDispersion(LIQUIDACIONES, { ...base, q: "nunoa" })
    ).toMatchObject({ total: 1, filas: [{ id: "d" }] })
    expect(
      paginaLiquidacionesDispersion(LIQUIDACIONES, {
        ...base,
        estado: ["PAGADA", "ANULADA"],
      }).filas.map((f) => f.id)
    ).toEqual(["a", "c"])
  })

  it("ordena por neto o medio y pagina", () => {
    expect(
      paginaLiquidacionesDispersion(LIQUIDACIONES, {
        ...base,
        orden: { campo: "neto", descendente: true },
      }).filas.map((f) => f.id)
    ).toEqual(["d", "a", "c", "b"])
    const pagina = paginaLiquidacionesDispersion(LIQUIDACIONES, {
      ...base,
      orden: { campo: "medio", descendente: false },
      tamano: 10,
      pagina: 4,
    })
    expect(pagina.total).toBe(4)
    expect(pagina.filas.map((f) => f.id)).toEqual(["b", "c", "d", "a"])
  })
})
