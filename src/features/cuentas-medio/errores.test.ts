import { describe, expect, it } from "vitest"

import { interpretarErrorCuenta, MENSAJES_CUENTAS } from "./errores"

describe("interpretarErrorCuenta", () => {
  it("una cuenta ya registrada por otro medio va al campo del perfil", () => {
    expect(
      interpretarErrorCuenta({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "cuentas_sociales_plataforma_handle_key"',
      })
    ).toMatchObject({
      esperado: true,
      campo: "perfil",
      mensaje: expect.stringMatching(/ya está registrada en AMO/),
    })
  })

  it("la tarifa fuera de rango va a su campo", () => {
    expect(
      interpretarErrorCuenta({
        code: "23514",
        message:
          'new row for relation "cuentas_sociales" violates check constraint "cuentas_sociales_tarifa_referencia_chk"',
      })
    ).toMatchObject({ campo: "tarifa", esperado: true })
  })

  it("una segunda verificación en curso tiene un mensaje general", () => {
    const resultado = interpretarErrorCuenta({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "verificaciones_cuenta_una_pendiente_key"',
    })
    expect(resultado.esperado).toBe(true)
    expect(resultado.campo).toBeUndefined()
    expect(resultado.mensaje).toMatch(/verificación en curso/)
  })

  it("los errores de negocio de la BD llegan con su detalle", () => {
    expect(
      interpretarErrorCuenta({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details:
          "Una cuenta verificada no puede cambiar de usuario, enlace ni plataforma: registra una cuenta nueva.",
      })
    ).toMatchObject({
      esperado: true,
      mensaje: expect.stringMatching(/^Una cuenta verificada no puede cambiar/),
    })
  })

  it("los mensajes no usan jerga técnica", () => {
    for (const texto of Object.values(MENSAJES_CUENTAS)) {
      expect(texto).not.toMatch(/\b(RLS|uuid|null|error \d|SQL|token)\b/i)
    }
  })
})
