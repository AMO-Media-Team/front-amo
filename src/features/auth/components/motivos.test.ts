import { describe, expect, it } from "vitest"

import { mensajeDeMotivo } from "./motivos"

describe("mensajeDeMotivo", () => {
  it("traduce los motivos conocidos", () => {
    expect(mensajeDeMotivo("inactividad")).toMatch(/inactividad/)
    expect(mensajeDeMotivo(["enlace-vencido", "otro"])).toMatch(/venció/)
  })

  it("ignora valores desconocidos o heredados del prototipo", () => {
    expect(mensajeDeMotivo(undefined)).toBeUndefined()
    expect(mensajeDeMotivo("<script>")).toBeUndefined()
    expect(mensajeDeMotivo("toString")).toBeUndefined()
  })
})
