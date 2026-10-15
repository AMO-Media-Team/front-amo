import { describe, expect, it } from "vitest"

import type { ResolucionDian } from "./tipos"
import {
  alertasResolucion,
  consumoResolucion,
  coincideReteica,
  estadoFilaTributaria,
  ordenarPorVigencia,
  ordenarReteica,
} from "./tributario"

const AHORA = new Date("2026-10-05T15:00:00Z")

function resolucion(cambios: Partial<ResolucionDian> = {}): ResolucionDian {
  return {
    id: "r1",
    tipo: "FACTURA_VENTA",
    prefijo: "AMO",
    numeroResolucion: "18760000001",
    fechaResolucion: "2026-01-10",
    rangoDesde: 1,
    rangoHasta: 1000,
    consecutivoActual: 0,
    vigenteDesde: "2026-01-10",
    vigenteHasta: "2027-01-10",
    activa: true,
    actualizadoAt: "2026-01-10T00:00:00Z",
    ...cambios,
  }
}

describe("consumoResolucion", () => {
  it("una resolución sin usar tiene todo el rango disponible", () => {
    expect(consumoResolucion(resolucion())).toEqual({
      total: 1000,
      usados: 0,
      disponibles: 1000,
      fraccion: 0,
      siguiente: "AMO1",
    })
  })

  it("cuenta los números emitidos desde el inicio del rango", () => {
    const consumo = consumoResolucion(
      resolucion({
        rangoDesde: 501,
        rangoHasta: 1000,
        consecutivoActual: 900,
        prefijo: "",
      })
    )
    expect(consumo).toMatchObject({
      total: 500,
      usados: 400,
      disponibles: 100,
      siguiente: "901",
    })
    expect(consumo.fraccion).toBeCloseTo(0.8)
  })

  it("agotada, no ofrece siguiente número", () => {
    expect(
      consumoResolucion(resolucion({ consecutivoActual: 1000 }))
    ).toMatchObject({
      disponibles: 0,
      fraccion: 1,
      siguiente: null,
    })
  })
})

describe("alertasResolucion", () => {
  it("sin problemas no hay alertas", () => {
    expect(
      alertasResolucion(resolucion({ consecutivoActual: 100 }), AHORA)
    ).toEqual([])
  })

  it("avisa cuando el rango se acaba", () => {
    expect(
      alertasResolucion(resolucion({ consecutivoActual: 900 }), AHORA)
    ).toEqual(["casi-agotada"])
    expect(
      alertasResolucion(resolucion({ consecutivoActual: 1000 }), AHORA)
    ).toEqual(["agotada"])
  })

  it("avisa cuando la vigencia vence pronto o ya venció (día de Bogotá inclusive)", () => {
    expect(
      alertasResolucion(resolucion({ vigenteHasta: "2026-10-20" }), AHORA)
    ).toEqual(["por-vencer"])
    expect(
      alertasResolucion(resolucion({ vigenteHasta: "2026-10-05" }), AHORA)
    ).toEqual(["por-vencer"])
    expect(
      alertasResolucion(resolucion({ vigenteHasta: "2026-10-04" }), AHORA)
    ).toEqual(["vencida"])
    expect(
      alertasResolucion(resolucion({ vigenteHasta: null }), AHORA)
    ).toEqual([])
  })

  it("puede acumular alertas de rango y de vigencia", () => {
    expect(
      alertasResolucion(
        resolucion({ consecutivoActual: 1000, vigenteHasta: "2026-01-31" }),
        AHORA
      )
    ).toEqual(["agotada", "vencida"])
  })
})

describe("vigencia por días", () => {
  const filas = [
    {
      id: "finalizada",
      vigenteDesde: "2025-01-01",
      vigenteHasta: "2026-01-01",
    },
    { id: "programada", vigenteDesde: "2027-01-01", vigenteHasta: null },
    { id: "vigente", vigenteDesde: "2026-01-01", vigenteHasta: "2027-01-01" },
    {
      id: "finalizada-vieja",
      vigenteDesde: "2024-01-01",
      vigenteHasta: "2025-01-01",
    },
  ]

  it("el estado respeta el fin exclusivo de la columna", () => {
    expect(filas.map((f) => estadoFilaTributaria(f, AHORA))).toEqual([
      "FINALIZADA",
      "PROGRAMADA",
      "VIGENTE",
      "FINALIZADA",
    ])
  })

  it("ordena vigentes, programadas y finalizadas (las más recientes antes)", () => {
    expect(ordenarPorVigencia(filas, AHORA).map((f) => f.id)).toEqual([
      "vigente",
      "programada",
      "finalizada",
      "finalizada-vieja",
    ])
    // No modifica la lista original.
    expect(filas[0].id).toBe("finalizada")
  })
})

describe("lista de ReteICA municipal", () => {
  const fila = (
    municipioNombre: string,
    vigenteDesde: string,
    vigenteHasta: string | null = null
  ) => ({ municipioNombre, vigenteDesde, vigenteHasta })

  it("ordena por estado y, dentro de cada uno, por nombre del municipio", () => {
    const filas = [
      fila("Zipaquirá", "2025-01-01"),
      fila("Ábrego", "2025-01-01"),
      fila("Medellín", "2024-01-01", "2025-01-01"),
      fila("Bogotá, D.C.", "2027-01-01"),
      fila("Cali", "2025-01-01"),
    ]
    expect(ordenarReteica(filas, AHORA).map((f) => f.municipioNombre)).toEqual([
      // Vigentes, alfabético en español (la tilde no manda al final).
      "Ábrego",
      "Cali",
      "Zipaquirá",
      // Programada y finalizada después.
      "Bogotá, D.C.",
      "Medellín",
    ])
    expect(filas[0].municipioNombre).toBe("Zipaquirá")
  })

  it("de un mismo municipio va primero la vigencia más reciente", () => {
    const filas = [
      fila("Cali", "2023-01-01", "2024-01-01"),
      fila("Cali", "2024-01-01", "2025-01-01"),
    ]
    expect(ordenarReteica(filas, AHORA).map((f) => f.vigenteDesde)).toEqual([
      "2024-01-01",
      "2023-01-01",
    ])
  })

  it("busca por municipio, departamento o código DIVIPOLA", () => {
    const normalizar = (texto: string) =>
      texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    const bogota = {
      municipioNombre: "Bogotá, D.C.",
      departamentoNombre: "Bogotá",
      municipioCodigo: "11001",
    }
    const sinDepartamento = {
      municipioNombre: "99999",
      departamentoNombre: null,
      municipioCodigo: "99999",
    }
    expect(coincideReteica(bogota, "", normalizar)).toBe(true)
    expect(coincideReteica(bogota, "bogota", normalizar)).toBe(true)
    expect(coincideReteica(bogota, "110", normalizar)).toBe(true)
    expect(coincideReteica(bogota, "cali", normalizar)).toBe(false)
    expect(coincideReteica(sinDepartamento, "999", normalizar)).toBe(true)
    expect(coincideReteica(sinDepartamento, "narino", normalizar)).toBe(false)
  })
})
