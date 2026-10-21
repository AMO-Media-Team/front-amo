import { describe, expect, it } from "vitest"

import {
  conReglasDeRol,
  esquemaCrearUsuario,
  esquemaEditarUsuario,
  esquemaEliminar,
  esquemaMasivo,
  esquemaMotivo,
  exigeOrganizacion,
  normalizarCelular,
} from "./schemas"

const ROL_ADMIN = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a01"
const ROL_ANUNCIANTE = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a02"
const ROL_AJENO = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a03"
const ORGANIZACION = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a04"
const USUARIO = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a05"

const ROLES = [
  { id: ROL_ADMIN, tipo: "ADMIN" as const },
  { id: ROL_ANUNCIANTE, tipo: "ANUNCIANTE" as const },
]

const BASE = {
  nombre: "  Ana Gómez ",
  email: " Ana.Gomez@AMO.test ",
  celular: "",
  rolId: ROL_ADMIN,
  organizacionId: null,
  metodo: "ENLACE" as const,
}

function errores(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ])
  )
}

describe("esquemaCrearUsuario", () => {
  it("normaliza nombre y correo y convierte el celular vacío en null", () => {
    expect(esquemaCrearUsuario.parse(BASE)).toEqual({
      nombre: "Ana Gómez",
      email: "ana.gomez@amo.test",
      celular: null,
      rolId: ROL_ADMIN,
      organizacionId: null,
      metodo: "ENLACE",
    })
  })

  it("valida correo, nombre, rol y método con mensajes en español", () => {
    const resultado = esquemaCrearUsuario.safeParse({
      ...BASE,
      nombre: "A",
      email: "no-es-correo",
      rolId: "",
      metodo: "SMS",
    })
    expect(errores(resultado)).toMatchObject({
      nombre: "Escribe al menos 2 caracteres.",
      email: "Escribe un correo válido.",
      rolId: "Elige un rol.",
    })
    expect(errores(resultado)).toHaveProperty("metodo")
  })

  it("acepta celulares con separadores y rechaza letras", () => {
    expect(
      esquemaCrearUsuario.parse({ ...BASE, celular: "+57 (300) 123-4567" })
        .celular
    ).toBe("+57 300 123 4567")
    expect(
      errores(esquemaCrearUsuario.safeParse({ ...BASE, celular: "300-ABC" }))
    ).toHaveProperty("celular")
  })
})

describe("normalizarCelular", () => {
  it("colapsa separadores en espacios", () => {
    expect(normalizarCelular(" 300.123.45 67 ")).toBe("300 123 45 67")
  })
})

describe("conReglasDeRol", () => {
  const esquema = conReglasDeRol(esquemaCrearUsuario, ROLES)

  it("rechaza un rol que el actor no puede asignar (anti-escalada)", () => {
    expect(errores(esquema.safeParse({ ...BASE, rolId: ROL_AJENO }))).toEqual({
      rolId: "No puedes asignar ese rol.",
    })
  })

  it("exige organización para roles de anunciante o medio", () => {
    expect(
      errores(esquema.safeParse({ ...BASE, rolId: ROL_ANUNCIANTE }))
    ).toEqual({
      organizacionId: "Elige el anunciante al que pertenece.",
    })
    expect(
      esquema.parse({
        ...BASE,
        rolId: ROL_ANUNCIANTE,
        organizacionId: ORGANIZACION,
      }).organizacionId
    ).toBe(ORGANIZACION)
  })

  it("descarta la organización de un rol interno", () => {
    expect(
      esquema.parse({ ...BASE, organizacionId: ORGANIZACION }).organizacionId
    ).toBeNull()
  })

  it("funciona igual con el esquema de edición", () => {
    const edicion = conReglasDeRol(esquemaEditarUsuario, ROLES)
    const { email: _email, metodo: _metodo, ...datos } = BASE
    expect(edicion.safeParse({ ...datos, usuarioId: USUARIO }).success).toBe(
      true
    )
  })
})

describe("exigeOrganizacion", () => {
  it("solo para anunciante y medio", () => {
    expect(exigeOrganizacion("ADMIN")).toBe(false)
    expect(exigeOrganizacion("MEDIO")).toBe(true)
    expect(exigeOrganizacion(undefined)).toBe(false)
  })
})

describe("acciones con confirmación", () => {
  it("el motivo es obligatorio y acotado", () => {
    expect(
      errores(esquemaMotivo.safeParse({ usuarioId: USUARIO, motivo: " no " }))
    ).toEqual({
      motivo: "Describe el motivo (al menos 5 caracteres).",
    })
    expect(
      esquemaMotivo.safeParse({ usuarioId: USUARIO, motivo: "x".repeat(501) })
        .success
    ).toBe(false)
  })

  it("eliminar exige escribir ELIMINAR exactamente", () => {
    expect(
      esquemaEliminar.safeParse({
        usuarioId: USUARIO,
        confirmacion: " ELIMINAR ",
      }).success
    ).toBe(true)
    expect(
      esquemaEliminar.safeParse({
        usuarioId: USUARIO,
        confirmacion: "eliminar",
      }).success
    ).toBe(false)
  })

  it("las acciones masivas aceptan entre 1 y 100 usuarios", () => {
    expect(esquemaMasivo.safeParse({ usuarioIds: [] }).success).toBe(false)
    expect(esquemaMasivo.safeParse({ usuarioIds: [USUARIO] }).success).toBe(
      true
    )
    expect(
      esquemaMasivo.safeParse({
        usuarioIds: Array.from({ length: 101 }, () => USUARIO),
      }).success
    ).toBe(false)
  })
})
