import { describe, expect, it } from "vitest"

import { desgloseEventos, EVENTOS_SESION } from "./desglose"

describe("desgloseEventos", () => {
  it("todos los eventos de sesión en orden fijo, con ceros e ignorando los ingresos", () => {
    const conteos = desgloseEventos([
      "MFA_FALLIDO",
      "LOGIN_EXITOSO",
      "MFA_FALLIDO",
      "SESION_REVOCADA",
    ])
    expect(conteos.map((c) => c.evento)).toEqual([...EVENTOS_SESION])
    expect(
      Object.fromEntries(conteos.map((c) => [c.evento, c.cantidad]))
    ).toMatchObject({
      MFA_FALLIDO: 2,
      SESION_REVOCADA: 1,
      MFA_EXITOSO: 0,
    })
    expect(conteos.some((c) => (c.evento as string) === "LOGIN_EXITOSO")).toBe(
      false
    )
  })
})
