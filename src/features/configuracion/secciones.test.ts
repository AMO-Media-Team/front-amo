import { describe, expect, it } from "vitest"

import {
  cargarSeccion,
  consultaSeccion,
  esSeccion,
  INFO_SECCIONES,
  parseAsSeccion,
  rutaSeccion,
  SECCION_POR_DEFECTO,
  SECCIONES,
} from "./secciones"

describe("secciones de configuración", () => {
  it("cada sección tiene título, resumen y descripción", () => {
    for (const seccion of SECCIONES) {
      const info = INFO_SECCIONES[seccion]
      expect(info.titulo.length).toBeGreaterThan(2)
      expect(info.resumen.length).toBeGreaterThan(5)
      expect(info.descripcion.endsWith(".")).toBe(true)
    }
    expect(new Set(SECCIONES).size).toBe(SECCIONES.length)
  })

  it("reconoce solo secciones conocidas", () => {
    expect(esSeccion("precios")).toBe(true)
    expect(esSeccion("Precios")).toBe(false)
    expect(esSeccion(undefined)).toBe(false)
  })

  it("un valor desconocido de ?seccion= cae en la sección por defecto", () => {
    expect(parseAsSeccion.parseServerSide("tributario")).toBe("tributario")
    expect(parseAsSeccion.parseServerSide("../admin")).toBe(SECCION_POR_DEFECTO)
    expect(parseAsSeccion.parseServerSide(undefined)).toBe(SECCION_POR_DEFECTO)
  })

  it("la página lee la sección con el mismo parser (searchParams es una promesa)", async () => {
    await expect(
      cargarSeccion(Promise.resolve({ seccion: "legal" }))
    ).resolves.toEqual({ seccion: "legal" })
    await expect(
      cargarSeccion(Promise.resolve({ seccion: ["x", "y"] }))
    ).resolves.toEqual({ seccion: SECCION_POR_DEFECTO })
  })

  it("la sección por defecto no ensucia la URL", () => {
    expect(consultaSeccion(SECCION_POR_DEFECTO)).toBe("")
    expect(consultaSeccion("precios")).toBe("?seccion=precios")
    expect(rutaSeccion("comercial")).toBe("/administracion/configuracion")
    expect(rutaSeccion("plantillas")).toBe(
      "/administracion/configuracion?seccion=plantillas"
    )
  })
})
