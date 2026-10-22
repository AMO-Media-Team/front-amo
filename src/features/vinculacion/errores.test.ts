import { describe, expect, it } from "vitest"

import { fallo } from "@/lib/result"

import {
  conMedioRegistrado,
  interpretarErrorEnvio,
  MENSAJES_VINCULACION,
  renombrarCampos,
} from "./errores"
import { CAMPOS_MEDIO_EN_HOJA, CAMPOS_USUARIO_EN_HOJA } from "./schemas"

describe("renombrarCampos", () => {
  it("lleva los errores del registro del medio a la hoja", () => {
    expect(
      renombrarCampos(
        fallo("Revisa los campos marcados.", {
          nombre: ["Máximo 120 caracteres."],
          municipioCodigo: ["Elige un municipio de la lista."],
        }),
        CAMPOS_MEDIO_EN_HOJA
      )
    ).toEqual(
      fallo("Revisa los campos marcados.", {
        nombreMedio: ["Máximo 120 caracteres."],
        municipioCodigo: ["Elige un municipio de la lista."],
      })
    )
  })

  it("lleva los errores del alta de la persona a la hoja", () => {
    expect(
      renombrarCampos(
        fallo("Ya existe una cuenta con ese correo.", {
          email: ["Ya existe una cuenta con ese correo."],
          nombre: ["Escribe al menos 2 caracteres."],
        }),
        CAMPOS_USUARIO_EN_HOJA
      ).erroresCampo
    ).toEqual({
      email: ["Ya existe una cuenta con ese correo."],
      contactoNombre: ["Escribe al menos 2 caracteres."],
    })
  })

  it("un error de un campo que la hoja no tiene pasa a mensaje general", () => {
    expect(
      renombrarCampos(
        fallo("Revisa los campos marcados.", {
          organizacionId: ["Elige el medio al que pertenece."],
        }),
        CAMPOS_USUARIO_EN_HOJA
      )
    ).toEqual(fallo("Elige el medio al que pertenece."))
  })

  it("deja igual un fallo sin errores de campo", () => {
    const original = fallo("Sin permiso.")
    expect(renombrarCampos(original, CAMPOS_USUARIO_EN_HOJA)).toBe(original)
  })
})

describe("conMedioRegistrado", () => {
  it("avisa que el medio quedó registrado y conserva los campos", () => {
    const resultado = conMedioRegistrado(
      fallo("Ya existe una cuenta con ese correo.", {
        email: ["Ya existe una cuenta con ese correo."],
      }),
      "Noticias del Sur"
    )
    expect(resultado.error).toBe(
      "Registramos el medio «Noticias del Sur», pero no pudimos crear la cuenta: Ya existe una cuenta con ese correo. Corrige y vuelve a intentarlo; no se registrará de nuevo."
    )
    expect(resultado.erroresCampo).toEqual({
      email: ["Ya existe una cuenta con ese correo."],
    })
  })
})

describe("interpretarErrorEnvio", () => {
  it("un municipio inhabilitado vuelve a su campo", () => {
    const { resultado, esperado } = interpretarErrorEnvio({
      code: "P0001",
      message: "AMO_CONFIG_INVALIDA",
      details: "Elige un municipio habilitado en AMO.",
    })
    expect(esperado).toBe(true)
    expect(resultado).toEqual(
      fallo("Elige un municipio habilitado en AMO.", {
        municipioCodigo: ["Elige un municipio habilitado en AMO."],
      })
    )
  })

  it("el límite por conexión se explica con el detalle de la BD", () => {
    expect(
      interpretarErrorEnvio({
        code: "P0001",
        message: "AMO_LIMITE_SOLICITUDES",
        details:
          "Recibimos varias solicitudes desde tu conexión. Intenta de nuevo mañana.",
      }).resultado
    ).toEqual(
      fallo(
        "Recibimos varias solicitudes desde tu conexión. Intenta de nuevo mañana."
      )
    )
  })

  it("cualquier otro error responde un mensaje genérico (sin detalles técnicos)", () => {
    const { resultado, esperado } = interpretarErrorEnvio({
      code: "23514",
      message:
        'new row for relation "solicitudes_vinculacion" violates check constraint',
    })
    expect(esperado).toBe(false)
    expect(resultado).toEqual(fallo(MENSAJES_VINCULACION.envioFallido))
  })
})
