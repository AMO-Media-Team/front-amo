import { describe, expect, it } from "vitest"

import { esCuentaNoInvitada } from "./cuentas-no-invitadas"

const ROL = "0199a7c2-1b2c-7d3e-8f40-123456789abc"

describe("esCuentaNoInvitada", () => {
  it("un INVITADO sin rol no nació de una invitación de AMO", () => {
    expect(esCuentaNoInvitada({ estado: "INVITADO", rol_id: null })).toBe(true)
  })

  it("una invitación de AMO (INVITADO con rol) es legítima", () => {
    expect(esCuentaNoInvitada({ estado: "INVITADO", rol_id: ROL })).toBe(false)
  })

  it.each(["ACTIVO", "SUSPENDIDO", "DESACTIVADO"] as const)(
    "una cuenta %s no se trata como registro externo",
    (estado) => {
      expect(esCuentaNoInvitada({ estado, rol_id: null })).toBe(false)
      expect(esCuentaNoInvitada({ estado, rol_id: ROL })).toBe(false)
    }
  )
})
