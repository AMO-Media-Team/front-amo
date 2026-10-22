import { describe, expect, it } from "vitest"

import {
  certificadoDePago,
  diasEntre,
  type DocumentoRegistrado,
  documentosExigidos,
  estadoRequisito,
  estadoRequisitos,
  nivelObjetivo,
  requisitoCubierto,
  requisitosParaEnviar,
} from "./requisitos"

const HOY = "2026-10-22"

function documento(
  parcial: Partial<DocumentoRegistrado> = {}
): DocumentoRegistrado {
  return {
    tipo: "CEDULA_FRENTE",
    estado: "APROBADO",
    fechaVencimiento: null,
    metodo: "ARCHIVO",
    observaciones: null,
    creadoAt: "2026-10-01T15:00:00Z",
    ...parcial,
  }
}

describe("certificadoDePago y documentosExigidos", () => {
  it("pide el certificado que corresponde al método de pago", () => {
    expect(certificadoDePago("BANCARIO")).toBe("CERT_BANCARIA")
    expect(certificadoDePago("BILLETERA")).toBe("CERT_BILLETERA")
    expect(certificadoDePago(null)).toBeNull()
  })

  it("suma el certificado al final, sin repetir tipos", () => {
    expect(
      documentosExigidos(
        ["CEDULA_FRENTE", "CEDULA_REVERSO", "CEDULA_FRENTE"],
        "BILLETERA"
      )
    ).toEqual({
      tipos: ["CEDULA_FRENTE", "CEDULA_REVERSO", "CERT_BILLETERA"],
      faltaMetodoPago: false,
    })
  })

  it("sin método de pago avisa que aún no se sabe qué certificado pedir", () => {
    expect(documentosExigidos(["CEDULA_FRENTE"], null)).toEqual({
      tipos: ["CEDULA_FRENTE"],
      faltaMetodoPago: true,
    })
  })

  it("no duplica el certificado si el nivel ya lo pide", () => {
    expect(documentosExigidos(["CERT_BANCARIA"], "BANCARIO").tipos).toEqual([
      "CERT_BANCARIA",
    ])
  })
})

describe("nivelObjetivo", () => {
  it("durante el alta (o tras un rechazo) el objetivo es el nivel 1", () => {
    expect(nivelObjetivo("PENDIENTE", 0)).toBe(1)
    expect(nivelObjetivo("RECHAZADO", 0)).toBe(1)
    expect(nivelObjetivo("PENDIENTE", 2)).toBe(1)
  })

  it("verificado, el objetivo es el siguiente sin pasar del máximo", () => {
    expect(nivelObjetivo("VERIFICADO", 1)).toBe(2)
    expect(nivelObjetivo("VERIFICADO", 2)).toBe(3)
    expect(nivelObjetivo("VERIFICADO", 3)).toBe(3)
    expect(nivelObjetivo("SUSPENDIDO", 2)).toBe(3)
  })

  it("un medio sin nivel asignado apunta al 1", () => {
    expect(nivelObjetivo("VERIFICADO", 0)).toBe(1)
  })
})

describe("diasEntre", () => {
  it("cuenta días de calendario, negativos hacia atrás", () => {
    expect(diasEntre("2026-10-22", "2026-11-21")).toBe(30)
    expect(diasEntre("2026-10-22", "2026-10-22")).toBe(0)
    expect(diasEntre("2026-10-22", "2026-10-20")).toBe(-2)
  })
})

