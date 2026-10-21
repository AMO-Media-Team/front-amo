import { describe, expect, it } from "vitest"

import {
  ESTADO_INICIAL,
  explorar,
  migasMapa,
  mismoEstado,
  normalizarEstadoNivel,
  puedeExplorar,
  subirNivel,
} from "./niveles"

const MUNDO = { nivel: "internacional", departamento: null } as const
const ANTIOQUIA = { nivel: "departamental", departamento: "05" } as const

describe("máquina de niveles del explorador", () => {
  it("normaliza la URL: el departamento solo vale en el nivel departamental", () => {
    expect(normalizarEstadoNivel("nacional", "05")).toEqual(ESTADO_INICIAL)
    expect(normalizarEstadoNivel("internacional", "05")).toEqual(MUNDO)
    expect(normalizarEstadoNivel("departamental", "05")).toEqual(ANTIOQUIA)
  })

  it("un nivel departamental sin departamento válido vuelve a Colombia", () => {
    expect(normalizarEstadoNivel("departamental", null)).toEqual(ESTADO_INICIAL)
    expect(normalizarEstadoNivel("departamental", "00")).toEqual(ESTADO_INICIAL)
    // Bogotá y San Andrés no tienen nivel municipal propio.
    expect(normalizarEstadoNivel("departamental", "11")).toEqual(ESTADO_INICIAL)
    expect(normalizarEstadoNivel("departamental", "88")).toEqual(ESTADO_INICIAL)
  })

  it("explorar baja Mundo → Colombia → departamento", () => {
    expect(explorar(MUNDO, "CO")).toEqual(ESTADO_INICIAL)
    expect(explorar(ESTADO_INICIAL, "05")).toEqual(ANTIOQUIA)
  })

  it("no hay nivel inferior para otros países, Bogotá, San Andrés ni municipios", () => {
    expect(explorar(MUNDO, "US")).toBeNull()
    expect(explorar(ESTADO_INICIAL, "11")).toBeNull()
    expect(explorar(ESTADO_INICIAL, "88")).toBeNull()
    expect(explorar(ESTADO_INICIAL, "00")).toBeNull()
    expect(explorar(ANTIOQUIA, "05001")).toBeNull()
    expect(puedeExplorar(ESTADO_INICIAL, "11")).toBe(false)
    expect(puedeExplorar(ESTADO_INICIAL, "76")).toBe(true)
  })

  it("subir nivel desanda el camino y se detiene en el mundo", () => {
    expect(subirNivel(ANTIOQUIA)).toEqual(ESTADO_INICIAL)
    expect(subirNivel(ESTADO_INICIAL)).toEqual(MUNDO)
    expect(subirNivel(MUNDO)).toBeNull()
  })

  it("las migas nombran el camino y solo las anteriores son navegables", () => {
    const migas = migasMapa(ANTIOQUIA)
    expect(migas.map((miga) => miga.etiqueta)).toEqual([
      "Mundo",
      "Colombia",
      "Antioquia",
    ])
    expect(migas[0].destino).toEqual(MUNDO)
    expect(migas[1].destino).toEqual(ESTADO_INICIAL)
    expect(migas[2].destino).toBeNull()
    expect(migasMapa(MUNDO)).toEqual([{ etiqueta: "Mundo", destino: null }])
  })

  it("compara estados por nivel y departamento", () => {
    expect(mismoEstado(ANTIOQUIA, { ...ANTIOQUIA })).toBe(true)
    expect(mismoEstado(ANTIOQUIA, ESTADO_INICIAL)).toBe(false)
  })
})
