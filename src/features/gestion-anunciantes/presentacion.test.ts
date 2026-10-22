import { describe, expect, it } from "vitest"

import { organizacionParaInvitar, resumenUsuarios } from "./presentacion"

describe("organizacionParaInvitar", () => {
  const anunciante = { id: "a1", nombreComercial: "Andina" }

  it("fija la empresa si hay algún rol de anunciante asignable", () => {
    expect(
      organizacionParaInvitar(
        [{ tipo: "ADMIN" }, { tipo: "ANUNCIANTE" }],
        anunciante
      )
    ).toEqual({ tipo: "ANUNCIANTE", id: "a1", nombre: "Andina" })
  })

  it("no ofrece invitar sin roles de anunciante o sin permiso", () => {
    expect(
      organizacionParaInvitar(
        [{ tipo: "ADMIN" }, { tipo: "MEDIO" }],
        anunciante
      )
    ).toBeNull()
    expect(organizacionParaInvitar(null, anunciante)).toBeNull()
  })
})

describe("resumenUsuarios", () => {
  it("cuenta las personas en singular y plural", () => {
    expect(resumenUsuarios([{ estado: "ACTIVO" }])).toBe("1 persona vinculada")
    expect(resumenUsuarios([{ estado: "ACTIVO" }, { estado: "ACTIVO" }])).toBe(
      "2 personas vinculadas"
    )
  })

  it("destaca invitaciones pendientes y cuentas suspendidas", () => {
    expect(
      resumenUsuarios([
        { estado: "ACTIVO" },
        { estado: "INVITADO" },
        { estado: "INVITADO" },
        { estado: "SUSPENDIDO" },
      ])
    ).toBe("4 personas vinculadas · 2 invitaciones pendientes · 1 suspendida")
  })
})
