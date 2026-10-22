import { describe, expect, it } from "vitest"

import {
  ordenarPersonas,
  resumenPersonas,
  rutaTrasRegistro,
  rutaUsuario,
} from "./presentacion"

const ID = "0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a01"

describe("rutas", () => {
  it("tras registrar lleva a la pestaña Usuarios solo si se puede invitar desde ella", () => {
    expect(rutaTrasRegistro(ID, true)).toBe(
      `/operacion/medios/${ID}?pestana=usuarios`
    )
    expect(rutaTrasRegistro(ID, false)).toBe(`/operacion/medios/${ID}`)
  })

  it("la ficha del usuario vive en Administración", () => {
    expect(rutaUsuario(ID)).toBe(`/administracion/usuarios/${ID}`)
  })
})

describe("ordenarPersonas", () => {
  it("activas, invitadas, suspendidas y de baja; dentro, por nombre (o correo)", () => {
    const personas = [
      { nombre: null, email: "zoe@medio.co", estado: "INVITADO" as const },
      { nombre: "Ana", email: "ana@medio.co", estado: "DESACTIVADO" as const },
      { nombre: "Álvaro", email: "al@medio.co", estado: "ACTIVO" as const },
      { nombre: "Beatriz", email: "bea@medio.co", estado: "ACTIVO" as const },
      { nombre: "Carlos", email: "c@medio.co", estado: "SUSPENDIDO" as const },
      { nombre: "Abel", email: "abel@medio.co", estado: "INVITADO" as const },
    ]
    expect(ordenarPersonas(personas).map((p) => p.nombre ?? p.email)).toEqual([
      "Álvaro",
      "Beatriz",
      "Abel",
      "zoe@medio.co",
      "Carlos",
      "Ana",
    ])
  })

  it("no modifica el arreglo original", () => {
    const personas = [
      { nombre: "B", email: "b@x.co", estado: "ACTIVO" as const },
      { nombre: "A", email: "a@x.co", estado: "ACTIVO" as const },
    ]
    ordenarPersonas(personas)
    expect(personas[0].nombre).toBe("B")
  })
})

describe("resumenPersonas", () => {
  it("cuenta personas, activas e invitaciones pendientes", () => {
    expect(
      resumenPersonas([
        { estado: "ACTIVO" },
        { estado: "ACTIVO" },
        { estado: "INVITADO" },
        { estado: "SUSPENDIDO" },
      ])
    ).toBe("4 personas · 2 activas · 1 invitación pendiente")
  })

  it("singular y sin partes vacías", () => {
    expect(resumenPersonas([{ estado: "ACTIVO" }])).toBe("1 persona · 1 activa")
    expect(
      resumenPersonas([{ estado: "INVITADO" }, { estado: "INVITADO" }])
    ).toBe("2 personas · 2 invitaciones pendientes")
  })
})
