import { describe, expect, it } from "vitest"

import {
  CLAVES_CONFIGURACION,
  CONFIGURACION_POR_DEFECTO,
  configuracionDesdeFilas,
  cortesConfig,
} from "./configuracion"

describe("configuración pública del asistente", () => {
  it("lee las claves públicas (valores como los guarda la BD)", () => {
    expect(
      configuracionDesdeFilas([
        { clave: "ofertas.anticipacion_minima_horas", valor: 0 },
        { clave: "ofertas.minimo_medios", valor: 2 },
        { clave: "ofertas.estimador_n_minimo", valor: "3" },
        { clave: "campanas.tope_porcentaje_por_medio", valor: 0.2 },
        { clave: "precios.recargo_exclusividad", valor: 1.3 },
        { clave: "metricas.cortes_requeridos", valor: ["H24"] },
        { clave: "medios.umbral_seguidores", valor: 30000 },
        { clave: "archivos.max_creativo_mb", valor: 25 },
      ])
    ).toEqual({
      anticipacionHoras: 0,
      minimoMedios: 2,
      estimadorMinimo: 3,
      topePorcentaje: 0.2,
      recargoExclusividad: 1.3,
      cortesPorDefecto: ["H24"],
      umbralSeguidores: 30_000,
      maximoCreativoMb: 25,
    })
  })

  it("sin filas o con valores ilegibles usa los de la migración", () => {
    expect(configuracionDesdeFilas([])).toEqual(CONFIGURACION_POR_DEFECTO)
    // `ofertas.estimador_n_minimo` nace en 5 (con 3, la mediana es el precio de un medio).
    expect(CONFIGURACION_POR_DEFECTO.estimadorMinimo).toBe(5)
    expect(
      configuracionDesdeFilas([
        { clave: "ofertas.anticipacion_minima_horas", valor: "mucho" },
        { clave: "campanas.tope_porcentaje_por_medio", valor: -1 },
      ])
    ).toMatchObject({ anticipacionHoras: 24, topePorcentaje: 0.15 })
  })

  it("los cortes por defecto quedan en orden y sin el personalizado", () => {
    expect(cortesConfig(["D7", "PERSONALIZADO", "H24"], ["H72"])).toEqual([
      "H24",
      "D7",
    ])
    expect(cortesConfig("H24", ["H72"])).toEqual(["H72"])
  })

  it("pide todas las claves que usa", () => {
    expect(CLAVES_CONFIGURACION).toHaveLength(8)
  })
})
