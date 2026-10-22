import { describe, expect, it } from "vitest"

import {
  anuncioCambioUrgencia,
  calcularPlazo,
  describirDuracion,
  milisegundosDe,
} from "./plazo"

const AHORA = new Date("2026-10-21T15:00:00.000Z")
const en = (minutos: number) =>
  new Date(AHORA.getTime() + minutos * 60_000).toISOString()

describe("describirDuracion", () => {
  it.each([
    [0, "1 min"],
    [0.4, "1 min"],
    [12, "12 min"],
    [359.9, "5 h 59 min"],
    [60, "1 h"],
    [4 * 60 + 12, "4 h 12 min"],
    [24 * 60, "1 día"],
    [26 * 60, "1 día 2 h"],
    [2 * 24 * 60 + 5 * 60, "2 días"],
    [-180, "3 h"],
  ] as const)("%f min → %s", (minutos, texto) => {
    expect(describirDuracion(minutos)).toBe(texto)
  })
})

describe("milisegundosDe", () => {
  it("lee texto ISO, milisegundos y Date", () => {
    const ms = AHORA.getTime()
    expect(milisegundosDe(AHORA.toISOString())).toBe(ms)
    expect(milisegundosDe(ms)).toBe(ms)
    expect(milisegundosDe(new Date(ms))).toBe(ms)
  })

  it("sin fecha o ilegible da NaN (nunca la época de 1970)", () => {
    for (const vence of [null, undefined, "", "mañana"]) {
      expect(milisegundosDe(vence)).toBeNaN()
    }
  })
})

describe("calcularPlazo", () => {
  it.each([
    [-180, "vencida", "Venció hace 3 h"],
    [0, "vencida", "Venció hace 1 min"],
    [135, "critica", "Vence en 2 h 15 min"],
    [4 * 60 + 12, "critica", "Vence en 4 h 12 min"],
    [6 * 60, "pronto", "Vence en 6 h"],
    [23 * 60 + 59, "pronto", "Vence en 23 h 59 min"],
    [24 * 60, "holgada", "Vence en 1 día"],
    [4 * 24 * 60 + 30, "holgada", "Vence en 4 días"],
  ] as const)("%i min → %s (%s)", (minutos, urgencia, texto) => {
    const plazo = calcularPlazo(en(minutos), AHORA)
    expect(plazo.urgencia).toBe(urgencia)
    expect(plazo.texto).toBe(texto)
    expect(plazo.minutosRestantes).toBe(minutos)
  })

  it("acepta milisegundos y Date además de texto ISO", () => {
    const limite = AHORA.getTime() + 90 * 60_000
    expect(calcularPlazo(limite, AHORA).texto).toBe("Vence en 1 h 30 min")
    expect(calcularPlazo(new Date(limite), AHORA).texto).toBe(
      "Vence en 1 h 30 min"
    )
  })

  it("sin fecha límite (o ilegible) no inventa urgencia", () => {
    for (const vence of [null, undefined, "", "no-es-fecha"]) {
      expect(calcularPlazo(vence, AHORA)).toEqual({
        urgencia: "holgada",
        texto: "Sin fecha límite",
        minutosRestantes: null,
      })
    }
  })

  it("los umbrales y los textos se ajustan por uso", () => {
    const plazo = calcularPlazo(en(30 * 60), AHORA, {
      umbrales: { prontoHoras: 48 },
      textos: { pendiente: "Cierra en" },
    })
    expect(plazo.urgencia).toBe("pronto")
    expect(plazo.texto).toBe("Cierra en 1 día 6 h")
    expect(
      calcularPlazo(en(-5), AHORA, { textos: { vencido: "Cerró hace" } }).texto
    ).toBe("Cerró hace 5 min")
  })
})

describe("anuncioCambioUrgencia", () => {
  it("da contexto con la etiqueta y dice cuándo es urgente o ya pasó", () => {
    expect(
      anuncioCambioUrgencia(calcularPlazo(en(135), AHORA), "Publicación")
    ).toBe("Publicación: vence en 2 h 15 min. Es urgente.")
    expect(anuncioCambioUrgencia(calcularPlazo(en(-3), AHORA))).toBe(
      "Venció hace 3 min. El plazo ya pasó."
    )
    expect(anuncioCambioUrgencia(calcularPlazo(en(8 * 60), AHORA))).toBe(
      "Vence en 8 h."
    )
  })

  it("volver a «con tiempo» no se anuncia", () => {
    expect(anuncioCambioUrgencia(calcularPlazo(en(3 * 24 * 60), AHORA))).toBe(
      ""
    )
  })
})
