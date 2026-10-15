import { describe, expect, it } from "vitest"

import {
  describirCalorVacio,
  describirPuntosCalor,
  etiquetaCubeta,
  formatearValorGeo,
  unidadGeo,
} from "./formato"

const sinEspacios = (texto: string) => texto.replace(/\s/g, " ")

describe("formato de cifras del mapa", () => {
  it("distingue sin datos de cero", () => {
    expect(formatearValorGeo(null, "medios")).toBe("Sin datos")
    expect(formatearValorGeo(Number.NaN, "medios")).toBe("Sin datos")
    expect(formatearValorGeo(0, "medios")).toBe("0")
  })

  it("formatea por unidad (COP, porcentaje, conteos)", () => {
    expect(sinEspacios(formatearValorGeo(1_234_567, "gmv"))).toBe("$ 1.234.567")
    expect(formatearValorGeo(0.8123, "cumplimiento")).toMatch(/^81,2\s?%$/)
    expect(formatearValorGeo(12_345, "medios")).toBe("12.345")
  })

  it("el modo compacto abrevia cifras grandes", () => {
    expect(formatearValorGeo(12_345, "alcance", { compacto: true })).not.toBe(
      "12.345"
    )
    expect(formatearValorGeo(950, "alcance", { compacto: true })).toBe("950")
  })

  it("las tasas por 100 mil habitantes conservan decimales útiles y la moneda", () => {
    expect(formatearValorGeo(3.456, "medios", { por100k: true })).toBe("3,46")
    expect(formatearValorGeo(45.66, "medios", { por100k: true })).toBe("45,7")
    expect(
      sinEspacios(formatearValorGeo(2_612_164, "gmv", { por100k: true }))
    ).toBe("$ 2.612.164")
  })

  it("rotula la unidad sin repetir la métrica", () => {
    expect(unidadGeo("medios")).toBe("medios")
    expect(unidadGeo("gmv")).toBe("")
    expect(unidadGeo("medios", true)).toBe("por 100 mil hab.")
  })
})

describe("modo calor sin puntos", () => {
  it("explica el vacío con el vocabulario de la métrica", () => {
    expect(describirCalorVacio("accesos")).toMatch(
      /Ningún ingreso .* coordenadas/
    )
    expect(describirCalorVacio("medios")).toMatch(/medios verificados/)
  })
})

describe("nota del modo calor", () => {
  const base = {
    consulta: {
      nivel: "nacional",
      metrica: "accesos",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      departamento: null,
    },
    puntos: [],
    origen: "base-de-datos",
  } as const

  it("accesos: total, tamaño de la celda y aviso de muestra", () => {
    expect(
      sinEspacios(
        describirPuntosCalor({
          ...base,
          total: 1234,
          muestra: 1234,
          pasoGrados: 0.05,
        })
      )
    ).toBe("1.234 ingresos con ubicación · celdas de ≈ 6 km")
    expect(
      sinEspacios(
        describirPuntosCalor({
          ...base,
          total: 24_000,
          muestra: 12_000,
          pasoGrados: 0.01,
        })
      )
    ).toBe(
      "24.000 ingresos con ubicación · celdas de ≈ 1 km · muestra de 12.000"
    )
  })

  it("medios: en la cabecera de su municipio", () => {
    expect(
      describirPuntosCalor({
        ...base,
        consulta: { ...base.consulta, metrica: "medios" },
        total: 1,
        muestra: 1,
        pasoGrados: 0.01,
      })
    ).toBe("1 medio · en la cabecera de su municipio")
  })
})

describe("rótulos de la serie de una zona", () => {
  const limpio = (texto: string) => texto.replace(/\s/g, " ").replace(/\.$/, "")

  it("día, semana y mes en español (hora de Bogotá)", () => {
    expect(
      limpio(
        etiquetaCubeta({ desde: "2026-09-24", hasta: "2026-09-24" }, "dia")
      )
    ).toMatch(/^jue/)
    expect(
      limpio(
        etiquetaCubeta({ desde: "2026-09-07", hasta: "2026-09-13" }, "semana")
      )
    ).toBe("7 a 13 de sept")
    expect(
      limpio(
        etiquetaCubeta({ desde: "2026-02-01", hasta: "2026-02-28" }, "mes")
      )
    ).toMatch(/^feb.* 2026$/)
  })
})
