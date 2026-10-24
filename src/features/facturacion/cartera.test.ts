import { describe, expect, it } from "vitest"

import {
  type FacturaAlCorte,
  filaCartera,
  proporcionesTramos,
  saldoAlCorte,
  totalesCartera,
  vencidasAlCorte,
} from "./cartera"

describe("filas de reporte_cartera", () => {
  it("lleva cada tramo de edad a la clave de la operación y tolera textos", () => {
    expect(
      filaCartera({
        anunciante_id: "a1",
        anunciante: null,
        facturado: "10000000",
        pagado: 4_000_000,
        saldo: 6_000_000,
        saldo_0_30: 1_000_000,
        saldo_31_60: 2_000_000,
        saldo_61_90: 0,
        saldo_90_mas: "3000000",
        facturas_vencidas: 2,
      })
    ).toEqual({
      anuncianteId: "a1",
      anunciante: "Anunciante sin nombre",
      facturado: 10_000_000,
      pagado: 4_000_000,
      saldo: 6_000_000,
      porTramo: {
        "0_30": 1_000_000,
        "31_60": 2_000_000,
        "61_90": 0,
        "90_mas": 3_000_000,
      },
      facturasVencidas: 2,
    })
  })

  it("suma los totales, lo de más de 30 días y las proporciones de la barra", () => {
    const filas = [
      filaCartera({
        anunciante_id: "a1",
        anunciante: "Tienda La 14",
        facturado: 10_000_000,
        pagado: 4_000_000,
        saldo: 6_000_000,
        saldo_0_30: 1_000_000,
        saldo_31_60: 2_000_000,
        saldo_61_90: 0,
        saldo_90_mas: 3_000_000,
        facturas_vencidas: 2,
      }),
      filaCartera({
        anunciante_id: "a2",
        anunciante: "Éxito",
        facturado: 0.1,
        pagado: 0,
        saldo: 0.2,
        saldo_0_30: 0.2,
        saldo_31_60: 0,
        saldo_61_90: 0,
        saldo_90_mas: 0,
        facturas_vencidas: 0,
      }),
    ]
    const totales = totalesCartera(filas)
    expect(totales).toMatchObject({
      anunciantes: 2,
      facturado: 10_000_000.1,
      saldo: 6_000_000.2,
      masDe30: 5_000_000,
      facturasVencidas: 2,
    })
    expect(totales.porTramo["0_30"]).toBe(1_000_000.2)
    const proporciones = proporcionesTramos({
      saldo: 6_000_000,
      porTramo: filas[0].porTramo,
    })
    expect(proporciones["90_mas"]).toBe(0.5)
    expect(
      proporcionesTramos({ saldo: 0, porTramo: filas[0].porTramo })["90_mas"]
    ).toBe(0)
  })
})

function factura(cambios: Partial<FacturaAlCorte>): FacturaAlCorte {
  return {
    id: "f1",
    numero: "FE10",
    anuncianteId: "a1",
    anunciante: "Tienda La 14",
    total: 10_000_000,
    fechaEmision: "2026-08-01",
    fechaVencimiento: "2026-08-31",
    pagos: [],
    notas: [],
    ...cambios,
  }
}

describe("saldo al corte (misma regla que reporte_cartera)", () => {
  const conMovimientos = factura({
    pagos: [
      { fecha: "2026-09-10", monto: 3_840_000, retenciones: 160_000 },
      { fecha: "2026-10-05", monto: 1_000_000, retenciones: 0 },
    ],
    notas: [{ fecha: "2026-09-20", valor: 500_000 }],
  })

  it("descuenta los pagos con retenciones y las notas hasta el día de corte", () => {
    expect(saldoAlCorte(conMovimientos, "2026-09-09")).toBe(10_000_000)
    expect(saldoAlCorte(conMovimientos, "2026-09-10")).toBe(6_000_000)
    expect(saldoAlCorte(conMovimientos, "2026-09-30")).toBe(5_500_000)
    expect(saldoAlCorte(conMovimientos, "2026-10-23")).toBe(4_500_000)
  })

  it("no cuenta una factura emitida después del corte ni da saldos negativos", () => {
    expect(saldoAlCorte(conMovimientos, "2026-07-31")).toBe(0)
    expect(
      saldoAlCorte(
        factura({
          pagos: [{ fecha: "2026-08-02", monto: 11e6, retenciones: 0 }],
        }),
        "2026-09-01"
      )
    ).toBe(0)
  })
})

describe("vencidas al corte (LIQ-008 c3)", () => {
  it("lista las vencidas con saldo, de la más atrasada a la menos", () => {
    const vencidas = vencidasAlCorte(
      [
        factura({ id: "reciente", fechaVencimiento: "2026-10-13" }),
        factura({
          id: "antigua",
          fechaVencimiento: "2026-06-30",
          fechaEmision: "2026-06-01",
        }),
        factura({ id: "por-vencer", fechaVencimiento: "2026-10-23" }),
        factura({
          id: "pagada",
          pagos: [{ fecha: "2026-09-01", monto: 10_000_000, retenciones: 0 }],
        }),
        factura({ id: "sin-vencimiento", fechaVencimiento: null }),
      ],
      "2026-10-23"
    )
    expect(vencidas.map((v) => v.id)).toEqual(["antigua", "reciente"])
    expect(vencidas[0]).toMatchObject({ diasMora: 115, saldo: 10_000_000 })
    expect(vencidas[1].diasMora).toBe(10)
  })

  it("una pagada después del corte sí estaba vencida ese día", () => {
    const vencidas = vencidasAlCorte(
      [
        factura({
          pagos: [{ fecha: "2026-10-20", monto: 10_000_000, retenciones: 0 }],
        }),
      ],
      "2026-10-01"
    )
    expect(vencidas).toHaveLength(1)
    expect(vencidas[0].diasMora).toBe(31)
  })

  it("a igual mora, primero la de mayor saldo", () => {
    const vencidas = vencidasAlCorte(
      [factura({ id: "chica", total: 1_000 }), factura({ id: "grande" })],
      "2026-09-30"
    )
    expect(vencidas.map((v) => v.id)).toEqual(["grande", "chica"])
  })
})
