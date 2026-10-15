import { describe, expect, it } from "vitest"

import {
  filaKpi,
  filasKpi,
  type FilaKpiRpc,
  hayActividad,
  indicePorKpi,
  valorKpi,
} from "./kpi"

/** PostgREST puede entregar `numeric` como texto: la fila lo simula. */
const filaRpc = (parcial: Record<string, unknown>): FilaKpiRpc =>
  ({
    kpi: "gmv_verificado",
    valor: null,
    valor_anterior: null,
    variacion: null,
    n: null,
    unidad: "COP",
    serie: null,
    n_anterior: null,
    ...parcial,
  }) as FilaKpiRpc

describe("filaKpi", () => {
  it("convierte los numéricos en texto y redondea los conteos", () => {
    expect(
      filaKpi(
        filaRpc({
          valor: "1500000.50",
          valor_anterior: "1000000",
          variacion: "0.5",
          n: "12.0",
          n_anterior: 9,
          serie: ["1", null, 2],
        })
      )
    ).toEqual({
      kpi: "gmv_verificado",
      valor: 1_500_000.5,
      valor_anterior: 1_000_000,
      variacion: 0.5,
      n: 12,
      n_anterior: 9,
      unidad: "COP",
      serie: [1, null, 2],
    })
  })

  it("sin unidad, cuenta; sin serie, `null` (KPI «foto»)", () => {
    const fila = filaKpi(filaRpc({ unidad: null }))
    expect(fila.unidad).toBe("conteo")
    expect(fila.serie).toBeNull()
  })

  it("descarta las filas sin clave y tolera una respuesta nula", () => {
    expect(filasKpi(null)).toEqual([])
    expect(filasKpi([filaRpc({ kpi: null }), filaRpc({})])).toHaveLength(1)
  })
})

describe("índice y actividad", () => {
  const filas = filasKpi([
    filaRpc({ kpi: "gmv_verificado", valor: 0, n: 0 }),
    filaRpc({ kpi: "negocios_cerrados", valor: 0, n: 3 }),
    filaRpc({ kpi: "tasa_llenado", valor: null, n: 2 }),
  ])

  it("busca cada KPI por su clave", () => {
    const indice = indicePorKpi(filas)
    expect(valorKpi(indice, "gmv_verificado")).toBe(0)
    expect(valorKpi(indice, "tasa_llenado")).toBeNull()
    expect(valorKpi(indice, "no_existe")).toBeNull()
  })

  it("distingue «sin hechos» de «cero con muestra»", () => {
    expect(hayActividad(filas, ["gmv_verificado"])).toBe(false)
    expect(hayActividad(filas, ["negocios_cerrados"])).toBe(true)
    expect(hayActividad(filas, ["tasa_llenado"])).toBe(true)
  })
})
