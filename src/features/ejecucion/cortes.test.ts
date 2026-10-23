import { describe, expect, it } from "vitest"

import {
  corteDisponible,
  cortePermitido,
  cortesDeLaOferta,
  disponibleDesde,
  tituloCorte,
  venceCarga,
} from "./cortes"

const PUBLICADA = "2026-10-20T15:00:00.000Z"

describe("cortes de métricas", () => {
  it("cada corte se habilita al cumplirse su tiempo desde la publicación", () => {
    expect(disponibleDesde(PUBLICADA, "H24")?.toISOString()).toBe(
      "2026-10-21T15:00:00.000Z"
    )
    expect(disponibleDesde(PUBLICADA, "H72")?.toISOString()).toBe(
      "2026-10-23T15:00:00.000Z"
    )
    expect(disponibleDesde(PUBLICADA, "D7")?.toISOString()).toBe(
      "2026-10-27T15:00:00.000Z"
    )
    expect(disponibleDesde(PUBLICADA, "PERSONALIZADO")).toBeNull()
    expect(disponibleDesde("no es fecha", "H24")).toBeNull()
  })

  it("la carga vence el plazo configurado después del corte", () => {
    expect(venceCarga(PUBLICADA, "H24", 48)?.toISOString()).toBe(
      "2026-10-23T15:00:00.000Z"
    )
    expect(venceCarga(PUBLICADA, "PERSONALIZADO", 48)).toBeNull()
  })

  it("dice si el corte ya se puede cargar (justo en el límite, sí)", () => {
    const limite = new Date("2026-10-21T15:00:00.000Z")
    expect(corteDisponible(PUBLICADA, "H24", limite)).toBe(true)
    expect(
      corteDisponible(PUBLICADA, "H24", new Date(limite.getTime() - 1))
    ).toBe(false)
    expect(corteDisponible(PUBLICADA, "PERSONALIZADO", new Date(0))).toBe(true)
  })

  it("el personalizado siempre se permite; los fijos, si la oferta los pide", () => {
    expect(cortePermitido("PERSONALIZADO", [])).toBe(true)
    expect(cortePermitido("H72", ["H24"])).toBe(false)
    expect(cortePermitido("H24", ["H24", "D7"])).toBe(true)
  })

  it("ordena los cortes de la oferta y quita repetidos y el personalizado", () => {
    expect(cortesDeLaOferta(["D7", "H24", "PERSONALIZADO", "H24"])).toEqual([
      "H24",
      "D7",
    ])
  })

  it("nombra el corte en voz del medio", () => {
    expect(tituloCorte("H72")).toBe("Métricas de 72 horas")
    expect(tituloCorte("PERSONALIZADO")).toBe(
      "Métricas de un periodo personalizado"
    )
  })
})
