import { describe, expect, it } from "vitest"

import {
  cambiosAudiencia,
  enCentesimas,
  hayCambiosAudiencia,
  ordenarAudiencia,
  sumaPorcentajes,
} from "./audiencia"

describe("enCentesimas y sumaPorcentajes", () => {
  it("suma sin error de coma flotante", () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumaPorcentajes([0.1, 0.2])).toBe(0.3)
    expect(sumaPorcentajes([33.33, 33.33, 33.34])).toBe(100)
    expect(sumaPorcentajes([])).toBe(0)
    expect(enCentesimas(12.345)).toBe(1235)
  })
})

describe("cambiosAudiencia", () => {
  const actuales = [
    { paisIso2: "CO", porcentaje: 80 },
    { paisIso2: "US", porcentaje: 10 },
    { paisIso2: "ES", porcentaje: 5 },
  ]

  it("sin cambios no escribe nada", () => {
    const cambios = cambiosAudiencia(actuales, [
      { paisIso2: "US", porcentaje: 10 },
      { paisIso2: "CO", porcentaje: 80.0 },
      { paisIso2: "ES", porcentaje: 5 },
    ])
    expect(hayCambiosAudiencia(cambios)).toBe(false)
  })

  it("separa lo que baja de lo que sube (se escribe primero lo que baja)", () => {
    const cambios = cambiosAudiencia(actuales, [
      { paisIso2: "CO", porcentaje: 70 },
      { paisIso2: "US", porcentaje: 15 },
      { paisIso2: "MX", porcentaje: 10 },
    ])
    expect(cambios).toEqual({
      borrar: ["ES"],
      reducir: [{ paisIso2: "CO", porcentaje: 70 }],
      aumentar: [{ paisIso2: "US", porcentaje: 15 }],
      insertar: [{ paisIso2: "MX", porcentaje: 10 }],
    })
    expect(hayCambiosAudiencia(cambios)).toBe(true)
  })

  it("vaciar la lista borra todo lo declarado", () => {
    expect(cambiosAudiencia(actuales, []).borrar).toEqual(["CO", "US", "ES"])
  })

  it("compara en centésimas (12,5 = 12,50)", () => {
    const cambios = cambiosAudiencia(
      [{ paisIso2: "CO", porcentaje: 12.5 }],
      [{ paisIso2: "CO", porcentaje: 12.5 }]
    )
    expect(hayCambiosAudiencia(cambios)).toBe(false)
  })
})

describe("ordenarAudiencia", () => {
  it("mayor porcentaje primero y, a igualdad, por nombre", () => {
    expect(
      ordenarAudiencia([
        { paisIso2: "US", porcentaje: 10, nombre: "Estados Unidos" },
        { paisIso2: "CO", porcentaje: 80, nombre: "Colombia" },
        { paisIso2: "EC", porcentaje: 10, nombre: "Ecuador" },
      ]).map((fila) => fila.paisIso2)
    ).toEqual(["CO", "EC", "US"])
  })
})
