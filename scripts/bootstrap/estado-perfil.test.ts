import { describe, expect, it } from "vitest"

import {
  requiereTransicionHumana,
  transicionesParaRestaurar,
} from "./estado-perfil"

describe("transicionesParaRestaurar", () => {
  it("una cuenta suspendida se reactiva con una sola transición", () => {
    expect(transicionesParaRestaurar("SUSPENDIDO")).toEqual(["ACTIVO"])
  })

  it("una cuenta desactivada vuelve a INVITADO y la activa el sistema", () => {
    expect(transicionesParaRestaurar("DESACTIVADO")).toEqual(["INVITADO"])
  })

  it("INVITADO y ACTIVO no necesitan transiciones humanas", () => {
    expect(transicionesParaRestaurar("INVITADO")).toEqual([])
    expect(transicionesParaRestaurar("ACTIVO")).toEqual([])
  })
})

describe("requiereTransicionHumana", () => {
  it("solo para suspendidas y desactivadas", () => {
    expect(requiereTransicionHumana("SUSPENDIDO")).toBe(true)
    expect(requiereTransicionHumana("DESACTIVADO")).toBe(true)
    expect(requiereTransicionHumana("INVITADO")).toBe(false)
    expect(requiereTransicionHumana("ACTIVO")).toBe(false)
  })
})
