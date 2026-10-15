import { describe, expect, it } from "vitest"

import {
  codigoNegocio,
  esCorreoExistente,
  MENSAJE_INESPERADO,
  mensajeErrorAuth,
  mensajeErrorBd,
} from "./errores"

describe("mensajeErrorBd", () => {
  it("usa el detalle escrito por la BD para los errores de negocio", () => {
    expect(
      mensajeErrorBd({
        code: "P0001",
        message: "AMO_NO_AUTORIZADO",
        details: "No puedes cambiar el estado de tu propia cuenta.",
      })
    ).toBe("No puedes cambiar el estado de tu propia cuenta.")
  })

  it("sin detalle usa el mensaje del catálogo", () => {
    expect(mensajeErrorBd({ code: "P0001", message: "AMO_ROL_PROPIO" })).toBe(
      "No puedes cambiar tu propio rol."
    )
  })

  it("traduce restricciones conocidas", () => {
    expect(
      mensajeErrorBd({
        code: "23514",
        message: "perfiles_rol_organizacion_chk",
      })
    ).toBe("Un usuario activo necesita la organización que exige su rol.")
    expect(
      mensajeErrorBd({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "perfiles_email_key"',
      })
    ).toBe("Ya existe una cuenta con ese correo.")
  })

  it("nunca muestra un error técnico crudo", () => {
    expect(
      mensajeErrorBd({
        code: "42501",
        message: "permission denied for table users",
      })
    ).toBe(MENSAJE_INESPERADO)
    expect(mensajeErrorBd({ code: "P0001", message: "AMO_DESCONOCIDO" })).toBe(
      MENSAJE_INESPERADO
    )
  })

  it("reconoce los códigos de negocio", () => {
    expect(codigoNegocio({ message: "AMO_ESCALADA_PERMISOS" })).toBe(
      "AMO_ESCALADA_PERMISOS"
    )
    expect(codigoNegocio({ message: "otra cosa" })).toBeNull()
  })
})

describe("mensajeErrorAuth", () => {
  it("detecta correos ya registrados", () => {
    expect(esCorreoExistente({ code: "email_exists", status: 422 })).toBe(true)
    expect(mensajeErrorAuth({ code: "user_already_exists" })).toBe(
      "Ya existe una cuenta con ese correo."
    )
  })

  it("informa límites de tasa y cae en el genérico en lo demás", () => {
    expect(mensajeErrorAuth({ status: 429 })).toMatch(/Espera un minuto/)
    expect(mensajeErrorAuth({ code: "unexpected_failure", status: 500 })).toBe(
      MENSAJE_INESPERADO
    )
  })
})
