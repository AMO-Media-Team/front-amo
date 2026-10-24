import { describe, expect, it } from "vitest"

import {
  accionSuspension,
  MOTIVOS_REACTIVACION_MEDIO,
  MOTIVOS_SUSPENSION_MEDIO,
} from "./decision"

const FINANZAS = ["medios.ver", "asignaciones.ver", "disputas.ver"]
const VERIFICADOR = ["medios.ver", "medios.verificar"]
const OPERACIONES = [...FINANZAS, "medios.verificar", "medios.suspender"]

describe("accionSuspension", () => {
  it("con `medios.suspender`, un medio verificado se suspende y uno suspendido se reactiva", () => {
    expect(accionSuspension("VERIFICADO", OPERACIONES)).toBe("suspender")
    expect(accionSuspension("SUSPENDIDO", OPERACIONES)).toBe("reactivar")
  })

  it("sin el permiso no se ofrece nada, aunque pueda cambiar el nivel", () => {
    expect(accionSuspension("VERIFICADO", FINANZAS)).toBeNull()
    expect(accionSuspension("VERIFICADO", VERIFICADOR)).toBeNull()
    expect(accionSuspension("SUSPENDIDO", VERIFICADOR)).toBeNull()
  })

  it("un medio en verificación o rechazado no se suspende", () => {
    expect(accionSuspension("PENDIENTE", OPERACIONES)).toBeNull()
    expect(accionSuspension("RECHAZADO", OPERACIONES)).toBeNull()
  })
})

describe("motivos frecuentes", () => {
  it("caben en `medios.motivo_estado` y no se repiten", () => {
    for (const lista of [
      MOTIVOS_SUSPENSION_MEDIO,
      MOTIVOS_REACTIVACION_MEDIO,
    ]) {
      expect(new Set(lista).size).toBe(lista.length)
      for (const motivo of lista) {
        expect(motivo.length).toBeGreaterThanOrEqual(5)
        expect(motivo.length).toBeLessThanOrEqual(500)
        expect(motivo.endsWith(".")).toBe(true)
      }
    }
  })
})
