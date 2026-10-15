import { describe, expect, it } from "vitest"

import { REPORTES, SLUGS_REPORTE } from "./catalogo"
import { contenidoReporte } from "./definiciones"
import { datosEjemplo, datosVacios } from "./fixtures"
import type { DatosReporte } from "./tipos"
import {
  avisoSinMovimiento,
  comparacionBreve,
  rejillaIndicadores,
  sinMovimiento,
  textoSinDatosIndicador,
  textoSinMovimiento,
} from "./vista"

describe("sinMovimiento", () => {
  it.each(SLUGS_REPORTE)("%s: con actividad no está vacío", (slug) => {
    const { vista } = contenidoReporte({
      reporte: slug,
      datos: datosEjemplo(slug),
    } as DatosReporte)
    expect(sinMovimiento(vista)).toBe(false)
  })

  it.each(SLUGS_REPORTE)(
    "%s: sin un solo movimiento se dice una vez",
    (slug) => {
      const { vista } = contenidoReporte({
        reporte: slug,
        datos: datosVacios(slug),
      } as DatosReporte)
      expect(sinMovimiento(vista)).toBe(true)
    }
  )

  it("un indicador distinto de cero basta para no declararlo vacío", () => {
    const { vista } = contenidoReporte({
      reporte: "cartera",
      datos: datosVacios("cartera"),
    })
    const conSaldo = vista.indicadores.map((ind, i) =>
      i === 0 ? { ...ind, valor: 1 } : ind
    )
    expect(sinMovimiento({ ...vista, indicadores: conSaldo })).toBe(false)
  })
})

describe("avisoSinMovimiento", () => {
  it("con periodo sugiere ampliarlo, salvo que ya sea el año", () => {
    const mes = avisoSinMovimiento(REPORTES.finanzas, "ultimos30")
    expect(mes.ampliarPeriodo).toBe(true)
    expect(mes.descripcion).toContain("periodo más amplio")

    const ano = avisoSinMovimiento(REPORTES.finanzas, "esteAno")
    expect(ano.ampliarPeriodo).toBe(false)
    expect(ano.descripcion).not.toContain("periodo más amplio")
    expect(ano.titulo).toBe(mes.titulo)
  })

  it("la cartera habla de saldos y de la fecha de corte", () => {
    const aviso = avisoSinMovimiento(REPORTES.cartera, "ultimos30")
    expect(aviso.ampliarPeriodo).toBe(false)
    expect(aviso.titulo).toContain("saldos por cobrar")
    expect(aviso.descripcion).toContain("otra fecha de corte")
  })

  it("los documentos usan el mismo texto, sin la sugerencia de la página", () => {
    const texto = textoSinMovimiento(REPORTES.finanzas)
    const aviso = avisoSinMovimiento(REPORTES.finanzas, "ultimos30")
    expect(aviso.descripcion.startsWith(texto.descripcion)).toBe(true)
    expect(texto.descripcion).not.toContain("Prueba")
    expect(textoSinMovimiento(REPORTES.cartera).descripcion).not.toContain(
      "Puedes elegir"
    )
  })
})

describe("comparacionBreve", () => {
  it("quita las fechas entre paréntesis (ya están en el resumen de filtros)", () => {
    expect(comparacionBreve("frente al mes anterior (1–31 ago 2026)")).toBe(
      "frente al mes anterior"
    )
    expect(
      comparacionBreve("frente al corte anterior (31 de agosto de 2026)")
    ).toBe("frente al corte anterior")
    expect(comparacionBreve("frente a ayer")).toBe("frente a ayer")
    expect(comparacionBreve(null)).toBeNull()
  })
})

describe("textoSinDatosIndicador", () => {
  it("un reporte a fecha de corte no habla de «periodo»", () => {
    expect(textoSinDatosIndicador(REPORTES.cartera)).toBe(
      "Sin datos a la fecha de corte"
    )
    expect(textoSinDatosIndicador(REPORTES.finanzas)).toBe(
      "Sin datos en el periodo"
    )
  })
})

describe("rejillaIndicadores", () => {
  it("seis tarjetas van de tres en tres, sin clases propias", () => {
    expect(rejillaIndicadores(6)).toEqual({ columnas: 3 })
  })

  it("ocho tarjetas solo van en cuatro columnas desde `xl`: antes, de dos en dos", () => {
    const { columnas, className } = rejillaIndicadores(8)
    expect(columnas).toBe(4)
    const clases = className?.split(" ") ?? []
    // Tableta y portátil con la barra lateral abierta: cuatro columnas recortan los títulos.
    expect(clases).toContain("md:grid-cols-2")
    expect(clases).toContain("lg:grid-cols-2")
    expect(clases).toContain("xl:grid-cols-4")
    expect(clases).not.toContain("md:grid-cols-4")
  })

  it.each(SLUGS_REPORTE)(
    "%s: el esqueleto reserva la misma rejilla que las tarjetas reales",
    (slug) => {
      const { vista } = contenidoReporte({
        reporte: slug,
        datos: datosEjemplo(slug),
      } as DatosReporte)
      expect(rejillaIndicadores(vista.indicadores.length)).toEqual(
        rejillaIndicadores(REPORTES[slug].indicadores)
      )
    }
  )
})
