import { describe, expect, it } from "vitest"

import {
  debeRenovarClave,
  nuevaClaveIdempotencia,
  uuidDeBytes,
} from "./idempotencia"
import type { FalloAceptar } from "./tipos"

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function fallo(definitivo: boolean): FalloAceptar {
  return {
    ok: false,
    error: "x",
    codigo: definitivo ? "AMO_SIN_CUPO" : null,
    titulo: "x",
    definitivo,
    bloquea: definitivo,
    enlace: null,
  }
}

describe("clave de idempotencia", () => {
  it("usa randomUUID cuando existe", () => {
    expect(
      nuevaClaveIdempotencia({
        randomUUID: () => "11111111-2222-4333-8444-555555555555",
      })
    ).toBe("11111111-2222-4333-8444-555555555555")
  })

  it("sin randomUUID (contexto no seguro) arma un UUID v4 con getRandomValues", () => {
    const clave = nuevaClaveIdempotencia({
      getRandomValues: <T extends ArrayBufferView | null>(arreglo: T) => {
        if (arreglo instanceof Uint8Array) arreglo.fill(0xff)
        return arreglo
      },
    })
    expect(clave).toMatch(UUID_V4)
    expect(clave).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff")
  })

  it("sin ninguna fuente igual devuelve un UUID v4 válido", () => {
    expect(nuevaClaveIdempotencia({})).toMatch(UUID_V4)
  })

  it("dos claves seguidas son distintas", () => {
    expect(nuevaClaveIdempotencia()).not.toBe(nuevaClaveIdempotencia())
  })

  it("fija la versión y la variante sin tocar el resto", () => {
    expect(uuidDeBytes(new Uint8Array(16))).toBe(
      "00000000-0000-4000-8000-000000000000"
    )
  })

  it("se renueva tras una respuesta firme y se conserva si no hubo respuesta", () => {
    expect(debeRenovarClave(null)).toBe(false)
    expect(debeRenovarClave(fallo(false))).toBe(false)
    expect(debeRenovarClave(fallo(true))).toBe(true)
    expect(
      debeRenovarClave({
        ok: true,
        datos: { asignacionId: "a", montoMedio: 96_000 },
      })
    ).toBe(true)
  })
})
