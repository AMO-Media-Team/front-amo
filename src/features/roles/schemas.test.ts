import { describe, expect, it } from "vitest"

import {
  type EntradaCrearRol,
  esquemaCrearRol,
  esquemaEditarRol,
  esquemaEliminarRol,
  esquemaPermisosRol,
  mfaObligatoria,
} from "./schemas"

const ROL = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a01"
const ORIGEN = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a02"

const BASE: EntradaCrearRol = {
  nombre: "  Analista de campañas ",
  clave: " analista_campanas ",
  descripcion: "   ",
  tipo: "ANUNCIANTE",
  color: "#3987e5",
  requiereMfa: false,
  clonarDesde: "",
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

describe("esquemaCrearRol", () => {
  it("normaliza nombre, clave, color, descripción vacía y origen vacío", () => {
    expect(esquemaCrearRol.parse(BASE)).toEqual({
      nombre: "Analista de campañas",
      clave: "ANALISTA_CAMPANAS",
      descripcion: null,
      tipo: "ANUNCIANTE",
      color: "#3987E5",
      requiereMfa: false,
      clonarDesde: null,
    })
  })

  it("fuerza la verificación en dos pasos en los roles del equipo interno", () => {
    const datos = esquemaCrearRol.parse({
      ...BASE,
      tipo: "ADMIN",
      requiereMfa: false,
    })
    expect(datos.requiereMfa).toBe(true)
    expect(mfaObligatoria("ADMIN")).toBe(true)
    expect(mfaObligatoria("MEDIO")).toBe(false)
  })

  it("respeta la MFA opcional en roles externos", () => {
    expect(
      esquemaCrearRol.parse({ ...BASE, tipo: "MEDIO", requiereMfa: true })
        .requiereMfa
    ).toBe(true)
  })

  it("conserva el rol de origen al clonar", () => {
    expect(
      esquemaCrearRol.parse({ ...BASE, clonarDesde: ORIGEN }).clonarDesde
    ).toBe(ORIGEN)
  })

  it("rechaza con mensajes en español cada campo inválido", () => {
    const resultado = esquemaCrearRol.safeParse({
      nombre: "A",
      clave: "1_MAL",
      descripcion: "x".repeat(301),
      tipo: "OTRO",
      color: "lila",
      requiereMfa: false,
      clonarDesde: "no-es-uuid",
    })
    expect(resultado.success).toBe(false)
    expect(errores(resultado)).toEqual({
      nombre: "Escribe al menos 2 caracteres.",
      clave:
        "Usa MAYÚSCULAS, números y guion bajo, empezando por una letra (2 a 40).",
      descripcion: "Máximo 300 caracteres.",
      tipo: "Elige el tipo de rol.",
      color: "Elige un color de la paleta.",
      clonarDesde: "Identificador inválido.",
    })
  })

  it("pide el nombre y la clave cuando están vacíos (primer error de cada campo)", () => {
    const resultado = esquemaCrearRol.safeParse({
      ...BASE,
      nombre: "  ",
      clave: "",
    })
    const primeros = new Map<string, string>()
    for (const issue of resultado.error?.issues ?? []) {
      const campo = issue.path.join(".")
      if (!primeros.has(campo)) primeros.set(campo, issue.message)
    }
    expect(Object.fromEntries(primeros)).toEqual({
      nombre: "Escribe el nombre del rol.",
      clave: "Escribe la clave del rol.",
    })
  })

  it("reserva las claves de los roles de sistema", () => {
    const resultado = esquemaCrearRol.safeParse({ ...BASE, clave: "admin" })
    expect(errores(resultado)).toEqual({
      clave: "Esa clave está reservada para un rol de sistema.",
    })
  })

  it("limita el nombre a 60 caracteres", () => {
    const resultado = esquemaCrearRol.safeParse({
      ...BASE,
      nombre: "n".repeat(61),
    })
    expect(errores(resultado)).toEqual({ nombre: "Máximo 60 caracteres." })
  })
})

describe("esquemaEditarRol", () => {
  it("valida el identificador y los datos editables", () => {
    expect(
      esquemaEditarRol.parse({
        rolId: ROL,
        nombre: " Soporte ",
        descripcion: "Atiende a los medios.",
        color: "#1baf7a",
        requiereMfa: true,
      })
    ).toEqual({
      rolId: ROL,
      nombre: "Soporte",
      descripcion: "Atiende a los medios.",
      color: "#1BAF7A",
      requiereMfa: true,
    })
    expect(
      errores(
        esquemaEditarRol.safeParse({
          rolId: "x",
          nombre: "Soporte",
          descripcion: "",
          color: "#1BAF7A",
          requiereMfa: false,
        })
      )
    ).toEqual({ rolId: "Identificador inválido." })
  })
})

describe("esquemaPermisosRol", () => {
  it("acepta un diff con permisos del catálogo", () => {
    expect(
      esquemaPermisosRol.parse({
        rolId: ROL,
        agregar: ["roles.ver"],
        quitar: ["usuarios.ver"],
      })
    ).toEqual({ rolId: ROL, agregar: ["roles.ver"], quitar: ["usuarios.ver"] })
  })

  it("rechaza permisos desconocidos", () => {
    const resultado = esquemaPermisosRol.safeParse({
      rolId: ROL,
      agregar: ["roles.borrar_todo"],
      quitar: [],
    })
    expect(errores(resultado)).toEqual({ "agregar.0": "Permiso desconocido." })
  })

  it("rechaza un diff vacío o contradictorio", () => {
    expect(
      esquemaPermisosRol.safeParse({ rolId: ROL, agregar: [], quitar: [] })
        .error?.issues[0]?.message
    ).toBe("No hay cambios que guardar.")
    expect(
      esquemaPermisosRol.safeParse({
        rolId: ROL,
        agregar: ["roles.ver"],
        quitar: ["roles.ver"],
      }).error?.issues[0]?.message
    ).toBe("Un permiso no puede otorgarse y retirarse a la vez.")
  })
})

describe("esquemaEliminarRol", () => {
  it("exige escribir el nombre del rol", () => {
    expect(
      errores(esquemaEliminarRol.safeParse({ rolId: ROL, confirmacion: "  " }))
    ).toEqual({ confirmacion: "Escribe el nombre del rol para confirmar." })
    expect(
      esquemaEliminarRol.parse({ rolId: ROL, confirmacion: " Soporte " })
    ).toEqual({ rolId: ROL, confirmacion: "Soporte" })
  })
})
