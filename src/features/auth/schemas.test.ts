import { describe, expect, it } from "vitest"

import {
  esquemaCodigoMfa,
  esquemaConfirmacionEnlace,
  esquemaIngreso,
  esquemaNuevaContrasena,
  esquemaRecuperacion,
  leerFormulario,
} from "./schemas"

describe("esquemaIngreso", () => {
  it("normaliza el correo y acepta un destino", () => {
    const resultado = esquemaIngreso.parse({
      email: "  Ana@AMO.test ",
      password: "x",
      next: "/reportes",
    })
    expect(resultado).toEqual({
      email: "ana@amo.test",
      password: "x",
      next: "/reportes",
    })
  })

  it("exige correo válido y contraseña", () => {
    const resultado = esquemaIngreso.safeParse({ email: "ana" })
    expect(resultado.success).toBe(false)
    const campos = resultado.error?.issues.map((issue) => issue.path[0])
    expect(campos).toEqual(expect.arrayContaining(["email", "password"]))
  })
})

describe("esquemaRecuperacion", () => {
  it("rechaza un correo vacío", () => {
    expect(esquemaRecuperacion.safeParse({ email: "" }).success).toBe(false)
  })
})

describe("esquemaNuevaContrasena", () => {
  const valida = "Montaña-Azul-2026"

  it("acepta una contraseña que cumple la política y coincide", () => {
    expect(
      esquemaNuevaContrasena.safeParse({
        password: valida,
        confirmacion: valida,
      }).success
    ).toBe(true)
  })

  it("señala la política en password y la diferencia en confirmacion", () => {
    const debil = esquemaNuevaContrasena.safeParse({
      password: "corta",
      confirmacion: "corta",
    })
    expect(debil.error?.issues[0]?.path).toEqual(["password"])

    const distinta = esquemaNuevaContrasena.safeParse({
      password: valida,
      confirmacion: `${valida}x`,
    })
    expect(distinta.error?.issues[0]?.path).toEqual(["confirmacion"])
  })
})

describe("esquemaCodigoMfa", () => {
  it("exige 6 dígitos y un factor UUID si viene", () => {
    expect(esquemaCodigoMfa.safeParse({ codigo: "123456" }).success).toBe(true)
    expect(esquemaCodigoMfa.safeParse({ codigo: "12345" }).success).toBe(false)
    expect(
      esquemaCodigoMfa.safeParse({ codigo: "123456", factorId: "x" }).success
    ).toBe(false)
  })
})

describe("esquemaConfirmacionEnlace", () => {
  it("acepta los tipos de Supabase y rechaza tokens con caracteres raros", () => {
    expect(
      esquemaConfirmacionEnlace.safeParse({
        token_hash: "pkce_0123456789abcdef",
        type: "invite",
      }).success
    ).toBe(true)
    expect(
      esquemaConfirmacionEnlace.safeParse({
        token_hash: "abc<script>",
        type: "invite",
      }).success
    ).toBe(false)
    expect(
      esquemaConfirmacionEnlace.safeParse({
        token_hash: "0123456789abcdef",
        type: "sms",
      }).success
    ).toBe(false)
  })
})

describe("leerFormulario", () => {
  it("toma solo los campos de texto pedidos y omite los vacíos", () => {
    const datos = new FormData()
    datos.set("email", "ana@amo.test")
    datos.set("next", "")
    datos.set("otro", "x")
    datos.set("archivo", new Blob(["x"]))
    expect(leerFormulario(datos, ["email", "next", "archivo"])).toEqual({
      email: "ana@amo.test",
    })
  })
})
