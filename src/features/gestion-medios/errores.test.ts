import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO, MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import {
  CATEGORIAS_NO_DISPONIBLES,
  interpretarErrorMedio,
  MUNICIPIO_DESCONOCIDO,
} from "./errores"

describe("interpretarErrorMedio", () => {
  it("lleva el municipio inhabilitado (trigger) a su campo con el detalle de la BD", () => {
    expect(
      interpretarErrorMedio({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El municipio seleccionado no está habilitado en la plataforma.",
      })
    ).toEqual({
      mensaje: "El municipio seleccionado no está habilitado en la plataforma.",
      campo: "municipioCodigo",
      esperado: true,
    })
  })

  it("sin detalle usa un texto propio para el municipio", () => {
    expect(
      interpretarErrorMedio({ code: "P0001", message: "AMO_CONFIG_INVALIDA" })
    ).toEqual({
      mensaje: "El municipio seleccionado no está habilitado en la plataforma.",
      campo: "municipioCodigo",
      esperado: true,
    })
  })

  it("AMO_NO_AUTORIZADO sin detalle → falta de permiso, sin campo", () => {
    expect(
      interpretarErrorMedio({ code: "P0001", message: "AMO_NO_AUTORIZADO" })
    ).toEqual({ mensaje: MENSAJE_SIN_PERMISO, esperado: true })
  })

  it("otra regla de negocio usa su detalle en español", () => {
    expect(
      interpretarErrorMedio({
        code: "P0001",
        message: "AMO_TRANSICION_INVALIDA",
        details: "El medio no puede pasar a ese estado.",
      })
    ).toEqual({
      mensaje: "El medio no puede pasar a ese estado.",
      esperado: true,
    })
  })

  it("reconoce las restricciones por su nombre y las lleva a su campo", () => {
    expect(
      interpretarErrorMedio({
        code: "23514",
        message:
          'new row for relation "medios" violates check constraint "medios_nombre_chk"',
      })
    ).toEqual({
      mensaje: "El nombre debe tener entre 2 y 120 caracteres.",
      campo: "nombre",
      esperado: true,
    })
    expect(
      interpretarErrorMedio({
        code: "23514",
        message:
          'new row for relation "medios" violates check constraint "medios_descripcion_audiencia_chk"',
      })
    ).toEqual({
      mensaje: "La descripción admite como máximo 1.000 caracteres.",
      campo: "descripcionAudiencia",
      esperado: true,
    })
    expect(
      interpretarErrorMedio({
        code: "23503",
        message:
          'insert or update on table "medios" violates foreign key constraint "medios_municipio_codigo_fkey"',
      })
    ).toEqual({
      mensaje: MUNICIPIO_DESCONOCIDO,
      campo: "municipioCodigo",
      esperado: true,
    })
    expect(
      interpretarErrorMedio({
        code: "23503",
        message: "violates foreign key constraint",
        details:
          'Key is not present in table "categorias". medio_categorias_categoria_id_fkey',
      })
    ).toEqual({
      mensaje: CATEGORIAS_NO_DISPONIBLES,
      campo: "categoriaIds",
      esperado: true,
    })
  })

  it("RLS (42501) → falta de permiso; lo desconocido → mensaje genérico y se registra", () => {
    expect(
      interpretarErrorMedio({
        code: "42501",
        message:
          'new row violates row-level security policy for table "medios"',
      })
    ).toEqual({ mensaje: MENSAJE_SIN_PERMISO, esperado: false })
    expect(
      interpretarErrorMedio({ code: "08006", message: "connection failure" })
    ).toEqual({ mensaje: MENSAJE_INESPERADO, esperado: false })
  })

  it("una restricción ajena al medio no se lleva a ningún campo del formulario", () => {
    const resultado = interpretarErrorMedio({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "otra_tabla_clave_key"',
    })
    expect(resultado.campo).toBeUndefined()
    expect(resultado.mensaje).not.toMatch(/otra_tabla/)
  })
})
