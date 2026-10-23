import { describe, expect, it } from "vitest"

import {
  FALLO_ACEPTAR_INESPERADO,
  falloInesperadoAceptar,
  falloValidacionAceptar,
  interpretarErrorAceptar,
  interpretarErrorRechazo,
} from "./errores"

function errorAmo(codigo: string, detalle?: string) {
  return { code: "P0001", message: codigo, details: detalle ?? null }
}

describe("errores al aceptar", () => {
  it("sin cupo: el título del criterio, bloquea y renueva la clave", () => {
    const fallo = interpretarErrorAceptar(
      errorAmo("AMO_SIN_CUPO", "No quedan cupos en tu franja.")
    )
    expect(fallo).toMatchObject({
      ok: false,
      codigo: "AMO_SIN_CUPO",
      titulo: "No quedan cupos en tu franja",
      definitivo: true,
      bloquea: true,
      enlace: { href: "/ofertas" },
    })
    expect(fallo.error).toMatch(/otro medio tomó el último cupo/i)
  })

  it("ya aceptada: lleva a Mis campañas", () => {
    expect(
      interpretarErrorAceptar(errorAmo("AMO_YA_ACEPTADA", "Ya aceptaste."))
    ).toMatchObject({
      titulo: "Ya aceptaste esta oferta",
      bloquea: true,
      enlace: { texto: "Ir a Mis campañas", href: "/mis-campanas" },
    })
  })

  it("tope de nivel: ofrece cómo subir de nivel (MED-007)", () => {
    expect(
      interpretarErrorAceptar(errorAmo("AMO_TOPE_NIVEL", "Detalle"))
    ).toMatchObject({
      titulo: "Llegaste al tope anual de tu nivel",
      enlace: { texto: "Cómo subir de nivel", href: "/mi-medio/nivel" },
    })
  })

  it("exclusividad: cubre las dos direcciones (la pide esta oferta o una aceptada)", () => {
    const fallo = interpretarErrorAceptar(
      errorAmo(
        "AMO_EXCLUSIVIDAD",
        "Tienes un compromiso de exclusividad con otra marca del mismo sector en esas fechas."
      )
    )
    expect(fallo).toMatchObject({
      titulo: "Choca con otra campaña del mismo sector",
      bloquea: true,
      enlace: { href: "/mis-campanas" },
    })
    expect(fallo.error).toBe(
      "Esta oferta o una que ya aceptaste pide exclusividad, y en esas fechas tienes pauta de otra marca del mismo sector."
    )
    expect(fallo.titulo).not.toMatch(/tienes una exclusividad/i)
  })

  it("no elegible: usa el detalle de la BD (medio o cuenta)", () => {
    const fallo = interpretarErrorAceptar(
      errorAmo(
        "AMO_NO_ELEGIBLE",
        "La cuenta elegida no cumple los requisitos de la oferta."
      )
    )
    expect(fallo.error).toBe(
      "La cuenta elegida no cumple los requisitos de la oferta."
    )
    expect(fallo.enlace?.href).toBe("/mi-medio/cuentas")
  })

  it("clave ya usada: se reintenta con otra clave sin bloquear", () => {
    expect(
      interpretarErrorAceptar(errorAmo("AMO_IDEMPOTENCIA_INVALIDA"))
    ).toMatchObject({ definitivo: true, bloquea: false })
  })

  it("otra regla de negocio: mensaje de la BD, clave nueva", () => {
    expect(
      interpretarErrorAceptar(
        errorAmo("AMO_TRANSICION_INVALIDA", "Ya no es posible.")
      )
    ).toMatchObject({
      titulo: "No pudimos aceptar la oferta",
      error: "Ya no es posible.",
      definitivo: true,
      bloquea: false,
    })
  })

  it("un fallo técnico conserva la clave para reintentar", () => {
    const fallo = interpretarErrorAceptar({ code: "57014", message: "x" })
    expect(fallo).toMatchObject({
      codigo: null,
      titulo: FALLO_ACEPTAR_INESPERADO.titulo,
      definitivo: false,
      bloquea: false,
    })
    expect(falloInesperadoAceptar()).toEqual(fallo)
  })

  it("una validación fallida no llega a la BD y pide otra clave", () => {
    expect(falloValidacionAceptar("Elige una cuenta.")).toMatchObject({
      error: "Elige una cuenta.",
      definitivo: true,
      bloquea: false,
    })
  })
})

describe("errores de «No me interesa»", () => {
  it("oferta que ya no está", () => {
    expect(
      interpretarErrorRechazo(errorAmo("AMO_OFERTA_NO_DISPONIBLE")).mensaje
    ).toMatch(/ya no está disponible/)
  })

  it("si ya había aceptado, el motivo es obligatorio y va en su campo", () => {
    expect(
      interpretarErrorRechazo(errorAmo("AMO_MOTIVO_REQUERIDO"))
    ).toMatchObject({ campo: "motivo", esperado: true })
  })

  it("descargado: el detalle de la BD", () => {
    expect(
      interpretarErrorRechazo(
        errorAmo(
          "AMO_YA_ACEPTADA",
          "Ya aceptaste esta oferta y descargaste el contenido."
        )
      ).mensaje
    ).toBe("Ya aceptaste esta oferta y descargaste el contenido.")
  })
})
