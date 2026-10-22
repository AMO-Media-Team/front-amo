// @vitest-environment node
import { describe, expect, it } from "vitest"

import { MEDIO_E2E_ID, MEDIO_NUEVO_E2E_ID } from "./medios-e2e"
import { organizacionDe } from "./organizacion"
import { CUENTAS_E2E, cuentaE2E, emailDe } from "./provision-e2e"

describe("CUENTAS_E2E", () => {
  it("cada cuenta tiene clave, correo y variables propios", () => {
    const unicos = (valores: string[]) => new Set(valores).size
    const claves = CUENTAS_E2E.map((cuenta) => cuenta.clave)
    expect(unicos(claves)).toBe(CUENTAS_E2E.length)
    expect(unicos(CUENTAS_E2E.map((cuenta) => cuenta.emailPorDefecto))).toBe(
      CUENTAS_E2E.length
    )
    const variables = CUENTAS_E2E.flatMap((cuenta) => [
      cuenta.variableEmail,
      cuenta.variablePassword,
    ])
    expect(unicos(variables)).toBe(variables.length)
  })

  it("solo usan el dominio reservado y variables E2E_*", () => {
    for (const cuenta of CUENTAS_E2E) {
      expect(cuenta.emailPorDefecto).toMatch(/^e2e\.[a-z.]+@amo\.test$/)
      expect(cuenta.variableEmail).toBe(`E2E_${cuenta.clave}_EMAIL`)
      expect(cuenta.variablePassword).toBe(`E2E_${cuenta.clave}_PASSWORD`)
    }
  })

  it("incluye las cuentas de medio del paquete E0, vinculadas a su medio y sin MFA", () => {
    const medio = cuentaE2E("MEDIO")
    const nuevo = cuentaE2E("MEDIO_NUEVO")
    expect(medio).toMatchObject({
      rol: "MEDIO",
      medioId: MEDIO_E2E_ID,
      conTotp: false,
      debeCambiarPassword: false,
      variableEmail: "E2E_MEDIO_EMAIL",
    })
    expect(nuevo).toMatchObject({
      rol: "MEDIO",
      medioId: MEDIO_NUEVO_E2E_ID,
      conTotp: false,
      debeCambiarPassword: false,
      variableEmail: "E2E_MEDIO_NUEVO_EMAIL",
    })
    expect(organizacionDe(medio)).toEqual({
      anunciante_id: null,
      medio_id: MEDIO_E2E_ID,
    })
    expect(organizacionDe(nuevo)).toEqual({
      anunciante_id: null,
      medio_id: MEDIO_NUEVO_E2E_ID,
    })
  })

  it("toda cuenta de rol MEDIO declara su medio (sin él no se puede preparar)", () => {
    for (const cuenta of CUENTAS_E2E.filter((c) => c.rol === "MEDIO")) {
      expect(() => organizacionDe(cuenta)).not.toThrow()
    }
  })

  it("solo los roles internos enrolan TOTP", () => {
    for (const cuenta of CUENTAS_E2E) {
      expect(cuenta.conTotp).toBe(cuenta.rol === "ADMIN")
    }
  })
})

describe("cuentaE2E y emailDe", () => {
  it("encuentra la cuenta por clave y falla con una desconocida", () => {
    expect(cuentaE2E("MEDIO_NUEVO").nombre).toBe("Medio Nuevo E2E")
    expect(() => cuentaE2E("NO_EXISTE")).toThrow(/desconocida/)
  })

  it("el correo de .env.local manda sobre el de omisión", () => {
    const cuenta = cuentaE2E("MEDIO")
    const anterior = process.env[cuenta.variableEmail]
    try {
      delete process.env[cuenta.variableEmail]
      expect(emailDe(cuenta)).toBe("e2e.medio@amo.test")
      process.env[cuenta.variableEmail] = "otro.medio@amo.test"
      expect(emailDe(cuenta)).toBe("otro.medio@amo.test")
    } finally {
      if (anterior === undefined) delete process.env[cuenta.variableEmail]
      else process.env[cuenta.variableEmail] = anterior
    }
  })
})
