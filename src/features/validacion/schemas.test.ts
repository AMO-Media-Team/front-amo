import { describe, expect, it } from "vitest"

import { MENSAJES_VALIDACION } from "./errores"
import {
  esquemaAprobarEvidencia,
  esquemaAprobarMetrica,
  esquemaCorreccion,
  esquemaValidarEvidencia,
  esquemaValidarMetrica,
  esquemaVerificar,
} from "./schemas"

const ID = "0192f3a4-5b6c-7d8e-9f01-0000000000a1"
/** `updated_at` tal cual lo entrega la BD (con microsegundos). */
const VERSION = "2026-10-22T16:00:00.123456+00:00"

function mensajes(resultado: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}): Record<string, string> {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [
      issue.path.join("."),
      issue.message,
    ])
  )
}

describe("evidencias (ADM-007)", () => {
  it("aprobar exige marcar la etiqueta de publicidad visible", () => {
    const resultado = esquemaAprobarEvidencia.safeParse({
      publicacionId: ID,
      etiquetaVerificada: false,
      observaciones: "",
    })
    expect(mensajes(resultado)).toEqual({
      etiquetaVerificada: MENSAJES_VALIDACION.etiquetaRequerida,
    })
    expect(
      esquemaValidarEvidencia.safeParse({
        aprobar: true,
        publicacionId: ID,
        enviadaAt: VERSION,
        etiquetaVerificada: true,
        observaciones: "  Todo en orden  ",
      }).data
    ).toEqual({
      aprobar: true,
      publicacionId: ID,
      enviadaAt: VERSION,
      etiquetaVerificada: true,
      observaciones: "Todo en orden",
    })
  })

  it("rechazar exige observaciones para el medio", () => {
    const resultado = esquemaValidarEvidencia.safeParse({
      aprobar: false,
      publicacionId: ID,
      enviadaAt: VERSION,
      observaciones: "  ",
    })
    expect(Object.keys(mensajes(resultado))).toEqual(["observaciones"])
    expect(
      esquemaValidarEvidencia.safeParse({
        aprobar: false,
        publicacionId: ID,
        enviadaAt: VERSION,
        observaciones: "Falta la etiqueta de publicidad.",
      }).success
    ).toBe(true)
  })

  it("decidir exige la versión que se vio (el formulario no la lleva)", () => {
    expect(
      esquemaAprobarEvidencia.safeParse({
        publicacionId: ID,
        etiquetaVerificada: true,
        observaciones: "",
      }).success
    ).toBe(true)
    for (const enviadaAt of [undefined, "", "ayer"]) {
      expect(
        Object.keys(
          mensajes(
            esquemaValidarEvidencia.safeParse({
              aprobar: false,
              publicacionId: ID,
              enviadaAt,
              observaciones: "Falta la etiqueta de publicidad.",
            })
          )
        )
      ).toEqual(["enviadaAt"])
    }
  })
})

describe("métricas (ADM-008)", () => {
  it("aprobar una con alerta exige anotar qué se revisó", () => {
    expect(
      mensajes(
        esquemaAprobarMetrica.safeParse({
          metricaId: ID,
          conAlerta: true,
          observaciones: "",
        })
      )
    ).toEqual({ observaciones: MENSAJES_VALIDACION.alertaSinRevision })
    expect(
      esquemaValidarMetrica.safeParse({
        aprobar: true,
        metricaId: ID,
        enviadaAt: VERSION,
        conAlerta: false,
        observaciones: "",
      }).success
    ).toBe(true)
    // Sin la versión que se vio no se decide; con ella, la constancia se sigue exigiendo.
    expect(
      Object.keys(
        mensajes(
          esquemaValidarMetrica.safeParse({
            aprobar: true,
            metricaId: ID,
            conAlerta: false,
            observaciones: "",
          })
        )
      )
    ).toEqual(["enviadaAt"])
    expect(
      mensajes(
        esquemaValidarMetrica.safeParse({
          aprobar: true,
          metricaId: ID,
          enviadaAt: VERSION,
          conAlerta: true,
          observaciones: "",
        })
      )
    ).toEqual({ observaciones: MENSAJES_VALIDACION.alertaSinRevision })
  })

  it("rechazar exige observaciones", () => {
    expect(
      esquemaValidarMetrica.safeParse({
        aprobar: false,
        metricaId: ID,
        enviadaAt: VERSION,
        observaciones: "",
      }).success
    ).toBe(false)
  })

  it("la corrección exige un motivo de al menos 10 caracteres", () => {
    const base = {
      asignacionId: ID,
      numero: 1,
      corte: "H24",
      metricaId: ID,
      dia: "2026-10-22",
      hora: "10:00",
      periodoDesde: "",
      periodoHasta: "",
      alcance: "1.250",
      impresiones: "2.000",
      reproducciones: "",
      espectadoresUnicos: "",
      meGusta: "10",
      comentarios: "1",
      compartidos: "0",
      guardados: "0",
      clicsEnlace: "",
      visitasPerfil: "",
      tiempoPromedioS: "",
      porcentajeCompleto: "",
    }
    expect(
      Object.keys(
        mensajes(esquemaCorreccion.safeParse({ ...base, motivo: "Error" }))
      )
    ).toEqual(["motivo"])
    expect(
      esquemaCorreccion.safeParse({
        ...base,
        motivo: "El medio digitó un cero de más.",
      }).success
    ).toBe(true)
  })
})

describe("verificación (ADM-009)", () => {
  it("sin constancia no pide motivo; con constancia, sí", () => {
    expect(
      esquemaVerificar.safeParse({
        asignacionId: ID,
        constancia: false,
        motivo: "",
      }).success
    ).toBe(true)
    expect(
      Object.keys(
        mensajes(
          esquemaVerificar.safeParse({
            asignacionId: ID,
            constancia: true,
            motivo: "ok",
          })
        )
      )
    ).toEqual(["motivo"])
  })
})
