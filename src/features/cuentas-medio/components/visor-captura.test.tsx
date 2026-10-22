import { describe, expect, it, vi } from "vitest"

// La acción no se ejecuta en jsdom; aquí solo se prueba el nombre del archivo.
vi.mock("../actions", () => ({ firmarCaptura: vi.fn() }))

import { nombreCaptura } from "./visor-captura"

describe("nombreCaptura", () => {
  it("lleva la extensión del tipo de la captura", () => {
    expect(nombreCaptura("image/webp")).toBe("Captura de la verificación.webp")
    expect(nombreCaptura("image/jpeg")).toBe("Captura de la verificación.jpg")
  })

  it("sin tipo conocido queda sin extensión", () => {
    expect(nombreCaptura(null)).toBe("Captura de la verificación")
    expect(nombreCaptura("application/x-desconocido")).toBe(
      "Captura de la verificación"
    )
  })
})
