import { describe, expect, it } from "vitest"

import {
  esIdValido,
  parsearIdsOfertas,
  rutaAsistente,
  rutaContinuarAsistente,
} from "./rutas"

const CAMPANA = "01a16540-0000-7000-8000-000000000001"
const A = "01a16540-0000-7000-8000-0000000000a1"
const B = "01a16540-0000-7000-8000-0000000000b1"

describe("rutas del asistente de oferta", () => {
  it("rutaAsistente (contrato): nueva o editar", () => {
    expect(rutaAsistente(CAMPANA)).toBe(`/campanas/${CAMPANA}/ofertas/nueva`)
    expect(rutaAsistente(CAMPANA, A)).toBe(
      `/campanas/${CAMPANA}/ofertas/${A}/editar`
    )
  })

  it("continúa con los borradores creados y el paso", () => {
    expect(rutaContinuarAsistente(CAMPANA, [A, B], "creativo")).toBe(
      `/campanas/${CAMPANA}/ofertas/nueva?ofertas=${A},${B}&paso=creativo`
    )
    expect(rutaContinuarAsistente(CAMPANA, [], "que")).toBe(
      `/campanas/${CAMPANA}/ofertas/nueva`
    )
  })

  it("lee `?ofertas=` sin repetidos, sin basura y con tope", () => {
    expect(parsearIdsOfertas(`${A},${B},${A},nada`)).toEqual([A, B])
    expect(parsearIdsOfertas([A.toUpperCase()])).toEqual([A])
    expect(parsearIdsOfertas(undefined)).toEqual([])
    const muchos = Array.from(
      { length: 12 },
      (_, i) => `01a16540-0000-7000-8000-${String(i).padStart(12, "0")}`
    ).join(",")
    expect(parsearIdsOfertas(muchos)).toHaveLength(9)
  })

  it("valida ids", () => {
    expect(esIdValido(A)).toBe(true)
    expect(esIdValido("nueva")).toBe(false)
  })
})
