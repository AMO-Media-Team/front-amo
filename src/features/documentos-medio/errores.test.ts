import { describe, expect, it } from "vitest"
import { z } from "zod"

import { MENSAJE_SIN_PERMISO } from "@/lib/errores-bd"

import {
  ARCHIVO_INVALIDO,
  interpretarErrorDocumento,
  mensajeValidacion,
} from "./errores"

describe("interpretarErrorDocumento", () => {
  it("reconoce la ruta fuera de la carpeta del documento", () => {
    expect(
      interpretarErrorDocumento({
        code: "23514",
        message:
          'new row for relation "documentos_medio" violates check constraint "documentos_medio_archivo_path_chk"',
      })
    ).toMatchObject({
      mensaje:
        "El archivo no quedó guardado en la carpeta de este documento. Súbelo de nuevo.",
      esperado: true,
    })
  })

  it("reconoce la ruta ya registrada", () => {
    expect(
      interpretarErrorDocumento({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "documentos_medio_archivo_path_key"',
      })
    ).toMatchObject({ esperado: true, mensaje: /ya estaba registrado/ })
  })

  it("una violación de RLS se explica como falta de permiso y se registra", () => {
    expect(
      interpretarErrorDocumento({
        code: "42501",
        message:
          'new row violates row-level security policy for table "documentos_medio"',
      })
    ).toMatchObject({ mensaje: MENSAJE_SIN_PERMISO, esperado: false })
  })
})

describe("mensajeValidacion", () => {
  it("muestra el primer motivo del rechazo", () => {
    const esquema = z.object({
      tamano: z.number().max(10, "El archivo supera el máximo de 10 MB."),
    })
    const resultado = esquema.safeParse({ tamano: 20 })
    expect(resultado.success).toBe(false)
    if (!resultado.success) {
      expect(mensajeValidacion(resultado.error)).toBe(
        "El archivo supera el máximo de 10 MB."
      )
    }
  })

  it("sin motivo usa un texto genérico", () => {
    expect(mensajeValidacion(new z.ZodError([]))).toBe(ARCHIVO_INVALIDO)
  })
})
