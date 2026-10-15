import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO } from "@/features/usuarios/errores"

import {
  esErrorEsperado,
  interpretarErrorConfiguracion,
  SIN_PERMISO,
} from "./errores"

describe("interpretarErrorConfiguracion", () => {
  it("traduce AMO_CONFIG_INVALIDA cambiando la clave por el título del parámetro", () => {
    expect(
      interpretarErrorConfiguracion({
        code: "P0001",
        message: "AMO_CONFIG_INVALIDA",
        details:
          "El valor de «comision.porcentaje_global» debe estar entre 0 y 0.5.",
      })
    ).toEqual({
      mensaje: "El valor de «Comisión global» debe estar entre 0 y 0.5.",
    })
  })

  it("humaniza una clave que aún no está en el catálogo", () => {
    expect(
      interpretarErrorConfiguracion({
        message: "AMO_CONFIG_INVALIDA",
        details: "El valor de «nuevo.limite_diario» debe ser un número entero.",
      }).mensaje
    ).toBe("El valor de «Limite diario» debe ser un número entero.")
  })

  it("sin detalle usa un mensaje propio del código", () => {
    expect(
      interpretarErrorConfiguracion({ message: "AMO_CONFIG_INVALIDA" }).mensaje
    ).toBe("El valor no cumple las reglas de este parámetro.")
    expect(
      interpretarErrorConfiguracion({ message: "AMO_NO_AUTORIZADO" }).mensaje
    ).toBe(SIN_PERMISO)
    expect(
      interpretarErrorConfiguracion({ message: "AMO_CODIGO_NUEVO" }).mensaje
    ).toBe(MENSAJE_INESPERADO)
  })

  it("conserva el detalle de otras guardas de negocio tal como lo escribe la BD", () => {
    expect(
      interpretarErrorConfiguracion({
        message: "AMO_TARIFA_SOLAPADA",
        details: "Ya hay una tarifa programada después de esa fecha.",
      }).mensaje
    ).toBe("Ya hay una tarifa programada después de esa fecha.")
  })

  it("reconoce restricciones por su nombre y apunta al campo del formulario", () => {
    expect(
      interpretarErrorConfiguracion({
        code: "23P01",
        message:
          'conflicting key value violates exclusion constraint "franjas_rango_excl"',
      })
    ).toEqual({
      mensaje:
        "El rango se cruza con otra franja activa. Ajusta los límites o desactiva la otra franja.",
      campo: "seguidoresMin",
    })
    expect(
      interpretarErrorConfiguracion({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key violates terminos_versiones_tipo_version_key",
      })
    ).toEqual({
      mensaje: "Ya existe esa versión para este documento.",
      campo: "version",
    })
  })

  it("una restricción sin campo solo lleva el mensaje", () => {
    const resultado = interpretarErrorConfiguracion({
      code: "23503",
      message:
        'update or delete on table "comisiones_excepcion" violates foreign key constraint "asignacion_montos_comision_excepcion_id_fkey"',
    })
    expect(resultado.campo).toBeUndefined()
    expect(resultado.mensaje).toContain("no se puede eliminar")
  })

  it("un destinatario de excepción borrado se explica en su campo (no como error inesperado)", () => {
    expect(
      interpretarErrorConfiguracion({
        code: "23503",
        message:
          'insert or update on table "comisiones_excepcion" violates foreign key constraint "comisiones_excepcion_campana_id_fkey"',
      })
    ).toEqual({
      mensaje: "Esa campaña ya no existe. Elige otra de la lista.",
      campo: "objetivoId",
    })
    expect(
      interpretarErrorConfiguracion({
        code: "23503",
        message:
          'insert or update on table "comisiones_excepcion" violates foreign key constraint "comisiones_excepcion_anunciante_id_fkey"',
      }).campo
    ).toBe("objetivoId")
  })

  it("un rechazo de privilegios o de RLS se explica como falta de permiso", () => {
    expect(
      interpretarErrorConfiguracion({
        code: "42501",
        message:
          'new row violates row-level security policy for table "tarifas"',
      }).mensaje
    ).toBe(SIN_PERMISO)
  })

  it("nunca muestra el mensaje técnico de un error desconocido", () => {
    const resultado = interpretarErrorConfiguracion({
      code: "XX000",
      message: "internal error: relation foo does not exist",
    })
    expect(resultado).toEqual({ mensaje: MENSAJE_INESPERADO })
  })
})

describe("esErrorEsperado", () => {
  it("distingue reglas conocidas (no se registran) de fallos reales", () => {
    expect(
      esErrorEsperado({ message: "AMO_CONFIG_INVALIDA", details: "x" })
    ).toBe(true)
    expect(esErrorEsperado({ message: "… tarifas_vigencia_excl …" })).toBe(true)
    expect(esErrorEsperado({ code: "42501" })).toBe(true)
    expect(
      esErrorEsperado({ code: "57014", message: "statement timeout" })
    ).toBe(false)
  })
})
