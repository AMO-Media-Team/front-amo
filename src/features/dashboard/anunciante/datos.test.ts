import { describe, expect, it } from "vitest"

import {
  desempenoPorPlataforma,
  estaVencida,
  etiquetaMunicipio,
  type FacturaPendiente,
  FACTURAS_VISIBLES,
  type FilaDesempeno,
  inversionPorDepartamento,
  MINIMO_COMPARABLES,
  rankingMedios,
  resumenCartera,
  serieDesempeno,
} from "./datos"

const fila = (
  clave: string,
  parcial: Partial<FilaDesempeno> = {}
): FilaDesempeno => ({
  clave,
  nombre: clave,
  asignaciones: 1,
  gmv: 0,
  alcance: 0,
  impresiones: 0,
  interacciones: 0,
  reproducciones: 0,
  clics: 0,
  cpm: null,
  costoInteraccion: null,
  engagement: null,
  costoAlcance: null,
  n: 0,
  ...parcial,
})

describe("serieDesempeno", () => {
  it("completa con ceros los días sin negocios verificados", () => {
    const serie = serieDesempeno(
      [fila("2026-09-03", { gmv: 500, alcance: 20 })],
      "2026-09-01",
      "2026-09-03"
    )
    expect(serie).toEqual({
      granularidad: "dia",
      etiquetas: ["1 sept", "2 sept", "3 sept"],
      inversion: [0, 0, 500],
      alcance: [0, 0, 20],
    })
  })

  it("con más de 31 días agrupa por semana ISO, como `private.cubeta`", () => {
    const serie = serieDesempeno(
      [fila("2026-09-07", { gmv: 100 })],
      "2026-09-01",
      "2026-10-10"
    )
    expect(serie.granularidad).toBe("semana")
    expect(serie.etiquetas[0]).toBe("Sem. 31 ago")
    expect(serie.inversion).toEqual([0, 100, 0, 0, 0, 0])
  })
})

describe("desempenoPorPlataforma", () => {
  it("orden fijo de plataformas, nombre comercial y sin claves ajenas", () => {
    const plataformas = desempenoPorPlataforma([
      fila("TIKTOK", { gmv: 3 }),
      fila("FACEBOOK", { gmv: 1 }),
      fila("OTRA", { gmv: 9 }),
    ])
    expect(plataformas.map((p) => [p.plataforma, p.nombre])).toEqual([
      ["FACEBOOK", "Facebook"],
      ["TIKTOK", "TikTok"],
    ])
  })
})

describe("rankingMedios", () => {
  const conMuestra = (clave: string, engagement: number, alcance = 100) =>
    fila(clave, { n: 5, engagement, alcance })

  it("ordena por engagement si hay suficientes medios comparables", () => {
    const ranking = rankingMedios(
      [
        conMuestra("a", 0.02),
        conMuestra("b", 0.08),
        conMuestra("c", 0.05),
        fila("d", { n: 1, engagement: 0.9, alcance: 50 }),
      ],
      3
    )
    expect(ranking.criterio).toBe("engagement")
    expect(ranking.filas.map((f) => f.clave)).toEqual(["b", "c", "a"])
  })

  it("con pocos comparables ordena por alcance (una suma no exige muestra)", () => {
    const ranking = rankingMedios(
      [
        conMuestra("a", 0.02, 10),
        fila("b", { n: 1, engagement: 0.5, alcance: 900 }),
        fila("c", { alcance: 0 }),
      ],
      3
    )
    expect(MINIMO_COMPARABLES).toBe(3)
    expect(ranking.criterio).toBe("alcance")
    expect(ranking.filas.map((f) => f.clave)).toEqual(["b", "a"])
  })
})

describe("inversionPorDepartamento", () => {
  it("solo códigos DANE de departamento con inversión", () => {
    expect(
      inversionPorDepartamento([
        fila("05", { gmv: 10 }),
        fila("11", { gmv: 0 }),
        fila("05001", { gmv: 7 }),
      ])
    ).toEqual({ "05": 10 })
  })
})

describe("etiquetaMunicipio", () => {
  it("no repite el departamento del distrito capital", () => {
    expect(etiquetaMunicipio("Bogotá, D.C., Bogotá")).toBe("Bogotá, D.C.")
  })

  it("respeta los municipios homónimos de su departamento", () => {
    expect(etiquetaMunicipio("Boyacá, Boyacá")).toBe("Boyacá, Boyacá")
    expect(etiquetaMunicipio("Medellín, Antioquia")).toBe("Medellín, Antioquia")
    expect(etiquetaMunicipio("Santa Fé de Antioquia, Antioquia")).toBe(
      "Santa Fé de Antioquia, Antioquia"
    )
  })
})

describe("cartera", () => {
  const factura = (
    id: string,
    parcial: Partial<FacturaPendiente> = {}
  ): FacturaPendiente => ({
    id,
    numero: `FE${id}`,
    total: 100,
    saldo: 100,
    estado: "EMITIDA",
    fechaVencimiento: null,
    ...parcial,
  })
  const HOY = "2026-10-01"

  it("vencida si así está marcada o si su fecha ya pasó", () => {
    expect(estaVencida(factura("1", { estado: "VENCIDA" }), HOY)).toBe(true)
    expect(
      estaVencida(factura("2", { fechaVencimiento: "2026-09-30" }), HOY)
    ).toBe(true)
    expect(estaVencida(factura("3", { fechaVencimiento: HOY }), HOY)).toBe(
      false
    )
    expect(estaVencida(factura("4"), HOY)).toBe(false)
  })

  it("suma saldos, separa lo vencido y lista primero lo vencido y lo más próximo", () => {
    const cartera = resumenCartera(
      [
        factura("a", { saldo: 50, fechaVencimiento: "2026-10-20" }),
        factura("b", { saldo: 0 }),
        factura("c", { saldo: 30, fechaVencimiento: "2026-10-05" }),
        factura("d", {
          saldo: 20,
          estado: "VENCIDA",
          fechaVencimiento: "2026-09-01",
        }),
        factura("e", { saldo: 10 }),
      ],
      HOY
    )
    expect(cartera.saldo).toBe(110)
    expect(cartera.vencido).toBe(20)
    expect(cartera.facturasVencidas).toBe(1)
    expect(cartera.facturas.map((f) => f.id)).toEqual(["d", "c", "a", "e"])
  })

  it(`muestra como máximo ${FACTURAS_VISIBLES} facturas`, () => {
    const muchas = Array.from({ length: 9 }, (_, i) => factura(String(i)))
    expect(resumenCartera(muchas, HOY).facturas).toHaveLength(FACTURAS_VISIBLES)
  })
})