describe("estadoRequisito", () => {
  it("sin cargas, falta", () => {
    expect(estadoRequisito("RUT", [documento()], HOY)).toMatchObject({
      tipo: "RUT",
      situacion: "falta",
      fechaVencimiento: null,
    })
  })

  it("un aprobado sin vencimiento es aprobado y no vence", () => {
    expect(estadoRequisito("CEDULA_FRENTE", [documento()], HOY)).toMatchObject({
      situacion: "aprobado",
      porVencer: false,
      renovacionEnRevision: false,
      porVideollamada: false,
    })
  })

  it("marca por vencer dentro de los 30 días y no antes", () => {
    const cerca = documento({ fechaVencimiento: "2026-11-21" })
    const lejos = documento({ fechaVencimiento: "2026-11-22" })
    expect(estadoRequisito("CEDULA_FRENTE", [cerca], HOY).porVencer).toBe(true)
    expect(estadoRequisito("CEDULA_FRENTE", [lejos], HOY).porVencer).toBe(false)
  })

  it("el aprobado vigente manda aunque haya una carga posterior en revisión", () => {
    const aprobado = documento({ fechaVencimiento: "2026-11-01" })
    const nuevo = documento({
      estado: "PENDIENTE",
      creadoAt: "2026-10-20T10:00:00Z",
    })
    expect(
      estadoRequisito("CEDULA_FRENTE", [aprobado, nuevo], HOY)
    ).toMatchObject({
      situacion: "aprobado",
      fechaVencimiento: "2026-11-01",
      renovacionEnRevision: true,
    })
  })

  it("una carga pendiente ANTERIOR al aprobado no cuenta como renovación", () => {
    const viejo = documento({
      estado: "PENDIENTE",
      creadoAt: "2026-09-01T10:00:00Z",
    })
    expect(
      estadoRequisito("CEDULA_FRENTE", [documento(), viejo], HOY)
        .renovacionEnRevision
    ).toBe(false)
  })

  it("un aprobado vencido ya no cuenta: manda la carga más reciente", () => {
    const vencido = documento({ fechaVencimiento: "2026-10-21" })
    expect(estadoRequisito("CEDULA_FRENTE", [vencido], HOY)).toMatchObject({
      situacion: "vencido",
      fechaVencimiento: "2026-10-21",
    })
    expect(
      estadoRequisito(
        "CEDULA_FRENTE",
        [documento({ estado: "VENCIDO", fechaVencimiento: "2026-01-01" })],
        HOY
      ).situacion
    ).toBe("vencido")
  })

  it("vence el mismo día de hoy: sigue vigente", () => {
    expect(
      estadoRequisito(
        "CEDULA_FRENTE",
        [documento({ fechaVencimiento: HOY })],
        HOY
      ).situacion
    ).toBe("aprobado")
  })

  it("la carga más reciente pendiente queda en revisión", () => {
    const rechazado = documento({
      estado: "RECHAZADO",
      creadoAt: "2026-10-01T10:00:00Z",
    })
    const pendiente = documento({
      estado: "PENDIENTE",
      creadoAt: "2026-10-05T10:00:00Z",
    })
    expect(
      estadoRequisito("CEDULA_FRENTE", [rechazado, pendiente], HOY).situacion
    ).toBe("en-revision")
  })

  it("un rechazo trae sus observaciones (sin espacios sobrantes)", () => {
    const rechazado = documento({
      estado: "RECHAZADO",
      observaciones: "  La foto está borrosa.  ",
    })
    expect(estadoRequisito("CEDULA_FRENTE", [rechazado], HOY)).toMatchObject({
      situacion: "rechazado",
      observaciones: "La foto está borrosa.",
    })
    expect(
      estadoRequisito(
        "CEDULA_FRENTE",
        [documento({ estado: "RECHAZADO", observaciones: "   " })],
        HOY
      ).observaciones
    ).toBeNull()
  })

  it("reconoce la prueba de vida aprobada por videollamada", () => {
    const videollamada = documento({
      tipo: "PRUEBA_VIDA",
      metodo: "VIDEOLLAMADA",
    })
    expect(
      estadoRequisito("PRUEBA_VIDA", [videollamada], HOY).porVideollamada
    ).toBe(true)
  })

  it("no mezcla tipos", () => {
    const otro = documento({ tipo: "CEDULA_REVERSO", estado: "RECHAZADO" })
    expect(
      estadoRequisito("CEDULA_FRENTE", [documento(), otro], HOY).situacion
    ).toBe("aprobado")
  })
})

describe("estadoRequisitos, requisitoCubierto y requisitosParaEnviar", () => {
  const requisitos = estadoRequisitos(
    ["CEDULA_FRENTE", "CEDULA_REVERSO", "PRUEBA_VIDA", "CERT_BANCARIA"],
    [
      documento(),
      documento({ tipo: "CEDULA_REVERSO", estado: "PENDIENTE" }),
      documento({ tipo: "CERT_BANCARIA", estado: "RECHAZADO" }),
    ],
    HOY
  )

  it("devuelve uno por tipo, en el orden pedido", () => {
    expect(requisitos.map((r) => [r.tipo, r.situacion])).toEqual([
      ["CEDULA_FRENTE", "aprobado"],
      ["CEDULA_REVERSO", "en-revision"],
      ["PRUEBA_VIDA", "falta"],
      ["CERT_BANCARIA", "rechazado"],
    ])
  })

  it("cubierto = aprobado o en revisión", () => {
    expect(requisitos.map(requisitoCubierto)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it("la prueba de vida no impide enviar (es facultativa)", () => {
    expect(requisitosParaEnviar(requisitos).map((r) => r.tipo)).toEqual([
      "CEDULA_FRENTE",
      "CEDULA_REVERSO",
      "CERT_BANCARIA",
    ])
  })
})
