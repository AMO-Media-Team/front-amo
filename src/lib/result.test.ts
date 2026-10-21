import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  MENSAJE_VALIDACION,
  type ResultadoAccion,
  desdeErrorZod,
  exito,
  fallo,
} from "./result"

describe("exito", () => {
  it("envuelve los datos", () => {
    expect(exito({ id: "1" })).toEqual({ ok: true, datos: { id: "1" } })
  })

  it("admite acciones sin datos", () => {
    const resultado: ResultadoAccion = exito()
    expect(resultado).toEqual({ ok: true, datos: undefined })
  })
})

describe("fallo", () => {
  it("omite erroresCampo cuando no hay", () => {
    expect(fallo("Sin permiso")).toEqual({ ok: false, error: "Sin permiso" })
  })

  it("es asignable a cualquier ResultadoAccion", () => {
    const resultado: ResultadoAccion<{ id: string }> = fallo("x", {
      nombre: ["Requerido"],
    })
    expect(resultado.ok).toBe(false)
  })
})

describe("desdeErrorZod", () => {
  const esquema = z
    .object({
      nombre: z.string().min(3, "Mínimo 3 caracteres"),
      correo: z.email("Correo inválido"),
      direccion: z.object({ ciudad: z.string().min(1, "Requerida") }),
      clave: z.string(),
      confirmacion: z.string(),
    })
    .refine((datos) => datos.clave === datos.confirmacion, {
      message: "Las contraseñas no coinciden",
      path: ["confirmacion"],
    })

  it("agrupa los mensajes por campo con rutas con puntos", () => {
    const resultado = esquema.safeParse({
      nombre: "ab",
      correo: "x",
      direccion: { ciudad: "" },
      clave: "a",
      confirmacion: "a",
    })
    expect(resultado.success).toBe(false)
    expect(desdeErrorZod(resultado.error!)).toEqual({
      ok: false,
      error: MENSAJE_VALIDACION,
      erroresCampo: {
        nombre: ["Mínimo 3 caracteres"],
        correo: ["Correo inválido"],
        "direccion.ciudad": ["Requerida"],
      },
    })
  })

  it("incluye errores de refinamiento con ruta", () => {
    const resultado = esquema.safeParse({
      nombre: "abc",
      correo: "a@b.co",
      direccion: { ciudad: "Cali" },
      clave: "a",
      confirmacion: "b",
    })
    expect(desdeErrorZod(resultado.error!).erroresCampo).toEqual({
      confirmacion: ["Las contraseñas no coinciden"],
    })
  })

  it("usa los errores sin ruta como mensaje general", () => {
    const global = z
      .object({ a: z.number(), b: z.number() })
      .refine((v) => v.a < v.b, "a debe ser menor que b")
    const resultado = global.safeParse({ a: 2, b: 1 })
    expect(desdeErrorZod(resultado.error!)).toEqual({
      ok: false,
      error: "a debe ser menor que b",
    })
  })

  it("permite personalizar el mensaje", () => {
    const resultado = z.object({ a: z.string() }).safeParse({})
    expect(desdeErrorZod(resultado.error!, "Datos incompletos").error).toBe(
      "Datos incompletos"
    )
  })
})
