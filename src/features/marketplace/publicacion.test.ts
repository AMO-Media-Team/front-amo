import { describe, expect, it } from "vitest"

import {
  diasDeOpcion,
  etiquetaPublicacion,
  OPCIONES_PUBLICACION,
  opcionActivaPublicacion,
  SIN_DIAS_PUBLICACION,
} from "./publicacion"

// Jueves 23 de octubre de 2026, 22:30 en Bogotá (ya viernes en UTC).
const AHORA = new Date("2026-10-24T03:30:00.000Z")

describe("días de publicación del marketplace", () => {
  it("las opciones rápidas cuentan desde hoy en Bogotá, no en UTC", () => {
    expect(diasDeOpcion("hoy", AHORA)).toEqual({
      desde: "2026-10-23",
      hasta: "2026-10-23",
    })
    expect(diasDeOpcion("manana", AHORA)).toEqual({
      desde: "2026-10-24",
      hasta: "2026-10-24",
    })
    // La semana va de lunes a domingo: de hoy (jueves) al domingo.
    expect(diasDeOpcion("estaSemana", AHORA)).toEqual({
      desde: "2026-10-23",
      hasta: "2026-10-25",
    })
    expect(diasDeOpcion("proximos7", AHORA)).toEqual({
      desde: "2026-10-23",
      hasta: "2026-10-29",
    })
    expect(diasDeOpcion("proximos30", AHORA)).toEqual({
      desde: "2026-10-23",
      hasta: "2026-11-21",
    })
  })

  it("reconoce la opción que coincide con los días elegidos", () => {
    for (const opcion of OPCIONES_PUBLICACION) {
      const dias = diasDeOpcion(opcion, AHORA)
      // Un jueves todas son distintas (un domingo «Hoy» y «Esta semana»
      // coinciden y gana la primera).
      expect(opcionActivaPublicacion(dias, AHORA)).toBe(opcion)
    }
    expect(
      opcionActivaPublicacion({ desde: "2026-10-23", hasta: null }, AHORA)
    ).toBeNull()
    expect(
      opcionActivaPublicacion(
        { desde: "2026-10-26", hasta: "2026-10-28" },
        AHORA
      )
    ).toBeNull()
  })

  it("el rótulo dice la opción, el tramo, un extremo o «Cualquier día»", () => {
    expect(etiquetaPublicacion(diasDeOpcion("estaSemana", AHORA), AHORA)).toBe(
      "Esta semana"
    )
    expect(
      etiquetaPublicacion({ desde: "2026-10-26", hasta: "2026-10-28" }, AHORA)
    ).toMatch(/^26 .*oct.* – 28 .*oct.* 2026$/)
    expect(
      etiquetaPublicacion({ desde: "2026-10-26", hasta: null }, AHORA)
    ).toMatch(/^Desde el 26/)
    expect(
      etiquetaPublicacion({ desde: null, hasta: "2026-10-28" }, AHORA)
    ).toMatch(/^Hasta el 28/)
    expect(etiquetaPublicacion({ desde: null, hasta: null }, AHORA)).toBe(
      SIN_DIAS_PUBLICACION
    )
  })
})
