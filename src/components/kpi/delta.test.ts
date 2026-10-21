import { describe, expect, it } from "vitest"

import { presentarDelta } from "./delta"
import { formatearValorKpi, formatoCifraKpi } from "./formato-kpi"

const plano = (texto: string) => texto.replace(/[\u00a0\u202f]/g, " ")

describe("presentarDelta", () => {
  it("variación relativa con signo y tono según el sentido", () => {
    const sube = presentarDelta({
      valor: 125,
      valorAnterior: 100,
      variacion: 0.25,
      unidad: "conteo",
      sentido: "mayor",
    })
    expect(sube).toMatchObject({
      tipo: "relativo",
      tendencia: "sube",
      tono: "positivo",
    })
    expect(plano(sube.texto)).toBe("+25,0%")
    expect(plano(sube.descripcion)).toBe(
      "Subió 25,0% frente al periodo anterior (antes 100)."
    )
  })

  it("si lo deseable es bajar, subir es negativo (y bajar positivo)", () => {
    const base = {
      valorAnterior: 100,
      unidad: "COP" as const,
      sentido: "menor" as const,
    }
    expect(presentarDelta({ ...base, valor: 120, variacion: 0.2 }).tono).toBe(
      "negativo"
    )
    const baja = presentarDelta({ ...base, valor: 80, variacion: -0.2 })
    expect(baja.tono).toBe("positivo")
    expect(plano(baja.texto)).toBe("−20,0%")
  })

  it("un sentido neutro nunca colorea", () => {
    expect(
      presentarDelta({
        valor: 2,
        valorAnterior: 1,
        variacion: 1,
        unidad: "conteo",
        sentido: "neutro",
      }).tono
    ).toBe("neutro")
  })

  it("las tasas se comparan en puntos porcentuales", () => {
    const delta = presentarDelta({
      valor: 0.82,
      valorAnterior: 0.88,
      variacion: -0.068,
      unidad: "%",
      sentido: "mayor",
    })
    expect(delta).toMatchObject({
      tipo: "puntos",
      tendencia: "baja",
      tono: "negativo",
    })
    expect(delta.texto).toBe("−6,0 pp")
    expect(plano(delta.descripcion)).toBe(
      "Bajó 6,0 puntos porcentuales frente al periodo anterior (antes 88,0%)."
    )
  })

  it("una variación que redondea a cero se muestra estable", () => {
    const delta = presentarDelta({
      valor: 100.0001,
      valorAnterior: 100,
      variacion: 0.000001,
      unidad: "conteo",
      sentido: "mayor",
    })
    expect(delta).toMatchObject({ tendencia: "estable", tono: "neutro" })
    expect(plano(delta.texto)).toBe("0,0%")
    expect(delta.descripcion.startsWith("Se mantuvo")).toBe(true)
  })

  it("sin actividad anterior es «Nuevo»; sin nada que comparar, una raya", () => {
    expect(
      presentarDelta({
        valor: 5,
        valorAnterior: 0,
        variacion: null,
        unidad: "conteo",
        sentido: "mayor",
      })
    ).toMatchObject({ tipo: "nuevo", texto: "Nuevo", tono: "neutro" })
    expect(
      presentarDelta({
        valor: 5,
        valorAnterior: null,
        variacion: null,
        unidad: "conteo",
        sentido: "mayor",
      }).tipo
    ).toBe("nuevo")
    expect(
      presentarDelta({
        valor: 0,
        valorAnterior: 0,
        variacion: null,
        unidad: "conteo",
        sentido: "mayor",
      })
    ).toMatchObject({ tipo: "sin-comparativo", texto: "—" })
  })
})

describe("formato de la cifra del KPI", () => {
  it("compacta montos y cantidades grandes para que quepan en móvil", () => {
    expect(formatoCifraKpi("COP", 184_320_000).formato).toBe("copCompacto")
    expect(formatoCifraKpi("COP", 950_000).formato).toBe("cop")
    expect(formatoCifraKpi("personas", 250_000).formato).toBe("compacto")
    expect(formatoCifraKpi("conteo", 12_000).formato).toBe("numero")
    expect(formatoCifraKpi("h", 36.5)).toEqual({
      formato: "numero",
      decimales: 1,
      sufijo: " h",
    })
    expect(formatoCifraKpi("factor", 1.15)).toEqual({
      formato: "numero",
      decimales: 2,
      sufijo: " ×",
    })
  })

  it("la cifra completa no abrevia", () => {
    expect(plano(formatearValorKpi(184_320_000, "COP"))).toBe("$ 184.320.000")
    expect(formatearValorKpi(0.125, "%")).toBe("12,5%")
    expect(formatearValorKpi(36.5, "h")).toBe("36,5 horas")
    expect(formatearValorKpi(1.15, "factor")).toBe("1,15 ×")
    expect(formatearValorKpi(250_000, "personas")).toBe("250.000")
  })
})
