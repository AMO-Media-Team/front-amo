import { describe, expect, it } from "vitest"

import {
  ETIQUETAS_SEGMENTO_MEDIO,
  estadoTablaMedios,
  SEGMENTOS_MEDIO,
} from "./estado-tablas"

describe("estadoTablaMedios · señales", () => {
  it("los enlaces de otros módulos llegan con su señal (CFG-005)", () => {
    expect(estadoTablaMedios.cargar("?segmento=cerca_tope").segmento).toEqual([
      "cerca_tope",
    ])
    expect(estadoTablaMedios.cargar("?segmento=en_riesgo").segmento).toEqual([
      "en_riesgo",
    ])
  })

  it("admite las dos señales a la vez y descarta las desconocidas", () => {
    const estado = estadoTablaMedios.cargar(
      "?segmento=en_riesgo,cerca_tope,inventada"
    )
    expect(estado.segmento).toEqual(["en_riesgo", "cerca_tope"])
    expect(estadoTablaMedios.cargar("").segmento).toEqual([])
  })

  it("cada señal tiene su rótulo en español", () => {
    expect(SEGMENTOS_MEDIO.map((s) => ETIQUETAS_SEGMENTO_MEDIO[s])).toEqual([
      "En riesgo de abandono",
      "Cerca del tope anual",
    ])
  })
})
