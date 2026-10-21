import { describe, expect, it } from "vitest"

import { posicionTooltip, textoTooltip } from "./tooltip-vidrio"

const LIENZO = { anchoLienzo: 600, altoLienzo: 300 }
const CAJA = { ancho: 180, alto: 80 }

describe("posicionTooltip", () => {
  it("va a la derecha del punto, centrado en su altura", () => {
    expect(posicionTooltip({ ...LIENZO, x: 100, y: 150 }, CAJA)).toEqual({
      left: 114,
      top: 110,
    })
  })

  it("cerca del borde derecho cambia al lado izquierdo", () => {
    expect(posicionTooltip({ ...LIENZO, x: 500, y: 150 }, CAJA)).toEqual({
      left: 500 - 14 - 180,
      top: 110,
    })
  })

  it("no se sale por arriba ni por abajo del lienzo", () => {
    expect(posicionTooltip({ ...LIENZO, x: 100, y: 10 }, CAJA).top).toBe(0)
    expect(posicionTooltip({ ...LIENZO, x: 100, y: 295 }, CAJA).top).toBe(220)
  })

  it("en un lienzo angosto sin lugar a los lados va encima, dentro del ancho", () => {
    const angosto = { anchoLienzo: 300, altoLienzo: 300 }
    const caja = { ancho: 220, alto: 80 }
    // Ni a la derecha (150 + 14 + 220 > 300) ni a la izquierda (150 − 14 − 220 < 0).
    expect(posicionTooltip({ ...angosto, x: 150, y: 200 }, caja)).toEqual({
      left: 40,
      top: 200 - 14 - 80,
    })
    // Sin lugar encima, debajo; y acotado al ancho sin salirse.
    expect(posicionTooltip({ ...angosto, x: 200, y: 40 }, caja)).toEqual({
      left: 80,
      top: 54,
    })
  })
})

describe("textoTooltip", () => {
  it("lee título, filas y pie como texto plano", () => {
    expect(
      textoTooltip({
        titulo: "abr",
        filas: [
          {
            id: "a",
            color: "#000",
            clave: "bloque",
            valor: "$ 1",
            etiqueta: "GMV",
          },
        ],
        pie: "Puesto 1",
      })
    ).toBe("abr. GMV: $ 1. Puesto 1")
  })
})
