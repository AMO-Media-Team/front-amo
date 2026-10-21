import { describe, expect, it } from "vitest"

import { MENSAJE_INESPERADO } from "@/features/usuarios/errores"

import { esErrorEsperado, interpretarErrorRol } from "./errores"

describe("interpretarErrorRol (errores AMO_* y restricciones de la BD)", () => {
  it("usa el detalle en español de las guardas", () => {
    expect(
      interpretarErrorRol({
        code: "P0001",
        message: "AMO_ROL_SISTEMA",
        details:
          "Los permisos de los roles de sistema solo cambian por migración.",
      })
    ).toEqual({
      mensaje:
        "Los permisos de los roles de sistema solo cambian por migración.",
    })
  })

  it("sin detalle, cae al mensaje propio del código", () => {
    expect(
      interpretarErrorRol({ code: "P0001", message: "AMO_ROL_PROPIO" })
    ).toEqual({ mensaje: "No puedes cambiar los permisos de tu propio rol." })
  })

  it("nombra el permiso de la anti-escalada a partir del hint", () => {
    expect(
      interpretarErrorRol({
        code: "P0001",
        message: "AMO_ESCALADA_PERMISOS",
        details: "No puedes otorgar ni retirar un permiso que no tienes.",
        hint: "pagos.registrar",
      })
    ).toEqual({
      mensaje:
        "No puedes otorgar ni retirar «Registrar pagos de anunciantes»: tú no tienes ese permiso.",
    })
    expect(
      interpretarErrorRol({
        code: "P0001",
        message: "AMO_ESCALADA_PERMISOS",
        hint: "desconocido",
      }).mensaje
    ).toBe("No puedes otorgar ni retirar un permiso que tú no tienes.")
  })

  it("nombra el permiso que no aplica a un rol de anunciante o de medio", () => {
    expect(
      interpretarErrorRol({
        code: "P0001",
        message: "AMO_PERMISO_NO_APLICABLE",
        details:
          "Ese permiso no aplica a un rol de anunciante: le abriría datos de toda la plataforma.",
        hint: "usuarios.ver",
      })
    ).toEqual({
      mensaje:
        "«Ver el listado y la ficha de usuarios» no aplica a este tipo de rol: los roles de anunciante y de medio solo admiten los permisos de su portal.",
    })
  })

  it("sin un permiso reconocible, explica AMO_PERMISO_NO_APLICABLE con el detalle o con su mensaje", () => {
    expect(
      interpretarErrorRol({
        code: "P0001",
        message: "AMO_PERMISO_NO_APLICABLE",
        details:
          "El rol tiene permisos que no aplican a un rol de medio: retíralos antes de cambiar el tipo.",
        hint: "desconocido",
      }).mensaje
    ).toBe(
      "El rol tiene permisos que no aplican a un rol de medio: retíralos antes de cambiar el tipo."
    )
    const sinDetalle = { code: "P0001", message: "AMO_PERMISO_NO_APLICABLE" }
    expect(interpretarErrorRol(sinDetalle).mensaje).toBe(
      "Ese permiso no aplica a este tipo de rol: los roles de anunciante y de medio solo admiten los permisos de su portal."
    )
    expect(esErrorEsperado(sinDetalle)).toBe(true)
  })

  it("lleva las restricciones a su campo del formulario", () => {
    expect(
      interpretarErrorRol({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "roles_clave_key"',
      })
    ).toEqual({ mensaje: "Ya existe un rol con esa clave.", campo: "clave" })
    expect(
      interpretarErrorRol({
        code: "23514",
        message:
          'new row for relation "roles" violates check constraint "roles_color_chk"',
      })
    ).toEqual({ mensaje: "Elige un color de la paleta.", campo: "color" })
  })

  it("explica la FK de perfiles al eliminar un rol en uso", () => {
    expect(
      interpretarErrorRol({
        code: "23503",
        message:
          'update or delete on table "roles" violates foreign key constraint "perfiles_rol_id_fkey" on table "perfiles"',
      }).mensaje
    ).toMatch(/cuentas asignadas/)
  })

  it("traduce la negativa de la RLS y oculta lo técnico del resto", () => {
    expect(
      interpretarErrorRol({
        code: "42501",
        message: 'new row violates row-level security policy for table "roles"',
      }).mensaje
    ).toBe(
      "No tienes permiso para gestionar roles o tu sesión necesita verificarse de nuevo."
    )
    expect(
      interpretarErrorRol({ code: "08006", message: "connection failure" })
    ).toEqual({ mensaje: MENSAJE_INESPERADO })
  })
})

describe("esErrorEsperado", () => {
  it("distingue reglas conocidas de fallos a registrar", () => {
    expect(
      esErrorEsperado({ code: "P0001", message: "AMO_NO_AUTORIZADO" })
    ).toBe(true)
    expect(esErrorEsperado({ code: "XX000", message: "boom" })).toBe(false)
  })
})
