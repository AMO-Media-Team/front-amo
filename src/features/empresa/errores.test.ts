import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO } from "@/lib/errores-bd"

import {
  CONTACTO_DESACTUALIZADO,
  interpretarErrorContacto,
  interpretarErrorEmpresa,
  interpretarErrorGeneral,
  NIT_DE_OTRA_EMPRESA,
  SIN_PERMISO_EMPRESA,
} from "./errores"

describe("interpretarErrorEmpresa", () => {
  it("el DV que rechaza el trigger va a su campo", () => {
    expect(
      interpretarErrorEmpresa({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.",
      })
    ).toEqual({
      mensaje:
        "El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.",
      campo: "digitoVerificacion",
      esperado: true,
    })
  })

  it("la identificación de una empresa verificada lo explica el `detail`", () => {
    expect(
      interpretarErrorEmpresa({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details:
          "La razón social y la identificación tributaria de una empresa verificada solo las corrige el equipo de AMO.",
      }).mensaje
    ).toMatch(/solo las corrige el equipo de AMO/)
  })

  it("el NIT de otra empresa no la nombra; la RLS habla de la propia empresa", () => {
    expect(
      interpretarErrorEmpresa({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "anunciantes_nit_key"',
      })
    ).toEqual({ mensaje: NIT_DE_OTRA_EMPRESA, campo: "nit", esperado: true })
    expect(NIT_DE_OTRA_EMPRESA).toBe(
      "Ya hay un anunciante registrado con ese NIT. Si es el de tu empresa, escríbele al equipo de AMO."
    )
    expect(
      interpretarErrorEmpresa({
        code: "42501",
        message:
          'new row violates row-level security policy for table "anunciantes"',
      })
    ).toEqual({ mensaje: SIN_PERMISO_EMPRESA, esperado: true })
  })

  it("lo desconocido no es esperado y no muestra el texto técnico", () => {
    expect(
      interpretarErrorEmpresa({ code: "XX000", message: "fallo interno" })
    ).toEqual({ mensaje: MENSAJE_INESPERADO, esperado: false })
  })
})

describe("interpretarErrorContacto", () => {
  it("cada restricción de `anunciantes_privado` va a su campo", () => {
    expect(
      interpretarErrorContacto({
        code: "23514",
        message:
          'new row for relation "anunciantes_privado" violates check constraint "anunciantes_privado_contacto_celular_chk"',
      })
    ).toMatchObject({ campo: "celular", esperado: true })
    expect(
      interpretarErrorContacto({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "anunciantes_privado_pkey"',
      })
    ).toEqual({ mensaje: CONTACTO_DESACTUALIZADO, esperado: true })
  })
})

describe("interpretarErrorGeneral", () => {
  it("usa el `detail` del envío a verificación", () => {
    expect(
      interpretarErrorGeneral({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Antes de enviar carga: RUT, Cámara de Comercio.",
      })
    ).toEqual({
      mensaje: "Antes de enviar carga: RUT, Cámara de Comercio.",
      esperado: true,
    })
  })
})
