import { describe, expect, it } from "vitest"

import { entradaVacia } from "../fixtures"
import type { MediosEnRiesgo } from "../tipos"
import { reglaMediosEnRiesgo } from "./medios-riesgo"

const plano = (texto: string | undefined) =>
  (texto ?? "").replace(/[\u00a0\u202f]/g, " ")

const RIESGO: MediosEnRiesgo = {
  cantidad: 12,
  gmvEnJuego: 18_400_000,
  gmvVerificado90d: 200_000_000,
  top: [
    { id: "a", nombre: "Noticias Pasto", gmv90d: 3_000_000 },
    { id: "b", nombre: "Eco Tunja", gmv90d: 5_000_000 },
    { id: "c", nombre: "Radio Neiva", gmv90d: 4_000_000 },
    { id: "d", nombre: "Voz de Ibagué", gmv90d: 1_000_000 },
  ],
}

describe("reglaMediosEnRiesgo", () => {
  it("atención si el GMV en juego pesa ≥ 5 % del verificado de 90 días", () => {
    const insight = reglaMediosEnRiesgo(
      entradaVacia({ mediosEnRiesgo: RIESGO })
    )
    expect(insight).toMatchObject({
      id: "medios-riesgo",
      regla: 3,
      severidad: "atencion",
      titulo: "12 medios en riesgo de abandono",
      valor: 12,
    })
    expect(plano(insight?.detalle)).toBe(
      "12 medios activos no aceptan ofertas hace más de 30 días; representan $18,4 M de GMV en los últimos 90 días (9,2% del GMV verificado). " +
        "Los de mayor GMV: Eco Tunja, Radio Neiva y Noticias Pasto."
    )
    expect(insight?.magnitud).toBeCloseTo(0.092)
    expect(insight?.accion?.href).toBe("/operacion/medios?segmento=en_riesgo")
  })

  it("información si pesa menos del 5 % (justo en 5 % ya es atención)", () => {
    const bajo = { ...RIESGO, gmvEnJuego: 9_999_999 }
    expect(
      reglaMediosEnRiesgo(entradaVacia({ mediosEnRiesgo: bajo }))?.severidad
    ).toBe("info")
    const justo = { ...RIESGO, gmvEnJuego: 10_000_000 }
    expect(
      reglaMediosEnRiesgo(entradaVacia({ mediosEnRiesgo: justo }))?.severidad
    ).toBe("atencion")
  })

  it("sin GMV de referencia es informativo y no da proporción", () => {
    const insight = reglaMediosEnRiesgo(
      entradaVacia({ mediosEnRiesgo: { ...RIESGO, gmvVerificado90d: null } })
    )
    expect(insight?.severidad).toBe("info")
    expect(insight?.detalle).not.toContain("del GMV verificado")
  })

  it("en singular no lista «los de mayor GMV»", () => {
    const insight = reglaMediosEnRiesgo(
      entradaVacia({
        mediosEnRiesgo: { ...RIESGO, cantidad: 1, top: RIESGO.top.slice(0, 1) },
      })
    )
    expect(insight?.titulo).toBe("1 medio en riesgo de abandono")
    expect(insight?.detalle).toMatch(
      /^1 medio activo no acepta ofertas .* representa /
    )
    expect(insight?.detalle).not.toContain("Los de mayor GMV")
  })

  it("usa los días configurados", () => {
    const insight = reglaMediosEnRiesgo(
      entradaVacia({
        mediosEnRiesgo: RIESGO,
        config: {
          umbralVariacion: 0.15,
          nMinimo: 20,
          diasRiesgoSinAceptar: 45,
          diasActividad: 120,
        },
      })
    )
    expect(insight?.detalle).toContain("hace más de 45 días")
    expect(insight?.detalle).toContain("últimos 120 días")
  })

  it("sin medios o sin GMV en juego no dispara", () => {
    expect(reglaMediosEnRiesgo(entradaVacia())).toBeNull()
    expect(
      reglaMediosEnRiesgo(
        entradaVacia({ mediosEnRiesgo: { ...RIESGO, cantidad: 0 } })
      )
    ).toBeNull()
    expect(
      reglaMediosEnRiesgo(
        entradaVacia({ mediosEnRiesgo: { ...RIESGO, gmvEnJuego: 0 } })
      )
    ).toBeNull()
  })
})
