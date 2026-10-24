// @vitest-environment node
import { describe, expect, it } from "vitest"

import { ANUNCIANTE_NUEVO_E2E_ID } from "./anunciantes-e2e"
import {
  MEDIO_E2E_ID,
  MEDIO_FACTURA_E2E_ID,
  MEDIO_FINANZAS_E2E_ID,
  MEDIO_NUEVO_E2E_ID,
  MEDIO_SUSPENSION_E2E_ID,
} from "./medios-e2e"
import { ANUNCIANTE_E2E_ID, exigeTotp, organizacionDe } from "./organizacion"
import {
  CUENTAS_E2E,
  cuentaE2E,
  emailDe,
  VARIABLE_TOTP_ADMIN,
  variableTotpDe,
} from "./provision-e2e"

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

  it("incluye las cuentas de la fase 4: OPERACIONES con TOTP y el Medio Suspensión E2E", () => {
    expect(cuentaE2E("OPERACIONES")).toMatchObject({
      rol: "OPERACIONES",
      conTotp: true,
      debeCambiarPassword: false,
      variableEmail: "E2E_OPERACIONES_EMAIL",
      variablePassword: "E2E_OPERACIONES_PASSWORD",
    })
    expect(organizacionDe(cuentaE2E("OPERACIONES"))).toEqual({
      anunciante_id: null,
      medio_id: null,
    })
    const suspension = cuentaE2E("MEDIO_SUSPENSION")
    expect(suspension).toMatchObject({
      rol: "MEDIO",
      medioId: MEDIO_SUSPENSION_E2E_ID,
      nombre: "Medio Suspensión E2E",
      conTotp: false,
      variableEmail: "E2E_MEDIO_SUSPENSION_EMAIL",
    })
    expect(organizacionDe(suspension).medio_id).toBe(MEDIO_SUSPENSION_E2E_ID)
  })

  it("incluye la cuenta del Anunciante Nuevo E2E, en su propia empresa y sin MFA", () => {
    const nuevo = cuentaE2E("ANUNCIANTE_NUEVO")
    expect(nuevo).toMatchObject({
      rol: "ANUNCIANTE",
      anuncianteId: ANUNCIANTE_NUEVO_E2E_ID,
      nombre: "Anunciante Nuevo E2E",
      conTotp: false,
      debeCambiarPassword: false,
      variableEmail: "E2E_ANUNCIANTE_NUEVO_EMAIL",
      variablePassword: "E2E_ANUNCIANTE_NUEVO_PASSWORD",
    })
    expect(organizacionDe(nuevo)).toEqual({
      anunciante_id: ANUNCIANTE_NUEVO_E2E_ID,
      medio_id: null,
    })
    // Las otras cuentas de rol ANUNCIANTE siguen en el Anunciante E2E.
    for (const clave of ["ANUNCIANTE", "CAMBIO"]) {
      expect(organizacionDe(cuentaE2E(clave)).anunciante_id).toBe(
        ANUNCIANTE_E2E_ID
      )
    }
  })

  it("incluye las cuentas de la fase 5: Finanzas con TOTP y los dos medios de Finanzas", () => {
    expect(cuentaE2E("FINANZAS")).toMatchObject({
      rol: "FINANZAS",
      nombre: "Finanzas E2E",
      emailPorDefecto: "e2e.finanzas@amo.test",
      conTotp: true,
      debeCambiarPassword: false,
      variableEmail: "E2E_FINANZAS_EMAIL",
      variablePassword: "E2E_FINANZAS_PASSWORD",
    })
    expect(variableTotpDe(cuentaE2E("FINANZAS"))).toBe(
      "E2E_FINANZAS_TOTP_SECRET"
    )
    expect(organizacionDe(cuentaE2E("FINANZAS"))).toEqual({
      anunciante_id: null,
      medio_id: null,
    })
    for (const [clave, medioId, nombre] of [
      ["MEDIO_FINANZAS", MEDIO_FINANZAS_E2E_ID, "Medio Finanzas E2E"],
      ["MEDIO_FACTURA", MEDIO_FACTURA_E2E_ID, "Medio Factura E2E"],
    ] as const) {
      const cuenta = cuentaE2E(clave)
      expect(cuenta).toMatchObject({
        rol: "MEDIO",
        medioId,
        nombre,
        conTotp: false,
        debeCambiarPassword: false,
      })
      expect(organizacionDe(cuenta).medio_id).toBe(medioId)
    }
  })

  it("toda cuenta de rol MEDIO declara su medio (sin él no se puede preparar)", () => {
    for (const cuenta of CUENTAS_E2E.filter((c) => c.rol === "MEDIO")) {
      expect(() => organizacionDe(cuenta)).not.toThrow()
    }
  })

  it("solo los roles internos enrolan TOTP, cada uno con su variable", () => {
    for (const cuenta of CUENTAS_E2E) {
      expect(cuenta.conTotp).toBe(exigeTotp(cuenta.rol))
    }
    const variables = CUENTAS_E2E.filter((c) => c.conTotp).map(variableTotpDe)
    expect(new Set(variables).size).toBe(variables.length)
    expect(variableTotpDe(cuentaE2E("ADMIN"))).toBe(VARIABLE_TOTP_ADMIN)
    expect(variableTotpDe(cuentaE2E("OPERACIONES"))).toBe(
      "E2E_OPERACIONES_TOTP_SECRET"
    )
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
