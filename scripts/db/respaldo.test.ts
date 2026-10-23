import { describe, expect, it } from "vitest"

import { etiquetaDeArgumentos, nombreRespaldo } from "./respaldo"

describe("nombreRespaldo", () => {
  it("lleva entorno, día de Bogotá, etiqueta opcional y parte", () => {
    const fecha = new Date("2026-10-22T23:30:00Z")
    expect(nombreRespaldo("produccion", fecha, "antes-e2d", "esquema")).toBe(
      "produccion-2026-10-22-antes-e2d-esquema.sql"
    )
    expect(nombreRespaldo("develop", fecha, null, "datos")).toBe(
      "develop-2026-10-22-datos.sql"
    )
    // 10 p. m. en Bogotá es el día siguiente en UTC.
    expect(
      nombreRespaldo("local", new Date("2026-10-23T03:00:00Z"), null, "datos")
    ).toBe("local-2026-10-22-datos.sql")
  })
})

describe("etiquetaDeArgumentos", () => {
  it("acepta minúsculas, números y guiones; rechaza lo demás", () => {
    expect(etiquetaDeArgumentos(["produccion"])).toBeNull()
    expect(
      etiquetaDeArgumentos(["produccion", "--etiqueta", "antes-e2d"])
    ).toBe("antes-e2d")
    expect(() =>
      etiquetaDeArgumentos(["produccion", "--etiqueta", "../fuera"])
    ).toThrow(/minúsculas/)
    expect(() => etiquetaDeArgumentos(["produccion", "--etiqueta"])).toThrow()
  })
})
