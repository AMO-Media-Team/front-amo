import { describe, expect, it } from "vitest"

import { normalizarBusqueda, puntuarComando } from "./filtro-comandos"

const AUDITORIA = [
  "bitácora",
  "historial",
  "Bitácora de cambios con actor, fecha y detalle",
]
const MAPA = [
  "geografía",
  "departamentos",
  "Explorador geográfico de medios, pauta y accesos",
]

describe("normalizarBusqueda", () => {
  it("quita tildes y mayúsculas", () => {
    expect(normalizarBusqueda("  Configuración ")).toBe("configuracion")
  })
})

describe("puntuarComando", () => {
  it("sin búsqueda muestra todo", () => {
    expect(puntuarComando("Mapa", "", MAPA)).toBe(1)
  })

  it("no acepta subsecuencias sueltas de letras", () => {
    expect(puntuarComando("Mapa", "bitac", MAPA)).toBe(0)
    expect(puntuarComando("Auditoría", "bitac", AUDITORIA)).toBeGreaterThan(0)
  })

  it("prioriza el inicio del título sobre las palabras clave", () => {
    const porTitulo = puntuarComando("Auditoría", "audi", AUDITORIA)
    const porClave = puntuarComando("Auditoría", "histo", AUDITORIA)
    expect(porTitulo).toBeGreaterThan(porClave)
  })

  it("ignora tildes en la búsqueda y en los textos", () => {
    expect(puntuarComando("Configuración", "configuracion")).toBe(1)
    expect(puntuarComando("Mapa", "geografia", MAPA)).toBeGreaterThan(0)
  })

  it("exige que todas las palabras coincidan", () => {
    expect(
      puntuarComando("Auditoría", "bitacora cambios", AUDITORIA)
    ).toBeGreaterThan(0)
    expect(puntuarComando("Auditoría", "bitacora mapa", AUDITORIA)).toBe(0)
  })
})
