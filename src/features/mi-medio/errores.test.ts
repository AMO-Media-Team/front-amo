import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO, MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import {
  CATEGORIAS_NO_DISPONIBLES,
  DOCUMENTO_DUPLICADO,
  interpretarErrorEnvio,
  interpretarErrorPago,
  interpretarErrorPerfil,
} from "./errores"

describe("interpretarErrorPerfil", () => {
  it("municipio no habilitado: el detalle de la BD, en su campo", () => {
    expect(
      interpretarErrorPerfil(
        {
          code: "P0001",
          message: "AMO_CONFIG_INVALIDA",
          details:
            "El municipio seleccionado no está habilitado en la plataforma.",
        },
        "medio"
      )
    ).toEqual({
      mensaje: "El municipio seleccionado no está habilitado en la plataforma.",
      campo: "municipioCodigo",
      esperado: true,
    })
  })

  it("categoría retirada: va al campo de categorías, con respaldo si no hay detalle", () => {
    expect(
      interpretarErrorPerfil(
        { code: "P0001", message: "AMO_CONFIG_INVALIDA" },
        "categorias"
      )
    ).toEqual({
      mensaje: CATEGORIAS_NO_DISPONIBLES,
      campo: "categoriaIds",
      esperado: true,
    })
  })

  it("la suma de la audiencia (trigger diferido) va al campo de audiencia", () => {
    expect(
      interpretarErrorPerfil(
        {
          code: "23514",
          message: "medio_audiencia_paises_suma_chk",
          details: "La suma de la audiencia por país…",
        },
        "audiencia"
      )
    ).toEqual({
      mensaje: "La suma de tu audiencia no puede pasar de 100 %.",
      campo: "audiencia",
      esperado: true,
    })
  })

  it("el largo del nombre va a su campo", () => {
    expect(
      interpretarErrorPerfil(
        {
          code: "23514",
          message:
            'new row for relation "medios" violates check constraint "medios_nombre_chk"',
        },
        "medio"
      )
    ).toMatchObject({ campo: "nombre", esperado: true })
  })

  it("sin permiso (RLS) no se muestra el mensaje técnico", () => {
    const resultado = interpretarErrorPerfil(
      {
        code: "42501",
        message:
          'new row violates row-level security policy for table "medios"',
      },
      "medio"
    )
    expect(resultado.mensaje).toBe(MENSAJE_SIN_PERMISO)
    expect(resultado.campo).toBeUndefined()
  })

  it("un error desconocido da el mensaje genérico y se registra", () => {
    expect(
      interpretarErrorPerfil({ code: "XX000", message: "boom" }, "medio")
    ).toEqual({ mensaje: MENSAJE_INESPERADO, esperado: false })
  })
})

describe("interpretarErrorPago", () => {
  it("documento repetido en otro medio, en el campo del número", () => {
    expect(
      interpretarErrorPago({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "medios_privado_numero_documento_hash_key"',
      })
    ).toEqual({
      mensaje: DOCUMENTO_DUPLICADO,
      campo: "numeroDocumento",
      esperado: true,
    })
  })

  it("pago incompleto (trigger) usa el detalle de la BD", () => {
    expect(
      interpretarErrorPago({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Los datos de pago van completos: método, cuenta y resumen.",
      })
    ).toMatchObject({
      mensaje: "Los datos de pago van completos: método, cuenta y resumen.",
      esperado: true,
    })
  })

  it("no autorizado, sin campo", () => {
    expect(
      interpretarErrorPago({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details: "No tienes permiso para esta acción.",
      })
    ).toEqual({
      mensaje: "No tienes permiso para esta acción.",
      esperado: true,
    })
  })
})

describe("interpretarErrorEnvio", () => {
  it("el detalle dice qué falta", () => {
    expect(
      interpretarErrorEnvio({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "Antes de enviar completa: una cuenta social, los datos de pago.",
      })
    ).toEqual({
      mensaje:
        "Antes de enviar completa: una cuenta social, los datos de pago.",
      esperado: true,
    })
  })

  it("ya verificado: transición inválida con su detalle", () => {
    expect(
      interpretarErrorEnvio({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details:
          "Tu medio ya está verificado: para subir de nivel carga los documentos del nivel nuevo.",
      }).mensaje
    ).toMatch(/^Tu medio ya está verificado/)
  })
})
