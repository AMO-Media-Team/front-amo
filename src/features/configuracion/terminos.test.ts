import { describe, expect, it } from "vitest"

import {
  estadoVersion,
  ordenarVersiones,
  siguienteVersion,
  versionesPorTipo,
  versionVigente,
} from "./terminos"

const AHORA = new Date("2026-10-05T15:00:00Z")

function version(
  id: string,
  publicada: boolean,
  vigenteDesde: string | null,
  creadaAt = "2026-01-01T00:00:00Z"
) {
  return { id, version: id, publicada, vigenteDesde, creadaAt }
}

const V1 = version("1.0", true, "2026-01-01T05:00:00Z")
const V2 = version("1.1", true, "2026-06-01T05:00:00Z")
const V3 = version("2.0", true, "2026-12-01T05:00:00Z")
const BORRADOR = version("2.1", false, null, "2026-10-01T00:00:00Z")
const TODAS = [V1, V2, V3, BORRADOR]

describe("versionVigente", () => {
  it("es la publicada más reciente que ya entró en vigor", () => {
    expect(versionVigente(TODAS, AHORA)?.id).toBe("1.1")
    expect(versionVigente(TODAS, new Date("2026-12-02T00:00:00Z"))?.id).toBe(
      "2.0"
    )
  })

  it("no hay vigente con solo borradores o programadas", () => {
    expect(versionVigente([BORRADOR, V3], AHORA)).toBeNull()
    expect(versionVigente([], AHORA)).toBeNull()
  })
})

describe("estadoVersion", () => {
  it("distingue borrador, programada, vigente y anterior", () => {
    expect(estadoVersion(BORRADOR, TODAS, AHORA)).toBe("BORRADOR")
    expect(estadoVersion(V3, TODAS, AHORA)).toBe("PROGRAMADA")
    expect(estadoVersion(V2, TODAS, AHORA)).toBe("VIGENTE")
    expect(estadoVersion(V1, TODAS, AHORA)).toBe("ANTERIOR")
  })
})

describe("ordenarVersiones", () => {
  it("pone arriba lo que requiere acción y deja el historial al final", () => {
    expect(
      ordenarVersiones([V1, V3, BORRADOR, V2], AHORA).map((v) => v.id)
    ).toEqual(["2.1", "2.0", "1.1", "1.0"])
  })
})

describe("siguienteVersion", () => {
  it("incrementa el último número y respeta el prefijo", () => {
    expect(siguienteVersion([])).toBe("1.0")
    expect(siguienteVersion([{ version: "1.2" }, { version: "1.10" }])).toBe(
      "1.11"
    )
    expect(siguienteVersion([{ version: "2" }])).toBe("3")
    expect(siguienteVersion([{ version: "v1" }])).toBe("v2")
  })

  it("una versión sin número final recibe un sufijo y nunca pasa de 20 caracteres", () => {
    expect(siguienteVersion([{ version: "beta" }])).toBe("beta.1")
    expect(siguienteVersion([{ version: "x".repeat(20) }])).toHaveLength(20)
  })
})

describe("versionesPorTipo", () => {
  it("filtra las versiones de un documento", () => {
    const versiones = [
      { tipo: "TERMINOS_MEDIO" as const, id: "a" },
      { tipo: "POLITICA_DATOS" as const, id: "b" },
    ]
    expect(versionesPorTipo(versiones, "POLITICA_DATOS")).toEqual([
      { tipo: "POLITICA_DATOS", id: "b" },
    ])
  })
})
