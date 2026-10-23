import { describe, expect, it } from "vitest"

import { elegirLogoFinal, REGLAS_LOGO, REGLAS_SELECCION_LOGO } from "./logo"

function archivo(tipo: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], `logo.${tipo.split("/")[1]}`, {
    type: tipo,
  })
}

describe("elegirLogoFinal", () => {
  it("sube el logo reducido (WebP)", () => {
    const reducido = archivo("image/webp", 50_000)
    expect(elegirLogoFinal(archivo("image/png", 900_000), reducido)).toBe(
      reducido
    )
  })

  it("si el navegador solo sabe JPEG, conserva el PNG original para no perder la transparencia", () => {
    const original = archivo("image/png", 900_000)
    expect(elegirLogoFinal(original, archivo("image/jpeg", 60_000))).toBe(
      original
    )
  })

  it("un PNG demasiado pesado se sube reducido aunque pierda la transparencia", () => {
    const reducido = archivo("image/jpeg", 60_000)
    expect(
      elegirLogoFinal(archivo("image/png", REGLAS_LOGO.maxBytes + 1), reducido)
    ).toBe(reducido)
  })

  it("al elegir se admite más peso que en el bucket (se reduce antes de subir)", () => {
    expect(REGLAS_SELECCION_LOGO.maxBytes).toBeGreaterThan(REGLAS_LOGO.maxBytes)
    expect(REGLAS_LOGO.mimes).toEqual(["image/jpeg", "image/png", "image/webp"])
  })
})
