import { describe, expect, it } from "vitest"

import { SLUGS_REPORTE } from "./catalogo"
import { datosEjemplo, datosFinanzasEjemplo, datosVacios } from "./fixtures"
import { paginaTablaReporte } from "./pagina-tabla"
import type { DatosReporte } from "./tipos"

const url = (parametros: Record<string, string> = {}) =>
  Promise.resolve(parametros)

const entrada = (slug: (typeof SLUGS_REPORTE)[number]) =>
  ({ reporte: slug, datos: datosEjemplo(slug) }) as DatosReporte

describe("paginaTablaReporte", () => {
  it.each(SLUGS_REPORTE)(
    "%s: sin parámetros entrega la primera página",
    async (slug) => {
      const pagina = await paginaTablaReporte(entrada(slug), url())
      expect(pagina.reporte).toBe(slug)
      expect(pagina.totalReporte).toBeGreaterThan(0)
      expect(pagina.total).toBe(pagina.totalReporte)
      expect(pagina.filas.length).toBe(Math.min(20, pagina.totalReporte))
    }
  )

  it.each(SLUGS_REPORTE)(
    "%s: sin datos, la tabla queda vacía (o en ceros)",
    async (slug) => {
      const pagina = await paginaTablaReporte(
        { reporte: slug, datos: datosVacios(slug) } as DatosReporte,
        url()
      )
      expect(pagina.total).toBe(pagina.totalReporte)
      expect(pagina.filas.length).toBeLessThanOrEqual(20)
    }
  )

  it("busca sin tildes en las columnas buscables", async () => {
    const pagina = await paginaTablaReporte(
      entrada("cumplimiento-medios"),
      url({ q: "rionegro" })
    )
    expect(pagina.reporte).toBe("cumplimiento-medios")
    expect(pagina.total).toBe(1)
    expect(pagina.totalReporte).toBeGreaterThan(1)
  })

  it("aplica las facetas y conserva todas sus opciones", async () => {
    const pagina = await paginaTablaReporte(
      entrada("cartera"),
      url({ mora: "critica" })
    )
    if (pagina.reporte !== "cartera") throw new Error("reporte inesperado")
    expect(pagina.filas.length).toBeGreaterThan(0)
    expect(pagina.filas.every((fila) => fila.saldoMas90 > 0)).toBe(true)
    // Las opciones salen de todas las filas, no solo de las filtradas.
    expect(pagina.opciones.mora.map((o) => o.valor)).toEqual([
      "al-dia",
      "vencida",
      "critica",
    ])
  })

  it("ordena por la lista blanca de la URL", async () => {
    const pagina = await paginaTablaReporte(
      entrada("cartera"),
      url({ orden: "anunciante.asc" })
    )
    if (pagina.reporte !== "cartera") throw new Error("reporte inesperado")
    const nombres = pagina.filas.map((fila) => fila.anunciante)
    expect(nombres).toEqual(
      [...nombres].sort((a, b) => a.localeCompare(b, "es"))
    )
  })

  it("un orden desconocido cae al orden por defecto del reporte", async () => {
    const pagina = await paginaTablaReporte(
      entrada("cartera"),
      url({ orden: "contrasena.desc" })
    )
    if (pagina.reporte !== "cartera") throw new Error("reporte inesperado")
    const saldos = pagina.filas.map((fila) => fila.saldo)
    expect(saldos).toEqual([...saldos].sort((a, b) => b - a))
  })

  it("pagina con el tamaño pedido y cae en la última página si se pasa", async () => {
    const todas = await paginaTablaReporte(
      entrada("cobertura-territorial"),
      url()
    )
    const segunda = await paginaTablaReporte(
      entrada("cobertura-territorial"),
      url({ pagina: "2" })
    )
    expect(todas.filas).toHaveLength(20)
    expect(segunda.filas).toHaveLength(todas.totalReporte - 20)

    const lejana = await paginaTablaReporte(
      entrada("cobertura-territorial"),
      url({ pagina: "99" })
    )
    expect(lejana.filas).toEqual(segunda.filas)
  })

  it("el resumen ejecutivo lista los 16 indicadores en el orden del tablero", async () => {
    const pagina = await paginaTablaReporte(entrada("resumen-ejecutivo"), url())
    if (pagina.reporte !== "resumen-ejecutivo")
      throw new Error("reporte inesperado")
    expect(pagina.totalReporte).toBe(16)
    expect(pagina.filas.map((fila) => fila.orden)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1)
    )

    const dinero = await paginaTablaReporte(
      entrada("resumen-ejecutivo"),
      url({ area: "dinero" })
    )
    expect(dinero.total).toBe(5)
  })

  it("finanzas entrega la agrupación y ordena los meses por calendario", async () => {
    const pagina = await paginaTablaReporte(
      { reporte: "finanzas", datos: datosFinanzasEjemplo("mes") },
      url({ orden: "grupo.asc" })
    )
    if (pagina.reporte !== "finanzas") throw new Error("reporte inesperado")
    expect(pagina.agrupacion).toBe("mes")
    expect(pagina.filas.map((fila) => fila.id)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ])
  })

  it("los filtros del reporte no se confunden con las facetas de la tabla", async () => {
    // `departamento` es un filtro del reporte; la faceta de la tabla es `zona`.
    const pagina = await paginaTablaReporte(
      entrada("cumplimiento-medios"),
      url({ departamento: "05", zona: "Antioquia" })
    )
    if (pagina.reporte !== "cumplimiento-medios")
      throw new Error("reporte inesperado")
    expect(pagina.filas.length).toBeGreaterThan(0)
    expect(
      pagina.filas.every((fila) => fila.departamento === "Antioquia")
    ).toBe(true)
  })
})
