import { describe, expect, it, vi } from "vitest"

import { animarColores } from "./animacion-colores"
import {
  interpolarColor,
  pinturaCirculos,
  pinturaRelleno,
  pinturaSinDatos,
  radioCirculo,
} from "./expresiones"
import { esErrorFatalMapa, mensajeErrorMapa } from "./error-mapa"
import { crearPatronRayado } from "./patron-rayado"
import { posicionTooltip } from "./tooltip-flotante"

describe("expresiones del coroplético", () => {
  it("el rayado de «sin datos» se apaga en el mapa mundial y en modo calor", () => {
    const base = { calor: false, foco: "ninguno" as const, rayar: true }
    expect(pinturaSinDatos("oscuro", base)["fill-opacity"]).not.toBe(0)
    expect(
      pinturaSinDatos("oscuro", { ...base, rayar: false })["fill-opacity"]
    ).toBe(0)
    expect(
      pinturaSinDatos("oscuro", { ...base, calor: true })["fill-opacity"]
    ).toBe(0)
  })

  it("las capas no reciben la luz ni el tema monocromo del mapa base", () => {
    const relleno = pinturaRelleno("oscuro", {
      calor: false,
      foco: "ninguno",
      rayar: true,
    })
    expect(relleno["fill-emissive-strength"]).toBe(1)
    expect(relleno["fill-color-use-theme"]).toBe("none")
    expect(
      pinturaCirculos("claro", { calor: true, foco: "ninguno" })[
        "circle-emissive-strength"
      ]
    ).toBe(1)
  })

  it("el radio de los círculos crece con la raíz del valor, entre 4 y 22 px", () => {
    expect(radioCirculo(null, 100)).toBe(0)
    expect(radioCirculo(0, 100)).toBe(0)
    expect(radioCirculo(100, 100)).toBe(22)
    expect(radioCirculo(25, 100)).toBe(13)
    expect(radioCirculo(500, 100)).toBe(22)
  })

  it("interpola colores HEX para las transiciones", () => {
    expect(interpolarColor("#000000", "#ffffff", 0)).toBe("#000000")
    expect(interpolarColor("#000000", "#ffffff", 0.5)).toBe("#808080")
    expect(interpolarColor("#000", "#fff", 2)).toBe("#ffffff")
  })

  it("la animación sin duración escribe el destino y borra lo que sale", () => {
    const escribir = vi.fn()
    const actuales = new Map([
      ["05", "#111111"],
      ["08", "#222222"],
    ])
    animarColores({
      actuales,
      destino: new Map([["05", "#AAAAAA"]]),
      colorBase: "#000000",
      duracionMs: 0,
      escribir,
    })
    expect(escribir).toHaveBeenCalledWith("05", "#AAAAAA")
    expect(escribir).toHaveBeenCalledWith("08", null)
    expect([...actuales]).toEqual([["05", "#AAAAAA"]])
  })
})

describe("utilidades del mapa", () => {
  it("el patrón rayado repite rayas diagonales opacas sobre fondo transparente", () => {
    const patron = crearPatronRayado("#FF0000", {
      lado: 6,
      periodo: 3,
      grosor: 1,
    })
    expect(patron.data).toHaveLength(6 * 6 * 4)
    // (0,0) raya; (1,0) vacío.
    expect([...patron.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
    expect(patron.data[7]).toBe(0)
    expect(() => crearPatronRayado("oklch(0.5 0.1 300)")).toThrow()
  })

  it("el tooltip se voltea cerca de los bordes", () => {
    const contenedor = { width: 400, height: 300 }
    expect(posicionTooltip(100, 200, 120, 60, contenedor)).toBe(
      "translate3d(114px, 126px, 0)"
    )
    expect(posicionTooltip(380, 10, 120, 60, contenedor)).toBe(
      "translate3d(246px, 24px, 0)"
    )
  })

  it("solo un error sin fuente ni tesela (el estilo) impide iniciar el mapa", () => {
    expect(esErrorFatalMapa({ error: new Error("Unauthorized") })).toBe(true)
    expect(
      esErrorFatalMapa({ error: new Error(""), sourceId: "composite" })
    ).toBe(false)
    expect(esErrorFatalMapa({ error: new Error(""), tile: {} })).toBe(false)
  })

  it("los errores de Mapbox llegan en español y sin el texto original", () => {
    const token = Object.assign(
      new Error(
        "Unauthorized: you may have provided an invalid Mapbox access token. See https://docs.mapbox.com/api/guides/"
      ),
      { status: 401 }
    )
    expect(mensajeErrorMapa(token)).toMatch(/rechazó la credencial/)
    expect(mensajeErrorMapa({ status: 403 })).toMatch(/rechazó la credencial/)
    expect(mensajeErrorMapa(new Error("Failed to initialize WebGL"))).toMatch(
      /WebGL/
    )
    const generico = mensajeErrorMapa(
      new Error("NetworkError when attempting to fetch")
    )
    expect(generico).toMatch(/Revisa tu conexión/)
    expect(generico).not.toMatch(/NetworkError/)
    expect(mensajeErrorMapa(undefined)).toBe(generico)
  })
})
