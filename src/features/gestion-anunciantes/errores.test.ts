import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO } from "@/lib/errores-bd"

import {
  esErrorEsperado,
  esNitRepetido,
  interpretarErrorAnunciante,
  mensajeNitRepetido,
  NIT_REPETIDO,
  SIN_PERMISO,
} from "./errores"

describe("interpretarErrorAnunciante", () => {
  it("lleva el error del DV del trigger al campo del dígito", () => {
    expect(
      interpretarErrorAnunciante({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.",
      })
    ).toEqual({
      mensaje:
        "El dígito de verificación no corresponde al NIT. Revísalo en el RUT de la empresa.",
      campo: "digitoVerificacion",
    })
    expect(
      interpretarErrorAnunciante({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details: "Indica el dígito de verificación del NIT.",
      }).campo
    ).toBe("digitoVerificacion")
  })

  it("lleva el municipio inhabilitado al campo del municipio", () => {
    expect(
      interpretarErrorAnunciante({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El municipio seleccionado no está habilitado en la plataforma.",
      })
    ).toEqual({
      mensaje: "El municipio seleccionado no está habilitado en la plataforma.",
      campo: "municipioCodigo",
    })
  })

  it("AMO_NO_AUTORIZADO es un error general con el detalle de la BD", () => {
    expect(
      interpretarErrorAnunciante({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details:
          "La identificación tributaria de la empresa solo la corrige el equipo de AMO.",
      })
    ).toEqual({
      mensaje:
        "La identificación tributaria de la empresa solo la corrige el equipo de AMO.",
    })
    expect(
      interpretarErrorAnunciante({ message: "AMO_NO_AUTORIZADO" })
    ).toEqual({ mensaje: SIN_PERMISO })
  })

  it("reconoce las restricciones de la tabla por su nombre", () => {
    expect(
      interpretarErrorAnunciante({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "anunciantes_nit_key"',
        details: "Key (nit)=(900123456) already exists.",
      })
    ).toEqual({ mensaje: NIT_REPETIDO, campo: "nit" })
    expect(
      interpretarErrorAnunciante({
        code: "23503",
        message:
          'insert or update on table "anunciantes" violates foreign key constraint "anunciantes_sector_id_fkey"',
      }).campo
    ).toBe("sectorId")
    expect(
      interpretarErrorAnunciante({
        code: "23514",
        message:
          'new row for relation "anunciantes" violates check constraint "anunciantes_nit_co_chk"',
      }).campo
    ).toBe("nit")
    expect(
      interpretarErrorAnunciante({
        code: "23514",
        message:
          'new row for relation "anunciantes" violates check constraint "anunciantes_municipio_co_chk"',
      }).campo
    ).toBe("municipioCodigo")
  })

  it("sin permiso de RLS o con un error desconocido no muestra el mensaje técnico", () => {
    expect(
      interpretarErrorAnunciante({
        code: "42501",
        message:
          'new row violates row-level security policy for table "anunciantes"',
      })
    ).toEqual({ mensaje: SIN_PERMISO })
    expect(
      interpretarErrorAnunciante({
        code: "57014",
        message: "canceling statement",
      })
    ).toEqual({ mensaje: MENSAJE_INESPERADO })
  })
})

describe("esErrorEsperado", () => {
  it("solo los desconocidos se registran en el servidor", () => {
    expect(
      esErrorEsperado({ message: "AMO_CONFIG_INVALIDA", details: "x" })
    ).toBe(true)
    expect(esErrorEsperado({ code: "57014", message: "timeout" })).toBe(false)
  })
})

describe("NIT repetido", () => {
  it("se detecta por el código y la restricción única", () => {
    expect(
      esNitRepetido({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "anunciantes_nit_key"',
      })
    ).toBe(true)
    expect(
      esNitRepetido({
        code: "23505",
        message: 'duplicate key value violates unique constraint "otra_key"',
      })
    ).toBe(false)
  })

  it("nombra al anunciante que ya tiene el NIT cuando se conoce", () => {
    expect(mensajeNitRepetido("Andina")).toMatch(/a nombre de «Andina»/)
    expect(mensajeNitRepetido(null)).toBe(NIT_REPETIDO)
  })
})
