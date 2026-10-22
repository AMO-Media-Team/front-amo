import { describe, expect, it } from "vitest"

import {
  cambiosMedio,
  type ColumnasEditablesMedio,
  columnasMedio,
  escrituraConVersion,
  hayCambiosMedio,
} from "./edicion"

const ACTUAL: ColumnasEditablesMedio = {
  nombre: "Noticias del Sur",
  tipo: "PAGINA_NOTICIAS",
  municipio_codigo: "52001",
  descripcion_audiencia: null,
}

describe("columnasMedio", () => {
  it("traduce el formulario validado a columnas de la tabla", () => {
    expect(
      columnasMedio({
        nombre: "Radio Pasto",
        tipo: "EMISORA",
        municipioCodigo: "52001",
        descripcionAudiencia: "Adultos de Pasto",
      })
    ).toEqual({
      nombre: "Radio Pasto",
      tipo: "EMISORA",
      municipio_codigo: "52001",
      descripcion_audiencia: "Adultos de Pasto",
    })
  })
})

describe("cambiosMedio", () => {
  it("sin cambios no escribe nada", () => {
    const cambios = cambiosMedio(ACTUAL, { ...ACTUAL })
    expect(cambios).toEqual({})
    expect(hayCambiosMedio(cambios)).toBe(false)
  })

  it("solo incluye las columnas que cambiaron", () => {
    const cambios = cambiosMedio(ACTUAL, {
      ...ACTUAL,
      tipo: "CREADOR",
      descripcion_audiencia: "Jóvenes de Nariño",
    })
    expect(cambios).toEqual({
      tipo: "CREADOR",
      descripcion_audiencia: "Jóvenes de Nariño",
    })
    expect(hayCambiosMedio(cambios)).toBe(true)
  })

  it("borrar la descripción es un cambio (a null)", () => {
    expect(
      cambiosMedio(
        { ...ACTUAL, descripcion_audiencia: "Algo" },
        { ...ACTUAL, descripcion_audiencia: null }
      )
    ).toEqual({ descripcion_audiencia: null })
  })

  it("detecta el cambio de nombre y de municipio", () => {
    expect(
      cambiosMedio(ACTUAL, {
        ...ACTUAL,
        nombre: "Noticias del Sur TV",
        municipio_codigo: "52835",
      })
    ).toEqual({ nombre: "Noticias del Sur TV", municipio_codigo: "52835" })
  })
})

describe("escrituraConVersion", () => {
  it("con columnas cambiadas escribe solo esas", () => {
    expect(escrituraConVersion(ACTUAL, { tipo: "EMISORA" })).toEqual({
      tipo: "EMISORA",
    })
  })

  it("si solo cambian las categorías reescribe el nombre vigente para renovar la versión", () => {
    const escritura = escrituraConVersion(ACTUAL, {})
    expect(escritura).toEqual({ nombre: ACTUAL.nombre })
    expect(cambiosMedio(ACTUAL, { ...ACTUAL, ...escritura })).toEqual({})
  })
})
