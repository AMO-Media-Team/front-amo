import { describe, expect, it } from "vitest"

import {
  detalleCumplimiento,
  negocios,
  noCumplidos,
  presentarCaso,
  publicaciones,
  reglasCumplimiento,
  situacionCumplimiento,
  textoMeta,
  valorCumplimiento,
} from "./datos"
import type { CasoReputacion } from "./tipos"

/** Los separadores de Intl (U+00A0, U+202F) como espacios, para comparar. */
const plano = (texto: string) => texto.replace(/[  ]/g, " ")

function caso(parcial: Partial<CasoReputacion> = {}): CasoReputacion {
  return {
    asignacionId: "a1",
    oferta: "Lanzamiento de temporada",
    limite: "2026-10-01T23:59:00-05:00",
    estado: "VERIFICADA",
    cumplida: true,
    ...parcial,
  }
}

describe("situacionCumplimiento (MED-016)", () => {
  it("con dos negocios resueltos y mínimo de 3 no hay tasa: «Sin historial suficiente»", () => {
    const situacion = situacionCumplimiento({
      tasa: null,
      n: 2,
      cumplidas: 2,
      nMinimo: 3,
    })
    expect(situacion).toEqual({ tipo: "sin-historial", n: 2, nMinimo: 3 })
    expect(valorCumplimiento(situacion)).toBe("Sin historial suficiente")
    expect(detalleCumplimiento(situacion)).toBe(
      "2 de 3 negocios en los últimos 180 días. Con 3 negocios o más calculamos tu tasa."
    )
    expect(textoMeta(situacion)).toBeNull()
  })

  it("sin negocios en la ventana también dice «Sin historial suficiente» y explica por qué", () => {
    const situacion = situacionCumplimiento({
      tasa: null,
      n: 0,
      cumplidas: 0,
      nMinimo: 5,
    })
    expect(situacion).toEqual({ tipo: "sin-casos", nMinimo: 5 })
    expect(valorCumplimiento(situacion)).toBe("Sin historial suficiente")
    expect(detalleCumplimiento(situacion)).toMatch(
      /^Aún no tienes negocios con fecha límite en los últimos 180 días\. Con 5 negocios o más/
    )
  })

  it("con la tasa: cifra, de cuántos sale y frente a la meta del 90 %", () => {
    const enMeta = situacionCumplimiento({
      tasa: 0.9412,
      n: 17,
      cumplidas: 16,
      nMinimo: 3,
    })
    expect(enMeta).toMatchObject({ tipo: "tasa", enMeta: true })
    expect(plano(valorCumplimiento(enMeta))).toBe("94%")
    expect(detalleCumplimiento(enMeta)).toBe(
      "16 de 17 negocios cumplidos en los últimos 180 días."
    )
    expect(plano(textoMeta(enMeta) ?? "")).toBe(
      "Estás en la meta de 90% o más."
    )

    const bajo = situacionCumplimiento({
      tasa: 0.5,
      n: 4,
      cumplidas: 2,
      nMinimo: 3,
    })
    expect(bajo).toMatchObject({ tipo: "tasa", enMeta: false })
    expect(plano(textoMeta(bajo) ?? "")).toBe("La meta es 90% o más.")
  })

  it("una tasa de cero también es una tasa (no «sin historial»)", () => {
    const situacion = situacionCumplimiento({
      tasa: 0,
      n: 3,
      cumplidas: 0,
      nMinimo: 3,
    })
    expect(situacion.tipo).toBe("tasa")
    expect(plano(valorCumplimiento(situacion))).toBe("0%")
  })
})

describe("textos de cantidades", () => {
  it("singular y plural, con separador de miles", () => {
    expect(negocios(1)).toBe("1 negocio")
    expect(negocios(3)).toBe("3 negocios")
    expect(publicaciones(1)).toBe("1 publicación")
    expect(publicaciones(1250)).toBe("1.250 publicaciones")
  })

  it("las reglas dicen el mínimo vigente", () => {
    expect(reglasCumplimiento(5).at(-1)).toBe(
      "Con menos de 5 negocios no mostramos una tasa: diría poco de tu trabajo."
    )
  })
})

describe("presentarCaso", () => {
  it("un negocio cumplido lo dice con el estado que ve el medio", () => {
    expect(presentarCaso(caso())).toEqual({
      etiqueta: "Cumplido",
      tono: "exito",
      motivo: "Publicaste a tiempo y el equipo AMO validó la evidencia.",
      estado: "Verificada",
    })
  })

  it("explica por qué no se cumplió según cómo terminó", () => {
    expect(
      presentarCaso(caso({ estado: "VENCIDA_SIN_PUBLICAR", cumplida: false }))
    ).toMatchObject({
      etiqueta: "No cumplido",
      tono: "peligro",
      motivo: "Pasó la fecha límite sin la evidencia de la publicación.",
    })
    expect(
      presentarCaso(caso({ estado: "CANCELADA", cumplida: false })).motivo
    ).toBe("El equipo AMO canceló tu participación por incumplimiento.")
    // Con la evidencia validada, lo que falló fue la fecha de publicación.
    expect(
      presentarCaso(caso({ estado: "VERIFICADA", cumplida: false })).motivo
    ).toBe("Publicaste después de la fecha límite.")
  })

  it("cuenta los no cumplidos", () => {
    expect(
      noCumplidos([
        caso(),
        caso({ asignacionId: "a2", cumplida: false }),
        caso({ asignacionId: "a3", cumplida: false }),
      ])
    ).toBe(2)
  })
})
