import { describe, expect, it } from "vitest"

import {
  centroAreaLibre,
  desplazamientoAlAreaLibre,
  encuadreDeZona,
} from "./area-libre"

const LIENZO = { ancho: 1176, alto: 836 }
/** Escritorio con el detalle abierto: ranking a la izquierda, detalle a la derecha. */
const MARGEN = { top: 84, bottom: 44, left: 376, right: 400 }

describe("traer una zona al área libre de paneles", () => {
  it("una zona ya visible no mueve la cámara", () => {
    expect(
      desplazamientoAlAreaLibre({ x: 560, y: 400 }, LIENZO, MARGEN)
    ).toEqual([0, 0])
  })

  it("una zona bajo el panel derecho se corre lo justo (con holgura), sin recentrar", () => {
    // Borde libre derecho = 1176 − 400 = 776; con 56 px de holgura, 720.
    expect(
      desplazamientoAlAreaLibre({ x: 784, y: 400 }, LIENZO, MARGEN)
    ).toEqual([64, 0])
  })

  it("una zona bajo el ranking o la barra superior se corre hacia el otro lado", () => {
    expect(
      desplazamientoAlAreaLibre({ x: 300, y: 60 }, LIENZO, MARGEN)
    ).toEqual([300 - (376 + 56), 60 - (84 + 56)])
  })

  it("sin holgura basta con cruzar el borde", () => {
    expect(
      desplazamientoAlAreaLibre({ x: 790, y: 400 }, LIENZO, MARGEN, 0)
    ).toEqual([14, 0])
    expect(
      desplazamientoAlAreaLibre({ x: 776, y: 400 }, LIENZO, MARGEN, 0)
    ).toEqual([0, 0])
  })

  it("en una franja más estrecha que dos holguras apunta a su centro (hoja de detalle en móvil)", () => {
    // Teléfono: entre la barra (136) y la hoja (788 − 556 = 232) quedan 96 px.
    const telefono = { ancho: 390, alto: 788 }
    const margen = { top: 136, bottom: 556, left: 24, right: 24 }
    const [dx, dy] = desplazamientoAlAreaLibre(
      { x: 195, y: 500 },
      telefono,
      margen
    )
    expect(dx).toBe(0)
    expect(500 - dy).toBe(136 + 96 / 2)
  })
})

describe("encuadre de la zona seleccionada", () => {
  /** Escritorio sin detalle: solo el ranking a la izquierda. */
  const SIN_DETALLE = { top: 84, bottom: 44, left: 376, right: 48 }

  it("el centro de la cámara se dibuja en el centro del área libre", () => {
    expect(centroAreaLibre(LIENZO, SIN_DETALLE)).toEqual({ x: 752, y: 438 })
    expect(centroAreaLibre(LIENZO, MARGEN)).toEqual({ x: 576, y: 438 })
  })

  it("si al abrirse el detalle la zona sigue a la vista, basta con deslizar los márgenes", () => {
    // El detalle corre la vista 176 px a la izquierda: 744 → 568, dentro del área libre.
    expect(
      encuadreDeZona({ x: 744, y: 400 }, LIENZO, SIN_DETALLE, MARGEN)
    ).toBeNull()
  })

  it("si aun así queda bajo el detalle, termina a una holgura de su borde", () => {
    // 1000 − 176 = 824; el borde libre con holgura es 720.
    const encuadre = encuadreDeZona(
      { x: 1000, y: 400 },
      LIENZO,
      SIN_DETALLE,
      MARGEN
    )
    expect(encuadre?.offset).toEqual([720 - 576, 400 - 438])
  })

  it("con los mismos márgenes (otra zona, detalle ya abierto) solo corrige lo que falta", () => {
    const encuadre = encuadreDeZona({ x: 300, y: 500 }, LIENZO, MARGEN, MARGEN)
    expect(encuadre?.offset).toEqual([376 + 56 - 576, 500 - 438])
    expect(
      encuadreDeZona({ x: 600, y: 500 }, LIENZO, MARGEN, MARGEN)
    ).toBeNull()
  })
})
