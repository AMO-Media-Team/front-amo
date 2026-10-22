import { describe, expect, it } from "vitest"

import type { EstadoPaso } from "./alta"
import {
  ESTADOS_PASO,
  fechaCalendario,
  notaRequisito,
  presentarSituacion,
  SITUACIONES_DOCUMENTO,
} from "./presentacion"
import type { EstadoRequisito, SituacionDocumento } from "./requisitos"

function requisito(parcial: Partial<EstadoRequisito>): EstadoRequisito {
  return {
    tipo: "CEDULA_FRENTE",
    situacion: "aprobado",
    fechaVencimiento: null,
    porVencer: false,
    observaciones: null,
    porVideollamada: false,
    renovacionEnRevision: false,
    deCuentaAnterior: false,
    ...parcial,
  }
}

describe("etiquetas", () => {
  it("cada estado de paso y de documento tiene etiqueta y tono", () => {
    const pasos: EstadoPaso[] = [
      "completo",
      "en-curso",
      "pendiente",
      "atencion",
    ]
    for (const estado of pasos) {
      expect(ESTADOS_PASO[estado].etiqueta.length).toBeGreaterThan(0)
    }
    const situaciones: SituacionDocumento[] = [
      "aprobado",
      "en-revision",
      "rechazado",
      "vencido",
      "falta",
    ]
    for (const situacion of situaciones) {
      expect(SITUACIONES_DOCUMENTO[situacion].etiqueta.length).toBeGreaterThan(
        0
      )
    }
  })
})

describe("fechaCalendario", () => {
  it("muestra el día de calendario tal cual, sin correrse por la zona", () => {
    expect(fechaCalendario("2026-12-01")).toBe("1 de diciembre de 2026")
    expect(fechaCalendario("2027-01-01")).toBe("1 de enero de 2027")
  })
})

describe("notaRequisito", () => {
  it("aprobado: vigencia, por vencer, videollamada o renovación", () => {
    expect(notaRequisito(requisito({}))).toBeNull()
    expect(notaRequisito(requisito({ fechaVencimiento: "2027-03-15" }))).toBe(
      "Vigente hasta el 15 de marzo de 2027."
    )
    expect(
      notaRequisito(
        requisito({ fechaVencimiento: "2026-11-01", porVencer: true })
      )
    ).toBe("Vence el 1 de noviembre de 2026: carga uno vigente.")
    expect(notaRequisito(requisito({ porVideollamada: true }))).toBe(
      "Verificada por videollamada."
    )
    expect(
      notaRequisito(requisito({ porVencer: true, renovacionEnRevision: true }))
    ).toBe("Tu documento nuevo está en revisión.")
  })

  it("en revisión, rechazado (con o sin motivo), vencido y faltante", () => {
    expect(notaRequisito(requisito({ situacion: "en-revision" }))).toBe(
      "El equipo de AMO lo está revisando."
    )
    expect(
      notaRequisito(
        requisito({ situacion: "rechazado", observaciones: "Está borrosa." })
      )
    ).toBe("Motivo: Está borrosa.")
    expect(notaRequisito(requisito({ situacion: "rechazado" }))).toBe(
      "No fue aprobado: carga uno nuevo."
    )
    expect(
      notaRequisito(
        requisito({ situacion: "vencido", fechaVencimiento: "2026-10-01" })
      )
    ).toBe("Venció el 1 de octubre de 2026: carga uno vigente.")
    expect(notaRequisito(requisito({ situacion: "vencido" }))).toBe(
      "Venció: carga uno vigente."
    )
    expect(notaRequisito(requisito({ situacion: "falta" }))).toBeNull()
  })

  it("el certificado de la cuenta anterior pide el de la cuenta nueva", () => {
    expect(
      notaRequisito(
        requisito({
          tipo: "CERT_BILLETERA",
          situacion: "falta",
          deCuentaAnterior: true,
        })
      )
    ).toBe(
      "Cambiaste tu cuenta de pago: carga el certificado de la cuenta nueva."
    )
  })
})

describe("presentarSituacion", () => {
  it("alta: cuántos pasos faltan, o que ya puede enviar", () => {
    expect(presentarSituacion({ tipo: "alta" }, null, 3)).toMatchObject({
      titulo: "Completa el alta de tu medio",
      tono: "info",
    })
    expect(presentarSituacion({ tipo: "alta" }, null, 3).descripcion).toMatch(
      /^Te faltan 3 pasos/
    )
    expect(presentarSituacion({ tipo: "alta" }, null, 1).descripcion).toMatch(
      /^Te falta 1 paso/
    )
    expect(presentarSituacion({ tipo: "alta" }, null, 0)).toMatchObject({
      titulo: "Todo listo para enviar",
      tono: "exito",
    })
  })

  it("en revisión dice desde cuándo (fecha de Bogotá)", () => {
    const { titulo, descripcion } = presentarSituacion(
      { tipo: "en-revision", enviadoAt: "2026-10-21T03:00:00Z" },
      null,
      0
    )
    expect(titulo).toBe("Tu medio está en revisión")
    // 03:00 UTC del 21 = 22:00 del 20 en Bogotá.
    expect(descripcion).toMatch(/^Lo enviaste el 20 de octubre de 2026\./)
  })

  it("verificado, rechazado y suspendido", () => {
    expect(
      presentarSituacion(
        { tipo: "verificado", nivel: 2 },
        "Persona natural con RUT",
        0
      )
    ).toMatchObject({
      titulo: "Tu medio está verificado",
      tono: "exito",
    })
    expect(
      presentarSituacion({ tipo: "verificado", nivel: 2 }, null, 0).descripcion
    ).toMatch(/^Nivel 2\. /)
    expect(
      presentarSituacion(
        { tipo: "rechazado", motivo: "x", enviadoAt: null },
        null,
        0
      ).tono
    ).toBe("peligro")
    expect(
      presentarSituacion({ tipo: "suspendido", motivo: null }, null, 0).tono
    ).toBe("aviso")
  })
})
